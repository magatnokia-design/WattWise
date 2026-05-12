const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');
const { getTemplateId, resolveUserContact, sendBrevoTemplateEmail } = require('../lib/brevoEmail');

/**
 * Firestore trigger: Fires when budget document is written
 * Checks if spending crosses thresholds (50%, 75%, 90%, 100%)
 * Creates notifications for threshold breaches
 */
async function handleBudgetAlerts(change, context) {
  try {
    const { userId, month } = context.params;
    
    // Get new data
    const newData = change.after.exists ? change.after.data() : null;
    const oldData = change.before.exists ? change.before.data() : null;

    // Skip if document deleted
    if (!newData) {
      return null;
    }

    const { monthlyBudget, currentSpending, thresholds } = newData;

    // Skip if no budget set
    if (!monthlyBudget || monthlyBudget === 0) {
      return null;
    }

    // Calculate percentage
    const percentage = (currentSpending / monthlyBudget) * 100;

    const db = admin.firestore();
    const budgetRef = change.after.ref;
    const emailTasks = [];
    let recipient = null;
    let recipientLoaded = false;

    const loadRecipient = async () => {
      if (recipientLoaded) return recipient;
      recipient = await resolveUserContact(userId);
      recipientLoaded = true;
      return recipient;
    };

    // Define threshold levels
    const levels = [
      { key: 'fifty', threshold: 50, title: '50% Budget Alert' },
      { key: 'seventyFive', threshold: 75, title: '75% Budget Alert' },
      { key: 'ninety', threshold: 90, title: '90% Budget Alert' },
      { key: 'hundred', threshold: 100, title: 'Budget Exceeded!' },
    ];

    for (const level of levels) {
      const { key, threshold, title } = level;

      // Check if threshold crossed
      const oldPercentage = oldData && oldData.monthlyBudget 
        ? (oldData.currentSpending / oldData.monthlyBudget) * 100 
        : 0;

      const alreadyTriggered = thresholds?.[key] === true;
      const crossedThreshold = percentage >= threshold && oldPercentage < threshold;

      if (crossedThreshold && !alreadyTriggered) {
        logger.info('Budget threshold crossed', { 
          userId, 
          month, 
          threshold, 
          percentage 
        });

        // Create notification
        await db.collection(`users/${userId}/notifications`).add({
          type: 'budget',
          title,
          message: `You've used ${percentage.toFixed(1)}% of your monthly budget (₱${currentSpending.toFixed(2)} / ₱${monthlyBudget.toFixed(2)})`,
          outlet: null,
          read: false,
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          metadata: {
            month,
            percentage: parseFloat(percentage.toFixed(1)),
            currentSpending,
            monthlyBudget,
            threshold,
          },
        });

        const contact = await loadRecipient();
        if (contact?.email) {
          const formattedCurrent = Number(currentSpending || 0).toFixed(2);
          const formattedBudget = Number(monthlyBudget || 0).toFixed(2);
          const emailMessage = `You have used ${percentage.toFixed(1)}% of your monthly budget (PHP ${formattedCurrent} / PHP ${formattedBudget}).`;

          emailTasks.push(sendBrevoTemplateEmail({
            toEmail: contact.email,
            toName: contact.name,
            templateId: getTemplateId('budget'),
            params: {
              title,
              message: emailMessage,
              month,
              percentage: Number(percentage.toFixed(1)),
              threshold,
              currentSpending: Number(formattedCurrent),
              monthlyBudget: Number(formattedBudget),
              currency: 'PHP',
            },
            tags: ['budget'],
          }));
        }

        // Update threshold flag
        await budgetRef.set({
          [`thresholds.${key}`]: true,
        }, { merge: true });

        logger.info('Budget alert created', { userId, threshold });
      }
    }

    if (emailTasks.length > 0) {
      await Promise.all(emailTasks);
    }

    return null;

  } catch (error) {
    logger.error('Error handling budget alerts:', error);
    return null;
  }
}

module.exports = { handleBudgetAlerts };
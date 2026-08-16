/**
 * About and Privacy content.
 *
 * Both were `Alert.alert` bodies. About had genuinely useful text in it -
 * including the safety limits, which are the most important sentences in the
 * app - crammed into a dialog where the bottom is the first thing cut off on a
 * small screen. Privacy was a "coming soon" placeholder.
 *
 * The privacy text is deliberately specific rather than boilerplate. Every claim
 * in it is checkable against the code: the collections listed are the ones that
 * exist under `users/{userId}`, the region is the one in `setGlobalOptions`, and
 * the "only you can read it" claim is the owner-scoped Firestore rules. A vague
 * policy would have been faster to write and impossible to verify.
 *
 * Data, not JSX, so the web app can lift it unchanged.
 */

import { formatVersion } from '../Settings/utils/settingsHelpers';

export const MAX_OUTLET_POWER_W = 500;
export const MAX_TOTAL_POWER_W = 1000;

export const ABOUT_SECTIONS = [
  {
    id: 'what',
    title: 'What WattWise is',
    body: [
      'WattWise is a smart energy monitoring system for apartment rooms. An ESP32 controller paired with PZEM-004T energy meters measures and switches two outlets, and this app is how you watch and control them.',
      'Everything the app reports is measured at those two outlets. Anything plugged in elsewhere in the room is invisible to WattWise, so its totals describe those two sockets rather than your whole electricity use.',
    ],
  },
  {
    id: 'does',
    title: 'What it does',
    bullets: [
      'Live voltage, current and power for each outlet',
      'Remote on and off switching from anywhere',
      'Appliance detection from measured power signatures',
      'Scheduled and countdown timers',
      'Power safety monitoring with automatic cut-off',
      'Monthly budget tracking with threshold alerts',
      'Cost estimates and monthly statements',
    ],
  },
  {
    id: 'wont',
    title: 'What it will not do on its own',
    body: [
      'WattWise never renames an appliance, accepts its own suggestion, or adopts a detected identity without you confirming it. Detection proposes; you decide.',
      'The one thing that acts by itself is the safety cut-off, which switches an outlet off when the measured power passes the limit you set. That is deliberate: it is a protection, and it works from the measurement rather than from any guess about what is plugged in.',
    ],
  },
  {
    id: 'billing',
    title: 'Billing',
    body: [
      'Costs use the PELCO III residential tariff (Pampanga III Electric Cooperative). Distribution and government charges are ERC-approved constants built into the app; generation and transmission are entered by you each month from pelco3.org/rates.php.',
      'Every bill states which rate set produced it and the date those rates took effect.',
    ],
  },
  {
    id: 'safety',
    title: 'Safety limits',
    tone: 'warning',
    body: [
      `Low-voltage appliances only. Maximum ${MAX_OUTLET_POWER_W} W per outlet and ${MAX_TOTAL_POWER_W} W combined.`,
      'Not for air conditioners, heaters, irons, kettles, or anything with a large motor.',
      'WattWise is a monitoring aid, not certified electrical protective equipment. The cut-off is a convenience layer and not a substitute for your building\'s circuit breaker or for wiring that is in good condition.',
    ],
  },
];

/**
 * Registration asks the user to tick "I agree to the Terms & Conditions", and
 * the link was styled as a link with no handler behind it - tapping it toggled
 * the checkbox. Agreement was being collected for a document that could not be
 * read, which is the one thing a terms checkbox must not do.
 */
export const TERMS_SECTIONS = [
  {
    id: 'what',
    title: 'What you are agreeing to',
    body: [
      'WattWise is a capstone project, provided as it is, for monitoring and switching two low-voltage outlets. Using it means accepting the limits below.',
      'It is not a commercial product and carries no warranty or service guarantee.',
    ],
  },
  {
    id: 'safe-use',
    title: 'Safe use — the part that matters',
    tone: 'warning',
    body: [
      `Low-voltage appliances only. Maximum ${MAX_OUTLET_POWER_W} W per outlet and ${MAX_TOTAL_POWER_W} W combined. Do not connect air conditioners, heaters, irons, kettles, or anything with a large motor.`,
      'WattWise is a monitoring aid, not certified electrical protective equipment. The automatic cut-off is a convenience layer. It is not a substitute for your building\'s circuit breaker, for sound wiring, or for your own judgement about what is safe to plug in.',
      'You remain responsible for what you connect to the outlets and for the condition of your electrical installation.',
    ],
  },
  {
    id: 'accuracy',
    title: 'What the numbers mean',
    body: [
      'Energy figures are measured at your two outlets. They describe those outlets only, not your whole electricity use, so they will not match your utility bill unless everything you use runs through them.',
      'Costs are estimates calculated from the PELCO III residential tariff using rates you enter. They are not a bill and carry no authority — the amount you owe is whatever your electricity provider charges.',
      'Appliance identification is a suggestion. It is reliable for steady loads and unreliable for loads that change while they run, and it never affects your measured energy, your costs or the safety cut-off.',
    ],
  },
  {
    id: 'account',
    title: 'Your account',
    body: [
      'Keep your sign-in details to yourself. Anyone signed in to your account can switch your outlets.',
      'Use an email address you can actually reach — statements, receipts and safety alerts are sent there.',
      'You can delete your account and all its data at any time from Settings. Deletion is permanent.',
    ],
  },
  {
    id: 'data',
    title: 'Your data',
    body: [
      'What is stored, why, and who can read it is set out in the Privacy Policy, which forms part of these terms.',
    ],
  },
];

export const PRIVACY_SECTIONS = [
  {
    id: 'summary',
    title: 'The short version',
    body: [
      'WattWise stores what it needs to show you your own energy use, and nothing else. Your data is readable only by your own signed-in account. It is not sold, not shared with advertisers, and not used to build a profile of you.',
      'You can delete all of it at any time from Settings.',
    ],
  },
  {
    id: 'collected',
    title: 'What is stored',
    bullets: [
      'Account details — your email address and display name',
      'Energy measurements — voltage, current, power and accumulated energy for each outlet, roughly every 1.5 seconds while your unit is online',
      'Appliance signatures — the power patterns of appliances you confirm',
      'Activity history — outlet switches, daily summaries and monthly statements',
      'Budget and notifications — your monthly budget, spending records and alerts',
      'Schedules and safety settings — timers and your power thresholds',
      'Your paired unit\'s device ID',
      'A push notification token, only if you turn notifications on',
    ],
  },
  {
    id: 'why',
    title: 'Why each of those exists',
    body: [
      'The measurements are the product: without them there is no usage, no cost and no history. Appliance signatures are what let WattWise recognise a device you have already named. The device ID is how the app knows which hardware belongs to your account, and the push token is the address a notification is delivered to.',
      'None of it is collected for any purpose beyond running the features you can see.',
    ],
  },
  {
    id: 'where',
    title: 'Where it is stored',
    body: [
      'In Google Firebase, in the Singapore region. Access is scoped to the owner: the database rules allow an account to read and write only documents under its own user, so no other WattWise user can reach your data.',
      'Three services handle it on the way: Google Firebase stores it, Expo delivers push notifications to your phone, and an email service sends receipts, statements and alerts to your account email.',
    ],
  },
  {
    id: 'sharing',
    title: 'What is not done with it',
    bullets: [
      'Not sold or rented to anyone',
      'Not shared with advertisers or data brokers',
      'Not used to build an advertising or behavioural profile',
      'Not pooled with other users — appliance signatures you teach stay on your account and are never shared',
    ],
  },
  {
    id: 'delete',
    title: 'Deleting your data',
    body: [
      'Settings → Delete Account removes your account and everything stored under it: measurements, history, statements, appliance signatures, budget, notifications, schedules and safety settings. It cannot be undone and no copy is kept.',
      'Your WattWise unit is not deleted. It is released from your account so it can be paired again — the hardware keeps working and nothing needs reflashing.',
      'Individual items can be removed without deleting the account: Forget removes one appliance signature, and notifications can be cleared from the Notifications screen.',
    ],
  },
  {
    id: 'contact',
    title: 'Questions',
    body: [
      'WattWise is a capstone project rather than a commercial service. If you have a question about what is stored or want your data removed, contact the account that provisioned your unit.',
      `App version ${formatVersion()}.`,
    ],
  },
];

import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { HELP_SECTIONS } from './helpContent';

export const SUPPORT_EMAIL = 'support@dagitab.site';

// Icons for the sections, in place of the emoji helpContent.js carries.
const SECTION_ICONS = {
  bill: 'receipt-outline',
  appliances: 'pricetags-outline',
  measuring: 'speedometer-outline',
  scope: 'list-outline',
};

// Height animation on the accordion. Android needs this switched on explicitly,
// and the guard matters because the flag throws on architectures where it is
// already enabled.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * One question, collapsed by default.
 *
 * Collapsed rather than a flat wall of text because the value of this screen is
 * that a user with one specific question can find it. Fifteen answers printed in
 * full is a document nobody reads.
 */
const HelpTopic = ({ topic, expanded, onToggle }) => (
  <View style={styles.topic}>
    <TouchableOpacity
      style={styles.topicHeader}
      onPress={onToggle}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
    >
      <Text style={styles.question}>{topic.question}</Text>
      <Ionicons
        name={expanded ? 'chevron-up' : 'chevron-down'}
        size={18}
        color={COLORS.textLight}
      />
    </TouchableOpacity>

    {expanded ? (
      <View style={styles.answer}>
        {topic.answer.map((paragraph, index) => (
          <Text key={index} style={styles.paragraph}>
            {paragraph}
          </Text>
        ))}
      </View>
    ) : null}
  </View>
);

export const HelpCenterScreen = ({ navigation }) => {
  // One open at a time. Two long answers open together pushes the question you
  // were reading off screen.
  const [openTopicId, setOpenTopicId] = useState(null);

  const toggleTopic = useCallback((topicId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpenTopicId((current) => (current === topicId ? null : topicId));
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton} accessibilityLabel="Back">
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Help Center</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Support first: someone opening Help may simply want a person. */}
        <TouchableOpacity
          style={styles.contact}
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=Dagitab%20help`).catch(() => {})}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={`Email support at ${SUPPORT_EMAIL}`}
        >
          <View style={styles.contactIcon}>
            <Ionicons name="mail" size={20} color={COLORS.white} />
          </View>
          <View style={styles.contactText}>
            <Text style={styles.contactTitle}>Message support</Text>
            <Text style={styles.contactEmail}>{SUPPORT_EMAIL}</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
        </TouchableOpacity>

        {HELP_SECTIONS.map((section) => (
          <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Ionicons
                name={SECTION_ICONS[section.id] || 'help-circle-outline'}
                size={16}
                color={COLORS.primary}
                style={styles.sectionIcon}
              />
              <Text style={styles.sectionTitle}>{section.title}</Text>
            </View>

            <View style={styles.card}>
              {section.topics.map((topic, index) => (
                <View key={topic.id}>
                  {index > 0 ? <View style={styles.separator} /> : null}
                  <HelpTopic
                    topic={topic}
                    expanded={openTopicId === topic.id}
                    onToggle={() => toggleTopic(topic.id)}
                  />
                </View>
              ))}
            </View>
          </View>
        ))}

        <Text style={styles.footer}>
          Readings come from the meters in your Dagitab unit. Rates follow the
          PELCO III residential structure, and every bill states which rate set
          produced it.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  backButton: {
    padding: 4,
    width: 32,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  section: {
    marginTop: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 8,
  },
  sectionIcon: {
    marginRight: 8,
  },
  contact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 14,
    backgroundColor: COLORS.white,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  contactIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  contactText: {
    flex: 1,
  },
  contactTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  contactEmail: {
    fontSize: 13,
    color: COLORS.primary,
    marginTop: 1,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    overflow: 'hidden',
  },
  topic: {
    paddingHorizontal: 16,
  },
  topicHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
  },
  question: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginRight: 12,
    lineHeight: 20,
  },
  answer: {
    paddingBottom: 14,
  },
  paragraph: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 20,
    marginBottom: 10,
  },
  separator: {
    height: 1,
    backgroundColor: COLORS.border,
  },
  footer: {
    fontSize: 12,
    color: COLORS.textLight,
    paddingHorizontal: 20,
    paddingTop: 24,
    lineHeight: 18,
  },
});

export default HelpCenterScreen;

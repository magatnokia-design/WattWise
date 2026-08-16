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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { HELP_SECTIONS } from './helpContent';

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
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
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
        <Text style={styles.intro}>
          How WattWise measures, what it can identify reliably, and what it
          cannot. Where something has a limit, it is stated here rather than
          left to be discovered.
        </Text>

        {HELP_SECTIONS.map((section) => (
          <View key={section.id} style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionIcon}>{section.icon}</Text>
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
          Readings come from the meters in your WattWise unit. Rates follow the
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
  intro: {
    fontSize: 13,
    color: COLORS.textLight,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
    lineHeight: 19,
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
    fontSize: 15,
    marginRight: 8,
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

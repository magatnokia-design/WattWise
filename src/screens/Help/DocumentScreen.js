import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { ABOUT_SECTIONS, PRIVACY_SECTIONS } from './legalContent';

/**
 * Renders About and Privacy from the same section shape.
 *
 * One screen for both because they are the same thing structurally - a titled
 * document of prose and bullet lists - and duplicating the layout would mean two
 * places to keep looking the same. Which document to show arrives as a route
 * param.
 */

const DOCUMENTS = {
  about: { title: 'About WattWise', sections: ABOUT_SECTIONS },
  privacy: { title: 'Privacy Policy', sections: PRIVACY_SECTIONS },
};

export const DocumentScreen = ({ navigation, route }) => {
  const document = DOCUMENTS[route?.params?.document] || DOCUMENTS.about;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{document.title}</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {document.sections.map((section) => (
          <View
            key={section.id}
            style={[styles.card, section.tone === 'warning' ? styles.cardWarning : null]}
          >
            <Text style={styles.sectionTitle}>{section.title}</Text>

            {(section.body || []).map((paragraph, index) => (
              <Text key={`p${index}`} style={styles.paragraph}>
                {paragraph}
              </Text>
            ))}

            {(section.bullets || []).map((bullet, index) => (
              <View key={`b${index}`} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{bullet}</Text>
              </View>
            ))}
          </View>
        ))}
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
    paddingTop: 16,
    paddingBottom: 32,
  },
  card: {
    backgroundColor: COLORS.white,
    marginHorizontal: 16,
    marginBottom: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  // The safety limits are the one section a user must not skim past.
  cardWarning: {
    borderColor: COLORS.warning,
    borderWidth: 1.5,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 10,
  },
  paragraph: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 20,
    marginBottom: 10,
  },
  bulletRow: {
    flexDirection: 'row',
    marginBottom: 7,
  },
  bulletDot: {
    fontSize: 13,
    color: COLORS.primary,
    marginRight: 8,
    lineHeight: 20,
  },
  bulletText: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 20,
  },
});

export default DocumentScreen;

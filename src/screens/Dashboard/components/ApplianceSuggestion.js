// Auto-detection suggestion for one outlet.
//
// Detection is suggestion-first: nothing is renamed until the user confirms.
// When several appliances draw the same wattage the detector cannot separate
// them on measurements alone, so it ranks them and the user picks - that choice
// is then learned, and the same appliance is recognised outright next time.
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { FONTS } from '../../../constants/theme';

const toMetricNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const formatRuntimeLabel = (seconds) => {
  const total = Math.max(0, Math.round(toMetricNumber(seconds)));
  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
};

const formatHeadline = (suggestion) => {
  if (!suggestion?.name) return '';

  return typeof suggestion.confidencePercent === 'number'
    ? `Suggested: ${suggestion.name} (${suggestion.confidencePercent}%)`
    : `Suggested: ${suggestion.name}`;
};

const formatWhy = (suggestion) => {
  const details = [];

  if (typeof suggestion?.meanPowerW === 'number') {
    details.push(`Avg power ${toMetricNumber(suggestion.meanPowerW).toFixed(1)} W`);
  }

  const runtimeLabel = formatRuntimeLabel(suggestion?.runtimeSeconds);
  if (runtimeLabel) {
    details.push(`Runtime ${runtimeLabel}`);
  }

  if (typeof suggestion?.confidencePercent === 'number') {
    details.push(`Confidence ${suggestion.confidencePercent}%`);
  }

  if (typeof suggestion?.sampleCount === 'number') {
    details.push(`Samples ${Math.max(0, Math.round(suggestion.sampleCount))}`);
  }

  return details.length > 0
    ? details.join(' • ')
    : 'Based on recent live power telemetry.';
};

const ApplianceSuggestion = ({
  suggestion,
  expanded,
  disabled = false,
  onToggleWhy,
  onChoose,
}) => {
  if (!suggestion?.showBadge) return null;

  const alternatives = (suggestion.candidates || []).filter(
    (candidate) => candidate.name !== suggestion.name
  );

  // Same-wattage appliances: show the choices immediately rather than making
  // the user open "Why" to discover the suggestion was a coin flip.
  const showPickerInline = suggestion.ambiguous && alternatives.length > 0;

  return (
    <>
      <View style={styles.row}>
        <Text style={styles.headline}>{formatHeadline(suggestion)}</Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.metaButton, expanded && styles.metaButtonActive]}
            onPress={onToggleWhy}
          >
            <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
            <Text style={styles.metaText}>Why</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.action, disabled && styles.actionDisabled]}
            onPress={() => onChoose(suggestion.name)}
            disabled={disabled}
          >
            <Text style={styles.actionText}>Accept</Text>
          </TouchableOpacity>
        </View>
      </View>

      {showPickerInline ? (
        <View style={styles.ambiguousNotice}>
          <Ionicons name="help-circle-outline" size={14} color={COLORS.textDark} />
          <Text style={styles.ambiguousText}>
            Similar wattage — tap the right one and it will be remembered.
          </Text>
        </View>
      ) : null}

      {(showPickerInline || expanded) && alternatives.length > 0 ? (
        <View style={styles.chipRow}>
          {alternatives.map((candidate) => (
            <TouchableOpacity
              key={candidate.name}
              style={[styles.chip, disabled && styles.actionDisabled]}
              onPress={() => onChoose(candidate.name)}
              disabled={disabled}
            >
              <Text style={styles.chipText}>{candidate.name}</Text>
              {typeof candidate.confidencePercent === 'number' ? (
                <Text style={styles.chipMeta}>{candidate.confidencePercent}%</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      {expanded ? (
        <View style={styles.detailCard}>
          <Text style={styles.detailTitle}>Why this suggestion?</Text>
          <Text style={styles.detailText}>{formatWhy(suggestion)}</Text>
        </View>
      ) : null}
    </>
  );
};

const styles = StyleSheet.create({
  row: {
    marginTop: -4,
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.primary + '12',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary + '40',
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 8,
  },
  headline: {
    flex: 1,
    ...FONTS.small,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.primary + '55',
    backgroundColor: COLORS.white,
  },
  metaButtonActive: {
    backgroundColor: COLORS.primary + '14',
    borderColor: COLORS.primary,
  },
  metaText: {
    ...FONTS.small,
    color: COLORS.primary,
    fontWeight: '700',
  },
  action: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  actionDisabled: {
    opacity: 0.55,
  },
  actionText: {
    ...FONTS.small,
    color: COLORS.white,
    fontWeight: '700',
  },
  ambiguousNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: -2,
    marginBottom: 6,
    paddingHorizontal: 2,
  },
  ambiguousText: {
    flex: 1,
    ...FONTS.small,
    color: COLORS.textLight,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
  },
  chipText: {
    ...FONTS.small,
    color: COLORS.textDark,
    fontWeight: '600',
  },
  chipMeta: {
    ...FONTS.small,
    color: COLORS.textLight,
  },
  detailCard: {
    marginTop: -2,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  detailTitle: {
    ...FONTS.small,
    color: COLORS.textDark,
    fontWeight: '700',
    marginBottom: 4,
  },
  detailText: {
    ...FONTS.small,
    color: COLORS.textLight,
    lineHeight: 16,
  },
});

export default ApplianceSuggestion;

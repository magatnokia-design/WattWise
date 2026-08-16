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
import { resolveSuggestionTrust, describeUncertainty } from '../utils/loadStability';

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

/**
 * Amber rather than the suggestion's green: when both are on screen this is the
 * caveat on that offer, and it belongs with the "Not <name>" line it explains
 * rather than with the thing it is qualifying. Matches the web client.
 */
const StaleRunNotice = () => (
  <View style={styles.staleNotice}>
    <Ionicons name="refresh-outline" size={14} color="#B45309" />
    <Text style={styles.staleText}>
      Different appliance detected. Switch this outlet off and on to measure it on
      its own — otherwise this reading still includes the last one.
    </Text>
  </View>
);

const ApplianceSuggestion = ({
  suggestion,
  expanded,
  disabled = false,
  onToggleWhy,
  onChoose,
}) => {
  // Swapping an appliance while the outlet stays on does not restart the
  // measurement, so the run keeps averaging the appliance that has gone with the
  // one that arrived. Observed: a lamp replaced by a fan reported "about 16.3 W"
  // on an outlet drawing 56 W, and the blend inflated the spread from 0.5 to
  // 17.3 - which is a Speaker's signature, so that is what it suggested.
  //
  // The measurements are stale rather than wrong, and the user cannot tell the
  // difference from the outside. Until the detector restarts a run on a sustained
  // level shift, say plainly what clears it.
  //
  // Deliberately NOT inside the suggestion block, and not behind `showBadge`.
  // A blended run can score past the scope ceiling and come back unsupported, so
  // there is no name to offer and `suggestionPending` is false - and gating the
  // hint on the badge hid it in precisely the case the user is most stuck, with a
  // contradicted name, no suggestion, and nothing explaining either. Verified:
  // a 20 W load swapped for a 300 W one gives state 'changed' with
  // suggestionPending false. Caught by the web repo, which shipped it this way
  // and was right to override the instruction I sent.
  const suggestionIsStale = suggestion?.identityState === 'changed';

  if (!suggestion?.showBadge) {
    // The hint still has to render on its own.
    return suggestionIsStale ? <StaleRunNotice /> : null;
  }

  // Whether the top match is a finding or a guess. An iPhone on its charge taper
  // scored Monitor 50 / Speaker 45 / Electric Fan 39 / Laptop Charger 37 - four
  // profiles inside thirteen points - and the card asserted the first of them.
  const trust = resolveSuggestionTrust({
    confidencePercent: suggestion.confidencePercent,
    candidates: suggestion.candidates,
    suggestedName: suggestion.name,
    ambiguous: suggestion.ambiguous,
    meanPowerW: suggestion.meanPowerW,
    stdDevPowerW: suggestion.stdDevPowerW,
  });

  // The leader is filtered out only when it has already been offered above.
  // Where nothing was offered it belongs in the list like everything else - it
  // is a candidate, not a verdict.
  //
  // Filtering it unconditionally meant the phone offered three choices where the
  // web offered four, and the one it withheld was the highest scoring. Measured
  // on the same run, 16 Aug 2026: the unsure card listed Monitor 42 / Electric
  // Fan 38 / Laptop Charger 35 and silently dropped Speaker 53 - so the option
  // the detector rated best was the one option the user could not pick.
  const alternatives = (suggestion.candidates || []).filter(
    (candidate) => !trust.trusted || candidate.name !== suggestion.name
  );

  // Show the choices immediately rather than making the user open "Why" to
  // discover the suggestion was a coin flip.
  const showPickerInline = !trust.trusted && alternatives.length > 0;

  return (
    <>
      {suggestionIsStale ? <StaleRunNotice /> : null}

      <View style={[styles.row, !trust.trusted && styles.rowUnsure]}>
        <Text style={styles.headline}>
          {trust.trusted ? formatHeadline(suggestion) : 'WattWise is not sure what this is'}
        </Text>
        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.metaButton, expanded && styles.metaButtonActive]}
            onPress={onToggleWhy}
          >
            <Ionicons name="information-circle-outline" size={14} color={COLORS.primary} />
            <Text style={styles.metaText}>Why</Text>
          </TouchableOpacity>
          {/* No primary button under a stated doubt. Offering "Accept" beneath
              "WattWise is not sure" contradicts itself; the names below are all
              equally on offer, so the user picks one rather than confirming a
              guess the card has just disowned. */}
          {trust.trusted ? (
            <TouchableOpacity
              style={[styles.action, disabled && styles.actionDisabled]}
              onPress={() => onChoose(suggestion.name)}
              disabled={disabled}
            >
              <Text style={styles.actionText}>Accept</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {!trust.trusted ? (
        <View style={styles.ambiguousNotice}>
          <Ionicons name="help-circle-outline" size={14} color={COLORS.textDark} />
          <Text style={styles.ambiguousText}>
            {describeUncertainty({
              varying: trust.varying,
              swingW: trust.swingW,
              meanPowerW: suggestion.meanPowerW,
            })}
          </Text>
        </View>
      ) : null}

      {showPickerInline ? (
        <View style={styles.ambiguousNotice}>
          <Ionicons name="pricetag-outline" size={14} color={COLORS.textLight} />
          <Text style={styles.ambiguousText}>
            Not one of these? Pick the closest anyway, then rename it under
            Settings. WattWise saves how <Text style={styles.emphasis}>this</Text>{' '}
            appliance draws power, not the name it started from.
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
  staleNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    // Amber, matching the safety "warning" tone already used across the app and
    // the web client's treatment of this same notice.
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  staleText: {
    flex: 1,
    ...FONTS.small,
    color: '#B45309',
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
  emphasis: {
    fontStyle: 'italic',
    fontWeight: '600',
  },
  // Amber rather than the confident green: the card is stating a doubt, and the
  // container should not read as an offer while the text says otherwise.
  rowUnsure: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
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

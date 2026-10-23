// Auto-detection suggestion for one outlet - compact (Oct 2026).
//
// Detection is suggestion-first: nothing is renamed until the user confirms.
// The card offers ONE name, the closest match, and lets the user type the real
// one instead. The capstone panel's case: a 60 W printer and a 60 W electric fan
// draw the same power, and no wattage catalogue can tell them apart - but the
// user standing next to it can. Whatever they confirm, offered or typed, goes
// through the same call (registerApplianceProfile) that names the outlet AND
// saves this appliance's measured power pattern under that name, so the next
// run of the same appliance is matched to the user's own signature and shown
// as "Printer". Typing the name once is how Dagitab learns it.
//
// The ranked list of 3-4 alternatives was removed on request. Doubt is still
// stated: a match the detector is unsure of reads "Not sure · closest:" in
// amber rather than "Looks like", because asserting a coin flip as a finding
// is the failure this card exists to avoid (see CLAUDE.md on identification).
import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../../constants/colors';
import { resolveSuggestionTrust } from '../utils/loadStability';

// registerApplianceProfile trims names to this length.
const MAX_NAME_LENGTH = 40;

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

const formatWhy = (suggestion) => {
  const details = [];
  if (typeof suggestion?.meanPowerW === 'number') {
    details.push(`Average ${toMetricNumber(suggestion.meanPowerW).toFixed(1)} W`);
  }
  const runtime = formatRuntimeLabel(suggestion?.runtimeSeconds);
  if (runtime) details.push(`running ${runtime}`);
  if (typeof suggestion?.confidencePercent === 'number') {
    details.push(`${suggestion.confidencePercent}% match`);
  }
  return details.length > 0
    ? `${details.join(' · ')}. Appliances with the same wattage look alike — type the real name if this is wrong.`
    : 'Based on recent live power readings.';
};

/**
 * The run blends two appliances when one is swapped for another on a live
 * outlet, so the suggestion is for neither. Shown even when there is no
 * suggestion to offer - that is when the user is most stuck.
 */
const StaleRunNotice = () => (
  <View style={styles.staleNotice}>
    <Ionicons name="refresh-outline" size={14} color="#B45309" />
    <Text style={styles.staleText}>
      Different appliance detected. Switch this outlet off and on to measure it on
      its own.
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
  const [typedName, setTypedName] = useState('');
  const suggestionIsStale = suggestion?.identityState === 'changed';

  if (!suggestion?.showBadge) {
    return suggestionIsStale ? <StaleRunNotice /> : null;
  }

  // Whether the top match is a finding or a guess (an iPhone on its charge
  // taper scored four profiles inside thirteen points).
  const trust = resolveSuggestionTrust({
    confidencePercent: suggestion.confidencePercent,
    candidates: suggestion.candidates,
    suggestedName: suggestion.name,
    ambiguous: suggestion.ambiguous,
    meanPowerW: suggestion.meanPowerW,
    stdDevPowerW: suggestion.stdDevPowerW,
  });

  // The closest match. When the detector is unsure, the leader is still the
  // best single guess - it is offered as "closest", not as a verdict.
  const closest = suggestion.name || suggestion.candidates?.[0]?.name || '';
  const typed = typedName.replace(/\s+/g, ' ').trim();

  const saveTyped = () => {
    if (!typed || disabled) return;
    onChoose(typed.slice(0, MAX_NAME_LENGTH));
    setTypedName('');
  };

  return (
    <View style={styles.wrap}>
      {suggestionIsStale ? <StaleRunNotice /> : null}

      {suggestion.askName ? (
        <View style={styles.row}>
          <Ionicons name="help-circle-outline" size={16} color={COLORS.primary} />
          <Text style={styles.headline} numberOfLines={1}>
            <Text style={styles.lead}>Not in Dagitab&apos;s list · </Text>
            <Text style={styles.name}>what is it?</Text>
          </Text>
        </View>
      ) : null}

      {closest ? (
        <View style={[styles.row, !trust.trusted && styles.rowUnsure]}>
          <Text style={styles.headline} numberOfLines={1}>
            <Text style={styles.lead}>{trust.trusted ? 'Looks like ' : 'Not sure · closest: '}</Text>
            <Text style={styles.name}>{closest}</Text>
          </Text>
          <TouchableOpacity
            onPress={onToggleWhy}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityRole="button"
            accessibilityLabel="Why this suggestion"
          >
            <Ionicons
              name={expanded ? 'information-circle' : 'information-circle-outline'}
              size={18}
              color={COLORS.primary}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.use, disabled && styles.disabled]}
            onPress={() => onChoose(closest)}
            disabled={disabled}
            accessibilityRole="button"
            accessibilityLabel={`Use ${closest}`}
          >
            <Text style={styles.useText}>Use</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {expanded ? <Text style={styles.why}>{formatWhy(suggestion)}</Text> : null}

      <View style={styles.typeRow}>
        <TextInput
          style={styles.input}
          value={typedName}
          onChangeText={setTypedName}
          placeholder={closest ? 'Or type the real name, e.g. Printer' : 'Type its name, e.g. Rice Cooker'}
          placeholderTextColor={COLORS.textLight}
          maxLength={MAX_NAME_LENGTH}
          returnKeyType="done"
          onSubmitEditing={saveTyped}
          editable={!disabled}
          autoCapitalize="words"
          accessibilityLabel="Appliance name"
        />
        <TouchableOpacity
          style={[styles.save, (!typed || disabled) && styles.disabled]}
          onPress={saveTyped}
          disabled={!typed || disabled}
          accessibilityRole="button"
          accessibilityLabel="Save appliance name"
        >
          <Text style={styles.saveText}>Save</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingLeft: 10,
    paddingRight: 4,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#ECF8EF',
    borderWidth: 1,
    borderColor: '#B4E5C2',
  },
  // Amber: the card is stating a doubt, so it must not read as an offer.
  rowUnsure: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  headline: {
    flex: 1,
    fontSize: 13,
  },
  lead: {
    color: COLORS.textLight,
  },
  name: {
    color: COLORS.text,
    fontWeight: '700',
  },
  use: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: COLORS.primary,
  },
  useText: {
    color: COLORS.white,
    fontWeight: '700',
    fontSize: 13,
  },
  why: {
    fontSize: 12,
    lineHeight: 17,
    color: COLORS.textLight,
    paddingHorizontal: 2,
  },
  typeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  input: {
    flex: 1,
    height: 36,
    paddingHorizontal: 10,
    paddingVertical: 0,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.background,
    fontSize: 13,
    color: COLORS.text,
  },
  save: {
    height: 36,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveText: {
    color: COLORS.primary,
    fontWeight: '700',
    fontSize: 13,
  },
  disabled: {
    opacity: 0.45,
  },
  staleNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  staleText: {
    flex: 1,
    fontSize: 12,
    color: '#B45309',
  },
});

export default ApplianceSuggestion;

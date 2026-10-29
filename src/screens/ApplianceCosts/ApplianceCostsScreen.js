import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import { useAuth } from '../../hooks/useAuth';
import { OfflineState } from '../../components/common/OfflineNotice';
import { formatCurrency } from '../BudgetTracking/utils/budgetHelpers';
import {
  costPerHour,
  describeApplianceDraw,
  formatHours,
  projectApplianceCost,
} from '../../utils/applianceCost';
import { useApplianceCosts } from './hooks/useApplianceCosts';

/**
 * Appliance costs (Oct 2026): what each saved appliance costs an hour, and a
 * "what would it cost?" calculator.
 *
 * Every figure here is a projection at the user's own rates and is labelled
 * that way. What appliances actually cost over a period is on the Analytics
 * card, which splits measured energy - this screen never restates that as a
 * projection, and nothing here feeds a bill, a budget or the safety cutoff.
 */

const OTHER_KEY = '__other__';
const DEFAULT_DAYS_PER_MONTH = '30';
const MAX_WATTS = 5000;

// Centavos matter at this scale: a 14 W lamp costs P0.15 an hour.
const formatRate = (value) => `₱${Number(value || 0).toFixed(2)}`;

const formatWatts = (draw) => (draw.varies
  ? `${Math.round(draw.minWatts)}–${Math.round(draw.maxWatts)} W`
  : `${draw.watts.toFixed(draw.watts < 10 ? 1 : 0)} W`);

const formatPerHour = (draw, rate) => (draw.varies
  ? `${formatRate(costPerHour(draw.minWatts, rate))}–${formatRate(costPerHour(draw.maxWatts, rate))}`
  : formatRate(costPerHour(draw.watts, rate)));

// A blank field is "not entered", not zero, so it never prints as P0.00.
const parseField = (text) => {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const value = Number(trimmed.replace(',', '.'));
  return Number.isFinite(value) ? value : NaN;
};

const Field = ({ label, value, onChangeText, suffix, placeholder, error, hint }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <View style={[styles.inputWrap, error ? styles.inputWrapError : null]}>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        keyboardType="decimal-pad"
        placeholder={placeholder}
        placeholderTextColor={COLORS.textLight}
        accessibilityLabel={label}
      />
      <Text style={styles.inputSuffix}>{suffix}</Text>
    </View>
    {error ? <Text style={styles.fieldError}>{error}</Text> : null}
    {!error && hint ? <Text style={styles.fieldHint}>{hint}</Text> : null}
  </View>
);

export const ApplianceCostsScreen = ({ navigation }) => {
  const { user } = useAuth();
  const {
    loading,
    ratePerKwh,
    savedAppliances,
    measuredByName,
    measuredWindowDays,
    showOfflineState,
  } = useApplianceCosts(user?.uid);

  const [selectedKey, setSelectedKey] = useState(null);
  const [wattsText, setWattsText] = useState('');
  const [hoursText, setHoursText] = useState('');
  const [daysText, setDaysText] = useState(DEFAULT_DAYS_PER_MONTH);

  const appliances = useMemo(
    () => savedAppliances
      .map((appliance) => ({
        ...appliance,
        key: appliance.label.toLowerCase(),
        draw: describeApplianceDraw(appliance),
        measured: measuredByName.get(appliance.label.toLowerCase()) || null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    [savedAppliances, measuredByName]
  );

  const selected = appliances.find((appliance) => appliance.key === selectedKey) || null;

  // Choosing an appliance fills both fields from what is known about it: its
  // learned draw, and its measured hours when there are any. Either can be
  // overwritten - the calculator answers "what if", not only "what is".
  const selectAppliance = (key) => {
    setSelectedKey(key);
    const appliance = appliances.find((item) => item.key === key);
    if (!appliance) {
      setWattsText('');
      setHoursText('');
      return;
    }
    setWattsText(String(Math.round(appliance.draw.watts * 10) / 10));
    setHoursText(appliance.measured ? String(Math.round(appliance.measured.hoursPerRunDay * 10) / 10) : '');
  };

  // Start on the first saved appliance once they load, or on a typed wattage
  // for an account with none. Once only, so later edits to the fields stick.
  useEffect(() => {
    if (selectedKey !== null || loading || showOfflineState) return;
    selectAppliance(appliances.length ? appliances[0].key : OTHER_KEY);
    // selectAppliance is recreated every render and deliberately not a
    // dependency; `appliances` is what it reads.
  }, [appliances, loading, showOfflineState, selectedKey]);

  const watts = parseField(wattsText);
  const hours = parseField(hoursText);
  const days = parseField(daysText);

  const wattsError = watts !== null && (Number.isNaN(watts) || watts <= 0 || watts > MAX_WATTS)
    ? `Enter a wattage between 1 and ${MAX_WATTS.toLocaleString()}.`
    : '';
  const hoursError = hours !== null && (Number.isNaN(hours) || hours < 0 || hours > 24)
    ? 'A day has 24 hours - enter 0 to 24.'
    : '';
  const daysError = days !== null && (Number.isNaN(days) || days < 0 || days > 31)
    ? 'Enter 0 to 31 days.'
    : '';

  const canProject = watts !== null && hours !== null && days !== null
    && !wattsError && !hoursError && !daysError;
  const projection = canProject
    ? projectApplianceCost({ watts, hoursPerDay: hours, daysPerMonth: days, ratePerKwh })
    : null;
  const perHourOnly = watts !== null && !wattsError ? costPerHour(watts, ratePerKwh) : null;

  const hoursHint = selected?.measured
    ? `Measured: about ${formatHours(selected.measured.hoursPerRunDay)} on each of the ${selected.measured.runDays} day${selected.measured.runDays === 1 ? '' : 's'} it ran in the last ${measuredWindowDays}.`
    : 'Not measured yet - enter your own estimate.';

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <View style={styles.headerTitles}>
          <Text style={styles.headerTitle}>Appliance costs</Text>
          <Text style={styles.headerSub}>What your appliances cost to run</Text>
        </View>
      </View>

      {showOfflineState ? (
        <OfflineState
          title="Can't load your appliances"
          body="No connection right now. Your rate and saved appliances will appear once you're back online."
        />
      ) : loading ? (
        <View style={styles.loading}>
          <ActivityIndicator color={COLORS.primary} />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.rateCard}>
            <Text style={styles.rateValue}>
              {formatRate(ratePerKwh)}
              <Text style={styles.rateUnit}> per kWh</Text>
            </Text>
            <Text style={styles.rateText}>
              Every per-kWh charge on your PELCO III bill, VAT included. Fixed monthly charges are
              left out - they are the same whether an appliance runs or not.
            </Text>
          </View>

          <Text style={styles.sectionTitle}>Your saved appliances</Text>
          <View style={styles.card}>
            {appliances.length === 0 ? (
              <Text style={styles.emptyText}>
                No saved appliances yet. When Dagitab asks what is plugged into an outlet, naming it
                saves it here. You can still use the calculator below with any wattage.
              </Text>
            ) : (
              appliances.map((appliance, index) => (
                <TouchableOpacity
                  key={appliance.key}
                  style={[styles.applianceRow, index > 0 && styles.applianceRowBorder]}
                  onPress={() => selectAppliance(appliance.key)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${appliance.label} in the calculator`}
                >
                  <View style={styles.applianceText}>
                    <Text style={styles.applianceName} numberOfLines={1}>{appliance.label}</Text>
                    <Text style={styles.applianceDetail}>
                      {formatWatts(appliance.draw)}
                      {appliance.measured ? ` · runs about ${formatHours(appliance.measured.hoursPerRunDay)} a day` : ''}
                    </Text>
                  </View>
                  <View style={styles.applianceCost}>
                    <Text style={styles.applianceCostValue}>{formatPerHour(appliance.draw, ratePerKwh)}</Text>
                    <Text style={styles.applianceCostUnit}>per hour</Text>
                  </View>
                </TouchableOpacity>
              ))
            )}
          </View>
          {appliances.some((appliance) => appliance.draw.varies) ? (
            <Text style={styles.footnote}>
              A range means the appliance draws differently at different times - a fan&apos;s speeds,
              or a charger tapering off as the battery fills.
            </Text>
          ) : null}

          <Text style={styles.sectionTitle}>What would it cost?</Text>
          <View style={styles.card}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.chips}
              keyboardShouldPersistTaps="handled"
            >
              {[...appliances.map((appliance) => ({ key: appliance.key, label: appliance.label })),
                { key: OTHER_KEY, label: 'Other' }].map((chip) => {
                const active = chip.key === selectedKey;
                return (
                  <TouchableOpacity
                    key={chip.key}
                    style={[styles.chip, active && styles.chipActive]}
                    onPress={() => selectAppliance(chip.key)}
                    activeOpacity={0.7}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                  >
                    <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                      {chip.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <Field
              label="Power"
              value={wattsText}
              onChangeText={setWattsText}
              suffix="W"
              placeholder="e.g. 60"
              error={wattsError}
              hint={selected?.draw.varies
                ? `Saved patterns range ${formatWatts(selected.draw)}; this is the most recent.`
                : ''}
            />
            <View style={styles.fieldRow}>
              <View style={styles.fieldHalf}>
                <Field
                  label="Hours a day"
                  value={hoursText}
                  onChangeText={setHoursText}
                  suffix="h"
                  placeholder="e.g. 8"
                  error={hoursError}
                />
              </View>
              <View style={styles.fieldHalf}>
                <Field
                  label="Days a month"
                  value={daysText}
                  onChangeText={setDaysText}
                  suffix="days"
                  placeholder="30"
                  error={daysError}
                />
              </View>
            </View>
            {!hoursError ? <Text style={styles.fieldHint}>{selected ? hoursHint : 'Enter your own estimate.'}</Text> : null}

            <View style={styles.results}>
              {[
                ['Per hour', projection ? formatRate(projection.perHour) : (perHourOnly !== null ? formatRate(perHourOnly) : '—')],
                ['Per day', projection ? formatCurrency(projection.perDay) : '—'],
                ['Per month', projection ? formatCurrency(projection.perMonth) : '—'],
              ].map(([label, value]) => (
                <View key={label} style={styles.result}>
                  <Text style={styles.resultLabel}>{label}</Text>
                  <Text style={[styles.resultValue, label === 'Per month' && styles.resultValueStrong]}>{value}</Text>
                </View>
              ))}
            </View>
            {projection ? (
              <Text style={styles.footnote}>
                {projection.kWhPerMonth.toFixed(2)} kWh a month. An estimate at your current rates,
                assuming it draws {watts} W the whole time it runs - not your bill.
              </Text>
            ) : null}
          </View>
        </ScrollView>
      )}
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
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backButton: {
    padding: 4,
    marginRight: 8,
  },
  headerTitles: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.text,
  },
  headerSub: {
    fontSize: 13,
    color: COLORS.textLight,
    marginTop: 2,
  },
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  rateCard: {
    backgroundColor: '#ECF8EF',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
  },
  rateValue: {
    fontSize: 24,
    fontWeight: '800',
    color: COLORS.primaryDark,
  },
  rateUnit: {
    fontSize: 14,
    fontWeight: '600',
  },
  rateText: {
    fontSize: 12.5,
    color: COLORS.text,
    marginTop: 4,
    lineHeight: 18,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 8,
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 19,
  },
  applianceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
  },
  applianceRowBorder: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  applianceText: {
    flex: 1,
  },
  applianceName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  applianceDetail: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
  },
  applianceCost: {
    alignItems: 'flex-end',
  },
  applianceCostValue: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
  },
  applianceCostUnit: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  footnote: {
    fontSize: 11.5,
    color: COLORS.textLight,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 16,
  },
  chips: {
    gap: 8,
    paddingBottom: 12,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    maxWidth: 180,
  },
  chipActive: {
    backgroundColor: COLORS.primary,
    borderColor: COLORS.primary,
  },
  chipText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  chipTextActive: {
    color: COLORS.white,
  },
  field: {
    marginBottom: 10,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: 10,
  },
  fieldHalf: {
    flex: 1,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 4,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
  },
  inputWrapError: {
    borderColor: COLORS.error,
  },
  input: {
    flex: 1,
    paddingVertical: 9,
    fontSize: 15,
    color: COLORS.text,
  },
  inputSuffix: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  fieldError: {
    fontSize: 11.5,
    color: COLORS.error,
    marginTop: 4,
  },
  fieldHint: {
    fontSize: 11.5,
    color: COLORS.textLight,
    marginTop: -4,
    marginBottom: 6,
  },
  results: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    marginBottom: 6,
  },
  result: {
    flex: 1,
    backgroundColor: COLORS.background,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  resultLabel: {
    fontSize: 11,
    color: COLORS.textLight,
  },
  resultValue: {
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 2,
  },
  resultValueStrong: {
    color: COLORS.primaryDark,
  },
});

export default ApplianceCostsScreen;

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Linking,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import { WEB_APP_LINKS } from '../../../constants/webApp';
import {
  SUPPLY_RATE_FIELDS,
  RATE_EFFECTIVE_DATE,
  calculatePelcoIIIBill,
  normalizeSupplyRates,
  sumSupplyRates,
} from '../../../utils/billing';
import { validateSupplyRates } from '../utils/settingsHelpers';

export const PELCO3_RATES_URL = 'https://www.pelco3.org/rates.php';

const PRIMARY_FIELD = SUPPLY_RATE_FIELDS.find((field) => field.primary);
const ADVANCED_FIELDS = SUPPLY_RATE_FIELDS.filter((field) => !field.primary);

// Rates print to 4 decimals on the bill; keep that precision through editing.
const toInputValue = (value) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(4) : '';
};

const buildInitialValues = (rates) => {
  const normalized = normalizeSupplyRates(rates);
  return SUPPLY_RATE_FIELDS.reduce((values, field) => {
    values[field.key] = toInputValue(normalized[field.key]);
    return values;
  }, {});
};

/**
 * Editor for PELCO III Block 1 (generation & transmission).
 *
 * Only Block 1 is editable: distribution and government charges are
 * ERC-approved constants, so exposing them would invite the user to break a
 * figure they cannot legitimately change.
 */
const SupplyRateModal = ({ visible, currentRates, onClose, onSave }) => {
  const { width } = useWindowDimensions();
  const [values, setValues] = useState(() => buildInitialValues(currentRates));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (visible) {
      setValues(buildInitialValues(currentRates));
      setShowAdvanced(false);
      setSaving(false);
      setError(null);
    }
  }, [visible, currentRates]);

  const parsedRates = useMemo(() => {
    return SUPPLY_RATE_FIELDS.reduce((rates, field) => {
      const raw = String(values[field.key] ?? '').trim();
      // A blank advanced field means "use the default", not zero.
      rates[field.key] = raw === '' ? field.defaultValue : Number(raw);
      return rates;
    }, {});
  }, [values]);

  // Live feedback: the running Block 1 sum plus what a full bill would cost per
  // kWh at these rates, so a mistyped digit is obvious before saving.
  const genTransTotal = useMemo(() => sumSupplyRates(parsedRates), [parsedRates]);
  const projectedEffectiveRate = useMemo(() => {
    const bill = calculatePelcoIIIBill(100, { supplyRates: parsedRates });
    return Number(bill?.effectiveRate) || 0;
  }, [parsedRates]);

  /*
   * The same rule the web client applies, from the same function.
   *
   * This screen had a generation > 0 check from the start and the web had none,
   * so the two clients disagreed about what a valid tariff was. Sharing the
   * check means a rule added for one is a rule both get - and it adds two the
   * phone was missing: a non-adjustment line cannot go negative, and an
   * implausible Block 1 total is called out before it prices a month.
   */
  const check = useMemo(
    () => validateSupplyRates(values, SUPPLY_RATE_FIELDS),
    [values]
  );
  const canSave = check.valid;

  const handleChange = useCallback((key, text) => {
    // Allow a leading minus: Gen. Rate Adj is a credit on every real bill.
    const cleaned = text.replace(/[^0-9.-]/g, '');
    setValues((previous) => ({ ...previous, [key]: cleaned }));
    setError(null);
  }, []);

  const handleOpenPelco = useCallback(() => {
    Linking.openURL(PELCO3_RATES_URL).catch(() => {
      setError('Could not open the PELCO III website.');
    });
  }, []);

  const handleOpenWeb = useCallback(() => {
    Linking.openURL(WEB_APP_LINKS.settings).catch(() => {
      setError('Could not open wattwise.site.');
    });
  }, []);

  const handleSave = useCallback(async () => {
    if (!canSave) {
      const field = SUPPLY_RATE_FIELDS.find((entry) => check.errors[entry.key]);
      setError(`${field.label}: ${check.errors[field.key]}`);
      return;
    }

    setSaving(true);
    const result = await onSave?.(parsedRates);
    setSaving(false);

    if (result && result.success === false) {
      setError(result.error || 'Could not save rates.');
      return;
    }

    onClose?.();
  }, [canSave, check.errors, onSave, onClose, parsedRates]);

  const renderField = (field) => (
    <View key={field.key} style={styles.fieldRow}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <TextInput
        style={styles.fieldInput}
        value={values[field.key]}
        onChangeText={(text) => handleChange(field.key, text)}
        keyboardType="numbers-and-punctuation"
        placeholder={toInputValue(field.defaultValue)}
        placeholderTextColor={COLORS.textLight}
      />
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <View style={[styles.card, { width: Math.min(width - 40, 420) }]}>
            <View style={styles.header}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Electricity Rates</Text>
                <Text style={styles.subtitle}>PELCO III residential tariff</Text>
              </View>
              <TouchableOpacity onPress={onClose} activeOpacity={0.7}>
                <Text style={styles.close}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator
            >
              <Text style={styles.sectionLabel}>
                Generation Rate <Text style={styles.required}>*required</Text>
              </Text>
              <View style={styles.primaryRow}>
                <TextInput
                  style={styles.primaryInput}
                  value={values[PRIMARY_FIELD.key]}
                  onChangeText={(text) => handleChange(PRIMARY_FIELD.key, text)}
                  keyboardType="numbers-and-punctuation"
                  placeholder={toInputValue(PRIMARY_FIELD.defaultValue)}
                  placeholderTextColor={COLORS.textLight}
                />
                <Text style={styles.primaryUnit}>₱/kWh</Text>
              </View>

              <TouchableOpacity
                style={styles.linkCard}
                onPress={handleOpenPelco}
                activeOpacity={0.7}
              >
                <Text style={styles.linkIcon}>🔗</Text>
                <View style={styles.linkTextWrap}>
                  <Text style={styles.linkTitle}>Get the official rate</Text>
                  <Text style={styles.linkSub}>
                    Read this month&apos;s generation rate from your bill, or open
                    pelco3.org/rates.php
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.advancedToggle}
                onPress={() => setShowAdvanced((previous) => !previous)}
                activeOpacity={0.7}
              >
                <Text style={styles.advancedToggleText}>
                  {showAdvanced ? '▾' : '▸'} Advanced ({ADVANCED_FIELDS.length} fields)
                </Text>
              </TouchableOpacity>

              {showAdvanced && (
                <View style={styles.advancedBlock}>
                  <Text style={styles.advancedHint}>
                    Leave blank to use the default. Negative values are credits.
                  </Text>
                  {ADVANCED_FIELDS.map(renderField)}

                  {/* One line, not a banner: this only appears once the user has
                      opened several decimal fields, which is the point where a
                      keyboard genuinely helps. Every field still works here. */}
                  <TouchableOpacity onPress={handleOpenWeb} activeOpacity={0.7}>
                    <Text style={styles.webHint}>
                      Lots to type? Enter these on wattwise.site with your bill in
                      hand →
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              <View style={styles.previewCard}>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Gen/Trans total</Text>
                  <Text style={styles.previewValue}>₱{genTransTotal.toFixed(4)} /kWh</Text>
                </View>
                <View style={styles.previewRow}>
                  <Text style={styles.previewLabel}>Projected effective</Text>
                  <Text style={styles.previewValueStrong}>
                    ₱{projectedEffectiveRate.toFixed(2)} /kWh
                  </Text>
                </View>
              </View>

              <Text style={styles.footnote}>
                Distribution and government charges are ERC-approved rates, current
                as of {RATE_EFFECTIVE_DATE}. Generation and transmission change
                monthly — update them here from the official PELCO III posting.
              </Text>

              {error ? <Text style={styles.error}>{error}</Text> : null}
            </ScrollView>

            <View style={styles.actions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={onClose}
                activeOpacity={0.7}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveButton, (!canSave || saving) && styles.saveButtonDisabled]}
                onPress={handleSave}
                disabled={!canSave || saving}
                activeOpacity={0.8}
              >
                <Text style={styles.saveText}>{saving ? 'Saving…' : 'Save Rates'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  keyboardWrap: {
    width: '100%',
    alignItems: 'center',
  },
  card: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    // Leaves room for the status bar and the Android navigation bar, so the
    // scrolling body is never clipped against a system chrome edge.
    maxHeight: '78%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  headerText: {
    flex: 1,
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
    marginTop: 2,
  },
  close: {
    fontSize: 18,
    color: COLORS.textLight,
    paddingHorizontal: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  // Without trailing space the last line of the footnote sits flush against the
  // action bar and reads as cut off.
  bodyContent: {
    paddingBottom: 20,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 8,
  },
  required: {
    color: COLORS.primary,
    fontWeight: '600',
  },
  primaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  primaryInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  primaryUnit: {
    marginLeft: 10,
    fontSize: 14,
    color: COLORS.textLight,
    fontWeight: '600',
  },
  linkCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  linkIcon: {
    fontSize: 16,
    marginRight: 10,
  },
  linkTextWrap: {
    flex: 1,
  },
  linkTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.primary,
  },
  linkSub: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 2,
    lineHeight: 17,
  },
  advancedToggle: {
    paddingVertical: 14,
  },
  advancedToggleText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  advancedBlock: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    paddingTop: 12,
  },
  advancedHint: {
    fontSize: 11,
    color: COLORS.textLight,
    marginBottom: 10,
  },
  webHint: {
    fontSize: 11,
    color: COLORS.primaryDark,
    fontWeight: '600',
    marginTop: 6,
    lineHeight: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  fieldLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.text,
    // Long labels like "Trans. Demand Adj" wrap rather than colliding with the
    // input, which is what made the advanced list look cramped.
    paddingRight: 12,
    lineHeight: 18,
  },
  fieldInput: {
    width: 104,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    fontSize: 13,
    color: COLORS.text,
    textAlign: 'right',
  },
  previewCard: {
    backgroundColor: COLORS.background,
    borderRadius: 10,
    padding: 14,
    marginTop: 16,
  },
  previewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  previewLabel: {
    fontSize: 13,
    color: COLORS.textLight,
  },
  previewValue: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.text,
  },
  previewValueStrong: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.primary,
  },
  footnote: {
    fontSize: 11,
    color: COLORS.textLight,
    lineHeight: 16,
    marginTop: 14,
    marginBottom: 8,
  },
  error: {
    fontSize: 12,
    color: COLORS.error,
    marginBottom: 8,
  },
  actions: {
    flexDirection: 'row',
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  cancelButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.border,
    alignItems: 'center',
    marginRight: 10,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  saveButton: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveText: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.white,
  },
});

export default SupplyRateModal;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  useWindowDimensions,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { COLORS } from '../../../constants/colors';
import { invoiceService } from '../../../services/firebase';
import { SUPPLY_RATE_FIELDS, normalizeSupplyRates } from '../../../utils/billing';
import { validateSupplyRates } from '../utils/settingsHelpers';
import { isConnectivityError } from '../../../utils/connectivity';
import { OfflineState } from '../../../components/common/OfflineNotice';
import { useOfflineRetry } from '../../../hooks/useOfflineRetry';

const PRIMARY_FIELD = SUPPLY_RATE_FIELDS.find((field) => field.primary);
const ADVANCED_FIELDS = SUPPLY_RATE_FIELDS.filter((field) => !field.primary);

const STATUS_COPY = {
  DRAFT: { label: 'Estimate', tone: 'warn' },
  PENDING: { label: 'Awaiting official rate', tone: 'warn' },
  FINALIZED: { label: 'Final', tone: 'good' },
};

const formatMonthName = (billingMonth) => {
  const [year, month] = String(billingMonth).split('-').map(Number);
  if (!year || !month) return String(billingMonth);
  const name = new Date(Date.UTC(year, month - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${name} ${year}`;
};

const peso = (value) => {
  const amount = Number(value) || 0;
  return `₱${amount.toFixed(2)}`;
};

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
 * Monthly statements, and the one place a closed month can be finalized.
 *
 * PELCO III publishes each month's generation rate only after the period ends,
 * so a statement is emailed as an estimate and stays PENDING until the real
 * figure is entered. The `finalizeInvoice` callable has always existed to do
 * that; nothing in the app called it, so every statement stayed an estimate for
 * ever and the emailed PDF instructed the reader to tap a control that did not
 * exist.
 *
 * Two views in one Modal rather than a second layer over the first. This app
 * has never nested one Modal inside another, and the rate form is where the
 * user is looking - opening it over the list would cover the figure they are
 * checking the rate against.
 */
const StatementsModal = ({ visible, userId, onClose }) => {
  const { width } = useWindowDimensions();

  const [loading, setLoading] = useState(false);
  const [invoices, setInvoices] = useState([]);
  const [loadFailure, setLoadFailure] = useState(null);

  // Which month the rate form is open for. null means the list is showing.
  const [editing, setEditing] = useState(null);
  const [values, setValues] = useState(() => buildInitialValues(null));
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null);

  // Re-sending the statement email is separate from finalizing and has its own
  // outcome: it can succeed on a month there is nothing to finalize, and it
  // fails for its own reasons (a period still open, or the one-per-minute
  // throttle on PDF rendering).
  const [emailing, setEmailing] = useState(false);
  const [emailNote, setEmailNote] = useState(null);

  // Which statement is on screen right now, readable from inside an awaited
  // callback. Rendering a PDF takes a moment, and in that moment the user can
  // go back and open a different month - without this, "Sent." would appear
  // under the wrong statement.
  const editingRef = useRef(null);
  useEffect(() => {
    editingRef.current = editing;
  }, [editing]);

  const load = useCallback(async () => {
    if (!userId) return;

    setLoading(true);
    setLoadFailure(null);

    const response = await invoiceService.getInvoices(userId);

    if (response.success) {
      setInvoices(response.data);
    } else {
      setInvoices([]);
      setLoadFailure(response);
    }

    setLoading(false);
  }, [userId]);

  useEffect(() => {
    if (!visible) return;

    // Reset to the list every time it opens, so a half-typed rate from last
    // time is never sitting there against a different month.
    setEditing(null);
    setResult(null);
    setFormError(null);
    setEmailNote(null);
    setErrors({});
    setShowAdvanced(false);
    load();
  }, [visible, load]);

  const openStatement = useCallback((invoice) => {
    setEditing(invoice);
    // Seeded from whatever priced the estimate, so the user edits one number
    // rather than retyping Block 1 from scratch.
    setValues(buildInitialValues(invoice.supplyRates));
    setErrors({});
    setFormError(null);
    setResult(null);
    setEmailNote(null);
    setShowAdvanced(false);
  }, []);

  const backToList = useCallback(() => {
    setEditing(null);
    setResult(null);
    setFormError(null);
    setEmailNote(null);
  }, []);

  const handleResend = useCallback(async () => {
    if (!editing) return;

    const month = editing.billingMonth;

    setEmailing(true);
    setEmailNote(null);

    const response = await invoiceService.resendStatement(month);

    // Always cleared, whichever statement is on screen now - leaving it set
    // would carry a spinner onto the next month the user opens.
    setEmailing(false);

    // The user may have moved on while the PDF rendered. Reporting an outcome
    // for a statement they are no longer looking at is worse than reporting
    // none, so the send stands and the message is dropped.
    if (editingRef.current?.billingMonth !== month) return;

    setEmailNote(
      response.success
        ? { tone: 'good', text: 'Sent. Check your inbox, and your spam folder.' }
        : {
          tone: 'bad',
          text: isConnectivityError(response)
            ? 'No connection — the statement was not sent.'
            : response.error || 'Could not send the statement.',
        }
    );
  }, [editing]);

  const handleChange = useCallback((key, text) => {
    setValues((current) => ({ ...current, [key]: text }));
    setErrors((current) => {
      if (!current[key]) return current;
      const next = { ...current };
      delete next[key];
      return next;
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!editing) return;

    const validation = validateSupplyRates(values, SUPPLY_RATE_FIELDS);
    if (Object.keys(validation.errors).length > 0) {
      setErrors(validation.errors);
      return;
    }

    setSaving(true);
    setFormError(null);

    const supplyRates = SUPPLY_RATE_FIELDS.reduce((rates, field) => {
      const raw = String(values[field.key] ?? '').trim();
      if (raw !== '') rates[field.key] = Number(raw);
      return rates;
    }, {});

    const response = await invoiceService.finalizeInvoice(editing.billingMonth, supplyRates);

    setSaving(false);

    if (!response.success) {
      // Inline, not a dialog: this is a Modal, and a dialog over it would cover
      // the field the message is about.
      setFormError(
        isConnectivityError(response)
          ? 'No connection — the statement could not be finalized. Nothing has changed.'
          : response.error || 'Could not finalize this statement.'
      );
      return;
    }

    setResult(response.data);
    load();
  }, [editing, values, load]);

  // Only while the list itself could not be read, and only while the modal is
  // open - a rate form the user is mid-way through typing must never be torn
  // out from under them by a background reload.
  useOfflineRetry(
    visible && !editing && !!loadFailure && isConnectivityError(loadFailure),
    load
  );

  const pendingCount = useMemo(
    () => invoices.filter((invoice) => invoice.status === 'PENDING').length,
    [invoices]
  );

  const renderList = () => {
    if (loading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={styles.centeredText}>Loading your statements</Text>
        </View>
      );
    }

    if (loadFailure && isConnectivityError(loadFailure)) {
      return (
        <OfflineState
          compact
          style={styles.offline}
          title="Can't load your statements"
          body="They are stored on your account and need a connection to read. Nothing has been lost."
          onRetry={load}
        />
      );
    }

    if (loadFailure) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{loadFailure.error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={load} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Try again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (invoices.length === 0) {
      return (
        <View style={styles.centered}>
          <Text style={styles.emptyIcon}>🧾</Text>
          <Text style={styles.emptyTitle}>No statements yet</Text>
          <Text style={styles.emptyBody}>
            One is prepared and emailed to you when a billing month ends.
          </Text>
        </View>
      );
    }

    return (
      <>
        {pendingCount > 0 ? (
          <View style={styles.notice}>
            <Text style={styles.noticeText}>
              {pendingCount === 1
                ? 'One statement is priced with an estimated rate.'
                : `${pendingCount} statements are priced with estimated rates.`}
              {' '}Enter the official generation rate from your paper bill to finalize.
            </Text>
          </View>
        ) : null}

        {invoices.map((invoice) => {
          const status = STATUS_COPY[invoice.status] || STATUS_COPY.DRAFT;

          // Every row opens, not just the ones awaiting a rate: a month already
          // final still has a statement worth emailing, and one that can be
          // recomputed if the rate was typed wrong.
          return (
            <TouchableOpacity
              key={invoice.billingMonth}
              style={styles.row}
              activeOpacity={0.7}
              onPress={() => openStatement(invoice)}
              accessibilityRole="button"
            >
              <View style={styles.rowMain}>
                <Text style={styles.rowMonth}>{formatMonthName(invoice.billingMonth)}</Text>
                <Text style={styles.rowMeta}>
                  {Number(invoice.totalKwh || 0).toFixed(2)} kWh
                  {Number.isFinite(invoice.daysMeasured)
                    ? ` · ${invoice.daysMeasured} of ${invoice.billingDays} days measured`
                    : ''}
                </Text>
                <View
                  style={[
                    styles.badge,
                    status.tone === 'good' ? styles.badgeGood : styles.badgeWarn,
                  ]}
                >
                  <Text
                    style={[
                      styles.badgeText,
                      status.tone === 'good' ? styles.badgeTextGood : styles.badgeTextWarn,
                    ]}
                  >
                    {status.label}
                  </Text>
                </View>
              </View>

              <View style={styles.rowRight}>
                <Text style={styles.rowAmount}>{peso(invoice.totalAmountDue)}</Text>
                <Text style={styles.rowArrow}>›</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </>
    );
  };

  const renderResult = () => (
    <View style={styles.resultCard}>
      <Text style={styles.resultTitle}>
        {formatMonthName(result.billingMonth)} is final
      </Text>
      <Text style={styles.resultAmount}>{peso(result.totalAmountDue)}</Text>
      <Text style={styles.resultMeta}>
        Effective rate {peso(result.effectiveRate)}/kWh
      </Text>

      {/* The shift from the estimate, named rather than left to be discovered.
          A total that moves without explanation reads as a bug. */}
      {result.delta && Number.isFinite(result.delta.difference) ? (
        <Text style={styles.resultDelta}>
          {result.delta.difference === 0
            ? 'Exactly what the estimate said.'
            : `${result.delta.difference > 0 ? 'Up' : 'Down'} ${peso(Math.abs(result.delta.difference))} from the estimate.`}
        </Text>
      ) : null}

      {/* The obvious next thing to want: the emailed copy still shows the
          estimate, and the PDF is rendered fresh on each send. */}
      <View style={styles.resultActions}>
        {renderResend()}

        <TouchableOpacity style={styles.primaryButton} onPress={backToList} activeOpacity={0.8}>
          <Text style={styles.primaryButtonText}>Done</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  const renderField = (field) => (
    <View key={field.key} style={styles.field}>
      <Text style={styles.fieldLabel}>{field.label}</Text>
      <TextInput
        style={[styles.input, errors[field.key] ? styles.inputError : null]}
        value={values[field.key]}
        onChangeText={(text) => handleChange(field.key, text)}
        keyboardType="decimal-pad"
        placeholder={toInputValue(field.defaultValue)}
        placeholderTextColor={COLORS.textLight}
        editable={!saving}
      />
      {errors[field.key] ? (
        <Text style={styles.fieldError}>{errors[field.key]}</Text>
      ) : null}
    </View>
  );

  /**
   * Emailing the statement again. Offered on any closed month, including one
   * already finalized - the PDF is rendered fresh on each send, so this is also
   * how a statement picks up a rate entered after its original email went out.
   */
  const renderResend = () => {
    // The backend refuses a period that has not closed, so an open month must
    // not be offered a button that can only fail.
    if (editing.status === 'DRAFT') return null;

    return (
      <View style={styles.resendBlock}>
        <TouchableOpacity
          style={[styles.secondaryButton, emailing ? styles.primaryButtonDisabled : null]}
          onPress={handleResend}
          disabled={emailing}
          activeOpacity={0.8}
        >
          {emailing ? (
            <ActivityIndicator color={COLORS.primary} />
          ) : (
            <Text style={styles.secondaryButtonText}>✉  Email me this statement</Text>
          )}
        </TouchableOpacity>

        {emailNote ? (
          <Text
            style={[
              styles.emailNote,
              emailNote.tone === 'good' ? styles.emailNoteGood : styles.emailNoteBad,
            ]}
          >
            {emailNote.text}
          </Text>
        ) : (
          <Text style={styles.resendHint}>
            Sends the PDF to your account email. One per minute.
          </Text>
        )}
      </View>
    );
  };

  const renderForm = () => {
    if (result) return renderResult();

    // A finalized month can be finalized again. The rate is typed by hand off a
    // paper bill, so it can be typed wrong, and PELCO III occasionally revises
    // a published figure - a locked total nobody can correct is worse than one
    // that records what it was corrected from. The backend keeps the original
    // estimate as the baseline however many times this runs.
    const isFinalized = editing.status === 'FINALIZED';
    const canFinalize = editing.status === 'PENDING' || isFinalized;

    return (
      <>
        <View style={styles.estimateCard}>
          <Text style={styles.estimateLabel}>
            {editing.status === 'FINALIZED' ? 'Final amount' : 'Current estimate'}
          </Text>
          <Text style={styles.estimateAmount}>{peso(editing.totalAmountDue)}</Text>
          <Text style={styles.estimateMeta}>
            {Number(editing.totalKwh || 0).toFixed(2)} kWh over{' '}
            {formatMonthName(editing.billingMonth)}
          </Text>
        </View>

        {renderResend()}

        {/* A month that is already final, or still open, has nothing to apply a
            rate to - the callable refuses both. Only the form is hidden; the
            statement and its email stay available. */}
        {!canFinalize ? (
          <Text style={styles.settledNote}>
            This period is still running. It can be finalized once the month ends.
          </Text>
        ) : null}

        {canFinalize ? (
          <>
        <Text style={styles.formIntro}>
          {isFinalized
            ? `This month is already locked to an official rate. Entering a different one for ${formatMonthName(editing.billingMonth)} recomputes it and replaces the figure above.`
            : `Enter the generation rate printed on your PELCO III bill for ${formatMonthName(editing.billingMonth)}. The other Block 1 lines keep their current values unless you change them.`}
        </Text>

        {renderField(PRIMARY_FIELD)}

        <TouchableOpacity
          style={styles.advancedToggle}
          onPress={() => setShowAdvanced((current) => !current)}
          activeOpacity={0.7}
        >
          <Text style={styles.advancedToggleText}>
            {showAdvanced ? 'Hide the other rates' : 'Enter the other rates too'}
          </Text>
        </TouchableOpacity>

        {showAdvanced ? ADVANCED_FIELDS.map(renderField) : null}

        {formError ? <Text style={styles.formError}>{formError}</Text> : null}

        <Text style={styles.caution}>
          {isFinalized
            ? 'The original estimate is kept as the comparison, however many times this month is recomputed. Distribution and government charges are ERC-approved and are not editable.'
            : 'Finalizing recomputes this month with the rates above and locks it. Distribution and government charges are ERC-approved and are not editable.'}
        </Text>

        <TouchableOpacity
          style={[styles.primaryButton, saving ? styles.primaryButtonDisabled : null]}
          onPress={handleSubmit}
          disabled={saving}
          activeOpacity={0.8}
        >
          {saving ? (
            <ActivityIndicator color={COLORS.white} />
          ) : (
            <Text style={styles.primaryButtonText}>
              {isFinalized ? 'Recompute with this rate' : 'Apply official rate'}
            </Text>
          )}
        </TouchableOpacity>
          </>
        ) : null}
      </>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
        >
          <View style={[styles.sheet, { width: Math.min(width - 32, 480) }]}>
            <View style={styles.header}>
              {editing && !result ? (
                <TouchableOpacity onPress={backToList} activeOpacity={0.7} style={styles.back}>
                  <Text style={styles.backText}>‹</Text>
                </TouchableOpacity>
              ) : null}

              <Text style={styles.title}>
                {editing ? formatMonthName(editing.billingMonth) : 'Monthly statements'}
              </Text>

              <TouchableOpacity onPress={onClose} activeOpacity={0.7} style={styles.close}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.body}
              contentContainerStyle={styles.bodyContent}
              keyboardShouldPersistTaps="handled"
            >
              {editing ? renderForm() : renderList()}
            </ScrollView>
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
  // `flex: 1` is load-bearing, not tidiness. Without a parent that has a
  // height, the sheet's percentage maxHeight below resolves against nothing:
  // the card collapsed to less than its content, and since Android does not
  // reliably clip on `overflow: 'hidden'`, the status badge drew outside the
  // white card and over the screen behind it.
  keyboardWrap: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sheet: {
    backgroundColor: COLORS.white,
    borderRadius: 16,
    maxHeight: '85%',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  // Both are icon-sized glyphs, so the padding is the tap target.
  back: { paddingRight: 12, paddingVertical: 4 },
  backText: { fontSize: 26, color: COLORS.primary, lineHeight: 28 },
  title: { flex: 1, fontSize: 16, fontWeight: '700', color: COLORS.text },
  close: { paddingLeft: 12, paddingVertical: 4, paddingRight: 2 },
  closeText: { fontSize: 18, color: COLORS.textLight },

  // Shrinks to whatever the sheet has left after the header, rather than a
  // fixed 520 that could be taller than the sheet itself on a short screen.
  body: { flexShrink: 1 },
  bodyContent: { padding: 16, paddingBottom: 20 },

  centered: { alignItems: 'center', paddingVertical: 28 },
  centeredText: { marginTop: 10, fontSize: 13, color: COLORS.textLight },
  errorText: { fontSize: 13, color: COLORS.error, textAlign: 'center', marginBottom: 12 },
  retryButton: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: COLORS.primary,
  },
  retryButtonText: { color: COLORS.white, fontWeight: '600', fontSize: 13 },
  offline: { marginVertical: 4 },

  emptyIcon: { fontSize: 32, marginBottom: 8 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 4 },
  emptyBody: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    paddingHorizontal: 12,
  },

  notice: {
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    padding: 12,
    marginBottom: 12,
  },
  noticeText: { fontSize: 12.5, color: '#92400E', lineHeight: 18 },

  // A row is a button when the month can be finalized, so it needs a target
  // worth aiming at rather than a 12pt strip of text.
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: COLORS.white,
    minHeight: 72,
  },
  rowMain: { flex: 1, paddingRight: 12 },
  rowMonth: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  rowMeta: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },
  badge: {
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
  },
  badgeGood: { backgroundColor: '#ECFDF5' },
  badgeWarn: { backgroundColor: '#FEF3C7' },
  badgeText: { fontSize: 10.5, fontWeight: '700' },
  badgeTextGood: { color: COLORS.primaryDark },
  badgeTextWarn: { color: '#92400E' },
  rowRight: { alignItems: 'flex-end', flexDirection: 'row' },
  rowAmount: { fontSize: 14.5, fontWeight: '700', color: COLORS.text },
  rowArrow: { fontSize: 20, color: COLORS.textLight, marginLeft: 6, lineHeight: 20 },

  estimateCard: {
    backgroundColor: COLORS.background,
    borderRadius: 12,
    padding: 14,
    marginBottom: 14,
  },
  estimateLabel: { fontSize: 11.5, color: COLORS.textLight, letterSpacing: 0.4 },
  estimateAmount: { fontSize: 24, fontWeight: '700', color: COLORS.text, marginTop: 2 },
  estimateMeta: { fontSize: 12, color: COLORS.textLight, marginTop: 2 },

  formIntro: { fontSize: 13, color: COLORS.textDark, lineHeight: 19, marginBottom: 14 },

  field: { marginBottom: 12 },
  fieldLabel: { fontSize: 12.5, color: COLORS.textDark, marginBottom: 5, fontWeight: '600' },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: COLORS.white,
  },
  inputError: { borderColor: COLORS.error },
  fieldError: { fontSize: 11.5, color: COLORS.error, marginTop: 4 },

  // Was a bare line of green text, which does not read as something you can
  // press. Bordered, full width, and tall enough to hit.
  advancedToggle: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 2,
    marginBottom: 14,
    alignItems: 'center',
  },
  advancedToggleText: { fontSize: 13.5, color: COLORS.primary, fontWeight: '600' },

  formError: {
    fontSize: 12.5,
    color: COLORS.error,
    marginTop: 4,
    marginBottom: 8,
    lineHeight: 18,
  },
  caution: {
    fontSize: 11.5,
    color: COLORS.textLight,
    lineHeight: 17,
    marginTop: 4,
    marginBottom: 14,
  },

  primaryButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 999,
    paddingVertical: 15,
    minHeight: 50,
    justifyContent: 'center',
    alignItems: 'center',
  },
  primaryButtonDisabled: { opacity: 0.7 },
  primaryButtonText: { color: COLORS.white, fontWeight: '700', fontSize: 14.5 },

  resendBlock: { marginBottom: 16 },
  secondaryButton: {
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    backgroundColor: COLORS.white,
    borderRadius: 999,
    paddingVertical: 13,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  secondaryButtonText: { color: COLORS.primary, fontWeight: '700', fontSize: 14 },
  resendHint: {
    fontSize: 11.5,
    color: COLORS.textLight,
    textAlign: 'center',
    marginTop: 7,
  },
  emailNote: { fontSize: 12.5, textAlign: 'center', marginTop: 8, lineHeight: 18 },
  emailNoteGood: { color: COLORS.primaryDark },
  emailNoteBad: { color: COLORS.error },
  settledNote: {
    fontSize: 12.5,
    color: COLORS.textLight,
    lineHeight: 18,
    textAlign: 'center',
    marginBottom: 4,
  },

  resultActions: { alignSelf: 'stretch' },
  resultCard: { alignItems: 'center', paddingVertical: 8 },
  resultTitle: { fontSize: 15, fontWeight: '700', color: COLORS.text, marginBottom: 6 },
  resultAmount: { fontSize: 30, fontWeight: '700', color: COLORS.primaryDark },
  resultMeta: { fontSize: 12.5, color: COLORS.textLight, marginTop: 4 },
  resultDelta: {
    fontSize: 13,
    color: COLORS.textDark,
    marginTop: 12,
    marginBottom: 18,
    textAlign: 'center',
  },
});

export default StatementsModal;

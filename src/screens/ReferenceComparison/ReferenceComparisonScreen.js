import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { COLORS } from '../../constants/colors';
import MonthComparePicker from './components/MonthComparePicker';
import CompareMetric from './components/CompareMetric';
import AddPreviousBillModal from './components/AddPreviousBillModal';
import useReferenceComparison from './hooks/useReferenceComparison';
import { buildTrend, explainAccuracy, formatMonthShort } from './utils/comparisonHelpers';
import { WebAppNotice } from '../../components/common/WebAppNotice';
import { WEB_APP_LINKS } from '../../constants/webApp';
import { useDismissibleNotice } from '../../hooks/useDismissibleNotice';

const formatKwh = (value) => `${(Number(value) || 0).toFixed(2)} kWh`;
const formatPeso = (value) => `₱${(Number(value) || 0).toFixed(2)}`;

const ReferenceComparisonScreen = ({ navigation }) => {
  const {
    monthOptions,
    month,
    previousMonth,
    totals,
    previousTotals,
    comparison,
    actualBill,
    accuracy,
    selectMonth,
    saveActualBill,
    deleteActualBill,
    refresh,
  } = useReferenceComparison();

  const [refreshing, setRefreshing] = useState(false);
  const [showBillModal, setShowBillModal] = useState(false);
  const webNotice = useDismissibleNotice('comparison-web-app');

  const label = formatMonthShort(month);
  const previousLabel = formatMonthShort(previousMonth);

  const hasUsage = totals.daysRecorded > 0;

  const trend = useMemo(
    () => buildTrend(comparison, label, previousLabel, {
      recorded: totals.daysRecorded,
      previousRecorded: previousTotals.daysRecorded,
    }),
    [comparison, label, previousLabel, totals.daysRecorded, previousTotals.daysRecorded]
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const trendStyle = {
    good: styles.verdictGood,
    alert: styles.verdictAlert,
    neutral: styles.verdictNeutral,
  }[trend.tone];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={COLORS.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Compare Usage</Text>
        <View style={styles.backButton} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[COLORS.primary]}
            tintColor={COLORS.primary}
          />
        }
      >
        <Text style={styles.intro}>
          Pick one month. Everything below is about that month - what WattWise measured,
          how that compares with the month before, and how it lines up with the PELCO III
          bill covering the same electricity.
        </Text>

        {/* Adding a past bill means copying peso figures off paper, which is
            markedly easier with a keyboard. Entry still works here in full. */}
        {webNotice.visible && (
          <WebAppNotice
            title="Typing in an old bill?"
            body="Copying figures off a paper bill is quicker on a laptop, where you can see every month at once."
            url={WEB_APP_LINKS.comparison}
            onDismiss={webNotice.dismiss}
          />
        )}

        <MonthComparePicker
          monthOptions={monthOptions}
          month={month}
          onSelect={selectMonth}
        />

        <View style={styles.body}>
          <Text style={styles.sectionTitle}>What WattWise measured in {label}</Text>

          {hasUsage ? (
            <>
              {/* The month-on-month line. Toned when there is a real change to
                  report; a quiet sentence when the preceding month has nothing,
                  because "no baseline" is not a finding and should not be
                  dressed as one. */}
              {trend.available ? (
                <View style={[styles.verdict, trendStyle]}>
                  <Text style={styles.verdictHeadline}>{trend.headline}</Text>
                  <Text style={styles.verdictDetail}>{trend.detail}</Text>
                </View>
              ) : (
                <Text style={styles.trendMuted}>{trend.detail}</Text>
              )}

              {trend.available ? (
                <>
                  <CompareMetric
                    title="Energy used"
                    labelA={label}
                    labelB={previousLabel}
                    valueA={comparison.energy.current}
                    valueB={comparison.energy.previous}
                    delta={comparison.energy}
                    format={formatKwh}
                    graded={!trend.partial}
                  />

                  <CompareMetric
                    title="Cost"
                    labelA={label}
                    labelB={previousLabel}
                    valueA={comparison.cost.current}
                    valueB={comparison.cost.previous}
                    delta={comparison.cost}
                    format={formatPeso}
                    graded={!trend.partial}
                  />

                  <Text style={styles.sectionTitle}>Which outlet changed</Text>
                  <View style={styles.outletCard}>
                    {[
                      { name: totals.outlet1Name, delta: comparison.outlet1 },
                      { name: totals.outlet2Name, delta: comparison.outlet2 },
                    ].map((outlet, index) => {
                      const improving = outlet.delta.direction === 'down';
                      const color = outlet.delta.direction === 'flat' || trend.partial
                        ? COLORS.textLight
                        : (improving ? COLORS.success : COLORS.error);

                      return (
                        <View
                          key={outlet.name}
                          style={[styles.outletRow, index === 0 && styles.outletRowDivided]}
                        >
                          <View style={styles.outletInfo}>
                            <Text style={styles.outletName}>{outlet.name}</Text>
                            <Text style={styles.outletFlow}>
                              {formatKwh(outlet.delta.previous)} → {formatKwh(outlet.delta.current)}
                            </Text>
                          </View>
                          <Text style={[styles.outletDelta, { color }]}>
                            {outlet.delta.direction === 'flat'
                              ? '—'
                              : `${outlet.delta.direction === 'down' ? '↓' : '↑'} ${
                                outlet.delta.absolutePercent === null
                                  ? formatKwh(outlet.delta.absolute)
                                  : `${outlet.delta.absolutePercent.toFixed(1)}%`
                              }`}
                          </Text>
                        </View>
                      );
                    })}
                  </View>
                </>
              ) : (
                /* No baseline, so no bars and no arrows - just the month's own
                   totals. Rendering a delta against an unmeasured month would
                   print a 100% rise off a zero that was never measured. */
                <View style={styles.totalsCard}>
                  {[
                    { label: 'Energy used', value: formatKwh(totals.kWh) },
                    { label: 'Cost', value: formatPeso(totals.cost) },
                    { label: totals.outlet1Name, value: formatKwh(totals.outlet1) },
                    { label: totals.outlet2Name, value: formatKwh(totals.outlet2) },
                  ].map((row, index) => (
                    <View
                      key={row.label}
                      style={[styles.totalsRow, index > 0 && styles.totalsRowDivided]}
                    >
                      <Text style={styles.totalsLabel}>{row.label}</Text>
                      <Text style={styles.totalsValue}>{row.value}</Text>
                    </View>
                  ))}
                  <Text style={styles.totalsFooter}>
                    {totals.daysRecorded} {totals.daysRecorded === 1 ? 'day' : 'days'} recorded,
                    from outlet 1 and outlet 2 only.
                  </Text>
                </View>
              )}
            </>
          ) : (
            <View style={styles.emptyState}>
              <Ionicons name="calendar-outline" size={64} color={COLORS.border} />
              <Text style={styles.emptyTitle}>Nothing recorded for {label}</Text>
              <Text style={styles.emptyText}>
                WattWise builds a monthly total from daily usage, which is recorded
                once your outlets have been reporting for a full day. You can still
                file that month&apos;s PELCO III bill below.
              </Text>
            </View>
          )}
        </View>

        {/* Deliberately outside the block above.
            A paper bill is a figure copied off paper - it does not depend on
            the month having recorded usage. Sitting inside that branch meant a
            user with no rollups yet could neither see a bill already on file
            nor add one, whatever Firestore held. Found from the web client,
            which gates neither. */}
        <View style={styles.billSection}>
          <Text style={styles.sectionTitle}>Check against your real bill</Text>

          {accuracy && hasUsage ? (
            <View style={styles.accuracyCard}>
              <View style={styles.accuracyRow}>
                <Text style={styles.accuracyLabel}>PELCO III billed you</Text>
                <Text style={styles.accuracyValue}>{formatPeso(accuracy.actualCost)}</Text>
              </View>
              <View style={styles.accuracyRow}>
                <Text style={styles.accuracyLabel}>WattWise estimated</Text>
                <Text style={styles.accuracyValue}>{formatPeso(accuracy.estimatedCost)}</Text>
              </View>
              <View style={styles.accuracyDivider} />
              {/* The scope gap, stated plainly and not graded. The bill covers
                  the apartment and WattWise covers two outlets, so this is
                  always large and always expected - colouring it as a failure
                  put a permanent warning on a card whose own paragraph
                  explained the gap was normal. */}
              <View style={styles.accuracyRow}>
                <Text style={styles.accuracyLabel}>Not measured by WattWise</Text>
                <Text style={styles.accuracyValue}>
                  {formatPeso(accuracy.absolute)} {accuracy.direction}
                  {' '}({accuracy.absolutePercent.toFixed(1)}%)
                </Text>
              </View>
              {/* The check that can actually fail: the bill's own kWh priced
                  with WattWise's tariff, against what the bill charged. */}
              {accuracy.modelCheck ? (
                <View style={styles.accuracyRow}>
                  <Text style={styles.accuracyLabel}>
                    Rate accuracy on {accuracy.modelCheck.billedKWh.toFixed(0)} kWh
                  </Text>
                  <Text
                    style={[
                      styles.accuracyValueStrong,
                      { color: accuracy.modelCheck.isClose ? COLORS.success : COLORS.warning },
                    ]}
                  >
                    {accuracy.modelCheck.absolutePercent.toFixed(1)}%
                    {' '}{accuracy.modelCheck.direction}
                  </Text>
                </View>
              ) : null}
              <Text style={styles.accuracyNote}>{explainAccuracy(accuracy, label)}</Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setShowBillModal(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>Edit actual bill</Text>
              </TouchableOpacity>
            </View>
          ) : accuracy ? (
            // A bill on file for a month WattWise did not measure. Showing it
            // against an estimate of zero would read as a 100% error rather
            // than as an absence of data, so the estimate line says so instead.
            <View style={styles.accuracyCard}>
              <View style={styles.accuracyRow}>
                <Text style={styles.accuracyLabel}>PELCO III billed you</Text>
                <Text style={styles.accuracyValue}>{formatPeso(accuracy.actualCost)}</Text>
              </View>
              <View style={styles.accuracyRow}>
                <Text style={styles.accuracyLabel}>WattWise measured</Text>
                <Text style={styles.accuracyValue}>Nothing yet</Text>
              </View>
              <Text style={styles.accuracyNote}>
                Your {label} bill is saved. WattWise has no recorded usage for that
                month, so there is nothing to grade it against yet - the check
                appears once your outlets have reported for a full day of {label}.
              </Text>
              <TouchableOpacity
                style={styles.secondaryButton}
                onPress={() => setShowBillModal(true)}
                activeOpacity={0.7}
              >
                <Text style={styles.secondaryButtonText}>Edit actual bill</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.addBillCard}
              onPress={() => setShowBillModal(true)}
              activeOpacity={0.7}
            >
              <Ionicons name="receipt-outline" size={22} color={COLORS.primary} />
              <View style={styles.addBillText}>
                <Text style={styles.addBillTitle}>Add your {label} bill</Text>
                <Text style={styles.addBillSub}>
                  Enter the total from your paper PELCO III bill to see how close
                  WattWise&apos;s estimate came.
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={COLORS.textLight} />
            </TouchableOpacity>
          )}
        </View>
      </ScrollView>

      <AddPreviousBillModal
        visible={showBillModal}
        selectedMonth={month}
        previousData={{
          kWh: actualBill?.totalKWh || 0,
          cost: actualBill?.totalCost || 0,
          outlet1: actualBill?.outlet1KWh || 0,
          outlet2: actualBill?.outlet2KWh || 0,
        }}
        onClose={() => setShowBillModal(false)}
        onSave={saveActualBill}
        onDelete={deleteActualBill}
      />
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
  },
  // Sits inside the body block now rather than spanning the screen, so it takes
  // its horizontal padding from the parent.
  verdict: {
    marginBottom: 12,
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
  },
  // No preceding month to compare against. Left as plain text on the background
  // deliberately: an absent comparison is not a result, and giving it a bordered
  // panel of its own was what made an empty screen look like it had reported
  // something.
  trendMuted: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 19,
    marginBottom: 12,
  },
  verdictGood: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  verdictAlert: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
  },
  verdictNeutral: {
    backgroundColor: COLORS.white,
    borderColor: COLORS.border,
  },
  verdictHeadline: {
    fontSize: 20,
    fontWeight: '700',
    color: COLORS.text,
    marginBottom: 4,
  },
  verdictDetail: {
    fontSize: 13,
    color: COLORS.textLight,
    lineHeight: 19,
  },
  body: {
    paddingHorizontal: 20,
    marginTop: 20,
  },
  billSection: {
    paddingHorizontal: 20,
    marginTop: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: COLORS.text,
    marginTop: 8,
    marginBottom: 10,
  },
  outletCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    marginBottom: 12,
  },
  totalsCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    paddingHorizontal: 16,
    paddingVertical: 4,
    marginBottom: 12,
  },
  totalsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 13,
    gap: 12,
  },
  totalsRowDivided: {
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  totalsLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textLight,
  },
  totalsValue: {
    flexShrink: 0,
    fontSize: 15,
    fontWeight: '700',
    color: COLORS.text,
  },
  totalsFooter: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
    paddingTop: 10,
    paddingBottom: 14,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  outletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
  },
  outletRowDivided: {
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  outletInfo: {
    flex: 1,
  },
  outletName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  outletFlow: {
    fontSize: 12,
    color: COLORS.textLight,
    marginTop: 3,
  },
  outletDelta: {
    fontSize: 14,
    fontWeight: '700',
    marginLeft: 12,
  },
  accuracyCard: {
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
  },
  // space-between alone does not stop a row from overflowing: without flex on
  // either child both Texts size to their content, and once they no longer fit
  // they simply butt together - "Not measured by WattWise" ran straight into
  // "P1172.83 under (99.1%)" with no gap at all. The short currency rows fit, so
  // the card looked correct until a long value appeared. The label is the part
  // that may wrap; the value stays on one line and keeps its right edge.
  accuracyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 5,
    gap: 12,
  },
  accuracyLabel: {
    flex: 1,
    fontSize: 13,
    color: COLORS.textLight,
  },
  accuracyValue: {
    flexShrink: 0,
    textAlign: 'right',
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  accuracyValueStrong: {
    flexShrink: 0,
    textAlign: 'right',
    fontSize: 15,
    fontWeight: '700',
  },
  accuracyDivider: {
    height: 1,
    backgroundColor: COLORS.border,
    marginVertical: 8,
  },
  accuracyNote: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
    marginTop: 8,
  },
  secondaryButton: {
    marginTop: 14,
    paddingVertical: 11,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.primary,
    alignItems: 'center',
  },
  secondaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.primary,
  },
  addBillCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.white,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 16,
    gap: 12,
  },
  addBillText: {
    flex: 1,
  },
  addBillTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  addBillSub: {
    fontSize: 12,
    color: COLORS.textLight,
    lineHeight: 17,
    marginTop: 3,
  },
  // Inside the body block, which already carries 20pt of horizontal padding.
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
    marginBottom: 10,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: COLORS.textLight,
    textAlign: 'center',
    lineHeight: 19,
  },
});

export default ReferenceComparisonScreen;

const PDFDocument = require('pdfkit');

/**
 * Renders an invoice to a PDF buffer.
 *
 * Layout mirrors the PELCO III bill so the two can be read side by side: the
 * same three charge blocks, in the same order, with the same line labels.
 */

// Yellow/white/green, per the requested design. Green carries the brand and the
// totals; yellow marks anything provisional, so an estimate is never mistaken
// for a final bill.
const COLORS = {
  green: '#047857',
  greenLight: '#10B981',
  greenTint: '#ECFDF5',
  yellow: '#F59E0B',
  yellowTint: '#FEF3C7',
  ink: '#1F2937',
  muted: '#6B7280',
  hairline: '#E5E7EB',
  white: '#FFFFFF',
};

const MARGIN = 44;
const PAGE_WIDTH = 595.28; // A4
const CONTENT_WIDTH = PAGE_WIDTH - (MARGIN * 2);

const peso = (value) => {
  const amount = Number(value) || 0;
  const formatted = Math.abs(amount)
    .toFixed(2)
    .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${amount < 0 ? '-' : ''}P ${formatted}`;
};

const formatMonthName = (billingMonth) => {
  const [year, month] = String(billingMonth).split('-').map(Number);
  if (!year || !month) return String(billingMonth);
  const name = new Date(Date.UTC(year, month - 1, 1))
    .toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
  return `${name} ${year}`;
};

const formatDate = (dateKey) => {
  const [year, month, day] = String(dateKey).split('-');
  return year ? `${month}/${day}/${year}` : String(dateKey);
};

const STATUS_COPY = {
  DRAFT: { label: 'ESTIMATE', tone: 'yellow' },
  PENDING: { label: 'AWAITING OFFICIAL RATE', tone: 'yellow' },
  FINALIZED: { label: 'FINAL', tone: 'green' },
};

const drawHeader = (doc, { invoice, account }) => {
  doc.rect(0, 0, PAGE_WIDTH, 104).fill(COLORS.green);

  doc.fillColor(COLORS.white).font('Helvetica-Bold').fontSize(21)
    .text('WattWise', MARGIN, 30);
  doc.font('Helvetica').fontSize(9).fillColor(COLORS.greenTint)
    .text('Energy statement - PELCO III residential', MARGIN, 56);

  const status = STATUS_COPY[invoice.status] || STATUS_COPY.DRAFT;
  const badgeWidth = 160;
  const badgeX = PAGE_WIDTH - MARGIN - badgeWidth;

  doc.roundedRect(badgeX, 28, badgeWidth, 22, 11)
    .fill(status.tone === 'green' ? COLORS.greenLight : COLORS.yellow);
  doc.fillColor(status.tone === 'green' ? COLORS.white : COLORS.ink)
    .font('Helvetica-Bold').fontSize(8)
    .text(status.label, badgeX, 35, { width: badgeWidth, align: 'center' });

  doc.font('Helvetica-Bold').fontSize(13).fillColor(COLORS.white)
    .text(formatMonthName(invoice.billingMonth), badgeX, 58, { width: badgeWidth, align: 'right' });

  doc.font('Helvetica').fontSize(8).fillColor(COLORS.greenTint)
    .text(account?.email || '', badgeX - 60, 78, { width: badgeWidth + 60, align: 'right' });
};

const drawAccountBlock = (doc, { invoice, account, top }) => {
  doc.roundedRect(MARGIN, top, CONTENT_WIDTH, 84, 8)
    .fillAndStroke(COLORS.white, COLORS.hairline);

  const leftX = MARGIN + 14;
  const rightX = MARGIN + (CONTENT_WIDTH / 2) + 6;

  const field = (label, value, x, y) => {
    doc.font('Helvetica').fontSize(7.5).fillColor(COLORS.muted).text(label.toUpperCase(), x, y);
    doc.font('Helvetica-Bold').fontSize(10).fillColor(COLORS.ink).text(value, x, y + 11);
  };

  field('Account', account?.name || account?.email || 'WattWise user', leftX, top + 14);
  field('Billing month', formatMonthName(invoice.billingMonth), rightX, top + 14);
  field(
    'Reading period',
    `${formatDate(invoice.readingDateFrom)} - ${formatDate(invoice.readingDateTo)}`,
    leftX,
    top + 48
  );
  // Both numbers, because they differ whenever the Hub was off or unplugged
  // for part of the month and only one of them describes the energy above.
  // Older invoice documents predate `daysMeasured`, so fall back rather than
  // printing "undefined of 31".
  const measured = Number.isFinite(invoice.daysMeasured) ? invoice.daysMeasured : null;
  field(
    measured === null ? 'Billing days' : 'Days measured',
    measured === null
      ? String(invoice.billingDays)
      : `${measured} of ${invoice.billingDays}`,
    rightX,
    top + 48
  );

  return top + 84;
};

const drawHeadline = (doc, { invoice, top }) => {
  const isEstimate = invoice.isEstimate;
  const boxHeight = 76;

  doc.roundedRect(MARGIN, top, CONTENT_WIDTH, boxHeight, 8)
    .fillAndStroke(isEstimate ? COLORS.yellowTint : COLORS.greenTint,
      isEstimate ? COLORS.yellow : COLORS.greenLight);

  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
    .text('TOTAL AMOUNT DUE', MARGIN + 16, top + 14);
  doc.font('Helvetica-Bold').fontSize(26).fillColor(isEstimate ? COLORS.ink : COLORS.green)
    .text(peso(invoice.totalAmountDue), MARGIN + 16, top + 27);

  const rightX = MARGIN + CONTENT_WIDTH - 190;
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
    .text('TOTAL kWh USED', rightX, top + 14, { width: 174, align: 'right' });
  doc.font('Helvetica-Bold').fontSize(15).fillColor(COLORS.ink)
    .text(`${Number(invoice.totalKwh).toFixed(2)} kWh`, rightX, top + 26, { width: 174, align: 'right' });
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
    .text(`Effective rate ${peso(invoice.effectiveRate)}/kWh`, rightX, top + 46, {
      width: 174,
      align: 'right',
    });

  return top + boxHeight;
};

const drawNotice = (doc, { invoice, top }) => {
  if (!invoice.isEstimate) return top;

  // Which rates these figures came from. `rateSourceMonth` is null both for the
  // rates the user typed into Settings and for the seeded defaults, and calling
  // the first of those "default rates" told a user who had entered their own
  // that the statement ignored them. Older invoices carry no `rateSource`, so
  // fall back to the previous wording rather than printing nothing.
  const rateSourceLabel = invoice.rateSourceMonth
    ? `${formatMonthName(invoice.rateSourceMonth)} rates`
    : (invoice.rateSource === 'settings' ? 'the rates you entered in Settings' : 'default rates');

  const message = invoice.status === 'PENDING'
    ? `This period has closed but the official ${formatMonthName(invoice.billingMonth)} rate has not been entered yet. Figures use ${rateSourceLabel} and will change once the official rate is applied.`
    : `This period is still open. Figures are an estimate using ${rateSourceLabel} - PELCO III publishes each month's rate only after the period closes.`;

  const height = 42;
  doc.roundedRect(MARGIN, top + 10, CONTENT_WIDTH, height, 6)
    .fillAndStroke(COLORS.white, COLORS.yellow);
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.ink)
    .text(message, MARGIN + 12, top + 20, { width: CONTENT_WIDTH - 24, lineGap: 1.5 });

  return top + 10 + height;
};

const drawBlock = (doc, { title, items, total, top, accent = false }) => {
  let y = top + 16;

  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.green).text(title.toUpperCase(), MARGIN, y);
  y += 14;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(1).stroke(COLORS.hairline);
  y += 6;

  items.forEach((item) => {
    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink).text(item.label, MARGIN + 4, y);

    if (item.kind === 'perKwh') {
      doc.fillColor(COLORS.muted).fontSize(8)
        .text(Number(item.rate).toFixed(4), MARGIN + 250, y, { width: 70, align: 'right' });
    }

    doc.font('Helvetica').fontSize(8.5).fillColor(COLORS.ink)
      .text(peso(item.amount), MARGIN + CONTENT_WIDTH - 110, y, { width: 110, align: 'right' });
    y += 14;
  });

  y += 2;
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 20, 4)
    .fill(accent ? COLORS.greenTint : '#F9FAFB');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.green)
    .text(`Total ${title}`, MARGIN + 8, y + 6);
  doc.fillColor(COLORS.green)
    .text(peso(total), MARGIN + CONTENT_WIDTH - 118, y + 6, { width: 110, align: 'right' });

  return y + 20;
};

/** How many appliances get a row of their own before the rest are folded. */
const APPLIANCE_ROW_LIMIT = 6;

/**
 * Fold an appliance breakdown into at most seven printable rows.
 *
 * Six named rows at most, but never at the cost of the column adding up.
 * `applianceBreakdown` is exhaustive by construction - processDailyRollup
 * writes both outlets' whole energy under some name every day - so anything
 * sliced off is real energy the reader can see missing. The August 2026
 * statement showed six rows totalling 6.72 of 7.24 kWh with the percentage
 * column summing to 92%, because a bare `slice(0, 6)` dropped the seventh
 * while the shares went on dividing by the full `totalKwh`.
 *
 * The remainder is summed from the tail itself rather than derived as
 * `totalKwh` minus the shown rows, so this can only ever restate figures that
 * exist. A legacy day carrying no `applianceBreakdown` at all would leave a
 * genuine shortfall, and the total bar the caller draws is what makes that
 * visible instead of silent.
 *
 * @param {Array<{applianceName: string, energyKwh: number, cost: number}>} breakdown
 * @returns {Array} rows to print, in the order given.
 */
const foldApplianceRows = (breakdown) => {
  const all = Array.isArray(breakdown) ? breakdown : [];
  const named = all.slice(0, APPLIANCE_ROW_LIMIT);
  const tail = all.slice(APPLIANCE_ROW_LIMIT);

  const tailKwh = tail.reduce((sum, item) => sum + (Number(item?.energyKwh) || 0), 0);
  const tailCost = tail.reduce((sum, item) => sum + (Number(item?.cost) || 0), 0);

  // Below a hundredth of a kWh the row would print as "0.00 kWh" and add a
  // line that explains nothing.
  if (tailKwh <= 0.004) return named;

  return [...named, {
    applianceName: tail.length === 1
      ? tail[0].applianceName
      : `Other (${tail.length} appliances)`,
    energyKwh: tailKwh,
    cost: tailCost,
  }];
};

const drawApplianceBlock = (doc, { invoice, top }) => {
  if (!invoice.applianceBreakdown?.length) return top;

  const rows = foldApplianceRows(invoice.applianceBreakdown);

  // Title, rule, one 24pt row per appliance, and the total bar underneath. If
  // that would run into the footer, start a fresh page rather than letting
  // pdfkit paginate mid-bar.
  const requiredHeight = 42 + (rows.length * 24) + 22;
  let start = top;

  if (top + requiredHeight > FOOTER_Y - 12) {
    doc.addPage();
    start = MARGIN;
  }

  let y = start + 18;
  doc.font('Helvetica-Bold').fontSize(9).fillColor(COLORS.green).text('WHERE IT WENT', MARGIN, y);
  y += 12;
  // Which of the two possible attributions this block is making. The app's
  // Compare Usage screen shows the same month as two outlet totals under each
  // outlet's most recent name; this credits energy to the name the outlet
  // carried on the day it was measured, so a rename splits one appliance into
  // two rows here and rewrites the whole month there. Both are defensible and
  // they disagree, so each has to say which it is.
  doc.font('Helvetica').fontSize(7).fillColor(COLORS.muted)
    .text(
      'Energy is credited to the name the outlet carried on the day it was measured, '
      + 'so an appliance renamed mid-month appears under both names.',
      MARGIN,
      y,
      { width: CONTENT_WIDTH }
    );
  y += 10;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(1).stroke(COLORS.hairline);
  y += 8;

  const maxKwh = Math.max(...rows.map((item) => item.energyKwh), 0.0001);

  rows.forEach((item, index) => {
    const share = invoice.totalKwh > 0 ? (item.energyKwh / invoice.totalKwh) * 100 : 0;

    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.ink)
      .text(item.applianceName, MARGIN + 4, y, { width: 190, ellipsis: true });
    doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
      .text(`${item.energyKwh.toFixed(2)} kWh - ${share.toFixed(0)}%`, MARGIN + 200, y, {
        width: 110,
        align: 'left',
      });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.ink)
      .text(peso(item.cost), MARGIN + CONTENT_WIDTH - 110, y, { width: 110, align: 'right' });

    // Bar, drawn under the row. Each is labelled above, so the bars carry
    // magnitude only and never have to encode identity by colour.
    const barY = y + 12;
    const barWidth = (item.energyKwh / maxKwh) * (CONTENT_WIDTH - 8);
    doc.roundedRect(MARGIN + 4, barY, CONTENT_WIDTH - 8, 4, 2).fill(COLORS.hairline);
    if (barWidth > 0) {
      doc.roundedRect(MARGIN + 4, barY, Math.max(barWidth, 3), 4, 2)
        .fill(index === 0 ? COLORS.green : COLORS.greenLight);
    }

    y += 24;
  });

  // The reconciling bar. Every other block on the statement totals its own
  // lines; this one asserted a decomposition and never showed it adding up,
  // which is the one piece of arithmetic a reader checks by hand.
  const shownKwh = rows.reduce((sum, item) => sum + (Number(item.energyKwh) || 0), 0);
  const shownCost = rows.reduce((sum, item) => sum + (Number(item.cost) || 0), 0);

  y += 2;
  doc.roundedRect(MARGIN, y, CONTENT_WIDTH, 20, 4).fill('#F9FAFB');
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.green)
    .text('Total measured', MARGIN + 8, y + 6);
  doc.font('Helvetica').fontSize(8).fillColor(COLORS.muted)
    .text(`${shownKwh.toFixed(2)} kWh`, MARGIN + 200, y + 6, { width: 110, align: 'left' });
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(COLORS.green)
    .text(peso(shownCost), MARGIN + CONTENT_WIDTH - 118, y + 6, { width: 110, align: 'right' });

  return y + 20;
};

// Anything drawn below this collides with the footer. Kept well clear of the
// page bottom: the disclaimer wraps to three lines, and letting it run past the
// bottom margin made pdfkit auto-append a page, whose footer then overflowed
// too - each render cascaded into four pages.
const FOOTER_Y = 748;

const drawFooterOnAllPages = (doc, { invoice }) => {
  const range = doc.bufferedPageRange();

  for (let index = 0; index < range.count; index += 1) {
    doc.switchToPage(range.start + index);
    drawFooter(doc, { invoice });
  }
};

const drawFooter = (doc, { invoice }) => {
  const y = FOOTER_Y;
  doc.moveTo(MARGIN, y).lineTo(MARGIN + CONTENT_WIDTH, y).lineWidth(1).stroke(COLORS.hairline);

  // Suppress auto-pagination while drawing into the bottom margin.
  const originalBottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;

  doc.font('Helvetica').fontSize(6.8).fillColor(COLORS.muted)
    .text(
      `Distribution and government charges are ERC-approved rates, current as of ${invoice.bill?.rateEffectiveDate || 'the latest posting'}. ` +
      'Generation and transmission rates change monthly - update them in Settings from the official PELCO III rate posting at pelco3.org/rates.php. ' +
      'This estimate excludes account-specific adjustments, arrears, and penalties.',
      MARGIN,
      y + 7,
      { width: CONTENT_WIDTH, lineGap: 1, height: 44 }
    );

  doc.page.margins.bottom = originalBottom;
};

/**
 * @returns {Promise<Buffer>} the rendered PDF.
 */
const renderInvoicePdf = ({ invoice, account }) => new Promise((resolve, reject) => {
  try {
    const doc = new PDFDocument({ size: 'A4', margin: MARGIN, bufferPages: true });
    const chunks = [];

    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    drawHeader(doc, { invoice, account });

    let y = drawAccountBlock(doc, { invoice, account, top: 124 });
    y = drawHeadline(doc, { invoice, top: y + 12 });
    y = drawNotice(doc, { invoice, top: y });

    const items = invoice.bill?.items || {};
    const totals = invoice.bill?.totals || {};

    y = drawBlock(doc, {
      title: 'Generation & Transmission',
      items: items.generationTransmission || [],
      total: totals.generationTransmission || 0,
      top: y,
    });
    y = drawBlock(doc, {
      title: 'Distribution',
      items: items.distribution || [],
      total: totals.distribution || 0,
      top: y,
    });
    y = drawBlock(doc, {
      title: 'Government Charges',
      items: items.government || [],
      total: totals.government || 0,
      top: y,
      accent: true,
    });

    drawApplianceBlock(doc, { invoice, top: y });
    drawFooterOnAllPages(doc, { invoice });

    doc.end();
  } catch (error) {
    reject(error);
  }
});

module.exports = { renderInvoicePdf, formatMonthName, foldApplianceRows };

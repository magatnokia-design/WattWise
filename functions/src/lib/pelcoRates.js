const logger = require('firebase-functions/logger');

/**
 * PELCO III's official generation rate for a month, read from the PDF it posts
 * at pelco3.org/rates.php (Oct 2026). This is what lets statements finalize
 * themselves instead of waiting for the user to type the rate off a paper bill.
 *
 * WHAT IS READ, AND WHY IT IS THE BILL'S FIGURE
 *
 * Each month is one PDF, `public/rates/MMYY.pdf`, with a supplier table whose
 * TOTAL row ends in the AVERAGE GENERATION COST (Php/kWh). That average is the
 * "Generation" line on the consumer bill: the four real bills in
 * billing.test.js carry 6.2295, 5.5924, 5.5719 and 5.5034, which are exactly
 * the February, April, May and July 2026 PDFs' figures. Checked against all 33
 * PDFs from January 2024 to September 2026 when this was written.
 *
 * Only Generation is published there. The other Block 1 lines (Gen. Rate Adj,
 * Transmission, System Loss) keep the values the statement already used.
 *
 * WHEN IT FAILS
 *
 * The PDF is posted some days after the month ends, so a 404 is normal and
 * means "not yet" - the job tries again the next day. Anything that does not
 * parse to a plausible rate returns null and the statement stays an estimate:
 * a wrong official rate is worse than a late one, so this never guesses.
 */

const RATES_BASE_URL = 'https://www.pelco3.org/public/rates/';

// Generation has run 4.7 to 7.8 Php/kWh since 2024. Well outside that is a
// misread column, not a price.
const PLAUSIBLE_MIN = 2;
const PLAUSIBLE_MAX = 20;

const MONTH_NAMES = [
  'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE',
  'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER',
];

/** '2026-09' -> 'https://www.pelco3.org/public/rates/0926.pdf' */
const ratesPdfUrl = (billingMonth) => {
  const match = /^(\d{4})-(\d{2})$/.exec(String(billingMonth || ''));
  if (!match) return null;
  return `${RATES_BASE_URL}${match[2]}${match[1].slice(2)}.pdf`;
};

/**
 * The average generation cost from the PDF's text lines, or null.
 *
 * The TOTAL row reads like
 *   "TOTAL 100.00% 24,631,937 174,244,505.76 - 174,244,505.76 7.0739"
 * and the rate is its last four-decimal number. When the PDF names its month
 * ("For the Month of SEPTEMBER 2026" - only posted since April 2026) it must
 * match the month asked for, so a file posted under the wrong name cannot
 * price the wrong month.
 *
 * @param {string[]} lines Text lines, top to bottom.
 * @param {string} [billingMonth] 'YYYY-MM', to check the month heading.
 * @returns {number|null}
 */
const parseGenerationRate = (lines = [], billingMonth = null) => {
  const text = (Array.isArray(lines) ? lines : []).map((line) => String(line || '').trim());

  if (billingMonth) {
    const heading = text.find((line) => /For the Month of/i.test(line));
    if (heading) {
      const [year, month] = billingMonth.split('-');
      const expected = `${MONTH_NAMES[Number(month) - 1]} ${year}`;
      if (!heading.toUpperCase().replace(/\s+/g, ' ').includes(expected)) return null;
    }
  }

  const total = text.find((line) => /^TOTAL\b/i.test(line) && /100(\.00)?\s*%/.test(line));
  if (!total) return null;

  const figures = total.match(/\d+\.\d{4}\b/g);
  if (!figures || figures.length === 0) return null;

  const rate = Number(figures[figures.length - 1]);
  if (!Number.isFinite(rate) || rate < PLAUSIBLE_MIN || rate > PLAUSIBLE_MAX) return null;
  return rate;
};

/**
 * The PDF's text as lines, top to bottom, items on one baseline joined by
 * spaces. pdfjs-dist is ESM-only, so it is imported on demand - which also
 * keeps it out of every other function's cold start.
 *
 * @param {Uint8Array} data
 * @returns {Promise<string[]>}
 */
const extractPdfLines = async (data) => {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
  // isEvalSupported: false - the PDF comes from outside, and PDF.js must not
  // compile anything it contains (CVE-2024-4367 was exactly that).
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    disableFontFace: true,
    useSystemFonts: false,
    verbosity: 0,
  }).promise;

  const lines = [];
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber);
    const content = await page.getTextContent();
    const rows = new Map();
    for (const item of content.items) {
      const y = Math.round(item.transform[5]);
      if (!rows.has(y)) rows.set(y, []);
      rows.get(y).push({ x: item.transform[4], text: item.str });
    }
    [...rows.entries()]
      .sort((a, b) => b[0] - a[0])
      .forEach(([, items]) => {
        lines.push(
          items.sort((a, b) => a.x - b.x).map((item) => item.text).join(' ').replace(/\s+/g, ' ').trim()
        );
      });
  }
  await doc.destroy();
  return lines;
};

/**
 * Fetches and reads one month's official generation rate.
 *
 * @param {string} billingMonth 'YYYY-MM'
 * @param {object} [options]
 * @param {Function} [options.fetchImpl] Injected for tests.
 * @returns {Promise<{generation: number, sourceUrl: string}|null>} null when
 *   the PDF is not posted yet or cannot be read with confidence.
 */
const fetchOfficialGenerationRate = async (billingMonth, { fetchImpl = fetch } = {}) => {
  const sourceUrl = ratesPdfUrl(billingMonth);
  if (!sourceUrl) return null;

  const response = await fetchImpl(sourceUrl, {
    headers: { 'User-Agent': 'Dagitab/1.0 (+https://www.dagitab.site)' },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    logger.warn('PELCO III rate PDF did not load', { billingMonth, status: response.status });
    return null;
  }

  const contentType = String(response.headers.get('content-type') || '');
  const data = new Uint8Array(await response.arrayBuffer());
  // A missing file can come back as an HTML page with status 200.
  if (!contentType.includes('pdf') && String.fromCharCode(...data.slice(0, 4)) !== '%PDF') {
    return null;
  }

  const lines = await extractPdfLines(data);
  const generation = parseGenerationRate(lines, billingMonth);
  if (generation === null) {
    logger.warn('PELCO III rate PDF did not parse', { billingMonth, sourceUrl });
    return null;
  }

  return { generation, sourceUrl };
};

module.exports = {
  RATES_BASE_URL,
  ratesPdfUrl,
  parseGenerationRate,
  extractPdfLines,
  fetchOfficialGenerationRate,
};

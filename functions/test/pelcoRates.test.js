const test = require('node:test');
const assert = require('node:assert/strict');
const PDFDocument = require('pdfkit');

const {
  ratesPdfUrl,
  parseGenerationRate,
  fetchOfficialGenerationRate,
} = require('../src/lib/pelcoRates');

// Lines as PDF.js extracts them from PELCO III's real September 2026 PDF
// (public/rates/0926.pdf), trimmed to the rows that matter.
const SEPTEMBER_2026 = [
  'PAMPANGA III ELECTRIC COOPERATIVE, INC.',
  'For the Month of SEPTEMBER 2026',
  '1. SUAL POWER INC. (SPI) 99.10% 24,409,123 172,812,698.67 172,812,698.67',
  '2. OTHERS: NET METERING 0.90% 222,814 1,431,807 1,431,807.09',
  'TOTAL 100.00% 24,631,937 174,244,505.76 - 174,244,505.76 7.0739',
];

test('the rate is the TOTAL row\'s average generation cost', () => {
  assert.equal(parseGenerationRate(SEPTEMBER_2026, '2026-09'), 7.0739);
});

test('the month heading must match the month asked for', () => {
  // A file posted under the wrong name must not price the wrong month.
  assert.equal(parseGenerationRate(SEPTEMBER_2026, '2026-08'), null);
});

test('older PDFs with no month heading still parse', () => {
  // PELCO III added "For the Month of" only from April 2026.
  const february = ['TOTAL 100.00% 24,213,721 150,839,450.40 - 150,839,450.40 6.2295'];
  // 6.2295 is the Generation line on a real February 2026 bill (billing.test.js).
  assert.equal(parseGenerationRate(february, '2026-02'), 6.2295);
});

test('nothing plausible means no rate, never a guess', () => {
  assert.equal(parseGenerationRate([], '2026-09'), null);
  assert.equal(parseGenerationRate(['TOTAL 100.00% 24,631,937 174,244,505.76'], '2026-09'), null);
  assert.equal(parseGenerationRate(['TOTAL 100.00% 1 2 99.9999'], '2026-09'), null, 'implausible');
  assert.equal(parseGenerationRate(['SUBTOTAL 50.00% 7.0739'], '2026-09'), null, 'not the TOTAL row');
});

test('the PDF address follows PELCO III\'s MMYY naming', () => {
  assert.equal(ratesPdfUrl('2026-09'), 'https://www.pelco3.org/public/rates/0926.pdf');
  assert.equal(ratesPdfUrl('2025-12'), 'https://www.pelco3.org/public/rates/1225.pdf');
  assert.equal(ratesPdfUrl('Sept'), null);
});

// A PDF laid out like PELCO III's, so the fetch -> extract -> parse path runs
// end to end without the network.
const buildRatesPdf = () => new Promise((resolve) => {
  const doc = new PDFDocument({ size: 'A4' });
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', () => resolve(Buffer.concat(chunks)));
  doc.fontSize(10).text('For the Month of SEPTEMBER 2026', 50, 80);
  const y = 200;
  [['TOTAL', 50], ['100.00%', 120], ['24,631,937', 180], ['174,244,505.76', 260], ['-', 360], ['174,244,505.76', 380], ['7.0739', 480]]
    .forEach(([text, x]) => doc.text(text, x, y, { lineBreak: false }));
  doc.end();
});

const fakeFetch = (status, body, contentType = 'application/pdf') => async () => ({
  status,
  ok: status >= 200 && status < 300,
  headers: { get: () => contentType },
  arrayBuffer: async () => body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength),
});

test('a posted PDF is fetched, read and parsed', async () => {
  const pdf = await buildRatesPdf();
  const result = await fetchOfficialGenerationRate('2026-09', { fetchImpl: fakeFetch(200, pdf) });
  assert.deepEqual(result, {
    generation: 7.0739,
    sourceUrl: 'https://www.pelco3.org/public/rates/0926.pdf',
  });
});

test('a month not posted yet is null, to be tried again tomorrow', async () => {
  const result = await fetchOfficialGenerationRate('2026-10', { fetchImpl: fakeFetch(404, Buffer.from('')) });
  assert.equal(result, null);
});

test('an HTML page served in place of the PDF is not read as a rate', async () => {
  const html = Buffer.from('<html>Not found</html>');
  const result = await fetchOfficialGenerationRate('2026-10', { fetchImpl: fakeFetch(200, html, 'text/html') });
  assert.equal(result, null);
});

#!/usr/bin/env node
/**
 * `npm audit` with a reviewed allowlist. Used by .github/workflows/audit.yml.
 *
 *   node scripts/audit-gate.js --level high [--allowlist functions/audit-allowlist.json]
 *   (run from the package directory being audited)
 *
 * Why not plain `npm audit --audit-level`: it can only fail on everything at a
 * level or nothing, and on 22 Oct 2026 the backend had exactly one high left -
 * node-forge, reachable only through a firebase-admin major (14) that removed
 * the namespaced API this backend is written in. The choice was a permanently
 * red gate that everyone learns to ignore, lowering the level for every future
 * advisory, or excusing that one advisory by ID with the reason written down.
 * This is the third.
 *
 * Judged per advisory, not per package. `npm audit` lists firebase-admin itself
 * as "high" only because it depends on node-forge; the advisory is the unit
 * that has a severity and an ID, so that is what the allowlist names.
 *
 * Exit 0: nothing at or above the level outside the allowlist.
 * Exit 1: something is - printed with its ID and title.
 * Exit 2: npm audit did not produce a report (registry down, no lockfile).
 *         Its raw output is printed so the workflow's "registry unreachable"
 *         matcher can see it and retry.
 * An allowlist entry that no longer matches anything is reported, so a fixed
 * advisory does not leave a stale excuse behind.
 */

const fs = require('fs');
const { spawnSync } = require('child_process');

const SEVERITY = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};

const level = arg('level', 'high');
if (!(level in SEVERITY)) {
  console.error(`Unknown --level "${level}". Use one of: ${Object.keys(SEVERITY).join(', ')}`);
  process.exit(2);
}

const allowlistPath = arg('allowlist', null);
const allowlist = allowlistPath && fs.existsSync(allowlistPath)
  ? JSON.parse(fs.readFileSync(allowlistPath, 'utf8')).allow || []
  : [];

const run = spawnSync('npm', ['audit', '--json'], { encoding: 'utf8', shell: process.platform === 'win32' });
const raw = `${run.stdout || ''}${run.stderr || ''}`;

let report;
try {
  report = JSON.parse(run.stdout);
} catch {
  console.log(raw);
  console.log('audit-gate: npm audit produced no JSON report.');
  process.exit(2);
}
if (report.error) {
  console.log(raw);
  console.log(`audit-gate: npm audit failed: ${report.error.summary || report.error.code || 'unknown error'}`);
  process.exit(2);
}

// Every advisory object, deduplicated by its source ID. Strings in `via` are
// package names (transitive flags) and carry no advisory of their own.
const advisories = new Map();
for (const [pkg, vuln] of Object.entries(report.vulnerabilities || {})) {
  for (const via of vuln.via || []) {
    if (typeof via !== 'object' || advisories.has(via.source)) continue;
    advisories.set(via.source, { ...via, package: pkg });
  }
}

const ghsa = (url = '') => (url.match(/GHSA-[\w-]+/) || [])[0] || '';
const allowedIds = new Set(allowlist.map((entry) => entry.id));
const usedIds = new Set();

const failing = [];
for (const adv of advisories.values()) {
  if (SEVERITY[adv.severity] < SEVERITY[level]) continue;
  const id = ghsa(adv.url);
  if (allowedIds.has(id)) {
    usedIds.add(id);
    const entry = allowlist.find((e) => e.id === id);
    console.log(`allowed  ${adv.severity.padEnd(8)} ${adv.package} ${id} - ${entry.reason}`);
    continue;
  }
  failing.push(adv);
}

for (const entry of allowlist) {
  if (!usedIds.has(entry.id)) {
    console.log(`::warning::audit-gate: allowlist entry ${entry.id} (${entry.package}) no longer matches any advisory - remove it.`);
  }
}

if (failing.length) {
  for (const adv of failing) {
    console.log(`FAIL     ${adv.severity.padEnd(8)} ${adv.package} ${ghsa(adv.url)} - ${adv.title} (${adv.range})`);
  }
  console.log(`audit-gate: ${failing.length} advisory(ies) at ${level} or above.`);
  process.exit(1);
}

console.log(`audit-gate: nothing at ${level} or above outside the allowlist (${advisories.size} advisories total).`);
process.exit(0);

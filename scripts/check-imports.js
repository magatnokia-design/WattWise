/**
 * Verifies every named import resolves to something the target file exports.
 *
 * Written after a crash that reached a real device. A generated edit inserted
 * `describeTimerState` into the wrong import block - it landed in the
 * `react-native` one instead of `../utils/scheduleHelpers` - so the name was
 * imported from a module that does not export it, resolved to undefined, and
 * threw the moment the Schedule screen rendered.
 *
 * Nothing caught it. It is not a syntax error, so Babel parses it happily;
 * eslint's core rules do not resolve relative modules; and there is no React
 * renderer in this project's tests, so nothing ever executed the component.
 *
 *     node scripts/check-imports.js
 *
 * Exits non-zero when a name cannot be found, so it can gate a commit.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'src');
const EXTENSIONS = ['.js', '.jsx'];

const walk = (dir, out = []) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (EXTENSIONS.includes(path.extname(entry.name))) out.push(full);
  }
  return out;
};

/** Resolve a relative specifier to a real file, trying extensions and index. */
const resolveModule = (fromFile, spec) => {
  const base = path.resolve(path.dirname(fromFile), spec);
  const candidates = [
    base,
    ...EXTENSIONS.map((e) => base + e),
    ...EXTENSIONS.map((e) => path.join(base, 'index' + e)),
  ];
  return candidates.find((c) => fs.existsSync(c) && fs.statSync(c).isFile()) || null;
};

/** Names a file exports. Deliberately generous: a miss must never be a false alarm. */
const exportsOf = (file) => {
  const src = fs.readFileSync(file, 'utf8');
  const names = new Set();

  for (const m of src.matchAll(/export\s+(?:const|let|var|function|class)\s+([A-Za-z0-9_$]+)/g)) {
    names.add(m[1]);
  }
  // export { a, b as c }
  for (const m of src.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part.split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  if (/export\s+default/.test(src)) names.add('default');
  // A star re-export could bring in anything; treat the file as opaque.
  if (/export\s*\*\s*from/.test(src)) names.add('*');

  return names;
};

const files = walk(ROOT);

/*
 * Every name this project exports anywhere.
 *
 * The relative-import check below missed the bug it was written for: the name
 * had been inserted into the `react-native` import block, and package imports
 * were being skipped. So a local helper was pulled from a third-party module,
 * resolved to undefined, and threw at render.
 *
 * A name we export ourselves has no business arriving from a package. That is
 * the shape of an edit landing in the wrong import block, and it is cheap to
 * spot.
 */
const localExports = new Set();
for (const f of files) {
  for (const name of exportsOf(f)) {
    if (name !== 'default' && name !== '*') localExports.add(name);
  }
}

const problems = [];

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8');

  for (const m of src.matchAll(/import\s+\{([^}]*)\}\s*from\s*['"]([^'"]+)['"]/g)) {
    const spec = m[2];

    if (!spec.startsWith('.')) {
      // A package cannot supply something this project defines.
      for (const part of m[1].split(',')) {
        const name = part.split(/\s+as\s+/)[0].trim();
        if (name && localExports.has(name)) {
          problems.push(
            `${path.relative(ROOT, file)}  ->  '${name}' imported from '${spec}', ` +
            'but this project exports it - wrong import block?'
          );
        }
      }
      continue;
    }

    const target = resolveModule(file, spec);
    if (!target) {
      problems.push(`${path.relative(ROOT, file)}  ->  '${spec}' does not resolve`);
      continue;
    }

    const available = exportsOf(target);
    if (available.has('*')) continue;

    for (const part of m[1].split(',')) {
      const name = part.split(/\s+as\s+/)[0].trim();
      if (!name) continue;
      if (!available.has(name)) {
        problems.push(
          `${path.relative(ROOT, file)}  ->  '${name}' is not exported by ${spec}`
        );
      }
    }
  }
}

if (problems.length) {
  console.error(`\n${problems.length} bad import${problems.length === 1 ? '' : 's'}:\n`);
  problems.forEach((p) => console.error('  ' + p));
  console.error('');
  process.exit(1);
}

console.log('imports: every named import resolves to a real export');

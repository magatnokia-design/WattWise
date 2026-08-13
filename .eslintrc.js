// Frontend linting for `src/`.
//
// There was none, and the web repo lost two hours to a blank dashboard caused by
// a renamed variable left behind in JSX - a reference to something that no longer
// existed, which nothing in either repo was checking for. That is a class of bug
// no amount of care catches reliably by reading.
//
// Deliberately narrow. This is not a style pass: `functions/` has its own config
// and its own conventions, and turning on a hundred formatting rules across a
// codebase this close to a deadline would bury the one signal that matters in
// noise nobody would read. `no-undef` is the rule that would have caught the web
// repo's crash, so it is the rule that runs.
//
// `no-unused-vars` is deliberately off: without eslint-plugin-react, an imported
// component used only as `<View>` is invisible to scope analysis and would be
// reported as unused on every screen in the project. A rule that cries wolf that
// loudly is a rule people learn to ignore.
//
// Uses the ESLint already installed under functions/, so this adds no dependency.
// Run with `npm run lint:app` (or `npm run verify` for everything).
module.exports = {
  root: true,
  env: {
    es2021: true,
    browser: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: 'module',
    ecmaFeatures: {
      jsx: true,
    },
  },
  globals: {
    // React Native's build-time flag, and the timer/fetch globals it provides.
    __DEV__: 'readonly',
    fetch: 'readonly',
    FormData: 'readonly',
    AbortController: 'readonly',
    requestAnimationFrame: 'readonly',
    cancelAnimationFrame: 'readonly',
  },
  ignorePatterns: [
    'functions/',
    'node_modules/',
    'android/',
    'ios/',
    'dist/',
    '.expo/',
    'scripts/',
  ],
  rules: {
    // The one that matters: a reference to something that does not exist.
    'no-undef': 'error',

    // Cheap structural mistakes that are always bugs, never style.
    'no-dupe-keys': 'error',
    'no-dupe-args': 'error',
    'no-unreachable': 'error',
    'no-const-assign': 'error',
    'no-self-assign': 'error',
    'no-cond-assign': 'error',
    'no-dupe-class-members': 'error',
    'no-func-assign': 'error',
    'no-import-assign': 'error',
    'use-isnan': 'error',
    'valid-typeof': 'error',
  },
};

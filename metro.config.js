const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// `functions/` is Cloud Functions code: it requires Node built-ins (`util`, `fs`)
// and firebase-admin, none of which exist in the React Native runtime. It also
// declares its own package.json "main", so running Metro from that directory
// would otherwise pick functions/index.js as the bundle entry. Blocking the whole
// tree keeps server code out of the app bundle and stops Metro from watching a
// second node_modules install.
const functionsDir = path.resolve(__dirname, 'functions');
const blockFunctionsTree = new RegExp(`^${escapeRegExp(functionsDir)}[\\\\/].*`);

const existingBlockList = config.resolver.blockList;
config.resolver.blockList = Array.isArray(existingBlockList)
  ? [...existingBlockList, blockFunctionsTree]
  : existingBlockList
    ? [existingBlockList, blockFunctionsTree]
    : [blockFunctionsTree];

module.exports = config;

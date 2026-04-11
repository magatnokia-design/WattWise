module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
  ],
  rules: {
    "quotes": "off",
    "max-len": "off",
    "require-jsdoc": "off",
    "valid-jsdoc": "off",
    "object-curly-spacing": "off",
    "comma-dangle": "off",
    "linebreak-style": "off",
    "indent": "off",
    "no-trailing-spaces": "off",
    "padded-blocks": "off",
    "eol-last": "off",
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
};
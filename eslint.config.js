import config from '@digitalbazaar/eslint-config/node-recommended';

export default [
  ...config,
  {
    files: [
      'test/mocha/**/*.js'
    ],
    languageOptions: {
      globals: {
        // @bedrock/test global
        assertNoError: true
      }
    }
  }
];

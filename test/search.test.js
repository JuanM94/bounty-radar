const assert = require('node:assert/strict');
const test = require('node:test');

const { parseAmount } = require('../dist/search');

test('parseAmount treats uppercase K as thousands', () => {
  assert.equal(parseAmount('$10K'), 10000);
  assert.equal(parseAmount('$10k'), 10000);
});

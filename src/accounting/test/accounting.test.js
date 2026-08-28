'use strict';

const assert = require('node:assert/strict');
const { Readable, Writable } = require('node:stream');
const test = require('node:test');

const {
  createDataStore,
  createOperations,
  formatBalance,
  parseAmount,
  run,
} = require('../index');

function runApplication(...inputLines) {
  let output = '';
  const input = Readable.from(inputLines.map((line) => `${line}\n`));
  const writable = new Writable({
    write(chunk, encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });

  return run(input, writable).then(() => output);
}

test('TC-001: starts with a default balance of 1000.00', async () => {
  const output = await runApplication('1', '4');

  assert.match(output, /Account Management System/);
  assert.match(output, /Current balance: 1000\.00/);
});

test('TC-002: viewing the balance repeatedly does not change it', async () => {
  const output = await runApplication('1', '1', '4');

  assert.equal((output.match(/Current balance: 1000\.00/g) || []).length, 2);
});

test('TC-003: credits a positive amount and reports the new balance', async () => {
  const output = await runApplication('2', '250.00', '1', '4');

  assert.match(output, /Amount credited\. New balance: 1250\.00/);
  assert.match(output, /Current balance: 1250\.00/);
});

test('TC-004: applies multiple credits cumulatively', async () => {
  const output = await runApplication('2', '100.00', '2', '50.25', '1', '4');

  assert.match(output, /Current balance: 1150\.25/);
});

test('TC-005: preserves cents precision when crediting', async () => {
  const output = await runApplication('2', '0.99', '1', '4');

  assert.match(output, /Current balance: 1000\.99/);
});

test('TC-006: accepts a zero credit without changing the balance', async () => {
  const output = await runApplication('2', '0.00', '1', '4');

  assert.match(output, /Amount credited\. New balance: 1000\.00/);
  assert.match(output, /Current balance: 1000\.00/);
});

test('TC-007: debits an amount below the current balance', async () => {
  const output = await runApplication('3', '300.00', '1', '4');

  assert.match(output, /Amount debited\. New balance: 700\.00/);
  assert.match(output, /Current balance: 700\.00/);
});

test('TC-008: allows a debit equal to the current balance', async () => {
  const output = await runApplication('3', '1000.00', '1', '4');

  assert.match(output, /Amount debited\. New balance: 0\.00/);
  assert.match(output, /Current balance: 0\.00/);
});

test('TC-009: rejects a debit greater than the current balance', async () => {
  const output = await runApplication('3', '1000.01', '1', '4');

  assert.match(output, /Insufficient funds for this debit\./);
  assert.match(output, /Current balance: 1000\.00/);
});

test('TC-010: keeps a rejected debit from affecting a later debit', async () => {
  const output = await runApplication('3', '1500.00', '3', '200.00', '1', '4');

  assert.match(output, /Insufficient funds for this debit\./);
  assert.match(output, /Amount debited\. New balance: 800\.00/);
  assert.match(output, /Current balance: 800\.00/);
});

test('TC-011: applies credits and debits in sequence', async () => {
  const output = await runApplication('2', '500.00', '3', '250.00', '1', '4');

  assert.match(output, /Current balance: 1250\.00/);
});

test('TC-012: repeats the menu after a completed operation', async () => {
  const output = await runApplication('1', '4');

  assert.equal((output.match(/Account Management System/g) || []).length, 2);
});

test('TC-013: rejects an invalid menu choice and continues', async () => {
  const output = await runApplication('5', '1', '4');

  assert.match(output, /Invalid choice, please select 1-4\./);
  assert.match(output, /Current balance: 1000\.00/);
  assert.equal((output.match(/Account Management System/g) || []).length, 3);
});

test('TC-014: exits with the expected goodbye message', async () => {
  const output = await runApplication('4');

  assert.match(output, /Exiting the program\. Goodbye!/);
});

test('TC-015: resets the balance for a new application run', async () => {
  const firstRun = await runApplication('2', '250.00', '4');
  const secondRun = await runApplication('1', '4');

  assert.match(firstRun, /New balance: 1250\.00/);
  assert.match(secondRun, /Current balance: 1000\.00/);
});

test('TC-016: rejects a negative credit amount', async () => {
  await assert.rejects(runApplication('2', '-100.00', '1', '4'), {
    message: 'Please enter a valid non-negative amount with up to two decimal places.',
  });
});

test('TC-017: rejects a negative debit amount', async () => {
  await assert.rejects(runApplication('3', '-100.00', '1', '4'), {
    message: 'Please enter a valid non-negative amount with up to two decimal places.',
  });
});

test('TC-018: rejects malformed amount input', async () => {
  await assert.rejects(runApplication('2', 'ABC', '1', '4'), {
    message: 'Please enter a valid non-negative amount with up to two decimal places.',
  });
});

test('TC-019: parses values beyond the COBOL field limit as integer cents', () => {
  assert.equal(parseAmount('1000000.00'), 100000000);
});

test('TC-020: performs no operation for an unsupported operation code', () => {
  const dataStore = createDataStore();
  const operations = createOperations(dataStore);

  assert.equal(typeof operations.UNSUPPORTED, 'undefined');
  assert.equal(dataStore.read(), 100000);
});

test('TC-021: reads the balance stored by the data module', () => {
  const dataStore = createDataStore();
  dataStore.write(125050);

  assert.equal(dataStore.read(), 125050);
});

test('TC-022: persists a written balance during the process', () => {
  const dataStore = createDataStore();
  dataStore.write(parseAmount('1250.50'));

  assert.equal(formatBalance(dataStore.read()), '1250.50');
});

test('TC-023: leaves the data module unchanged when no supported operation is used', () => {
  const dataStore = createDataStore();
  dataStore.write(100000);

  assert.equal(dataStore.read(), 100000);
});
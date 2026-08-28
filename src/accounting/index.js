'use strict';

const readline = require('node:readline');

const DEFAULT_BALANCE_CENTS = 100000;

function formatBalance(balanceCents) {
  return (balanceCents / 100).toFixed(2);
}

function parseAmount(input) {
  const value = String(input).trim();
  if (!/^\d+(?:\.\d{1,2})?$/.test(value)) {
    throw new Error('Please enter a valid non-negative amount with up to two decimal places.');
  }

  const [whole, fraction = ''] = value.split('.');
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
}

function createDataStore(initialBalanceCents = DEFAULT_BALANCE_CENTS) {
  let storageBalanceCents = initialBalanceCents;

  return {
    read() {
      return storageBalanceCents;
    },
    write(balanceCents) {
      storageBalanceCents = balanceCents;
    },
  };
}

function createOperations(dataStore = createDataStore()) {
  return {
    total() {
      return dataStore.read();
    },
    credit(amountCents) {
      const balanceCents = dataStore.read() + amountCents;
      dataStore.write(balanceCents);
      return balanceCents;
    },
    debit(amountCents) {
      const balanceCents = dataStore.read();
      if (balanceCents < amountCents) {
        return { successful: false, balanceCents };
      }

      const newBalanceCents = balanceCents - amountCents;
      dataStore.write(newBalanceCents);
      return { successful: true, balanceCents: newBalanceCents };
    },
  };
}

function createInterface(input = process.stdin, output = process.stdout) {
  const terminal = readline.createInterface({ input, output });
  const operations = createOperations();
  const inputLines = terminal[Symbol.asyncIterator]();

  const displayMenu = () => {
    output.write('--------------------------------\n');
    output.write('Account Management System\n');
    output.write('1. View Balance\n');
    output.write('2. Credit Account\n');
    output.write('3. Debit Account\n');
    output.write('4. Exit\n');
    output.write('--------------------------------\n');
  };

  const ask = async (question) => {
    output.write(question);
    const { value, done } = await inputLines.next();
    return done ? '' : value;
  };

  return { terminal, operations, displayMenu, ask };
}

async function run(input = process.stdin, output = process.stdout) {
  const { terminal, operations, displayMenu, ask } = createInterface(input, output);

  try {
    let continueRunning = true;
    while (continueRunning) {
      displayMenu();
      const choice = (await ask('Enter your choice (1-4): ')).trim();

      switch (choice) {
        case '1':
          output.write(`Current balance: ${formatBalance(operations.total())}\n`);
          break;
        case '2': {
          const amount = parseAmount(await ask('Enter credit amount: '));
          output.write(`Amount credited. New balance: ${formatBalance(operations.credit(amount))}\n`);
          break;
        }
        case '3': {
          const amount = parseAmount(await ask('Enter debit amount: '));
          const result = operations.debit(amount);
          if (result.successful) {
            output.write(`Amount debited. New balance: ${formatBalance(result.balanceCents)}\n`);
          } else {
            output.write('Insufficient funds for this debit.\n');
          }
          break;
        }
        case '4':
          continueRunning = false;
          break;
        default:
          output.write('Invalid choice, please select 1-4.\n');
      }
    }
    output.write('Exiting the program. Goodbye!\n');
  } finally {
    terminal.close();
  }
}

if (require.main === module) {
  run().catch((error) => {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_BALANCE_CENTS,
  createDataStore,
  createOperations,
  formatBalance,
  parseAmount,
  run,
};
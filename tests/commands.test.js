const assert = require('node:assert/strict');

const { buildCommands, getCommandsSignature, registerCommands } = require('../commands');

async function runTest(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

async function collectCommands() {
  let captured = null;
  const guild = {
    commands: {
      async set(commands) {
        captured = commands;
        return commands;
      }
    }
  };

  await registerCommands(guild);
  return captured;
}

async function testRequiredOptionsPrecedeOptionalOptions() {
  const commands = await collectCommands();
  assert.ok(Array.isArray(commands) && commands.length > 0);

  for (const command of commands) {
    let sawOptional = false;
    for (const option of command.options || []) {
      if (option.required) {
        assert.equal(
          sawOptional,
          false,
          `Command /${command.name} has required option "${option.name}" after an optional option`
        );
      } else {
        sawOptional = true;
      }
    }
  }
}

async function testClearAllChannelConfirmationStaysRequiredAndFirst() {
  const commands = await collectCommands();
  const clearAll = commands.find(command => command.name === 'clearallchannel');

  assert.ok(clearAll);
  assert.equal(clearAll.options[0].required, true);
  assert.equal(clearAll.options[0].name, 'подтверждение');
  assert.equal(clearAll.options[1].required, false);
}

async function testAutomodAndServerReportCommandsAreRegistered() {
  const commands = await collectCommands();
  const automod = commands.find(command => command.name === 'automod');
  const serverReport = commands.find(command => command.name === 'serverreport');
  const setChannel = commands.find(command => command.name === 'setchannel');

  assert.ok(automod);
  assert.ok(serverReport);
  assert.ok(setChannel);
  assert.equal((setChannel.options[0].choices || []).some(choice => choice.value === 'updates'), true);
}

async function testCommandSignatureIsStable() {
  const first = buildCommands();
  const second = buildCommands();

  assert.equal(getCommandsSignature(first), getCommandsSignature(second));
}

async function main() {
  await runTest('commands keep required options before optional ones', testRequiredOptionsPrecedeOptionalOptions);
  await runTest('clearallchannel keeps confirmation as the first required option', testClearAllChannelConfirmationStaysRequiredAndFirst);
  await runTest('automod and serverreport commands are registered', testAutomodAndServerReportCommandsAreRegistered);
  await runTest('command signature stays stable between builds', testCommandSignatureIsStable);
  console.log('ALL COMMAND TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };

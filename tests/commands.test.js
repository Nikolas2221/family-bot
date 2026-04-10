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
  const setRole = commands.find(command => command.name === 'setrole');
  const welcome = commands.find(command => command.name === 'welcome');
  const autorole = commands.find(command => command.name === 'autorole');
  const reactionRole = commands.find(command => command.name === 'reactionrole');
  const reportSchedule = commands.find(command => command.name === 'reportschedule');

  assert.ok(automod);
  assert.ok(serverReport);
  assert.ok(setChannel);
  assert.ok(setRole);
  assert.ok(welcome);
  assert.ok(autorole);
  assert.ok(reactionRole);
  assert.ok(reportSchedule);
  assert.equal((setChannel.options[0].choices || []).some(choice => choice.value === 'updates'), true);
  assert.equal((setChannel.options[0].choices || []).some(choice => choice.value === 'welcome'), true);
  assert.equal((setChannel.options[0].choices || []).some(choice => choice.value === 'reports'), true);
  assert.equal((setRole.options[0].choices || []).some(choice => choice.value === 'autorole'), true);
}

async function testCommandSignatureIsStable() {
  const first = buildCommands();
  const second = buildCommands();

  assert.equal(getCommandsSignature(first), getCommandsSignature(second));
}

function collectDescriptions(command, bucket = []) {
  if (typeof command.description === 'string') {
    bucket.push({ name: command.name, description: command.description });
  }

  for (const option of command.options || []) {
    if (typeof option.description === 'string') {
      bucket.push({ name: `${command.name}.${option.name}`, description: option.description });
    }
    for (const nested of option.options || []) {
      if (typeof nested.description === 'string') {
        bucket.push({ name: `${command.name}.${option.name}.${nested.name}`, description: nested.description });
      }
    }
  }

  return bucket;
}

async function testCommandDescriptionsDoNotContainMojibake() {
  const commands = buildCommands();
  const descriptions = commands.flatMap((command) => collectDescriptions(command));
  const mojibakeMarkers = ['Рџ', 'РЎ', 'СЃ', 'С‚', 'СЊ', 'Рђ', 'Р‘', 'Р’', 'Р“', 'Р”', 'Р•', 'Р–', 'Р—', 'Р', 'Р™', 'Рљ', 'Р›', 'Рњ', 'Рќ', 'Рћ', 'Рџ', 'Р ', 'РЎ'];
  const mojibake = descriptions.filter((entry) => mojibakeMarkers.some((marker) => entry.description.includes(marker)));

  assert.deepEqual(
    mojibake,
    [],
    `Found mojibake in command descriptions: ${mojibake.map((entry) => `${entry.name} => ${entry.description}`).join('; ')}`
  );
}

async function main() {
  await runTest('commands keep required options before optional ones', testRequiredOptionsPrecedeOptionalOptions);
  await runTest('clearallchannel keeps confirmation as the first required option', testClearAllChannelConfirmationStaysRequiredAndFirst);
  await runTest('automod and serverreport commands are registered', testAutomodAndServerReportCommandsAreRegistered);
  await runTest('command signature stays stable between builds', testCommandSignatureIsStable);
  await runTest('command descriptions stay free of mojibake', testCommandDescriptionsDoNotContainMojibake);
  console.log('ALL COMMAND TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };

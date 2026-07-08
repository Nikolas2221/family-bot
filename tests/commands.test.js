const assert = require('node:assert/strict');

const { buildCommands, getCommandsSignature, registerCommands } = require('../dist-ts/commands');

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
  const reportForm = commands.find(command => command.name === 'reportform');
  const mediaShare = commands.find(command => command.name === 'mediashare');
  const announce = commands.find(command => command.name === 'announce');
  const event = commands.find(command => command.name === 'event');
  const close = commands.find(command => command.name === 'close');
  const law = commands.find(command => command.name === 'law');
  const ticket = commands.find(command => command.name === 'ticket');
  const afk = commands.find(command => command.name === 'afk');
  const online = commands.find(command => command.name === 'online');
  const capabilities = commands.find(command => command.name === 'capabilities');
  const serverBackup = commands.find(command => command.name === 'serverbackup');
  const voice = commands.find(command => command.name === 'voice');
  const security = commands.find(command => command.name === 'security');

  assert.ok(automod);
  assert.ok(serverReport);
  assert.ok(setChannel);
  assert.ok(setRole);
  assert.ok(welcome);
  assert.ok(autorole);
  assert.ok(reactionRole);
  assert.ok(reportSchedule);
  assert.ok(reportForm);
  assert.ok(mediaShare);
  assert.ok(announce);
  assert.ok(event);
  assert.ok(close);
  assert.ok(law);
  assert.ok(ticket);
  assert.ok(afk);
  assert.ok(online);
  assert.ok(capabilities);
  assert.ok(serverBackup);
  assert.ok(voice);
  assert.deepEqual((voice.options || []).map(option => option.name), [
    'name',
    'limit',
    'bitrate',
    'lock',
    'unlock',
    'hide',
    'show',
    'allow',
    'deny',
    'kick',
    'ban',
    'transfer',
    'delete'
  ]);
  assert.ok(security);
  assert.deepEqual(afk.options.map(option => option.name), ['setup', 'list', 'approve', 'decline', 'status', 'refresh']);
  assert.deepEqual(ticket.options.map(option => option.name), ['setup', 'info', 'close', 'claim', 'add', 'remove', 'list']);
  assert.deepEqual(reportForm.options.map(option => option.name), ['setup', 'refresh', 'status']);
  assert.deepEqual(mediaShare.options.map(option => option.name), ['setup', 'refresh', 'status']);
  assert.deepEqual(serverBackup.options.map(option => option.name), ['create', 'list', 'restore']);
  assert.deepEqual(security.options.map(option => option.name), ['lockdown', 'unlock', 'check']);
  assert.equal(law.options[0].name, 'question');
  assert.equal(announce.options[0].name, 'text');
  assert.equal(event.options[0].name, 'text');
  assert.equal((setChannel.options[0].choices || []).some(choice => choice.value === 'updates'), true);
  assert.equal((setChannel.options[0].choices || []).some(choice => choice.value === 'welcome'), true);
  assert.equal((setChannel.options[0].choices || []).some(choice => choice.value === 'reports'), true);
  assert.equal((setRole.options[0].choices || []).some(choice => choice.value === 'autorole'), true);
  assert.equal(welcome.options.some(option => option.name === 'rules'), true);
  const verification = commands.find(command => command.name === 'verification');
  assert.equal(verification.options.some(option => option.name === 'questionnaire'), false);
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

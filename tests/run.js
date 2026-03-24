async function main() {
  const { main: runAiTests } = require('./ai.test');
  const { main: runAutomodTests } = require('./automod.test');
  const { main: runApplicationsTests } = require('./applications.test');
  const { main: runCommandsTests } = require('./commands.test');
  const { main: runDatabaseTests } = require('./database.test');
  const { main: runConfigTests } = require('./config.test');
  const { main: runEmbedsTests } = require('./embeds.test');
  const { main: runReleaseNotesTests } = require('./release-notes.test');
  const { main: runRanksTests } = require('./ranks.test');
  const { main: runSecurityTests } = require('./security.test');
  const { main: runStorageTests } = require('./storage.test');

  await runAiTests();
  await runAutomodTests();
  await runApplicationsTests();
  await runCommandsTests();
  await runDatabaseTests();
  await runConfigTests();
  await runEmbedsTests();
  await runReleaseNotesTests();
  await runRanksTests();
  await runSecurityTests();
  await runStorageTests();
  console.log('ALL TEST SUITES PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };

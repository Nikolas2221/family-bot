async function main() {
  const { main: runAiTests } = require('./ai.test');
  const { main: runAutomodTests } = require('./automod.test');
  const { main: runApplicationsTests } = require('./applications.test');
  const { main: runCommandsTests } = require('./commands.test');
  const { main: runCopyRuntimeTests } = require('./copy-runtime.test');
  const { main: runDatabaseTests } = require('./database.test');
  const { main: runConfigTests } = require('./config.test');
  const { main: runEmbedsTests } = require('./embeds.test');
  const { main: runReleaseNotesTests } = require('./release-notes.test');
  const { main: runRanksTests } = require('./ranks.test');
  const { main: runRuntimeAccessHelpersTests } = require('./runtime-access-helpers.test');
  const { main: runRuntimeCommandHelpersTests } = require('./runtime-command-helpers.test');
  const { main: runRuntimeFamilyHelpersTests } = require('./runtime-family-helpers.test');
  const { main: runRuntimeNotificationHelpersTests } = require('./runtime-notification-helpers.test');
  const { main: runSecurityTests } = require('./security.test');
  const { main: runStorageTests } = require('./storage.test');
  const { main: runTsDebtTests } = require('./ts-debt.test');
  const { main: runTsMigrationTests } = require('./ts-migration.test');

  await runAiTests();
  await runAutomodTests();
  await runApplicationsTests();
  await runCommandsTests();
  await runCopyRuntimeTests();
  await runDatabaseTests();
  await runConfigTests();
  await runEmbedsTests();
  await runReleaseNotesTests();
  await runRanksTests();
  await runRuntimeAccessHelpersTests();
  await runRuntimeCommandHelpersTests();
  await runRuntimeFamilyHelpersTests();
  await runRuntimeNotificationHelpersTests();
  await runSecurityTests();
  await runStorageTests();
  await runTsDebtTests();
  await runTsMigrationTests();
  console.log('ALL TEST SUITES PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };

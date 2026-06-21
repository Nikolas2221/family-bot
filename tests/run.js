async function main() {
  const { main: runAiTests } = require('./ai.test');
  const { main: runAutomodTests } = require('./automod.test');
  const { main: runApplicationsTests } = require('./applications.test');
  const { main: runCommandsTests } = require('./commands.test');
  const { main: runClientReadyRuntimeTests } = require('./client-ready-runtime.test');
  const { main: runCopyRuntimeTests } = require('./copy-runtime.test');
  const { main: runDatabaseTests } = require('./database.test');
  const { main: runConfigTests } = require('./config.test');
  const { main: runEmbedsTests } = require('./embeds.test');
  const { main: runGuildRuntimeTests } = require('./guild-runtime.test');
  const { main: runLeakGuardTests } = require('./leak-guard.test');
  const { main: runLawTests } = require('./law.test');
  const { main: runMojibakeTests } = require('./mojibake.test');
  const { main: runReleaseNotesTests } = require('./release-notes.test');
  const { main: runRanksTests } = require('./ranks.test');
  const { main: runRuntimeAccessHelpersTests } = require('./runtime-access-helpers.test');
  const { main: runRuntimeAutomationHelpersTests } = require('./runtime-automation-helpers.test');
  const { main: runRuntimeCommandHelpersTests } = require('./runtime-command-helpers.test');
  const { main: runRuntimeFamilyHelpersTests } = require('./runtime-family-helpers.test');
  const { main: runRuntimeLifecycleHelpersTests } = require('./runtime-lifecycle-helpers.test');
  const { main: runRuntimeNotificationHelpersTests } = require('./runtime-notification-helpers.test');
  const { main: runSecurityTests } = require('./security.test');
  const { main: runStorageTests } = require('./storage.test');
  const { main: runTelegramTests } = require('./telegram.test');
  const { main: runTelegramHandlersTests } = require('./telegram-handlers.test');
  const { main: runTicketBridgeTests } = require('./ticket-bridge.test');
  const { main: runAnnouncementsTests } = require('./announcements.test');
  const { main: runTsDebtTests } = require('./ts-debt.test');
  const { main: runTsMigrationTests } = require('./ts-migration.test');

  await runAiTests();
  await runAutomodTests();
  await runApplicationsTests();
  await runCommandsTests();
  await runClientReadyRuntimeTests();
  await runCopyRuntimeTests();
  await runDatabaseTests();
  await runConfigTests();
  await runEmbedsTests();
  await runGuildRuntimeTests();
  await runLeakGuardTests();
  await runLawTests();
  await runMojibakeTests();
  await runReleaseNotesTests();
  await runRanksTests();
  await runRuntimeAccessHelpersTests();
  await runRuntimeAutomationHelpersTests();
  await runRuntimeCommandHelpersTests();
  await runRuntimeFamilyHelpersTests();
  await runRuntimeLifecycleHelpersTests();
  await runRuntimeNotificationHelpersTests();
  await runSecurityTests();
  await runStorageTests();
  await runTelegramTests();
  await runTelegramHandlersTests();
  await runTicketBridgeTests();
  await runAnnouncementsTests();
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

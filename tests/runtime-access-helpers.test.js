const assert = require('node:assert/strict');

const {
  canApplications,
  canBypassChannelGuard,
  canBypassLeakGuard,
  canDebugConfig,
  canDiscipline,
  canManageNicknames,
  canManageRanks,
  canManageTargetChannel,
  canModerate,
  canUseSecurity,
  formatModerationTimestamp,
  resolveTargetTextChannel
} = require('../dist-ts/runtime-access-helpers');

async function main() {
  const accessApi = {
    canApplications: () => true,
    canDiscipline: () => true,
    canManageRanks: () => false,
    canModerate: () => true,
    canManageNicknames: () => false,
    canUseSecurity: () => true,
    canBypassLeakGuard: () => false,
    canBypassChannelGuard: () => true,
    canManageTargetChannel: (_member, channel) => channel?.id === 'ok'
  };

  assert.equal(canApplications(accessApi, {}), true);
  assert.equal(canDiscipline(accessApi, {}), true);
  assert.equal(canManageRanks(accessApi, {}), false);
  assert.equal(canModerate(accessApi, {}), true);
  assert.equal(canManageNicknames(accessApi, {}), false);
  assert.equal(canUseSecurity(accessApi, {}), true);
  assert.equal(canBypassLeakGuard(accessApi, {}), false);
  assert.equal(canBypassChannelGuard(accessApi, {}), true);
  assert.equal(canManageTargetChannel(accessApi, {}, { id: 'ok' }), true);
  assert.equal(canManageTargetChannel(accessApi, {}, { id: 'bad' }), false);

  const fakePermissions = {
    has(flag) {
      return flag === 8n || flag === 32n || flag === 268435456n;
    }
  };
  assert.equal(canDebugConfig({ memberPermissions: fakePermissions }), true);
  assert.equal(canDebugConfig({}), false);

  const channel = { id: 'chan', type: 0 };
  assert.equal(
    resolveTargetTextChannel(
      {
        options: { getChannel: () => null },
        channel
      },
      'канал'
    ),
    channel
  );
  assert.equal(
    resolveTargetTextChannel(
      {
        options: { getChannel: () => ({ id: 'voice', type: 2 }) },
        channel: null
      },
      'канал'
    ),
    null
  );

  assert.match(formatModerationTimestamp(Date.now()), /\d{2}\.\d{2}\.\d{4}/u);
  assert.equal(formatModerationTimestamp('not-a-date'), 'неизвестно');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };

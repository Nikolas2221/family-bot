const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder } = require('discord.js');
const { updateArtworkHtml } = require('../dist-ts/services/update-artwork');
const { createTelegramNotificationService } = require('../dist-ts/telegram');
const { createNotificationRuntimeHelpers } = require('../dist-ts/runtime-notification-helpers');
const { buildUpdateAnnouncementEmbed } = require('../dist-ts/embeds-source');

async function main() {
  const banner = fs.readFileSync(path.join(__dirname, '../assets/vice-city/banner.png'));
  assert.ok(banner.length > 10000);
  const html = updateArtworkHtml({ semver: '2.7.9', buildId: '<script>bad</script>', changeLines: { added: ['<img src=x onerror=bad()>'] } }, banner);
  assert.match(html, /2\.7\.9/);
  assert.doesNotMatch(html, /<script>|onerror=bad\(\)>/);
  assert.match(html, /&lt;img/);
  assert.throws(() => updateArtworkHtml({ semver: '1', buildId: 'a' }, banner), /requires release notes/);
  const attachmentEmbed = buildUpdateAnnouncementEmbed({ semver: '2', buildId: 'x', versionLabel: 'test', imageUrl: 'attachment://klaiz-update.png' });
  assert.equal(attachmentEmbed.toJSON().image.url, 'attachment://klaiz-update.png');
  const files = [];
  const messages = [];
  let renders = 0;
  let custom = false;
  let fail = false;
  const telegram = createTelegramNotificationService({ adminChatId: 'admin', getCardStyle: () => custom ? { imageUrl: 'https://example.com/custom.png' } : {},
    renderUpdateArtwork: async () => { renders++; if (fail) throw Error('render unavailable'); return Buffer.from('image'); },
    sender: { sendPhoto: async (_chat, photo) => files.push(photo), sendMessage: async (_chat, text) => messages.push(text) }, logger: { warn() {} }
  });
  const input = { guildId: 'guild', semver: '1.5.0', buildId: 'abc', versionLabel: 'KLAIZ', changeLines: { added: ['New style'] } };
  assert.equal(await telegram.notifyUpdateAnnouncement(input), true);
  assert.ok(Buffer.isBuffer(files[0].source));
  assert.match(messages[0], /New style/);
  fail = true;
  assert.equal(await telegram.notifyUpdateAnnouncement(input), true);
  assert.equal(messages.length, 2);
  custom = true;
  const before = renders;
  assert.equal(await telegram.notifyUpdateAnnouncement(input), true);
  assert.equal(renders, before);
  assert.equal(files.at(-1), 'https://example.com/custom.png');
  const discordPayloads = [];
  let announced = false;
  let canAttach = true;
  let failRender = false;
  const helper = createNotificationRuntimeHelpers({ productVersionSemver: '1.5.0', deployCommitMessage: 'Release 1.5.0: Vice City', deployBuildId: 'abc', productVersionLabel: 'KLAIZ',
    database: { getGuild: () => ({ maintenance: {} }), updateGuildMaintenance: () => { announced = true; } },
    resolveGuildSettings: () => ({ channels: { updates: 'updates' }, visuals: {} }),
    fetchTextChannel: async () => ({ permissionsFor: () => ({ has: () => canAttach }), send: async payload => { discordPayloads.push(payload); } }),
    embeds: { buildUpdateAnnouncementEmbed }, EmbedBuilderCtor: EmbedBuilder,
    getUpdateChangeGroups: () => ({ added: ['New style'], updated: [], fixed: [] }), getCurrentReleaseChangeGroups: () => ({}),
    renderUpdateArtwork: async () => { if (failRender) throw Error('Renderer failed'); return Buffer.from('image'); }
  });
  const discordGuild = { id: 'guild', client: { user: { id: 'bot' } } };
  await helper.announceBuildUpdate(discordGuild);
  assert.equal(announced, true);
  assert.ok(Buffer.isBuffer(discordPayloads[0].files[0].attachment));
  assert.equal(discordPayloads[0].embeds[0].toJSON().image.url, 'attachment://klaiz-update.png');
  canAttach = false;
  await helper.announceBuildUpdate({ ...discordGuild, id: 'no-attachment-permission' });
  assert.equal(discordPayloads.at(-1).files, undefined);
  assert.equal(discordPayloads.at(-1).embeds[0].toJSON().image, undefined);
  failRender = true;
  await helper.announceBuildUpdate({ ...discordGuild, id: 'renderer-failure' });
  assert.equal(discordPayloads.at(-1).files, undefined);
  assert.match(JSON.stringify(discordPayloads.at(-1).embeds[0].toJSON()), /New style/);
  console.log('PASS Vice City artwork escaping, dynamic version, Discord attachment, Telegram upload, custom override and text fallback');
}
module.exports = { main };

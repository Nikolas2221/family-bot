const assert = require('node:assert/strict');

const {
  buildMediaShareModal,
  buildMediaSharePanel,
  buildMediaSharePublicationEmbed
} = require('../dist-ts/media-share-ui');

async function main() {
  const panel = buildMediaSharePanel({
    minRoleId: '111111111111111111',
    targetChannelId: '222222222222222222'
  });
  const buttons = panel.components[0].toJSON().components.map(component => component.custom_id);
  assert.deepEqual(buttons, ['media_share_open:video', 'media_share_open:stream']);

  assert.equal(buildMediaShareModal('video').toJSON().custom_id, 'media_share_modal:video');
  assert.equal(buildMediaShareModal('stream').toJSON().custom_id, 'media_share_modal:stream');

  const embed = buildMediaSharePublicationEmbed({
    kind: 'video',
    url: 'https://example.test/video',
    note: 'test',
    author: { id: '333333333333333333' },
    moderator: 'Автопубликация'
  }).toJSON();
  const fieldNames = embed.fields.map(field => field.name);
  assert.deepEqual(fieldNames.slice(0, 3), ['Автор публикации', 'Модератор', 'Контент']);

  console.log('ALL MEDIA SHARE UI TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };

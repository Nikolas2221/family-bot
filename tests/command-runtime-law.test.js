const assert = require('node:assert/strict');
const { EmbedBuilder } = require('discord.js');
const { handleCommandRuntime } = require('../dist-ts/command-runtime');

async function main() {
  let reply = null;
  const interaction = {
    commandName: 'law',
    guild: { id: '123456789012345678' },
    isChatInputCommand: () => true,
    options: { getString: () => 'виды территорий' },
    async deferReply() {},
    async editReply(payload) { reply = payload; }
  };
  const handled = await handleCommandRuntime(interaction, {
    guildStorage: { addCommend() {} },
    EmbedBuilderCtor: EmbedBuilder,
    lawService: {
      async answer() {
        await new Promise(resolve => setTimeout(resolve, 5));
        return { found: true, title: 'Ответ ассистента', description: 'Проверенный ответ' };
      },
      stats() { return { documents: 27 }; }
    }
  });

  assert.equal(handled, true);
  assert.ok(reply?.embeds?.[0]);
  const embed = reply.embeds[0].toJSON();
  assert.equal(embed.title, 'Ответ ассистента');
  assert.equal(embed.description, 'Проверенный ответ');
  console.log('ALL LAW COMMAND RUNTIME TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };

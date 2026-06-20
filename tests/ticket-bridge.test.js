const assert = require('node:assert/strict');

const { createTicketService } = require('../dist-ts/services/tickets');

async function main() {
  const application = {
    id: 'ticket-1',
    guildId: 'guild-1',
    discordId: 'user-1',
    nickname: 'Candidate',
    ticketThreadId: '',
    ticketStatus: 'open',
    status: 'pending'
  };
  const store = { applications: [application], announcements: [] };
  let saves = 0;
  const channelMessages = [];
  const telegramMessages = [];
  const channel = {
    id: 'channel-1',
    name: 'ticket-candidate',
    archived: false,
    async send(payload) {
      channelMessages.push(payload);
      return { id: `discord-${channelMessages.length}` };
    }
  };
  const service = createTicketService({
    storage: {
      getStore: () => store,
      save: () => { saves += 1; }
    },
    client: {
      channels: { fetch: async id => (id === channel.id ? channel : null) }
    },
    telegramNotifications: {
      notifyTicketActivity: async payload => {
        telegramMessages.push(payload);
        return true;
      }
    },
    notificationWindowMs: 20
  });

  service.registerTicket(application, {
    channelId: channel.id,
    channelName: channel.name,
    discordUsername: 'candidate'
  });
  assert.equal(service.findTicketByChannel(channel.id), application);
  assert.equal(application.ticketStatus, 'open');

  assert.equal(await service.takeInWork('ticket-1', '@telegram-admin'), 'ok');
  assert.equal(application.ticketStatus, 'in_progress');
  assert.match(channelMessages[0].content, /взял в работу/);

  assert.equal(await service.replyToTicket('ticket-1', 'Ожидай ответ.', '@telegram-admin'), 'ok');
  assert.match(channelMessages[1].content, /Ответ от администрации Telegram/);

  const message = {
    content: 'Первое сообщение',
    guild: { id: 'guild-1' },
    channel,
    author: { id: 'user-1', username: 'candidate', bot: false }
  };
  assert.equal(await service.handleDiscordTicketMessage(message), true);
  assert.equal(await service.handleDiscordTicketMessage({ ...message, content: 'Второе сообщение' }), true);
  assert.equal(telegramMessages.length, 1);
  await new Promise(resolve => setTimeout(resolve, 35));
  assert.equal(telegramMessages.length, 2);
  assert.equal(telegramMessages[1].count, 1);

  service.markClosed(application, { handledBy: 'moderator', reason: 'done' });
  assert.equal(await service.replyToTicket('ticket-1', 'late', '@admin'), 'closed');
  assert.equal(application.closedAt.length > 0, true);
  assert.equal(saves > 0, true);
  service.stop();
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };

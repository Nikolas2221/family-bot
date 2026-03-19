require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType,
} = require('discord.js');

const ROLES = require('./roles');
const DATA_FILE = path.join(__dirname, 'storage.json');

const GUILD_ID = process.env.GUILD_ID;
const CHANNEL_ID = process.env.CHANNEL_ID;
const APPLICATIONS_CHANNEL_ID = process.env.APPLICATIONS_CHANNEL_ID || CHANNEL_ID;
const LOG_CHANNEL_ID = process.env.LOG_CHANNEL_ID || '';
const UPDATE_INTERVAL_MS = Math.max(60000, Number(process.env.UPDATE_INTERVAL_MS || 60000));
const APPLICATION_COOLDOWN_MS = Math.max(10000, Number(process.env.APPLICATION_COOLDOWN_MS || 300000));
const APPLICATION_DEFAULT_ROLE = process.env.APPLICATION_DEFAULT_ROLE || process.env.ROLE_NEWBIE || '';
const FAMILY_TITLE = process.env.FAMILY_TITLE || '🏠 Семья';

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

function defaultStore() {
  return {
    members: {},
    applications: [],
    cooldowns: {},
    stats: {}
  };
}

function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return defaultStore();
    return { ...defaultStore(), ...JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) };
  } catch {
    return defaultStore();
  }
}
let store = loadStore();
function saveStore() {
  fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8');
}

function ensureMember(id) {
  if (!store.members[id]) {
    store.members[id] = {
      messageCount: 0,
      lastSeenAt: Date.now()
    };
  }
  return store.members[id];
}

function getRoleIds() {
  return ROLES.map(r => r.id).filter(Boolean);
}

function hasFamilyRole(member) {
  const ids = new Set(getRoleIds());
  return member.roles.cache.some(r => ids.has(r.id));
}

function getStatusEmoji(member) {
  const s = member.presence?.status || 'offline';
  if (s === 'online') return '🟢';
  if (s === 'idle') return '🟡';
  if (s === 'dnd') return '⛔';
  return '⚫';
}

function statusWeight(member) {
  const s = member.presence?.status || 'offline';
  if (s === 'online') return 0;
  if (s === 'idle') return 1;
  if (s === 'dnd') return 2;
  return 3;
}

function activityScore(memberId) {
  const m = ensureMember(memberId);
  return m.messageCount || 0;
}

function sortMembers(members) {
  return [...members].sort((a, b) => {
    const st = statusWeight(a) - statusWeight(b);
    if (st !== 0) return st;
    const act = activityScore(b.id) - activityScore(a.id);
    if (act !== 0) return act;
    return a.displayName.localeCompare(b.displayName, 'ru');
  });
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function fetchTextChannel(guild, id) {
  if (!id) return null;
  const ch = await guild.channels.fetch(id).catch(() => null);
  if (!ch || ch.type !== ChannelType.GuildText) return null;
  return ch;
}

function panelButtons() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('family_refresh').setLabel('Обновить').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
    )
  ];
}

function buildApplyModal() {
  const modal = new ModalBuilder().setCustomId('family_apply_modal').setTitle('Заявка в семью');
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('nickname').setLabel('Ваш ник').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('age').setLabel('Ваш возраст').setStyle(TextInputStyle.Short).setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('text').setLabel('Почему хотите в семью').setStyle(TextInputStyle.Paragraph).setRequired(true)
    )
  );
  return modal;
}

async function buildFamilyEmbeds(guild) {
  const configuredRoles = ROLES
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(item => item.role)
    .sort((a, b) => b.role.position - a.role.position);

  const embeds = [];
  let embed = new EmbedBuilder()
    .setTitle(FAMILY_TITLE)
    .setColor(0x8B5CF6)
    .setDescription('🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн')
    .setTimestamp()
    .setFooter({ text: `Оптимизировано • обновление ${Math.floor(UPDATE_INTERVAL_MS / 1000)} сек.` });

  let total = 0;
  let fieldCount = 0;

  for (const item of configuredRoles) {
    const members = sortMembers(item.role.members.map(m => m));
    if (!members.length) continue;
    total += members.length;

    const lines = members.map(m => `${getStatusEmoji(m)} <@${m.id}> • ${activityScore(m.id)} очк.`);
    const parts = chunk(lines, 15);

    for (let i = 0; i < parts.length; i++) {
      if (fieldCount >= 25) {
        embeds.push(embed);
        embed = new EmbedBuilder().setColor(0x8B5CF6).setTimestamp();
        fieldCount = 0;
      }
      embed.addFields({
        name: i === 0 ? `${item.name} (${members.length})` : `${item.name} — продолжение`,
        value: parts[i].join('\n'),
        inline: false
      });
      fieldCount++;
    }
  }

  if (fieldCount === 0) {
    embed.setDescription('Нет участников в выбранных ролях.');
  }

  embed.setAuthor({ name: `Всего участников: ${total}` });
  embeds.push(embed);
  return embeds;
}

let panelUpdateInProgress = false;
let pendingPanelUpdate = false;
let lastPanelUpdate = 0;

async function doPanelUpdate(force = false) {
  if (panelUpdateInProgress) {
    pendingPanelUpdate = true;
    return;
  }

  const now = Date.now();
  if (!force && now - lastPanelUpdate < 15000) return;

  panelUpdateInProgress = true;
  try {
    const guild = client.guilds.cache.get(GUILD_ID);
    if (!guild) return;
    const channel = await fetchTextChannel(guild, CHANNEL_ID);
    if (!channel) return;

    const embeds = await buildFamilyEmbeds(guild);

    if (process.env.MESSAGE_ID) {
      try {
        const message = await channel.messages.fetch(process.env.MESSAGE_ID);
        await message.edit({ embeds, components: panelButtons(), content: '' });
      } catch {
        const message = await channel.send({ embeds, components: panelButtons(), content: '' });
        console.log('Скопируй MESSAGE_ID:', message.id);
      }
    } else {
      const message = await channel.send({ embeds, components: panelButtons(), content: '' });
      console.log('Скопируй MESSAGE_ID:', message.id);
    }

    lastPanelUpdate = Date.now();
  } catch (e) {
    console.error('Ошибка обновления панели:', e);
  } finally {
    panelUpdateInProgress = false;
    if (pendingPanelUpdate) {
      pendingPanelUpdate = false;
      setTimeout(() => doPanelUpdate(false), 3000);
    }
  }
}

async function sendAcceptLog(guild, member, moderatorUser, reason, rankName) {
  if (!LOG_CHANNEL_ID) return;
  const channel = await fetchTextChannel(guild, LOG_CHANNEL_ID);
  if (!channel) return;

  const embed = new EmbedBuilder()
    .setColor(0x16a34a)
    .setTitle('🏠 Приём в семью')
    .setDescription(`> **<@${member.id}> принят в семью**\n> Принял: <@${moderatorUser.id}>`)
    .addFields(
      { name: '👤 Кандидат', value: `**Ник:** ${member.displayName}\n**ID:** \`${member.id}\``, inline: false },
      { name: '👑 Принял', value: `**Ник:** ${moderatorUser.username}\n**ID:** \`${moderatorUser.id}\``, inline: false },
      { name: '📋 Детали', value: `**Причина:** ${reason}\n**Ранг:** ${rankName}`, inline: false }
    )
    .setThumbnail(member.user.displayAvatarURL())
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function registerCommands(guild) {
  const commands = [
    new SlashCommandBuilder().setName('family').setDescription('Открыть меню семьи'),
    new SlashCommandBuilder().setName('apply').setDescription('Подать заявку в семью'),
    new SlashCommandBuilder().setName('applypanel').setDescription('Отправить панель заявок'),
    new SlashCommandBuilder().setName('applications').setDescription('Показать последние заявки'),
    new SlashCommandBuilder().setName('testaccept').setDescription('Тест красивого лога приёма')
  ].map(c => c.toJSON());

  await guild.commands.set(commands);
}

client.on('clientReady', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);

  const guild = await client.guilds.fetch(GUILD_ID);
  await guild.roles.fetch();
  await guild.members.fetch();
  await registerCommands(guild);
  await doPanelUpdate(true);

  setInterval(() => {
    doPanelUpdate(false);
  }, UPDATE_INTERVAL_MS);
});

client.on('messageCreate', message => {
  if (!message.guild || message.author.bot || !message.member) return;
  if (!hasFamilyRole(message.member)) return;

  const data = ensureMember(message.member.id);
  data.messageCount += 1;
  data.lastSeenAt = Date.now();
  saveStore();
});

client.on('presenceUpdate', (_, presence) => {
  const member = presence?.member;
  if (!member || !hasFamilyRole(member)) return;

  const data = ensureMember(member.id);
  data.lastSeenAt = Date.now();
  saveStore();
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const before = hasFamilyRole(oldMember);
  const after = hasFamilyRole(newMember);

  if (before !== after) {
    setTimeout(() => doPanelUpdate(false), 2000);
  }
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'family') {
        const embed = new EmbedBuilder()
          .setTitle('🌆 Панель семьи')
          .setColor(0x8B5CF6)
          .setDescription('Выбери действие ниже.')
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('family_refresh').setLabel('Обновить').setStyle(ButtonStyle.Secondary),
          new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
        );

        return interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
      }

      if (interaction.commandName === 'apply') {
        const last = store.cooldowns[interaction.user.id] || 0;
        if (Date.now() - last < APPLICATION_COOLDOWN_MS) {
          return interaction.reply({ content: `Подожди ${Math.ceil((APPLICATION_COOLDOWN_MS - (Date.now() - last)) / 1000)} сек.`, ephemeral: true });
        }
        return interaction.showModal(buildApplyModal());
      }

      if (interaction.commandName === 'applypanel') {
        const channel = await fetchTextChannel(interaction.guild, APPLICATIONS_CHANNEL_ID);
        if (!channel) return interaction.reply({ content: 'Канал заявок не найден.', ephemeral: true });

        await channel.send({
          embeds: [new EmbedBuilder().setTitle('📨 Заявки в семью').setColor(0x22C55E).setDescription('Нажми кнопку ниже, чтобы подать заявку.').setTimestamp()],
          components: [new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
          )]
        });

        return interaction.reply({ content: 'Панель заявок отправлена.', ephemeral: true });
      }

      if (interaction.commandName === 'applications') {
        const list = store.applications.slice(0, 10).map((a, i) =>
          `${i + 1}. <@${a.discordId}> • ${a.status} • ${String(a.text).slice(0, 50)}`
        ).join('\n') || 'Нет заявок';

        return interaction.reply({
          embeds: [new EmbedBuilder().setTitle('🗂 Последние заявки').setColor(0x22C55E).setDescription(list).setTimestamp()],
          ephemeral: true
        });
      }

      if (interaction.commandName === 'testaccept') {
        await sendAcceptLog(interaction.guild, interaction.member, interaction.user, 'Собеседование', '1 ранг');
        return interaction.reply({ content: 'Тестовый лог отправлен.', ephemeral: true });
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'family_refresh') {
        await interaction.deferReply({ ephemeral: true });
        await doPanelUpdate(true);
        return interaction.editReply({ content: 'Панель обновлена.' });
      }

      if (interaction.customId === 'family_apply') {
        const last = store.cooldowns[interaction.user.id] || 0;
        if (Date.now() - last < APPLICATION_COOLDOWN_MS) {
          return interaction.reply({ content: `Подожди ${Math.ceil((APPLICATION_COOLDOWN_MS - (Date.now() - last)) / 1000)} сек.`, ephemeral: true });
        }
        return interaction.showModal(buildApplyModal());
      }
    }

    if (interaction.isModalSubmit() && interaction.customId === 'family_apply_modal') {
      const nickname = interaction.fields.getTextInputValue('nickname');
      const age = interaction.fields.getTextInputValue('age');
      const text = interaction.fields.getTextInputValue('text');

      store.cooldowns[interaction.user.id] = Date.now();
      store.applications.unshift({
        id: `${Date.now()}_${interaction.user.id}`,
        discordId: interaction.user.id,
        nickname,
        age,
        text,
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      store.applications = store.applications.slice(0, 100);
      saveStore();

      const channel = await fetchTextChannel(interaction.guild, APPLICATIONS_CHANNEL_ID);
      if (channel) {
        await channel.send({
          embeds: [
            new EmbedBuilder()
              .setTitle('📝 Заявка в семью')
              .setColor(0x22C55E)
              .addFields(
                { name: 'Пользователь', value: `<@${interaction.user.id}>`, inline: true },
                { name: 'Ник', value: nickname, inline: true },
                { name: 'Возраст', value: age, inline: true },
                { name: 'Текст', value: text, inline: false }
              )
              .setTimestamp()
          ]
        });
      }

      return interaction.reply({ content: 'Заявка отправлена.', ephemeral: true });
    }
  } catch (e) {
    console.error('Ошибка interactionCreate:', e);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Произошла ошибка.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);

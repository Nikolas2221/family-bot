require('dotenv').config();
const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  SlashCommandBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ChannelType
} = require('discord.js');

const ROLES = require('./roles');

const UPDATE_INTERVAL_MS = Math.max(5000, Number(process.env.UPDATE_INTERVAL_MS || 30000));
const FAMILY_TITLE = process.env.FAMILY_TITLE || '🏠 Состав семьи';
const APPLICATION_DEFAULT_ROLE = process.env.APPLICATION_DEFAULT_ROLE || process.env.ROLE_NEWBIE || '';
const MANAGER_ROLE_IDS = (process.env.MANAGER_ROLE_IDS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const PANEL_BUTTONS = new ActionRowBuilder().addComponents(
  new ButtonBuilder()
    .setCustomId('family_refresh')
    .setLabel('Обновить')
    .setStyle(ButtonStyle.Secondary),
  new ButtonBuilder()
    .setCustomId('family_apply')
    .setLabel('Подать заявку')
    .setStyle(ButtonStyle.Success)
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences
  ]
});

function chunkArray(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function getStatusEmoji(member) {
  const status = member.presence?.status || 'offline';
  if (status === 'online') return '🟢';
  if (status === 'idle') return '🟡';
  if (status === 'dnd') return '⛔';
  return '⚫';
}

function getStatusWeight(member) {
  const status = member.presence?.status || 'offline';
  if (status === 'online') return 0;
  if (status === 'idle') return 1;
  if (status === 'dnd') return 2;
  return 3;
}

function sortMembers(members) {
  return [...members].sort((a, b) => {
    const statusDiff = getStatusWeight(a) - getStatusWeight(b);
    if (statusDiff !== 0) return statusDiff;
    return a.displayName.localeCompare(b.displayName, 'ru');
  });
}

function getFamilyRoleObjects(guild) {
  return ROLES
    .map(item => ({ ...item, role: guild.roles.cache.get(item.id) }))
    .filter(item => item.role)
    .sort((a, b) => b.role.position - a.role.position);
}

function getFamilyRoleIds() {
  return ROLES.map(r => r.id).filter(Boolean);
}

function memberFamilyRoles(member) {
  const familyRoleIds = new Set(getFamilyRoleIds());
  return member.roles.cache.filter(role => familyRoleIds.has(role.id));
}

function hasFamilyRole(member) {
  return memberFamilyRoles(member).size > 0;
}

function isManager(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionFlagsBits.ManageRoles)) return true;
  if (!MANAGER_ROLE_IDS.length) return false;
  return member.roles.cache.some(role => MANAGER_ROLE_IDS.includes(role.id));
}

async function sendLog(guild, embed) {
  try {
    if (!process.env.LOG_CHANNEL_ID) return;
    const channel = await guild.channels.fetch(process.env.LOG_CHANNEL_ID);
    if (!channel || channel.type !== ChannelType.GuildText) return;
    await channel.send({ embeds: [embed] });
  } catch (error) {
    console.error('Ошибка отправки лога:', error);
  }
}

async function generateEmbeds(guild) {
  await guild.members.fetch();
  await guild.roles.fetch();

  const configuredRoles = getFamilyRoleObjects(guild);

  const embeds = [];
  let embed = new EmbedBuilder()
    .setTitle(FAMILY_TITLE)
    .setColor(0x8B5CF6)
    .setDescription('🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн')
    .setTimestamp()
    .setFooter({ text: `Автообновление каждые ${Math.floor(UPDATE_INTERVAL_MS / 1000)} сек.` });

  let fieldsCount = 0;
  let totalMembers = 0;

  for (const item of configuredRoles) {
    const members = sortMembers(item.role.members.map(m => m));
    if (!members.length) continue;

    totalMembers += members.length;

    const lines = members.map(member => `${getStatusEmoji(member)} <@${member.id}>`);
    const chunks = chunkArray(lines, 20);

    for (let i = 0; i < chunks.length; i++) {
      if (fieldsCount >= 25) {
        embeds.push(embed);
        embed = new EmbedBuilder()
          .setColor(0x8B5CF6)
          .setTimestamp()
          .setFooter({ text: `Автообновление каждые ${Math.floor(UPDATE_INTERVAL_MS / 1000)} сек.` });
        fieldsCount = 0;
      }

      embed.addFields({
        name: i === 0 ? `${item.name} (${members.length})` : `${item.name} — продолжение`,
        value: chunks[i].join('\n'),
        inline: false
      });
      fieldsCount++;
    }
  }

  if (fieldsCount === 0) {
    embed
      .setDescription('Нет участников в выбранных ролях.')
      .setFooter({ text: `Проверь ROLE_* переменные. Автообновление каждые ${Math.floor(UPDATE_INTERVAL_MS / 1000)} сек.` });
  }

  embed.setAuthor({ name: `Всего участников в списке: ${totalMembers}` });
  embeds.push(embed);

  return embeds;
}

async function updateFamilyPanel() {
  try {
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(process.env.CHANNEL_ID);
    const embeds = await generateEmbeds(guild);

    if (process.env.MESSAGE_ID) {
      try {
        const message = await channel.messages.fetch(process.env.MESSAGE_ID);
        await message.edit({ content: '', embeds, components: [PANEL_BUTTONS] });
      } catch {
        const message = await channel.send({ content: '', embeds, components: [PANEL_BUTTONS] });
        console.log('Скопируй MESSAGE_ID:', message.id);
      }
    } else {
      const message = await channel.send({ content: '', embeds, components: [PANEL_BUTTONS] });
      console.log('Скопируй MESSAGE_ID:', message.id);
    }
  } catch (error) {
    console.error('Ошибка обновления панели:', error);
  }
}

function buildApplicationEmbed({ user, nickname, age, text, source, inviter, requestedRoleId }) {
  const embed = new EmbedBuilder()
    .setTitle(source === 'invite' ? '📨 Инвайт в семью' : '📝 Заявка в семью')
    .setColor(source === 'invite' ? 0x3B82F6 : 0x22C55E)
    .addFields(
      { name: 'Пользователь', value: `<@${user.id}>`, inline: true },
      { name: 'Ник', value: nickname || 'Не указан', inline: true },
      { name: 'Возраст', value: age || 'Не указан', inline: true },
      { name: 'Текст', value: text || 'Нет текста', inline: false },
      { name: 'Роль при одобрении', value: requestedRoleId ? `<@&${requestedRoleId}>` : 'Не указана', inline: true }
    )
    .setTimestamp();

  if (inviter) embed.addFields({ name: 'Кто инвайтит', value: `<@${inviter.id}>`, inline: true });

  return embed;
}

function buildApplicationButtons(userId, roleId, source) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_approve:${source}:${userId}:${roleId || 'none'}`)
      .setLabel('Одобрить')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`app_reject:${source}:${userId}:${roleId || 'none'}`)
      .setLabel('Отклонить')
      .setStyle(ButtonStyle.Danger)
  );
}

async function postApplication({ guild, user, nickname, age, text, source, inviter, requestedRoleId }) {
  const channelId = process.env.APPLICATIONS_CHANNEL_ID || process.env.CHANNEL_ID;
  const channel = await guild.channels.fetch(channelId);
  const embed = buildApplicationEmbed({ user, nickname, age, text, source, inviter, requestedRoleId });
  const buttons = buildApplicationButtons(user.id, requestedRoleId || APPLICATION_DEFAULT_ROLE || 'none', source);
  await channel.send({ embeds: [embed], components: [buttons] });
}

async function registerCommands(guild) {
  const commands = [
    new SlashCommandBuilder()
      .setName('familypanel')
      .setDescription('Отправить или обновить панель семьи')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
      .setName('applypanel')
      .setDescription('Отправить панель заявки в канал')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
      .setName('invite')
      .setDescription('Создать инвайт-запрос в семью')
      .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(option =>
        option.setName('пользователь').setDescription('Кого инвайтить').setRequired(true)
      )
      .addRoleOption(option =>
        option.setName('роль').setDescription('Роль при одобрении').setRequired(false)
      )
      .addStringOption(option =>
        option.setName('причина').setDescription('Причина / комментарий').setRequired(false)
      ),

    new SlashCommandBuilder()
      .setName('apply')
      .setDescription('Подать заявку в семью')
  ].map(command => command.toJSON());

  await guild.commands.set(commands);
}

client.on('clientReady', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);

  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await registerCommands(guild);
  await updateFamilyPanel();

  setInterval(async () => {
    await updateFamilyPanel();
  }, UPDATE_INTERVAL_MS);
});

client.on('guildMemberAdd', async member => {
  if (!hasFamilyRole(member)) return;
  const embed = new EmbedBuilder()
    .setTitle('➕ Кто зашёл в семью')
    .setColor(0x22C55E)
    .setDescription(`<@${member.id}> зашёл на сервер и уже состоит в семье.`)
    .setTimestamp();
  await sendLog(member.guild, embed);
});

client.on('guildMemberRemove', async member => {
  if (!hasFamilyRole(member)) return;
  const embed = new EmbedBuilder()
    .setTitle('➖ Кто вышел из семьи / сервера')
    .setColor(0xEF4444)
    .setDescription(`<@${member.id}> вышел с сервера.`)
    .setTimestamp();
  await sendLog(member.guild, embed);
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const oldFamily = memberFamilyRoles(oldMember);
  const newFamily = memberFamilyRoles(newMember);

  const oldIds = new Set(oldFamily.map(r => r.id));
  const newIds = new Set(newFamily.map(r => r.id));

  const added = [...newIds].filter(id => !oldIds.has(id)).map(id => newMember.guild.roles.cache.get(id)).filter(Boolean);
  const removed = [...oldIds].filter(id => !newIds.has(id)).map(id => newMember.guild.roles.cache.get(id)).filter(Boolean);

  if (!added.length && !removed.length) return;

  if (!oldFamily.size && newFamily.size) {
    await sendLog(newMember.guild, new EmbedBuilder()
      .setTitle('✅ Кто зашёл в семью')
      .setColor(0x22C55E)
      .setDescription(`<@${newMember.id}> вступил в семью.`)
      .addFields({ name: 'Текущие роли семьи', value: newFamily.map(r => `<@&${r.id}>`).join(', '), inline: false })
      .setTimestamp()
    );
  }

  if (oldFamily.size && !newFamily.size) {
    await sendLog(newMember.guild, new EmbedBuilder()
      .setTitle('❌ Кто вышел из семьи')
      .setColor(0xEF4444)
      .setDescription(`<@${newMember.id}> больше не состоит в семье.`)
      .setTimestamp()
    );
  }

  if (added.length) {
    await sendLog(newMember.guild, new EmbedBuilder()
      .setTitle('🎖 Кто получил роль')
      .setColor(0x3B82F6)
      .setDescription(`<@${newMember.id}> получил роль(и): ${added.map(r => `<@&${r.id}>`).join(', ')}`)
      .setTimestamp()
    );
  }

  if (removed.length) {
    await sendLog(newMember.guild, new EmbedBuilder()
      .setTitle('🗑 Кто потерял роль')
      .setColor(0xF59E0B)
      .setDescription(`<@${newMember.id}> потерял роль(и): ${removed.map(r => `<@&${r.id}>`).join(', ')}`)
      .setTimestamp()
    );
  }

  await updateFamilyPanel();
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === 'familypanel') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        }
        await updateFamilyPanel();
        return interaction.reply({ content: 'Панель семьи обновлена.', ephemeral: true });
      }

      if (interaction.commandName === 'applypanel') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
          return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        }

        const channelId = process.env.APPLICATIONS_CHANNEL_ID || process.env.CHANNEL_ID;
        const channel = await interaction.guild.channels.fetch(channelId);

        const embed = new EmbedBuilder()
          .setTitle('📨 Заявки в семью')
          .setColor(0x22C55E)
          .setDescription('Нажми кнопку ниже, чтобы подать заявку.')
          .setTimestamp();

        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('family_apply')
            .setLabel('Подать заявку')
            .setStyle(ButtonStyle.Success)
        );

        await channel.send({ embeds: [embed], components: [row] });
        return interaction.reply({ content: 'Панель заявки отправлена.', ephemeral: true });
      }

      if (interaction.commandName === 'invite') {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) && !isManager(interaction.member)) {
          return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        }

        const user = interaction.options.getUser('пользователь', true);
        const role = interaction.options.getRole('роль', false);
        const reason = interaction.options.getString('причина', false) || 'Инвайт от руководства';

        await postApplication({
          guild: interaction.guild,
          user,
          nickname: user.username,
          age: '-',
          text: reason,
          source: 'invite',
          inviter: interaction.user,
          requestedRoleId: role?.id || APPLICATION_DEFAULT_ROLE || ''
        });

        return interaction.reply({ content: 'Инвайт-запрос отправлен в канал заявок.', ephemeral: true });
      }

      if (interaction.commandName === 'apply') {
        const modal = new ModalBuilder()
          .setCustomId('family_apply_modal')
          .setTitle('Заявка в семью');

        const nicknameInput = new TextInputBuilder()
          .setCustomId('nickname')
          .setLabel('Ваш ник')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const ageInput = new TextInputBuilder()
          .setCustomId('age')
          .setLabel('Ваш возраст')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const textInput = new TextInputBuilder()
          .setCustomId('text')
          .setLabel('Почему хотите в семью')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nicknameInput),
          new ActionRowBuilder().addComponents(ageInput),
          new ActionRowBuilder().addComponents(textInput)
        );

        return interaction.showModal(modal);
      }
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'family_refresh') {
        await interaction.deferReply({ ephemeral: true });
        await updateFamilyPanel();
        return interaction.editReply({ content: 'Панель обновлена.' });
      }

      if (interaction.customId === 'family_apply') {
        const modal = new ModalBuilder()
          .setCustomId('family_apply_modal')
          .setTitle('Заявка в семью');

        const nicknameInput = new TextInputBuilder()
          .setCustomId('nickname')
          .setLabel('Ваш ник')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const ageInput = new TextInputBuilder()
          .setCustomId('age')
          .setLabel('Ваш возраст')
          .setStyle(TextInputStyle.Short)
          .setRequired(true);

        const textInput = new TextInputBuilder()
          .setCustomId('text')
          .setLabel('Почему хотите в семью')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true);

        modal.addComponents(
          new ActionRowBuilder().addComponents(nicknameInput),
          new ActionRowBuilder().addComponents(ageInput),
          new ActionRowBuilder().addComponents(textInput)
        );

        return interaction.showModal(modal);
      }

      if (interaction.customId.startsWith('app_approve:') || interaction.customId.startsWith('app_reject:')) {
        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageRoles) && !isManager(interaction.member)) {
          return interaction.reply({ content: 'Нет доступа.', ephemeral: true });
        }

        const [, source, userId, roleIdRaw] = interaction.customId.split(':');
        const roleId = roleIdRaw === 'none' ? '' : roleIdRaw;
        const member = await interaction.guild.members.fetch(userId).catch(() => null);

        if (interaction.customId.startsWith('app_reject:')) {
          const rejected = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor(0xEF4444)
            .setFooter({ text: `Отклонено: ${interaction.user.tag}` });

          await interaction.message.edit({ embeds: [rejected], components: [] });
          return interaction.reply({ content: 'Заявка отклонена.', ephemeral: true });
        }

        if (!member) {
          return interaction.reply({ content: 'Пользователь не найден на сервере.', ephemeral: true });
        }

        if (roleId) {
          const role = interaction.guild.roles.cache.get(roleId);
          if (role) await member.roles.add(role).catch(console.error);
        }

        const approved = EmbedBuilder.from(interaction.message.embeds[0])
          .setColor(0x22C55E)
          .setFooter({ text: `Одобрено: ${interaction.user.tag}` });

        await interaction.message.edit({ embeds: [approved], components: [] });
        await interaction.reply({ content: 'Заявка одобрена, роль выдана.', ephemeral: true });
        await updateFamilyPanel();
      }
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'family_apply_modal') {
        const nickname = interaction.fields.getTextInputValue('nickname');
        const age = interaction.fields.getTextInputValue('age');
        const text = interaction.fields.getTextInputValue('text');

        await postApplication({
          guild: interaction.guild,
          user: interaction.user,
          nickname,
          age,
          text,
          source: 'apply',
          requestedRoleId: APPLICATION_DEFAULT_ROLE || ''
        });

        return interaction.reply({ content: 'Заявка отправлена.', ephemeral: true });
      }
    }
  } catch (error) {
    console.error('Ошибка interactionCreate:', error);
    if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'Произошла ошибка.', ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.TOKEN);

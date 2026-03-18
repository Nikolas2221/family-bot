require('dotenv').config();
const fs = require('fs');
const path = require('path');
const {
  Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  PermissionFlagsBits, SlashCommandBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType
} = require('discord.js');
const ROLES = require('./roles');

const DATA_FILE = path.join(__dirname, 'storage.json');
const UPDATE_INTERVAL_MS = Math.max(5000, Number(process.env.UPDATE_INTERVAL_MS || 30000));
const APPLICATION_COOLDOWN_MS = Math.max(10000, Number(process.env.APPLICATION_COOLDOWN_MS || 300000));
const REPORT_INTERVAL_MS = Math.max(3600000, Number(process.env.REPORT_INTERVAL_MS || 86400000));
const INACTIVE_DAYS = Math.max(1, Number(process.env.INACTIVE_DAYS || 7));
const FAMILY_TITLE = process.env.FAMILY_TITLE || '🏠 Состав семьи';
const APPLICATION_DEFAULT_ROLE = process.env.APPLICATION_DEFAULT_ROLE || process.env.ROLE_NEWBIE || '';
const MANAGER_ROLE_IDS = (process.env.MANAGER_ROLE_IDS || '').split(',').map(x => x.trim()).filter(Boolean);

const PANEL_BUTTONS = new ActionRowBuilder().addComponents(
  new ButtonBuilder().setCustomId('family_refresh').setLabel('Обновить').setStyle(ButtonStyle.Secondary),
  new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates
  ]
});

function now() { return Date.now(); }
function loadStore() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { members:{}, applications:[], warns:[], commends:[], contracts:[], logs:[], cooldowns:{}, sessions:{} };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return { members:{}, applications:[], warns:[], commends:[], contracts:[], logs:[], cooldowns:{}, sessions:{} };
  }
}
let store = loadStore();
function saveStore() { fs.writeFileSync(DATA_FILE, JSON.stringify(store, null, 2), 'utf8'); }
function ensureMember(id) {
  if (!store.members[id]) {
    store.members[id] = { discordId:id, joinedFamilyAt:null, lastSeenAt:now(), messageCount:0, voiceSeconds:0, warns:0, commends:0, nickname:'' };
  }
  return store.members[id];
}
function addLog(type, discordId, moderatorId, details) {
  store.logs.unshift({ id:`${Date.now()}_${Math.random().toString(36).slice(2,8)}`, type, discordId, moderatorId:moderatorId||null, details:details||'', createdAt:new Date().toISOString() });
  store.logs = store.logs.slice(0,500);
  saveStore();
}
function chunkArray(arr, size){ const out=[]; for(let i=0;i<arr.length;i+=size) out.push(arr.slice(i,i+size)); return out; }
function getStatusEmoji(member){ const s = member.presence?.status || 'offline'; if(s==='online') return '🟢'; if(s==='idle') return '🟡'; if(s==='dnd') return '⛔'; return '⚫'; }
function getStatusWeight(member){ const s = member.presence?.status || 'offline'; if(s==='online') return 0; if(s==='idle') return 1; if(s==='dnd') return 2; return 3; }
function getFamilyRoleIds(){ return ROLES.map(r=>r.id).filter(Boolean); }
function memberFamilyRoles(member){ const ids=new Set(getFamilyRoleIds()); return member.roles.cache.filter(r=>ids.has(r.id)); }
function hasFamilyRole(member){ return memberFamilyRoles(member).size > 0; }
function isManager(member){ if(!member) return false; if(member.permissions.has(PermissionFlagsBits.ManageRoles)) return true; return member.roles.cache.some(r=>MANAGER_ROLE_IDS.includes(r.id)); }
function sortMembers(members){
  return [...members].sort((a,b)=>{
    const byStatus = getStatusWeight(a)-getStatusWeight(b);
    if(byStatus!==0) return byStatus;
    const ad=ensureMember(a.id), bd=ensureMember(b.id);
    const byActivity = ((bd.messageCount||0)+Math.floor((bd.voiceSeconds||0)/60)) - ((ad.messageCount||0)+Math.floor((ad.voiceSeconds||0)/60));
    if(byActivity!==0) return byActivity;
    return a.displayName.localeCompare(b.displayName,'ru');
  });
}
function activityScore(id){ const m=ensureMember(id); return (m.messageCount||0)+Math.floor((m.voiceSeconds||0)/60)+((m.commends||0)*10)-((m.warns||0)*5); }
function getFamilyRoleObjects(guild){
  return ROLES.map(item=>({...item, role:guild.roles.cache.get(item.id)})).filter(x=>x.role).sort((a,b)=>b.role.position-a.role.position);
}
async function sendLogEmbed(guild, embed){
  try{
    if(!process.env.LOG_CHANNEL_ID) return;
    const channel = await guild.channels.fetch(process.env.LOG_CHANNEL_ID);
    if(!channel || channel.type !== ChannelType.GuildText) return;
    await channel.send({ embeds:[embed] });
  }catch(e){ console.error('Ошибка лог-канала:', e); }
}
async function trySendDM(user, text){ try{ await user.send(text); }catch{} }
function canManage(actorMember, targetMember, targetRole){
  if(actorMember.id === targetMember.id) return { ok:false, reason:'Нельзя управлять собой.' };
  if(targetRole && actorMember.roles.highest.position <= targetRole.position) return { ok:false, reason:'Роль выше или равна твоей.' };
  if(actorMember.roles.highest.position <= targetMember.roles.highest.position) return { ok:false, reason:'Цель выше или равна тебе.' };
  return { ok:true };
}
function buildProfileEmbed(member){
  const data = ensureMember(member.id);
  const familyRoles = memberFamilyRoles(member).map(r=>`<@&${r.id}>`).join(', ') || 'Нет';
  const joined = data.joinedFamilyAt ? `<t:${Math.floor(new Date(data.joinedFamilyAt).getTime()/1000)}:R>` : 'Неизвестно';
  const lastSeen = data.lastSeenAt ? `<t:${Math.floor(Number(data.lastSeenAt)/1000)}:R>` : 'Неизвестно';
  return new EmbedBuilder().setTitle(`👤 Профиль — ${member.displayName}`).setColor(0x3B82F6).setThumbnail(member.user.displayAvatarURL())
    .addFields(
      { name:'Статус', value:`${getStatusEmoji(member)} ${member.presence?.status || 'offline'}`, inline:true },
      { name:'Роли семьи', value:familyRoles, inline:false },
      { name:'Вступил', value:joined, inline:true },
      { name:'Последняя активность', value:lastSeen, inline:true },
      { name:'Сообщения', value:String(data.messageCount||0), inline:true },
      { name:'Голос', value:`${Math.floor((data.voiceSeconds||0)/60)} мин`, inline:true },
      { name:'Преды', value:String(data.warns||0), inline:true },
      { name:'Похвалы', value:String(data.commends||0), inline:true },
      { name:'Активность', value:String(activityScore(member.id)), inline:true }
    ).setTimestamp();
}
async function generateFamilyEmbeds(guild){
  await guild.members.fetch();
  await guild.roles.fetch();
  const configured = getFamilyRoleObjects(guild);
  const embeds = [];
  let embed = new EmbedBuilder().setTitle(FAMILY_TITLE).setColor(0x8B5CF6).setDescription('🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн').setTimestamp().setFooter({ text:`Автообновление каждые ${Math.floor(UPDATE_INTERVAL_MS/1000)} сек.` });
  let totalMembers=0, fieldsCount=0;
  for(const item of configured){
    const members = sortMembers(item.role.members.map(m=>m));
    if(!members.length) continue;
    totalMembers += members.length;
    const lines = members.map(m=>`${getStatusEmoji(m)} <@${m.id}> • ${activityScore(m.id)} очк.`);
    const chunks = chunkArray(lines, 15);
    for(let i=0;i<chunks.length;i++){
      if(fieldsCount >= 25){ embeds.push(embed); embed = new EmbedBuilder().setColor(0x8B5CF6).setTimestamp(); fieldsCount=0; }
      embed.addFields({ name: i===0 ? `${item.name} (${members.length})` : `${item.name} — продолжение`, value: chunks[i].join('\n'), inline:false });
      fieldsCount++;
    }
  }
  if(fieldsCount===0) embed.setDescription('Нет участников в выбранных ролях.');
  embed.setAuthor({ name:`Всего участников: ${totalMembers}` });
  embeds.push(embed);
  return embeds;
}
async function updateFamilyPanel(){
  try{
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    const channel = await guild.channels.fetch(process.env.CHANNEL_ID);
    const embeds = await generateFamilyEmbeds(guild);
    if(process.env.MESSAGE_ID){
      try{
        const message = await channel.messages.fetch(process.env.MESSAGE_ID);
        await message.edit({ embeds, components:[PANEL_BUTTONS], content:'' });
      }catch{
        const message = await channel.send({ embeds, components:[PANEL_BUTTONS], content:'' });
        console.log('Скопируй MESSAGE_ID:', message.id);
      }
    }else{
      const message = await channel.send({ embeds, components:[PANEL_BUTTONS], content:'' });
      console.log('Скопируй MESSAGE_ID:', message.id);
    }
  }catch(e){ console.error('Ошибка обновления панели:', e); }
}
async function updateStatsPanel(guildInput){
  try{
    const guild = guildInput || await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();
    const familyMembers = guild.members.cache.filter(m=>hasFamilyRole(m));
    const onlineCount = familyMembers.filter(m=>(m.presence?.status || 'offline') !== 'offline').size;
    const offlineCount = familyMembers.size - onlineCount;
    const top = [...familyMembers.values()].sort((a,b)=>activityScore(b.id)-activityScore(a.id)).slice(0,5).map((m,i)=>`${i+1}. <@${m.id}> — ${activityScore(m.id)} очк.`).join('\n') || 'Нет данных';
    const embed = new EmbedBuilder().setTitle('📊 Статистика семьи').setColor(0xF59E0B).addFields(
      { name:'Всего участников', value:String(familyMembers.size), inline:true },
      { name:'Онлайн', value:String(onlineCount), inline:true },
      { name:'Оффлайн', value:String(offlineCount), inline:true },
      { name:'Топ активности', value:top, inline:false }
    ).setTimestamp();
    const channelId = process.env.STATS_CHANNEL_ID || process.env.CHANNEL_ID;
    const channel = await guild.channels.fetch(channelId);
    if(process.env.STATS_MESSAGE_ID){
      try{
        const message = await channel.messages.fetch(process.env.STATS_MESSAGE_ID);
        await message.edit({ embeds:[embed], content:'' });
        return;
      }catch{}
    }
    const message = await channel.send({ embeds:[embed], content:'' });
    console.log('Скопируй STATS_MESSAGE_ID:', message.id);
  }catch(e){ console.error('Ошибка статистики:', e); }
}
function buildApplicationEmbed({ user, nickname, age, text, source, inviter, requestedRoleId }){
  const embed = new EmbedBuilder().setTitle(source==='invite' ? '📨 Инвайт в семью' : '📝 Заявка в семью').setColor(source==='invite' ? 0x3B82F6 : 0x22C55E)
    .addFields(
      { name:'Пользователь', value:`<@${user.id}>`, inline:true },
      { name:'Ник', value:nickname || 'Не указан', inline:true },
      { name:'Возраст', value:age || '-', inline:true },
      { name:'Текст', value:text || 'Нет текста', inline:false },
      { name:'Роль при одобрении', value:requestedRoleId ? `<@&${requestedRoleId}>` : 'Не указана', inline:true }
    ).setTimestamp();
  if(inviter) embed.addFields({ name:'Кто инвайтит', value:`<@${inviter.id}>`, inline:true });
  return embed;
}
function buildApplicationButtons(userId, roleId, source){
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`app:approve:${source}:${userId}:${roleId || 'none'}`).setLabel('Одобрить').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`app:reject:${source}:${userId}:${roleId || 'none'}`).setLabel('Отклонить').setStyle(ButtonStyle.Danger)
  );
}
async function postApplication({ guild, user, nickname, age, text, source, inviter, requestedRoleId }){
  const channelId = process.env.APPLICATIONS_CHANNEL_ID || process.env.CHANNEL_ID;
  const channel = await guild.channels.fetch(channelId);
  store.applications.unshift({
    id:`${Date.now()}_${user.id}`, discordId:user.id, nickname, age, text, source, inviterId:inviter?.id || null,
    requestedRoleId:requestedRoleId || APPLICATION_DEFAULT_ROLE || null, status:'pending', createdAt:new Date().toISOString()
  });
  store.applications = store.applications.slice(0,200);
  saveStore();
  const embed = buildApplicationEmbed({ user, nickname, age, text, source, inviter, requestedRoleId });
  const buttons = buildApplicationButtons(user.id, requestedRoleId || APPLICATION_DEFAULT_ROLE || 'none', source);
  await channel.send({ embeds:[embed], components:[buttons] });
}
async function createReport(){
  try{
    const guild = await client.guilds.fetch(process.env.GUILD_ID);
    await guild.members.fetch();
    const familyMembers = guild.members.cache.filter(m=>hasFamilyRole(m));
    const online = familyMembers.filter(m=>(m.presence?.status || 'offline') !== 'offline').size;
    const percent = familyMembers.size ? Math.round((online / familyMembers.size) * 100) : 0;
    const threshold = now() - INACTIVE_DAYS*24*60*60*1000;
    const inactive = [...familyMembers.values()].filter(m=>(ensureMember(m.id).lastSeenAt || 0) < threshold).slice(0,10).map(m=>`<@${m.id}>`).join('\n') || 'Нет';
    const top = [...familyMembers.values()].sort((a,b)=>activityScore(b.id)-activityScore(a.id)).slice(0,5).map((m,i)=>`${i+1}. <@${m.id}> — ${activityScore(m.id)} очк.`).join('\n') || 'Нет';
    const embed = new EmbedBuilder().setTitle('📋 Отчёт семьи').setColor(percent >= 80 ? 0x22C55E : 0x3B82F6).addFields(
      { name:'Онлайн сейчас', value:`${online}/${familyMembers.size} (${percent}%)`, inline:true },
      { name:'Топ активности', value:top, inline:false },
      { name:`Неактивны ${INACTIVE_DAYS}+ дн.`, value:inactive, inline:false }
    ).setTimestamp();
    const channelId = process.env.REPORT_CHANNEL_ID || process.env.LOG_CHANNEL_ID || process.env.CHANNEL_ID;
    const channel = await guild.channels.fetch(channelId);
    await channel.send({ embeds:[embed] });
    if(percent >= 80) await channel.send('🔥 Сегодня онлайн 80%+ семьи. Отличный актив!');
  }catch(e){ console.error('Ошибка отчёта:', e); }
}
async function registerCommands(guild){
  const commands = [
    new SlashCommandBuilder().setName('familypanel').setDescription('Обновить панель семьи').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    new SlashCommandBuilder().setName('familystats').setDescription('Обновить статистику семьи').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    new SlashCommandBuilder().setName('apply').setDescription('Подать заявку в семью'),
    new SlashCommandBuilder().setName('applypanel').setDescription('Отправить панель заявок').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),
    new SlashCommandBuilder().setName('invite').setDescription('Создать инвайт-запрос').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o=>o.setName('пользователь').setDescription('Кого пригласить').setRequired(true))
      .addRoleOption(o=>o.setName('роль').setDescription('Роль при одобрении').setRequired(false))
      .addStringOption(o=>o.setName('причина').setDescription('Комментарий').setRequired(false)),
    new SlashCommandBuilder().setName('profile').setDescription('Показать профиль').addUserOption(o=>o.setName('пользователь').setDescription('Участник').setRequired(true)),
    new SlashCommandBuilder().setName('promote').setDescription('Повысить участника').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o=>o.setName('пользователь').setDescription('Кого повысить').setRequired(true))
      .addRoleOption(o=>o.setName('роль').setDescription('Новая роль').setRequired(true)),
    new SlashCommandBuilder().setName('demote').setDescription('Понизить участника').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o=>o.setName('пользователь').setDescription('Кого понизить').setRequired(true))
      .addRoleOption(o=>o.setName('роль').setDescription('Роль для снятия').setRequired(true)),
    new SlashCommandBuilder().setName('warn').setDescription('Выдать предупреждение').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o=>o.setName('пользователь').setDescription('Кому').setRequired(true))
      .addStringOption(o=>o.setName('причина').setDescription('Причина').setRequired(true)),
    new SlashCommandBuilder().setName('commend').setDescription('Похвалить участника').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
      .addUserOption(o=>o.setName('пользователь').setDescription('Кого').setRequired(true))
      .addStringOption(o=>o.setName('причина').setDescription('Причина').setRequired(true)),
    new SlashCommandBuilder().setName('contract').setDescription('Управление контрактами')
      .addSubcommand(s=>s.setName('create').setDescription('Создать контракт')
        .addUserOption(o=>o.setName('пользователь').setDescription('Кому').setRequired(true))
        .addStringOption(o=>o.setName('текст').setDescription('Описание').setRequired(true)))
      .addSubcommand(s=>s.setName('list').setDescription('Список контрактов')),
    new SlashCommandBuilder().setName('applications').setDescription('Последние заявки').setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles)
  ].map(x=>x.toJSON());
  await guild.commands.set(commands);
}

client.on('clientReady', async () => {
  console.log(`Бот запущен как ${client.user.tag}`);
  const guild = await client.guilds.fetch(process.env.GUILD_ID);
  await registerCommands(guild);
  await updateFamilyPanel();
  await updateStatsPanel(guild);
  setInterval(async ()=>{ await updateFamilyPanel(); await updateStatsPanel(guild); }, UPDATE_INTERVAL_MS);
  setInterval(async ()=>{ await createReport(); }, REPORT_INTERVAL_MS);
});

client.on('messageCreate', message => {
  if(!message.guild || message.author.bot || !message.member || !hasFamilyRole(message.member)) return;
  const data = ensureMember(message.member.id);
  data.messageCount += 1;
  data.lastSeenAt = now();
  data.nickname = message.member.displayName;
  saveStore();
});
client.on('presenceUpdate', (_, p) => {
  const member = p?.member;
  if(!member || !hasFamilyRole(member)) return;
  const data = ensureMember(member.id);
  data.lastSeenAt = now();
  data.nickname = member.displayName;
  saveStore();
});
client.on('voiceStateUpdate', (oldState, newState) => {
  const member = newState.member || oldState.member;
  if(!member || !hasFamilyRole(member)) return;
  const data = ensureMember(member.id);
  if(!oldState.channelId && newState.channelId){ store.sessions[member.id] = now(); saveStore(); }
  if(oldState.channelId && !newState.channelId){
    const started = store.sessions[member.id];
    if(started){
      data.voiceSeconds += Math.floor((now() - started)/1000);
      data.lastSeenAt = now();
      delete store.sessions[member.id];
      saveStore();
    }
  }
});
client.on('guildMemberAdd', async member => {
  const data = ensureMember(member.id);
  data.lastSeenAt = now();
  data.nickname = member.displayName;
  saveStore();
  if(!hasFamilyRole(member)) return;
  await sendLogEmbed(member.guild, new EmbedBuilder().setTitle('➕ Кто зашёл в семью').setColor(0x22C55E).setDescription(`<@${member.id}> зашёл на сервер и уже состоит в семье.`).setTimestamp());
});
client.on('guildMemberRemove', async member => {
  if(!hasFamilyRole(member)) return;
  await sendLogEmbed(member.guild, new EmbedBuilder().setTitle('➖ Кто вышел из семьи / сервера').setColor(0xEF4444).setDescription(`<@${member.id}> вышел с сервера.`).setTimestamp());
});
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const oldFamily = memberFamilyRoles(oldMember);
  const newFamily = memberFamilyRoles(newMember);
  const oldIds = new Set(oldFamily.map(r=>r.id));
  const newIds = new Set(newFamily.map(r=>r.id));
  const added = [...newIds].filter(id=>!oldIds.has(id)).map(id=>newMember.guild.roles.cache.get(id)).filter(Boolean);
  const removed = [...oldIds].filter(id=>!newIds.has(id)).map(id=>newMember.guild.roles.cache.get(id)).filter(Boolean);
  const data = ensureMember(newMember.id);
  data.lastSeenAt = now();
  data.nickname = newMember.displayName;
  if(!oldFamily.size && newFamily.size && !data.joinedFamilyAt) data.joinedFamilyAt = new Date().toISOString();
  saveStore();
  if(!added.length && !removed.length) return;
  if(!oldFamily.size && newFamily.size){
    await sendLogEmbed(newMember.guild, new EmbedBuilder().setTitle('✅ Кто зашёл в семью').setColor(0x22C55E).setDescription(`<@${newMember.id}> вступил в семью.`).addFields({ name:'Роли', value:newFamily.map(r=>`<@&${r.id}>`).join(', '), inline:false }).setTimestamp());
    addLog('join_family', newMember.id, null, newFamily.map(r=>r.name).join(', '));
  }
  if(oldFamily.size && !newFamily.size){
    await sendLogEmbed(newMember.guild, new EmbedBuilder().setTitle('❌ Кто вышел из семьи').setColor(0xEF4444).setDescription(`<@${newMember.id}> больше не состоит в семье.`).setTimestamp());
    addLog('leave_family', newMember.id, null, '');
  }
  if(added.length){
    await sendLogEmbed(newMember.guild, new EmbedBuilder().setTitle('🎖 Кто получил роль').setColor(0x3B82F6).setDescription(`<@${newMember.id}> получил: ${added.map(r=>`<@&${r.id}>`).join(', ')}`).setTimestamp());
    addLog('role_add', newMember.id, null, added.map(r=>r.name).join(', '));
  }
  if(removed.length){
    await sendLogEmbed(newMember.guild, new EmbedBuilder().setTitle('🗑 Кто потерял роль').setColor(0xF59E0B).setDescription(`<@${newMember.id}> потерял: ${removed.map(r=>`<@&${r.id}>`).join(', ')}`).setTimestamp());
    addLog('role_remove', newMember.id, null, removed.map(r=>r.name).join(', '));
  }
  await updateFamilyPanel();
  await updateStatsPanel(newMember.guild);
});

client.on('interactionCreate', async interaction => {
  try{
    if(interaction.isChatInputCommand()){
      if(interaction.commandName === 'familypanel'){
        if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
        await updateFamilyPanel();
        return interaction.reply({ content:'Панель семьи обновлена.', ephemeral:true });
      }
      if(interaction.commandName === 'familystats'){
        if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
        await updateStatsPanel(interaction.guild);
        return interaction.reply({ content:'Статистика обновлена.', ephemeral:true });
      }
      if(interaction.commandName === 'applypanel'){
        if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
        const channelId = process.env.APPLICATIONS_CHANNEL_ID || process.env.CHANNEL_ID;
        const channel = await interaction.guild.channels.fetch(channelId);
        const embed = new EmbedBuilder().setTitle('📨 Заявки в семью').setColor(0x22C55E).setDescription('Нажми кнопку ниже, чтобы подать заявку.').setTimestamp();
        const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success));
        await channel.send({ embeds:[embed], components:[row] });
        return interaction.reply({ content:'Панель заявок отправлена.', ephemeral:true });
      }
      if(interaction.commandName === 'apply'){
        const last = store.cooldowns[interaction.user.id] || 0;
        if(now()-last < APPLICATION_COOLDOWN_MS) return interaction.reply({ content:`Подожди ${Math.ceil((APPLICATION_COOLDOWN_MS - (now()-last))/1000)} сек.`, ephemeral:true });
        if(store.applications.find(x=>x.discordId===interaction.user.id && x.status==='pending')) return interaction.reply({ content:'У тебя уже есть активная заявка.', ephemeral:true });
        const modal = new ModalBuilder().setCustomId('family_apply_modal').setTitle('Заявка в семью');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nickname').setLabel('Ваш ник').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age').setLabel('Ваш возраст').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Почему хотите в семью').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        return interaction.showModal(modal);
      }
      if(interaction.commandName === 'invite'){
        if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
        const user = interaction.options.getUser('пользователь', true);
        const role = interaction.options.getRole('роль', false);
        const reason = interaction.options.getString('причина', false) || 'Инвайт от руководства';
        if(user.id === interaction.user.id) return interaction.reply({ content:'Нельзя инвайтить себя.', ephemeral:true });
        await postApplication({ guild:interaction.guild, user, nickname:user.username, age:'-', text:reason, source:'invite', inviter:interaction.user, requestedRoleId:role?.id || APPLICATION_DEFAULT_ROLE || '' });
        return interaction.reply({ content:'Инвайт-запрос отправлен.', ephemeral:true });
      }
      if(interaction.commandName === 'profile'){
        const user = interaction.options.getUser('пользователь', true);
        const member = await interaction.guild.members.fetch(user.id).catch(()=>null);
        if(!member) return interaction.reply({ content:'Участник не найден.', ephemeral:true });
        return interaction.reply({ embeds:[buildProfileEmbed(member)], ephemeral:true });
      }
      if(interaction.commandName === 'promote'){
        if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
        const user = interaction.options.getUser('пользователь', true);
        const role = interaction.options.getRole('роль', true);
        const member = await interaction.guild.members.fetch(user.id).catch(()=>null);
        if(!member) return interaction.reply({ content:'Участник не найден.', ephemeral:true });
        const check = canManage(interaction.member, member, role);
        if(!check.ok) return interaction.reply({ content:check.reason, ephemeral:true });
        await member.roles.add(role);
        await trySendDM(user, `Тебя повысили в семье. Новая роль: ${role.name}`);
        addLog('promote', member.id, interaction.user.id, role.name);
        return interaction.reply({ content:`Роль ${role.name} выдана ${member.displayName}.`, ephemeral:true });
      }
      if(interaction.commandName === 'demote'){
        if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
        const user = interaction.options.getUser('пользователь', true);
        const role = interaction.options.getRole('роль', true);
        const member = await interaction.guild.members.fetch(user.id).catch(()=>null);
        if(!member) return interaction.reply({ content:'Участник не найден.', ephemeral:true });
        const check = canManage(interaction.member, member, role);
        if(!check.ok) return interaction.reply({ content:check.reason, ephemeral:true });
        await member.roles.remove(role);
        await trySendDM(user, `Тебя понизили в семье. Снята роль: ${role.name}`);
        addLog('demote', member.id, interaction.user.id, role.name);
        return interaction.reply({ content:`Роль ${role.name} снята с ${member.displayName}.`, ephemeral:true });
      }
      if(interaction.commandName === 'warn'){
        if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
        const user = interaction.options.getUser('пользователь', true);
        const reason = interaction.options.getString('причина', true);
        const data = ensureMember(user.id); data.warns += 1;
        store.warns.unshift({ userId:user.id, moderatorId:interaction.user.id, reason, createdAt:new Date().toISOString() }); saveStore();
        addLog('warn', user.id, interaction.user.id, reason);
        await trySendDM(user, `Тебе выдали предупреждение в семье. Причина: ${reason}`);
        return interaction.reply({ content:`Предупреждение выдано <@${user.id}>.`, ephemeral:true });
      }
      if(interaction.commandName === 'commend'){
        if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
        const user = interaction.options.getUser('пользователь', true);
        const reason = interaction.options.getString('причина', true);
        const data = ensureMember(user.id); data.commends += 1;
        store.commends.unshift({ userId:user.id, moderatorId:interaction.user.id, reason, createdAt:new Date().toISOString() }); saveStore();
        addLog('commend', user.id, interaction.user.id, reason);
        await trySendDM(user, `Тебя отметили в семье. Причина: ${reason}`);
        return interaction.reply({ content:`Похвала выдана <@${user.id}>.`, ephemeral:true });
      }
      if(interaction.commandName === 'contract'){
        const sub = interaction.options.getSubcommand();
        if(sub === 'create'){
          if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
          const user = interaction.options.getUser('пользователь', true);
          const text = interaction.options.getString('текст', true);
          store.contracts.unshift({ id:`${Date.now()}_${user.id}`, userId:user.id, text, createdBy:interaction.user.id, createdAt:new Date().toISOString(), status:'active' });
          store.contracts = store.contracts.slice(0,100); saveStore();
          await trySendDM(user, `Тебе назначен контракт семьи: ${text}`);
          return interaction.reply({ content:`Контракт создан для <@${user.id}>.`, ephemeral:true });
        }
        const list = store.contracts.slice(0,10).map((c,i)=>`${i+1}. <@${c.userId}> — ${c.text} [${c.status}]`).join('\n') || 'Нет контрактов';
        return interaction.reply({ embeds:[new EmbedBuilder().setTitle('📜 Контракты').setColor(0x10B981).setDescription(list).setTimestamp()], ephemeral:true });
      }
      if(interaction.commandName === 'applications'){
        if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
        const list = store.applications.slice(0,10).map((a,i)=>`${i+1}. <@${a.discordId}> • ${a.status} • ${a.source} • ${String(a.text).slice(0,60)}`).join('\n') || 'Нет заявок';
        return interaction.reply({ embeds:[new EmbedBuilder().setTitle('📝 Последние заявки').setColor(0x22C55E).setDescription(list).setTimestamp()], ephemeral:true });
      }
    }
    if(interaction.isButton()){
      if(interaction.customId === 'family_refresh'){
        await interaction.deferReply({ ephemeral:true });
        await updateFamilyPanel();
        await updateStatsPanel(interaction.guild);
        return interaction.editReply({ content:'Панели обновлены.' });
      }
      if(interaction.customId === 'family_apply'){
        const last = store.cooldowns[interaction.user.id] || 0;
        if(now()-last < APPLICATION_COOLDOWN_MS) return interaction.reply({ content:`Подожди ${Math.ceil((APPLICATION_COOLDOWN_MS - (now()-last))/1000)} сек.`, ephemeral:true });
        if(store.applications.find(x=>x.discordId===interaction.user.id && x.status==='pending')) return interaction.reply({ content:'У тебя уже есть активная заявка.', ephemeral:true });
        const modal = new ModalBuilder().setCustomId('family_apply_modal').setTitle('Заявка в семью');
        modal.addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nickname').setLabel('Ваш ник').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age').setLabel('Ваш возраст').setStyle(TextInputStyle.Short).setRequired(true)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('text').setLabel('Почему хотите в семью').setStyle(TextInputStyle.Paragraph).setRequired(true))
        );
        return interaction.showModal(modal);
      }
      if(interaction.customId.startsWith('app:')){
        if(!isManager(interaction.member)) return interaction.reply({ content:'Нет доступа.', ephemeral:true });
        const parts = interaction.customId.split(':');
        const action = parts[1];
        const source = parts[2];
        const userId = parts[3];
        const roleIdRaw = parts[4];
        const roleId = roleIdRaw === 'none' ? '' : roleIdRaw;
        const member = await interaction.guild.members.fetch(userId).catch(()=>null);
        const app = store.applications.find(x=>x.discordId===userId && x.status==='pending');
        if(action === 'reject'){
          if(app) app.status = 'rejected';
          saveStore();
          const rejected = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xEF4444).setFooter({ text:`Отклонено: ${interaction.user.tag}` });
          await interaction.message.edit({ embeds:[rejected], components:[] });
          if(member) await trySendDM(member.user, `Твоя заявка в семью отклонена.`);
          return interaction.reply({ content:'Заявка отклонена.', ephemeral:true });
        }
        if(!member) return interaction.reply({ content:'Пользователь не найден на сервере.', ephemeral:true });
        if(roleId){
          const role = interaction.guild.roles.cache.get(roleId);
          if(role) await member.roles.add(role);
        }
        if(app) app.status = 'approved';
        saveStore();
        const approved = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x22C55E).setFooter({ text:`Одобрено: ${interaction.user.tag}` });
        await interaction.message.edit({ embeds:[approved], components:[] });
        await trySendDM(member.user, `Ты принят в семью 🎉`);
        addLog(source === 'invite' ? 'invite_approved' : 'application_approved', member.id, interaction.user.id, roleId || '');
        await updateFamilyPanel();
        return interaction.reply({ content:'Заявка одобрена, роль выдана.', ephemeral:true });
      }
    }
    if(interaction.isModalSubmit() && interaction.customId === 'family_apply_modal'){
      const nickname = interaction.fields.getTextInputValue('nickname');
      const age = interaction.fields.getTextInputValue('age');
      const text = interaction.fields.getTextInputValue('text');
      store.cooldowns[interaction.user.id] = now();
      saveStore();
      await postApplication({ guild:interaction.guild, user:interaction.user, nickname, age, text, source:'apply', requestedRoleId:APPLICATION_DEFAULT_ROLE || '' });
      return interaction.reply({ content:'Заявка отправлена.', ephemeral:true });
    }
  }catch(e){
    console.error('Ошибка interactionCreate:', e);
    if(interaction.isRepliable() && !interaction.replied && !interaction.deferred){
      await interaction.reply({ content:'Произошла ошибка.', ephemeral:true }).catch(()=>{});
    }
  }
});

client.login(process.env.TOKEN);

import { spawn } from 'node:child_process';
import { ChannelType, PermissionFlagsBits, SlashCommandBuilder, type Client, type GuildMember, type Interaction } from 'discord.js';
import { MusicManager } from './manager';
import { DiscordMusicBackend } from './backend';
import { resolveTrack } from './sources';
import { trackListener } from '../../services/shutdown';
export function buildMusicCommand() {
  return new SlashCommandBuilder().setName('music').setDescription('Музыка: поиск по названию, файлы и очередь')
    .addSubcommand(sub => sub.setName('play').setDescription('Найти песню по названию или включить аудио')
      .addStringOption(option => option.setName('query').setDescription('Исполнитель — песня, либо HTTPS-аудиоссылка').setMaxLength(300))
      .addAttachmentOption(option => option.setName('file').setDescription('Аудиофайл до 100 МБ')))
    .addSubcommand(sub => sub.setName('queue').setDescription('Текущий трек и очередь'))
    .addSubcommand(sub => sub.setName('pause').setDescription('Пауза'))
    .addSubcommand(sub => sub.setName('resume').setDescription('Продолжить'))
    .addSubcommand(sub => sub.setName('skip').setDescription('Пропустить трек или отменить поиск'))
    .addSubcommand(sub => sub.setName('stop').setDescription('Очистить очередь и отключить бота'))
    .addSubcommand(sub => sub.setName('status').setDescription('Готовность музыкального модуля'));
}
export function canControlMusic(member: Pick<GuildMember, 'permissions' | 'roles' | 'voice'>, channelId: string, djRoleIds: string[]): boolean {
  return member.voice.channelId === channelId || member.permissions.has(PermissionFlagsBits.Administrator) || djRoleIds.some(id => member.roles.cache.has(id));
}
export function createMusicService(client: Client, enabled: (guildId: string) => boolean) {
  const manager = new MusicManager(new DiscordMusicBackend(id => client.guilds.cache.get(id)), resolveTrack);
  const djRoles = String(process.env.MUSIC_DJ_ROLE_IDS || '').split(/[,\s]+/u).filter(Boolean);
  let dependencyCache: { expires: number; result: Promise<{ ffmpeg: boolean; search: boolean }> } | undefined;
  const dependencies = () => {
    if (dependencyCache && dependencyCache.expires > Date.now()) return dependencyCache.result;
    const available = (command: string, args: string[]) => new Promise<boolean>(resolve => {
      const child = spawn(command, args, { windowsHide: true, stdio: 'ignore' });
      let done = false;
      const finish = (result: boolean) => { if (done) return; done = true; clearTimeout(timer); child.kill(); resolve(result); };
      const timer = setTimeout(() => finish(false), 3000);
      child.once('error', () => finish(false)); child.once('close', code => finish(code === 0));
    });
    const result = Promise.all([available(process.env.FFMPEG_PATH || 'ffmpeg', ['-version']), available(process.env.YTDLP_PATH || 'yt-dlp', ['--version'])])
      .then(([ffmpeg, search]) => ({ ffmpeg, search }));
    dependencyCache = { expires: Date.now() + 30000, result }; return result;
  };
  let registered = false;
  function registerEvents(): void {
    if (registered) return; registered = true;
  client.on('voiceStateUpdate', trackListener(async (oldState, newState) => {
    const session = manager.snapshot(newState.guild.id); if (!session) return;
    if (!enabled(newState.guild.id)) { manager.stop(newState.guild.id); return; }
    if (newState.id === client.user?.id && newState.channelId !== session.channelId) { manager.stop(newState.guild.id); return; }
    if (oldState.channelId === session.channelId || newState.channelId === session.channelId) {
      const channel = newState.guild.channels.cache.get(session.channelId);
      if (!channel || channel.type !== ChannelType.GuildVoice || ![...channel.members.values()].some(member => !member.user.bot)) manager.stop(newState.guild.id);
    }
  }));
  client.on('channelDelete', trackListener(async channel => { if ('guild' in channel) manager.stopChannel(channel.guild.id, channel.id); }));
  }
  return {
    registerEvents,
    stop: () => manager.stopAll(),
    stopGuild: (guildId: string) => manager.stop(guildId),
    stopChannel: (guildId: string, channelId: string) => manager.stopChannel(guildId, channelId),
    healthLines: () => ['Музыка: очереди в памяти; /music status — зависимости и включение'],
    async handleInteraction(interaction: Interaction<'cached'>): Promise<boolean> {
      if (!interaction.isChatInputCommand() || interaction.commandName !== 'music') return false;
      if (!interaction.inCachedGuild()) return false;
      const reply = (content: string) => interaction.deferred ? interaction.editReply({ content, allowedMentions: { parse: [] } }) : interaction.reply({ content, flags: 64, allowedMentions: { parse: [] } });
      const action = interaction.options.getSubcommand();
      if (action === 'status') {
        await interaction.deferReply({ flags: 64 });
        const ready = await dependencies();
        await reply('Музыка: ' + (enabled(interaction.guildId) ? 'включена' : 'выключена — /settings module key:music enabled:true')
          + '\nFFmpeg: ' + (ready.ffmpeg ? 'доступен' : 'не установлен') + '\nПоиск yt-dlp: ' + (ready.search ? 'доступен' : 'не установлен')
          + '\nПоиск: /music play query:Исполнитель — песня. Очередь: 25; на участника: 5; трек: до 15 минут/100 МБ.'); return true;
      }
      if (!enabled(interaction.guildId)) { await reply('Музыка выключена. Администратор может включить её через /settings module key:music enabled:true.'); return true; }
      const session = manager.snapshot(interaction.guildId);
      if (action === 'queue') {
        await reply(session ? ['🎵 ' + (session.current?.title || 'Подготовка'), ...session.queue.slice(0, 25).map((track, index) => (index + 1) + '. ' + track.title)].join('\n').slice(0, 1900) : 'Очередь пуста.'); return true;
      }
      if (session && !canControlMusic(interaction.member, session.channelId, djRoles)) { await reply('Управлять плеером можно из его голосового канала, с ролью DJ или правом Administrator.'); return true; }
      if (action !== 'play') {
        if (!session) { await reply('Сейчас ничего не играет.'); return true; }
        if (action === 'stop') manager.stop(interaction.guildId);
        else if (action === 'skip') manager.skip(interaction.guildId);
        else if (action === 'pause' && !manager.pause(interaction.guildId)) { await reply('Пока нечего ставить на паузу.'); return true; }
        else if (action === 'resume' && !manager.resume(interaction.guildId)) { await reply('Нет приостановленного трека.'); return true; }
        await reply('Готово.'); return true;
      }
      const channel = interaction.member.voice.channel;
      if (!channel || channel.type !== ChannelType.GuildVoice) { await reply('Сначала зайдите в обычный голосовой канал.'); return true; }
      const bot = interaction.guild.members.me;
      if (!bot || !channel.permissionsFor(bot)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) { await reply('Боту нужны View Channel, Connect и Speak в этом голосовом канале.'); return true; }
      const file = interaction.options.getAttachment('file');
      const query = interaction.options.getString('query')?.trim();
      if ((!query && !file) || (query && file)) { await reply('Укажите либо название/ссылку в query, либо один аудиофайл.'); return true; }
      if (file && (file.size > 100 * 1024 * 1024 || !/\.(mp3|ogg|opus|wav|flac|m4a|aac|webm)$/iu.test(file.name))) { await reply('Нужен аудиофайл поддерживаемого формата до 100 МБ.'); return true; }
      await interaction.deferReply({ flags: 64 });
      const ready = await dependencies();
      if (!ready.ffmpeg || (!file && !/^https:\/\//iu.test(query || '') && !ready.search)) { await reply('Музыка не готова. Проверьте FFmpeg и yt-dlp через /music status.'); return true; }
      try {
        const target = interaction.channel;
        const position = manager.enqueue(interaction.guildId, channel.id, { query: file?.url || query!, title: file?.name || query!, userId: interaction.user.id },
          text => target && 'send' in target ? target.send({ content: text.slice(0, 1800), allowedMentions: { parse: [] } }) : Promise.resolve());
        await reply('Добавлено в очередь: ' + (file?.name || query) + '. Позиция: ' + position + '. Для названия выполняется поиск первого результата.');
      } catch (error) { await reply(error instanceof Error ? error.message : 'Не удалось добавить трек.'); }
      return true;
    }
  };
}

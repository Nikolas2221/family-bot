import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import copyCatalog, { repairText } from './copy';

type AnyRecord = Record<string, any>;
type ButtonRow = ActionRowBuilder<ButtonBuilder>;
type InputRow = ActionRowBuilder<TextInputBuilder>;

const copy = copyCatalog as AnyRecord;

const THEME = {
  brand: 0x7c3aed,
  phoenix: 0xf97316,
  ruby: 0xe11d48,
  gold: 0xf59e0b,
  royal: 0x2563eb,
  emerald: 0x10b981,
  warning: 0xf97316,
  slate: 0x334155
} as const;

const BRAND_FOOTER = 'BRHD • Phoenix';
const TEXT_REPAIRS: Array<[RegExp, string]> = [
  [new RegExp('\\u0420\\u00a7\\u0420\\u040e', 'g'), 'ЧС'],
  [new RegExp('\\u0420\\u201c\\u0420\\u0455\\u0420\\u00bb\\u0420\\u0455\\u0421\\u0192', 'g'), 'Голос'],
  [new RegExp('\\u0420\\u045b\\u0420\\u00b1\\u0420\\u0405\\u0420\\u0455\\u0420\\u0406\\u0420\\u0451\\u0421\\u201a\\u0421\\u040a', 'g'), 'Обновить'],
  [new RegExp('\\u0420\\u045f\\u0421\\u201a\\u0420\\u0455\\u0421\\u201e\\u0420\\u0451\\u0420\\u00bb\\u0421\\u040a', 'g'), 'Профиль'],
  [new RegExp('\\u0420\\u045e\\u0420\\u0455\\u0420\\u0457', 'g'), 'Топ'],
  [new RegExp('\\u0420\\u2014\\u0420\\u00b0\\u0421\\u040f\\u0420\\u0406\\u0420\\u0454\\u0420\\u0451', 'g'), 'Заявки'],
  [new RegExp('\\u0420\\u0452\\u0420\\u0491\\u0420\\u0458\\u0420\\u0451\\u0420\\u0405\\u0420\\u0454\\u0420\\u00b0', 'g'), 'Админка'],
  [new RegExp('\\u0420\\u045b\\u0421\\u201a\\u0421\\u2021\\u0421\\u2018\\u0421\\u201a', 'g'), 'Отчёт']
];

function text(value: unknown, fallback = ''): string {
  const raw = String(value ?? fallback);
  if (!raw) return fallback;
  return TEXT_REPAIRS.reduce((next, [pattern, replacement]) => next.replace(pattern, replacement), repairText(raw));
}

function optionalText(value: unknown): string | undefined {
  const next = text(value).trim();
  return next || undefined;
}

function trimValue(value: unknown, limit = 1024, fallback = '—'): string {
  const next = text(value, fallback).trim();
  if (!next) return fallback;
  return next.length > limit ? `${next.slice(0, limit - 1)}…` : next;
}

function hoursFromMinutes(minutes: unknown): string {
  return `${(Number(minutes || 0) / 60).toFixed(1)} ч`;
}

function avatarUrl(user: AnyRecord | null | undefined): string | undefined {
  return user?.displayAvatarURL?.({ size: 256 }) || user?.displayAvatarURL?.() || undefined;
}

function card({
  title,
  description,
  color = THEME.brand,
  footer = BRAND_FOOTER,
  thumbnail,
  image,
  author
}: {
  title: unknown;
  description?: unknown;
  color?: number;
  footer?: unknown;
  thumbnail?: unknown;
  image?: unknown;
  author?: AnyRecord;
}): EmbedBuilder {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(trimValue(title, 256, 'BRHD • Phoenix'))
    .setTimestamp();

  const nextDescription = optionalText(description);
  if (nextDescription) embed.setDescription(trimValue(nextDescription, 4096));

  const footerText = optionalText(footer);
  if (footerText) embed.setFooter({ text: footerText });

  const thumbnailUrl = optionalText(thumbnail);
  if (thumbnailUrl) embed.setThumbnail(thumbnailUrl);

  const imageUrl = optionalText(image);
  if (imageUrl) embed.setImage(imageUrl);

  if (author?.name) {
    embed.setAuthor({
      name: trimValue(author.name, 256),
      iconURL: optionalText(author.iconURL)
    });
  }

  return embed;
}

function section(name: unknown, value: unknown, inline = false): { name: string; value: string; inline: boolean } {
  return {
    name: trimValue(name, 256, 'Раздел'),
    value: trimValue(value, 1024),
    inline
  };
}

function buttonRow(...components: ButtonBuilder[]): ButtonRow {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(...components);
}

function inputRow(component: TextInputBuilder): InputRow {
  return new ActionRowBuilder<TextInputBuilder>().addComponents(component);
}

function chunk<T>(items: T[], size: number): T[][] {
  const parts: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    parts.push(items.slice(index, index + size));
  }
  return parts;
}

function statusEmoji(member: AnyRecord | null | undefined): string {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return '🟢';
  if (status === 'idle') return '🟡';
  if (status === 'dnd') return '⛔';
  return '⚫';
}

function statusLabel(member: AnyRecord | null | undefined): string {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return 'Онлайн';
  if (status === 'idle') return 'Отошёл';
  if (status === 'dnd') return 'Не беспокоить';
  return 'Оффлайн';
}

function statusWeight(member: AnyRecord): number {
  const status = member?.presence?.status || 'offline';
  if (status === 'online') return 0;
  if (status === 'idle') return 1;
  if (status === 'dnd') return 2;
  return 3;
}

function sortMembers(members: AnyRecord[], activityScore: (memberId: string) => number): AnyRecord[] {
  return [...members].sort((a, b) => {
    const byStatus = statusWeight(a) - statusWeight(b);
    if (byStatus !== 0) return byStatus;

    const byActivity = activityScore(b.id) - activityScore(a.id);
    if (byActivity !== 0) return byActivity;

    return text(a.displayName).localeCompare(text(b.displayName), 'ru');
  });
}

function roleLine(label: string, roleId?: string): string {
  return `${label}: ${roleId ? `<@&${roleId}>` : 'не задана'}`;
}

function channelLine(label: string, channelId?: string): string {
  return `${label}: ${channelId ? `<#${channelId}>` : 'не задан'}`;
}

function interactiveIdentityBlock(user: AnyRecord, nickname = ''): string {
  return [
    `Пользователь: <@${user.id}>`,
    nickname ? `Ник: ${text(nickname)}` : '',
    `ID: \`${user.id}\``
  ].filter(Boolean).join('\n');
}

function formatList<T>(items: T[], formatter: (item: T, index: number) => string, empty: string): string {
  return items.length ? items.map(formatter).join('\n') : empty;
}

function updateGroupLines(lines: unknown[] = [], fallback = '—'): string {
  if (!Array.isArray(lines) || !lines.length) return fallback;
  return lines.map((line) => `• ${text(line)}`).join('\n');
}

function familySummaryLines(summary: AnyRecord = {}): string[] {
  return [
    `Всего участников: ${summary.totalMembers ?? 0}`,
    `С ролями / без ролей: ${summary.membersWithFamilyRoles ?? 0} / ${summary.membersWithoutFamilyRoles ?? 0}`,
    `Заявок на рассмотрении: ${summary.pendingApplications ?? 0}`,
    `AFK-рисков: ${summary.afkRiskCount ?? 0}`,
    `Тариф: ${summary.planLabel || 'Free - 0$'}`,
    `Статусы: 🟢 ${summary.onlineCount ?? 0} • 🟡 ${summary.idleCount ?? 0} • ⛔ ${summary.dndCount ?? 0} • ⚫ ${summary.offlineCount ?? 0}`,
    summary.topMemberLine ? `Топ-1 активности: ${text(summary.topMemberLine)}` : '',
    summary.lastUpdatedLabel ? `Последнее обновление: ${text(summary.lastUpdatedLabel)}` : ''
  ].filter(Boolean);
}

function helpSections(catalog: AnyRecord = {}): Array<{ title: string; commands: AnyRecord[] }> {
  return [
    { title: text(copy.help?.regularSection, 'Обычные команды'), commands: Array.isArray(catalog.regularCommands) ? catalog.regularCommands : [] },
    { title: text(copy.help?.adminSection, 'Команды администрации'), commands: Array.isArray(catalog.adminCommands) ? catalog.adminCommands : [] },
    { title: text(copy.help?.premiumRegularSection, 'Обычные команды Premium'), commands: Array.isArray(catalog.premiumRegularCommands) ? catalog.premiumRegularCommands : [] },
    { title: text(copy.help?.premiumAdminSection, 'Админ-команды Premium'), commands: Array.isArray(catalog.premiumAdminCommands) ? catalog.premiumAdminCommands : [] }
  ].filter((item) => item.commands.length);
}

function renderCommands(commands: AnyRecord[] = []): string {
  if (!commands.length) return text(copy.help?.none, 'Нет доступных команд для этого раздела.');
  return commands
    .map((command) => text(copy.help?.line?.(command.name, command.description), `/${command.name} • ${command.description}`))
    .join('\n')
    .slice(0, 4000);
}

export function panelButtons(): ButtonRow[] {
  return [
    buttonRow(
      new ButtonBuilder().setCustomId('family_refresh').setLabel('Обновить').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_profile').setLabel('Профиль').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('family_leaderboard').setLabel('Топ').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_voice').setLabel('Голос').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
    ),
    buttonRow(
      new ButtonBuilder().setCustomId('admin_applications').setLabel('Заявки').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_aiadvisor').setLabel('AI-совет').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_panel').setLabel('Админка').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('admin_blacklist').setLabel('ЧС').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('admin_activityreport').setLabel('Отчёт').setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function buildAiAdvisorModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('family_aiadvisor_modal')
    .setTitle(text(copy.family?.aiAdvisorModalTitle, 'AI-совет по участнику'))
    .addComponents(
      inputRow(
        new TextInputBuilder()
          .setCustomId('aiadvisor_member')
          .setLabel(text(copy.family?.aiAdvisorModalLabel, 'ID, @ник или имя участника').slice(0, 45))
          .setPlaceholder(text(copy.family?.aiAdvisorModalPlaceholder, 'Оставь пустым для анализа себя').slice(0, 100))
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
      )
    );
}

export function buildApplyModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('family_apply_modal')
    .setTitle(text(copy.applications?.applyModalTitle, 'Заявка в семью'))
    .addComponents(
      inputRow(new TextInputBuilder().setCustomId('nickname').setLabel('Ник в игре').setStyle(TextInputStyle.Short).setRequired(true)),
      inputRow(new TextInputBuilder().setCustomId('level').setLabel('Какой лвл?').setStyle(TextInputStyle.Short).setRequired(true)),
      inputRow(new TextInputBuilder().setCustomId('inviter').setLabel('Кто дал инвайт?').setStyle(TextInputStyle.Short).setRequired(true)),
      inputRow(new TextInputBuilder().setCustomId('discovery').setLabel('Откуда о нас узнали?').setStyle(TextInputStyle.Short).setRequired(true)),
      inputRow(new TextInputBuilder().setCustomId('about').setLabel('О себе').setStyle(TextInputStyle.Paragraph).setRequired(true))
    );
}

export function buildAcceptModal(applicationId: string, userId: string, messageId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`app_accept_modal:${applicationId}:${userId}:${messageId}`)
    .setTitle(text(copy.applications?.acceptModalTitle, 'Детали приёма'))
    .addComponents(
      inputRow(
        new TextInputBuilder()
          .setCustomId('accept_reason')
          .setLabel(text(copy.applications?.acceptModalReason, 'Причина приёма').slice(0, 45))
          .setPlaceholder(text(copy.applications?.acceptModalReasonPlaceholder, 'Например: собеседование пройдено').slice(0, 100))
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
      ),
      inputRow(
        new TextInputBuilder()
          .setCustomId('accept_rank')
          .setLabel(text(copy.applications?.acceptModalRank, 'На какой ранг принят').slice(0, 45))
          .setPlaceholder(text(copy.applications?.acceptModalRankPlaceholder, 'Например: 1 ранг').slice(0, 100))
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      )
    );
}

export function buildVerificationModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('welcome_verification_modal')
    .setTitle(text(copy.verification?.modalTitle, 'Подтверждение доступа'))
    .addComponents(
      inputRow(new TextInputBuilder().setCustomId('verify_nick').setLabel(text(copy.verification?.modalNick, 'Ник в игре').slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(true)),
      inputRow(new TextInputBuilder().setCustomId('verify_reason').setLabel(text(copy.verification?.modalReason, 'Почему хочешь доступ?').slice(0, 45)).setStyle(TextInputStyle.Paragraph).setRequired(true)),
      inputRow(new TextInputBuilder().setCustomId('verify_rules').setLabel(text(copy.verification?.modalRules, 'Правила прочитал?').slice(0, 45)).setStyle(TextInputStyle.Short).setRequired(true))
    );
}

export function buildWelcomeButtons(): ButtonRow[] {
  return [
    buttonRow(
      new ButtonBuilder().setCustomId('welcome_verify').setLabel(text(copy.verification?.verifyButton, 'Подтвердить')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('welcome_rules').setLabel(text(copy.verification?.rulesButton, 'Правила')).setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('family_apply').setLabel(text(copy.verification?.applyButton, 'Подать заявку')).setStyle(ButtonStyle.Primary)
    )
  ];
}

export function buildApplicationsPanelButtons(): ButtonRow[] {
  return [
    buttonRow(
      new ButtonBuilder().setCustomId('family_apply').setLabel('Подать заявку').setStyle(ButtonStyle.Success)
    )
  ];
}

export function buildRankButtons({ userId, canPromote, canDemote, canAutoSync }: AnyRecord): ButtonRow[] {
  return [
    buttonRow(
      new ButtonBuilder().setCustomId(`rank_promote:${userId}`).setLabel(text(copy.ranks?.promoteButton, 'Повысить')).setStyle(ButtonStyle.Success).setDisabled(!canPromote),
      new ButtonBuilder().setCustomId(`rank_demote:${userId}`).setLabel(text(copy.ranks?.demoteButton, 'Понизить')).setStyle(ButtonStyle.Danger).setDisabled(!canDemote),
      new ButtonBuilder().setCustomId(`rank_autosync:${userId}`).setLabel(text(copy.ranks?.autoSyncButton, 'Авто-ранг')).setStyle(ButtonStyle.Secondary).setDisabled(!canAutoSync)
    )
  ];
}

export function buildRoleMenuComponents(menu: AnyRecord = {}): ButtonRow[] {
  const buttons = (Array.isArray(menu.items) ? menu.items : []).slice(0, 25).map((item: AnyRecord) => {
    const button = new ButtonBuilder()
      .setCustomId(`rolemenu_toggle:${menu.menuId}:${item.roleId}`)
      .setLabel(trimValue(item.label || item.roleId, 80))
      .setStyle(ButtonStyle.Secondary);

    if (item.emoji) button.setEmoji(String(item.emoji));
    return button;
  });

  return chunk(buttons, 5).map((part) => buttonRow(...part));
}

export function buildApplicationButtons(applicationId: string, userId: string, { closed = false }: AnyRecord = {}): ButtonRow[] {
  const rows: ButtonRow[] = [];

  if (!closed) {
    rows.push(buttonRow(
      new ButtonBuilder().setCustomId(`app_accept:${applicationId}:${userId}`).setLabel(text(copy.applications?.acceptButton, 'Принять')).setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`app_reject:${applicationId}:${userId}`).setLabel(text(copy.applications?.rejectButton, 'Отклонить')).setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`app_review:${applicationId}:${userId}`).setLabel(text(copy.applications?.reviewButton, 'На рассмотрении')).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`app_ai:${applicationId}:${userId}`).setLabel(text(copy.applications?.aiButton, 'AI-анализ')).setStyle(ButtonStyle.Secondary)
    ));
  }

  rows.push(buttonRow(
    new ButtonBuilder().setCustomId(`app_close:${applicationId}:${userId}`).setLabel(text(copy.applications?.closeTicketButton, 'Закрыть тикет')).setStyle(ButtonStyle.Secondary)
  ));

  return rows;
}

export function buildFamilyMenuEmbed({ imageUrl, summary }: AnyRecord = {}): EmbedBuilder {
  return card({
    title: 'Панель семьи',
    color: THEME.brand,
    description: [
      'Панель семьи в стиле BRHD / Phoenix.',
      '',
      ...familySummaryLines(summary),
      '',
      '• Обновить - обновить состав, активность и ранги',
      '• Профиль - открыть свой профиль',
      '• Топ - рейтинг по очкам',
      '• Голос - топ по голосовой активности',
      '• Подать заявку - открыть анкету кандидата'
    ].join('\n'),
    footer: `${BRAND_FOOTER} • Family Control`,
    image: imageUrl
  });
}

export async function buildFamilyEmbeds(
  guild: AnyRecord,
  {
    roles = [],
    familyTitle,
    updateIntervalMs = 60000,
    activityScore = () => 0,
    summary = {},
    imageUrl
  }: AnyRecord = {}
): Promise<EmbedBuilder[]> {
  const configuredRoles = (Array.isArray(roles) ? roles : [])
    .map((item: AnyRecord) => ({ ...item, role: guild.roles?.cache?.get?.(item.id) }))
    .filter((item: AnyRecord) => item.role)
    .sort((a: AnyRecord, b: AnyRecord) => (b.role.position || 0) - (a.role.position || 0));

  const assignedMemberIds = new Set<string>();
  const snapshots = configuredRoles.map((item: AnyRecord) => {
    const members = Array.from(item.role.members?.values?.() || [])
      .filter((member: any) => !member.user?.bot)
      .filter((member: any) => {
        if (assignedMemberIds.has(member.id)) return false;
        assignedMemberIds.add(member.id);
        return true;
      });

    return {
      name: text(item.name || item.role.name),
      members: sortMembers(members as AnyRecord[], activityScore)
    };
  });

  const allMembers = Array.from(guild.members?.cache?.values?.() || []).filter((member: any) => !member.user?.bot);
  const activeRoles = snapshots.filter((item: AnyRecord) => item.members.length > 0);

  const embed = card({
    title: text(familyTitle || guild.name || 'Phoenix'),
    color: THEME.brand,
    description: [
      ...familySummaryLines({
        ...summary,
        totalMembers: allMembers.length,
        membersWithFamilyRoles: assignedMemberIds.size,
        membersWithoutFamilyRoles: Math.max(0, allMembers.length - assignedMemberIds.size)
      }),
      '',
      `Активных секций: ${activeRoles.length}`,
      `Обновление: каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
      '',
      '🟢 Онлайн • 🟡 Отошёл • ⛔ Не беспокоить • ⚫ Оффлайн'
    ].join('\n'),
    footer: `${BRAND_FOOTER} • Обновление каждые ${Math.floor(updateIntervalMs / 1000)} сек.`,
    image: imageUrl
  });

  if (!activeRoles.length) {
    embed.addFields(section('Состав', text(copy.family?.emptyMembers, 'Нет участников в выбранных ролях.')));
    return [embed];
  }

  for (const item of activeRoles) {
    embed.addFields(section(
      `${item.name} • ${item.members.length}`,
      item.members.map((member: AnyRecord) => `${statusEmoji(member)} <@${member.id}> • ${activityScore(member.id)} очк.`).join('\n')
    ));
  }

  return [embed];
}

export function buildProfileEmbed(
  member: AnyRecord,
  { activityScore = () => 0, memberData = {}, familyRoleIds = [], rankInfo = null }: AnyRecord = {}
): EmbedBuilder {
  const familyRoles = member.roles?.cache
    ?.filter?.((role: AnyRecord) => familyRoleIds.includes(role.id))
    ?.map?.((role: AnyRecord) => `<@&${role.id}>`)
    ?.join(', ') || text(copy.profile?.noRoles, 'Нет семейных ролей');

  const currentRoleName = text(rankInfo?.currentRole?.name || copy.profile?.noRoles || 'Без ранга');
  const autoRankText = !rankInfo?.autoEnabled
    ? text(copy.ranks?.autoDisabled, 'Авто-ранги выключены.')
    : rankInfo?.manualOnly
      ? text(copy.ranks?.manualOnly?.(currentRoleName), `Ранг управляется вручную: ${currentRoleName}`)
      : rankInfo?.currentRole && rankInfo?.autoTargetRole && rankInfo.currentRole.id === rankInfo.autoTargetRole.id
        ? text(copy.ranks?.alreadySynced?.(currentRoleName, rankInfo.score), `Ранг уже синхронизирован: ${currentRoleName}`)
        : rankInfo?.currentRole && rankInfo?.autoTargetRole
          ? text(copy.ranks?.autoStatus?.(text(rankInfo.autoTargetRole.name), rankInfo.score), `Цель авто-ранга: ${text(rankInfo.autoTargetRole.name)}`)
          : text(copy.ranks?.autoUnavailable, 'Авто-ранг недоступен.');

  return card({
    title: text(copy.profile?.title, 'Профиль участника'),
    color: THEME.brand,
    description: text(copy.profile?.description?.(member.id), `Информация о <@${member.id}>`),
    footer: `${BRAND_FOOTER} • Profile`,
    thumbnail: avatarUrl(member.user)
  }).addFields(
    section('Основное', [`Ник: ${text(member.displayName || member.user?.username)}`, `Discord: <@${member.id}>`, `ID: \`${member.id}\``].join('\n')),
    section(text(copy.profile?.fieldRoles, 'Роли семьи'), familyRoles),
    section('Активность', [
      `Актив-очки: ${activityScore(member.id)}`,
      `Репутация: ${memberData.points || 0}/100`,
      `Сообщения: ${memberData.messageCount || 0}`,
      `Похвалы: ${memberData.commends || 0}`,
      `Выговоры: ${memberData.warns || 0}`
    ].join('\n'), true),
    section('Голосовые каналы', `Онлайн в голосе: ${hoursFromMinutes(memberData.voiceMinutes || 0)}`, true),
    section('Статус и ранг', [`Статус: ${statusEmoji(member)} ${statusLabel(member)}`, `Ранг: ${currentRoleName}`].join('\n'), true),
    section(text(copy.profile?.fieldAutoRank, 'Авто-ранг'), autoRankText)
  );
}

export function buildLeaderboardEmbed(entries: unknown[] = [], summary: AnyRecord = {}): EmbedBuilder {
  const content = entries.length ? entries.map((entry) => text(entry)).join('\n') : text(copy.stats?.leaderboardEmpty, 'Рейтинг пока пуст.');
  return card({
    title: `${text(copy.stats?.leaderboardTitle, 'Таблица участников')} • Phoenix`,
    color: THEME.gold,
    description: [
      text(copy.stats?.leaderboardDescription, 'Премиальный срез репутации семьи в стиле BRHD / Phoenix.'),
      '',
      `Участников в рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Топ-игрок: ${summary.topLine ? text(summary.topLine) : 'нет данных'}`
    ].join('\n'),
    footer: `${BRAND_FOOTER} • Premium Leaderboard`,
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [
      `Средняя репутация: ${summary.averagePoints ?? 0}/100`,
      `Суммарная репутация: ${summary.totalPoints ?? 0}`,
      `Голос семьи: ${summary.totalVoiceHours ?? 0} ч`
    ].join('\n'), true),
    section('Рейтинг', content)
  );
}

export function buildVoiceActivityEmbed(entries: unknown[] = [], summary: AnyRecord = {}): EmbedBuilder {
  const content = entries.length ? entries.map((entry) => text(entry)).join('\n') : text(copy.stats?.voiceEmpty, 'Голосовой рейтинг пока пуст.');
  return card({
    title: `${text(copy.stats?.voiceTitle, 'Голосовая активность')} • Phoenix`,
    color: THEME.royal,
    description: [
      text(copy.stats?.voiceDescription, 'Премиальный срез голосовой активности семьи.'),
      '',
      `Участников в голосовом рейтинге: ${summary.memberCount ?? entries.length}`,
      `Тариф: ${summary.planLabel || 'Premium - 5$'}`,
      `Лидер голоса: ${summary.topLine ? text(summary.topLine) : 'нет данных'}`
    ].join('\n'),
    footer: `${BRAND_FOOTER} • Premium Voice`,
    image: summary.imageUrl
  }).addFields(
    section('Сводка', [
      `Суммарно часов: ${summary.totalHours ?? 0} ч`,
      `Среднее на участника: ${summary.averageHours ?? 0} ч`,
      `Репутация ядра: ${summary.totalPoints ?? 0}`
    ].join('\n'), true),
    section('Топ по голосу', content)
  );
}

export function buildWelcomeEmbed(
  member: AnyRecord,
  familyTitle: string,
  imageUrl = '',
  customMessage = '',
  extras: AnyRecord = {}
): EmbedBuilder {
  return card({
    title: `Добро пожаловать в ${text(familyTitle || 'Phoenix')}`,
    color: THEME.emerald,
    description: [
      customMessage
        ? text(customMessage)
        : `Рады видеть тебя в семье **${text(familyTitle || 'Phoenix')}** на сервере **${text(member.guild?.name || 'Phoenix')}**.`,
      '',
      extras.rulesChannelId ? `Правила: <#${extras.rulesChannelId}>` : '',
      extras.applicationsChannelId ? `Подача заявки: <#${extras.applicationsChannelId}>` : '',
      extras.verificationEnabled ? 'Подтверди доступ кнопкой ниже, чтобы получить стартовую роль.' : ''
    ].filter(Boolean).join('\n'),
    footer: `${BRAND_FOOTER} • Welcome`,
    thumbnail: avatarUrl(member.user),
    image: imageUrl
  }).addFields(section('Старт', [
    '1. Изучи правила сервера',
    '2. Пройди подтверждение',
    '3. Открой панель семьи и подай заявку'
  ].join('\n')));
}

export function buildApplicationsPanelEmbed({ imageUrl }: AnyRecord = {}): EmbedBuilder {
  return card({
    title: text(copy.applications?.panelTitle, 'Заявки в семью'),
    color: THEME.phoenix,
    description: [
      'Подача заявки в семью в стиле BRHD / Phoenix.',
      '',
      text(copy.applications?.panelDescription, 'Нажми кнопку ниже, чтобы подать заявку в семью.'),
      '',
      'Как проходит подача:',
      '1. Нажми кнопку ниже',
      '2. Заполни анкету кандидата',
      '3. Руководство получит тикет на рассмотрение'
    ].join('\n'),
    footer: `${BRAND_FOOTER} • Applications`,
    image: imageUrl
  });
}

export function buildApplicationEmbed({
  user,
  nickname,
  level = '',
  inviter = '',
  discovery = '',
  about = '',
  age = '',
  text: legacyText = '',
  applicationId,
  source
}: AnyRecord): EmbedBuilder {
  const normalizedLevel = level || age || 'не указано';
  const normalizedAbout = about || legacyText || 'не указано';
  const sourceLabel = source || text(copy.applications?.source, 'Заявка');
  const status = text(copy.applications?.statusLabel?.('review'), 'На рассмотрении');

  return card({
    title: `${text(copy.applications?.embedTitle, 'Заявка в семью')} • Phoenix Intake`,
    color: THEME.phoenix,
    description: text(copy.applications?.description?.(sourceLabel, user.id, status), `> **${sourceLabel} от <@${user.id}>**\n> Статус: **${status}**`),
    footer: `${BRAND_FOOTER} • Candidate Card`,
    thumbnail: avatarUrl(user)
  }).addFields(
    section('Кандидат', [`Пользователь: <@${user.id}>`, `Ник в игре: ${text(nickname)}`, `Лвл: ${text(normalizedLevel)}`].join('\n'), true),
    section(text(copy.applications?.fieldInvite, 'Инвайт и источник'), [`Кто дал инвайт: ${text(inviter || 'не указано')}`, `Откуда узнали: ${text(discovery || 'не указано')}`].join('\n'), true),
    section('ID анкеты', `\`${applicationId}\``, true),
    section(text(copy.applications?.fieldText, 'О себе'), text(normalizedAbout))
  );
}

export function buildAcceptLogEmbed({ member, moderatorUser, reason, rankName }: AnyRecord): EmbedBuilder {
  return card({
    title: text(copy.logs?.acceptTitle, 'Отчёт о приёме в семью'),
    color: THEME.emerald,
    description: text(copy.logs?.acceptDescription?.(moderatorUser.id, member.id), `**<@${moderatorUser.id}> принимает <@${member.id}> в семью**`),
    footer: `${BRAND_FOOTER} • Family Log`,
    thumbnail: avatarUrl(member.user)
  }).addFields(
    section(text(copy.logs?.acceptedMember, 'Принят в семью'), interactiveIdentityBlock(member, member.displayName)),
    section(text(copy.logs?.acceptedBy, 'Кто принял'), interactiveIdentityBlock(moderatorUser, moderatorUser.username)),
    section(text(copy.logs?.acceptDetails, 'Детали приёма'), [`Причина: ${text(reason || copy.applications?.acceptReason || 'Собеседование')}`, `Принят на: ${text(rankName || copy.applications?.acceptRank || '1 ранг')}`].join('\n'))
  );
}

export function buildRejectLogEmbed({ user, moderatorUser, reason }: AnyRecord): EmbedBuilder {
  return card({
    title: text(copy.logs?.rejectTitle, 'Отчёт об отказе'),
    color: THEME.ruby,
    description: text(copy.logs?.rejectDescription?.(moderatorUser.id, user.id), `**<@${moderatorUser.id}> отклоняет заявку <@${user.id}>**`),
    footer: `${BRAND_FOOTER} • Family Log`,
    thumbnail: avatarUrl(user)
  }).addFields(
    section(text(copy.logs?.candidate, 'Кандидат'), interactiveIdentityBlock(user)),
    section(text(copy.logs?.rejectedBy, 'Кто отклонил'), interactiveIdentityBlock(moderatorUser, moderatorUser.username)),
    section(text(copy.logs?.reason, 'Причина'), text(reason || copy.applications?.rejectReason || 'Отказ'))
  );
}

export function buildWarnLogEmbed({ targetUser, moderatorUser, reason }: AnyRecord): EmbedBuilder {
  return card({
    title: text(copy.logs?.warnTitle, 'Выговор'),
    color: THEME.warning,
    description: text(copy.logs?.warnDescription?.(moderatorUser.id, targetUser.id), `**<@${moderatorUser.id}> выдал выговор <@${targetUser.id}>**`),
    footer: `${BRAND_FOOTER} • Discipline`,
    thumbnail: avatarUrl(targetUser)
  }).addFields(
    section(text(copy.logs?.participant, 'Участник'), interactiveIdentityBlock(targetUser, targetUser.username), true),
    section(text(copy.logs?.moderator, 'Выдал'), interactiveIdentityBlock(moderatorUser, moderatorUser.username), true),
    section(text(copy.logs?.reason, 'Причина'), text(reason))
  );
}

export function buildCommendLogEmbed({ targetUser, moderatorUser, reason }: AnyRecord): EmbedBuilder {
  return card({
    title: text(copy.logs?.commendTitle, 'Похвала'),
    color: THEME.royal,
    description: text(copy.logs?.commendDescription?.(moderatorUser.id, targetUser.id), `**<@${moderatorUser.id}> отметил <@${targetUser.id}>**`),
    footer: `${BRAND_FOOTER} • Discipline`,
    thumbnail: avatarUrl(targetUser)
  }).addFields(
    section(text(copy.logs?.participant, 'Участник'), interactiveIdentityBlock(targetUser, targetUser.username), true),
    section(text(copy.logs?.moderator, 'Выдал'), interactiveIdentityBlock(moderatorUser, moderatorUser.username), true),
    section(text(copy.logs?.reason, 'Причина'), text(reason))
  );
}

export function buildApplicationsListEmbed(applications: AnyRecord[] = []): EmbedBuilder {
  const lines = formatList(
    applications,
    (application, index) => text(copy.list?.line?.(index, application), `${index + 1}. <@${application.userId}> • ${application.status} • ${application.id}`),
    text(copy.list?.empty, 'Заявок пока нет.')
  );

  return card({
    title: text(copy.list?.title, 'Последние заявки'),
    color: THEME.phoenix,
    description: lines,
    footer: `${BRAND_FOOTER} • Applications`
  });
}

export function buildBlacklistEmbed(entries: AnyRecord[] = []): EmbedBuilder {
  const lines = formatList(
    entries,
    (entry, index) => text(copy.security?.blacklistLine?.(index, entry), `${index + 1}. <@${entry.userId}> • ${entry.reason || 'без причины'}`),
    text(copy.security?.blacklistEmpty, 'Чёрный список пуст.')
  );

  return card({
    title: text(copy.security?.blacklistTitle, 'Чёрный список'),
    color: THEME.ruby,
    description: lines,
    footer: `${BRAND_FOOTER} • Security`
  });
}

export function buildBanListEmbed(entries: AnyRecord[] = []): EmbedBuilder {
  const lines = formatList(
    entries,
    (entry, index) => {
      const user = entry.user || entry;
      return `${index + 1}. <@${user.id}> • ${text(user.tag || user.username || user.id)}`;
    },
    text(copy.security?.banListEmpty, 'Бан-лист пуст.')
  );

  return card({
    title: text(copy.security?.banListTitle, 'Бан-лист'),
    color: THEME.ruby,
    description: lines,
    footer: `${BRAND_FOOTER} • Security`
  });
}

function joinSectionLines(lines: unknown[]): string {
  return Array.isArray(lines) && lines.length ? trimValue(lines.map((line) => text(line)).join('\n')) : text(copy.debugConfig?.none, '—');
}

export function buildDebugConfigEmbed({ summaryLines, validation }: AnyRecord): EmbedBuilder {
  const errors = validation?.errors || [];
  const warnings = validation?.warnings || [];
  const notes = validation?.notes || [];
  const hasErrors = errors.length > 0;
  const hasWarnings = warnings.length > 0;

  return card({
    title: hasErrors
      ? text(copy.debugConfig?.titleError, 'Конфигурация: есть ошибки')
      : hasWarnings
        ? text(copy.debugConfig?.titleWarn, 'Конфигурация: есть предупреждения')
        : text(copy.debugConfig?.titleOk, 'Конфигурация: OK'),
    color: hasErrors ? THEME.ruby : hasWarnings ? THEME.gold : THEME.brand,
    description: 'Текущая диагностика конфигурации сервера и бота.',
    footer: `${BRAND_FOOTER} • ${text(copy.debugConfig?.footer, 'Debug')}`
  }).addFields(
    section(text(copy.debugConfig?.summaryField, 'Сводка'), joinSectionLines(summaryLines)),
    section(text(copy.debugConfig?.notesField, 'Заметки'), joinSectionLines(notes)),
    section(text(copy.debugConfig?.warningsField, 'Предупреждения'), joinSectionLines(warnings)),
    section(text(copy.debugConfig?.errorsField, 'Ошибки'), joinSectionLines(errors))
  );
}

export function buildHelpEmbed(catalog: AnyRecord = {}, page = 0): EmbedBuilder {
  const sections = helpSections(catalog);
  const totalPages = Math.max(1, sections.length || 1);
  const safePage = Math.max(0, Math.min(Number(page) || 0, totalPages - 1));
  const current = sections[safePage] || { title: 'Команды', commands: [] };

  return card({
    title: `Справка • ${current.title}`,
    color: catalog.plan === 'premium' ? THEME.gold : THEME.brand,
    description: [
      `Тариф: ${catalog.plan === 'premium' ? 'Premium - 5$' : 'Free - 0$'}`,
      `Страница: ${safePage + 1}/${totalPages}`,
      '',
      renderCommands(current.commands)
    ].join('\n'),
    footer: `${BRAND_FOOTER} • Help`
  });
}

export function buildHelpPaginationButtons(catalog: AnyRecord = {}, page = 0): ButtonRow[] {
  const sections = helpSections(catalog);
  if (sections.length <= 1) return [];
  const safePage = Math.max(0, Math.min(Number(page) || 0, sections.length - 1));

  return [
    buttonRow(
      new ButtonBuilder()
        .setCustomId(`help_page:${Math.max(0, safePage - 1)}`)
        .setLabel('Назад')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(safePage === 0),
      new ButtonBuilder()
        .setCustomId(`help_page:${Math.min(sections.length - 1, safePage + 1)}`)
        .setLabel('Вперёд')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(safePage >= sections.length - 1)
    )
  ];
}

export function buildUpdateAnnouncementEmbed({ versionLabel, semver, buildId, commitMessage = '', changeLines = {} }: AnyRecord): EmbedBuilder {
  const groups = Array.isArray(changeLines)
    ? { added: changeLines, updated: [], fixed: [] }
    : {
        added: Array.isArray(changeLines?.added) ? changeLines.added : [],
        updated: Array.isArray(changeLines?.updated) ? changeLines.updated : [],
        fixed: Array.isArray(changeLines?.fixed) ? changeLines.fixed : []
      };

  const hasChanges = groups.added.length || groups.updated.length || groups.fixed.length;
  const embed = card({
    title: '🚀 Бот получил обновление',
    color: THEME.gold,
    description: `${text(versionLabel)}\nСборка успешно развернута на сервере.`,
    footer: `${BRAND_FOOTER} • Updates`
  });

  embed.addFields(
    section('Версия', [`Лейбл: ${text(versionLabel)}`, `Semver: ${semver}`, `Build: ${buildId}`].join('\n'), true),
    section('Коммит', trimValue(commitMessage || 'deploy update'), true)
  );

  if (groups.added.length) embed.addFields(section('Добавлено', updateGroupLines(groups.added)));
  if (groups.updated.length) embed.addFields(section('Обновлено', updateGroupLines(groups.updated)));
  if (groups.fixed.length) embed.addFields(section('Исправлено', updateGroupLines(groups.fixed)));

  embed.addFields(section(
    'Итог',
    hasChanges
      ? 'Обновление успешно применено и разложено по понятным пунктам.'
      : 'Список изменений не передан, но сборка успешно развернута.'
  ));

  return embed;
}

export function buildWelcomeStatusEmbed({ enabled, channelId, dmEnabled, message = '', autoroleRoleId = '' }: AnyRecord = {}): EmbedBuilder {
  return card({
    title: text(copy.welcome?.statusTitle, 'Welcome'),
    color: enabled ? THEME.emerald : THEME.slate,
    description: [
      `Статус: ${enabled ? text(copy.welcome?.enabled, 'включено') : text(copy.welcome?.disabled, 'выключено')}`,
      `Канал: ${channelId ? `<#${channelId}>` : 'не задан'}`,
      `ЛС: ${dmEnabled ? 'включены' : 'выключены'}`,
      `Автороль: ${autoroleRoleId ? `<@&${autoroleRoleId}>` : 'не задана'}`,
      `Текст: ${message ? 'задан' : 'не задан'}`
    ].join('\n'),
    footer: `${BRAND_FOOTER} • Welcome`
  });
}

export function buildAutoroleStatusEmbed(roleId = ''): EmbedBuilder {
  return card({
    title: '🔖 Автороль',
    color: roleId ? THEME.emerald : THEME.slate,
    description: `Текущая роль: ${roleId ? `<@&${roleId}>` : 'не задана'}`,
    footer: `${BRAND_FOOTER} • Autorole`
  });
}

export function buildReactionRoleStatusEmbed(entries: AnyRecord[] = []): EmbedBuilder {
  const lines = entries.slice(0, 20).map((entry, index) => (
    `${index + 1}. ${entry.emoji || '•'} • <@&${entry.roleId}> • \`${entry.messageId}\`${entry.channelId ? ` • <#${entry.channelId}>` : ''}`
  ));

  return card({
    title: text(copy.reactionRoles?.title, 'Reaction Roles'),
    color: entries.length ? THEME.brand : THEME.slate,
    description: lines.length ? lines.join('\n') : text(copy.reactionRoles?.empty, 'Reaction roles пока не настроены.'),
    footer: `${BRAND_FOOTER} • Reaction Roles`
  });
}

export function buildVerificationStatusEmbed(config: AnyRecord = {}): EmbedBuilder {
  return card({
    title: text(copy.verification?.title, 'Verification'),
    color: config.enabled ? THEME.emerald : THEME.slate,
    description: [
      `Статус: ${config.enabled ? 'включено' : 'выключено'}`,
      `Роль после подтверждения: ${config.roleId ? `<@&${config.roleId}>` : 'не задана'}`,
      `Анкета: ${config.questionnaireEnabled ? 'включена' : 'выключена'}`
    ].join('\n'),
    footer: `${BRAND_FOOTER} • Verification`
  });
}

export function buildRoleMenuStatusEmbed(menus: AnyRecord[] = []): EmbedBuilder {
  const lines = menus.flatMap((menu) => {
    const head = `• \`${menu.menuId}\` — ${text(menu.title)}${menu.category ? ` [${text(menu.category)}]` : ''}`;
    const items = (Array.isArray(menu.items) ? menu.items : [])
      .slice(0, 5)
      .map((item: AnyRecord) => `  - ${item.emoji ? `${item.emoji} ` : ''}${text(item.label)} -> <@&${item.roleId}>`);
    return [head, ...items];
  });

  return card({
    title: `🎛️ ${text(copy.roleMenus?.title, 'Role Menu')}`,
    color: menus.length ? THEME.brand : THEME.slate,
    description: lines.length ? lines.join('\n') : text(copy.roleMenus?.empty, 'Role menu пока не настроены.'),
    footer: `${BRAND_FOOTER} • Role Menu`
  });
}

export function buildRoleMenuEmbed(menu: AnyRecord = {}): EmbedBuilder {
  const lines = (Array.isArray(menu.items) ? menu.items : []).map((item: AnyRecord) => {
    const prefix = item.emoji ? `${item.emoji} ` : '';
    const suffix = item.description ? ` — ${text(item.description)}` : '';
    return `• ${prefix}<@&${item.roleId}>${suffix}`;
  });

  return card({
    title: text(menu.title || copy.roleMenus?.title || 'Role Menu'),
    color: THEME.brand,
    description: [
      menu.category ? `Категория: **${text(menu.category)}**` : '',
      menu.description ? text(menu.description) : '',
      '',
      lines.length ? lines.join('\n') : 'Пункты пока не добавлены.'
    ].filter(Boolean).join('\n'),
    footer: `${BRAND_FOOTER} • Role Menu`
  });
}

export function buildCustomCommandsEmbed(commands: AnyRecord[] = []): EmbedBuilder {
  const lines = commands.map((command) => `• \`${command.name}\` — ${text(command.trigger)} (${text(command.mode)})`);
  return card({
    title: `🧩 ${text(copy.customCommands?.title, 'Custom Commands')}`,
    color: THEME.royal,
    description: lines.length ? lines.join('\n') : text(copy.customCommands?.empty, 'Кастомных команд пока нет.'),
    footer: `${BRAND_FOOTER} • Custom Commands`
  });
}

export function buildAutomodStatusEmbed(config: AnyRecord = {}, automodChannelId = ''): EmbedBuilder {
  const badWords = Array.isArray(config.badWords) ? config.badWords : [];
  return card({
    title: '🛡️ Automod',
    color: config.enabled === false ? THEME.slate : THEME.ruby,
    description: [
      `Инвайты: ${config.invitesEnabled ? 'ON' : 'OFF'}`,
      `Ссылки: ${config.linksEnabled ? 'ON' : 'OFF'}`,
      `Капс: ${config.capsEnabled ? `ON (${config.capsPercent || 75}% / ${config.capsMinLength || 12}+)` : 'OFF'}`,
      `Упоминания: ${config.mentionsEnabled ? `ON (${config.mentionLimit || 5})` : 'OFF'}`,
      `Флуд: ${config.spamEnabled ? `ON (${config.spamCount || 6}/${config.spamWindowSeconds || 8}с)` : 'OFF'}`,
      `Стоп-слова: ${config.badWordsEnabled ? `ON (${badWords.length})` : 'OFF'}`,
      `Наказание: ${config.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`,
      `Лог-канал: ${automodChannelId ? `<#${automodChannelId}>` : 'не задан'}`
    ].join('\n'),
    footer: `${BRAND_FOOTER} • Automod`
  }).addFields(
    section('Стоп-слова', badWords.length ? badWords.map((word) => text(word)).join(', ') : 'Список пуст')
  );
}

export function buildAutomodActionEmbed({ member, rule, detail, channelId, content }: AnyRecord): EmbedBuilder {
  const ruleLabel = text(copy.automod?.ruleLabel?.(rule), rule);
  return card({
    title: '🚫 Automod сработал',
    color: THEME.ruby,
    description: `Сообщение участника ${member ? `<@${member.id}>` : 'неизвестно'} было удалено автоматически.`,
    footer: `${BRAND_FOOTER} • Automod`,
    thumbnail: avatarUrl(member?.user || member)
  }).addFields(
    section('Правило', `${ruleLabel}${detail ? ` • ${text(detail)}` : ''}`, true),
    section('Канал', channelId ? `<#${channelId}>` : 'не задан', true),
    section('Сообщение', trimValue(content, 1000))
  );
}

export function buildReportScheduleEmbed(schedule: AnyRecord = {}, channels: AnyRecord = {}): EmbedBuilder {
  const weekly = schedule.weekly || {};
  const monthly = schedule.monthly || {};
  const fallbackChannel = channels.reports || '';

  return card({
    title: text(copy.reports?.title, 'Расписание отчётов'),
    color: THEME.royal,
    description: [
      `Weekly: ${weekly.enabled ? 'ON' : 'OFF'}`,
      `Канал weekly: ${weekly.channelId ? `<#${weekly.channelId}>` : (fallbackChannel ? `<#${fallbackChannel}>` : 'не задан')}`,
      '',
      `Monthly: ${monthly.enabled ? 'ON' : 'OFF'}`,
      `Канал monthly: ${monthly.channelId ? `<#${monthly.channelId}>` : (fallbackChannel ? `<#${fallbackChannel}>` : 'не задан')}`
    ].join('\n'),
    footer: `${BRAND_FOOTER} • Reports`
  });
}

export function buildAdminPanelEmbed({ guildName, record }: AnyRecord): EmbedBuilder {
  const settings = record?.settings || {};
  const channels = settings.channels || {};
  const roles = settings.roles || {};
  const visuals = settings.visuals || {};
  const modules = settings.modules || {};
  const automod = settings.automod || {};
  const welcome = settings.welcome || {};
  const verification = settings.verification || {};
  const reportSchedule = settings.reportSchedule || {};
  const reactionRoles = Array.isArray(settings.reactionRoles) ? settings.reactionRoles : [];
  const roleMenus = Array.isArray(settings.roleMenus) ? settings.roleMenus : [];
  const customCommands = Array.isArray(settings.customCommands) ? settings.customCommands : [];
  const isPremium = record?.plan === 'premium';
  const planLabel = isPremium ? 'Premium - 5$' : 'Free - 0$';
  const mode = settings.mode || 'hybrid';

  const moduleLines = [
    `Family: ${modules.family ? 'ON' : 'OFF'}`,
    `Applications: ${modules.applications ? 'ON' : 'OFF'}`,
    `Moderation: ${modules.moderation ? 'ON' : 'OFF'}`,
    `Security: ${modules.security ? 'ON' : 'OFF'}`,
    `Analytics: ${modules.analytics ? 'ON' : 'OFF'}`,
    `AI: ${modules.ai ? 'ON' : 'OFF'}`,
    `Welcome: ${modules.welcome ? 'ON' : 'OFF'}`,
    `Automod: ${modules.automod ? 'ON' : 'OFF'}`,
    `Subscriptions: ${modules.subscriptions ? 'ON' : 'OFF'}`,
    `Custom Commands: ${modules.customCommands ? 'ON' : 'OFF'}`,
    `Music: ${modules.music ? 'ON' : 'OFF'}`
  ];

  return card({
    title: text(copy.admin?.panelTitle, 'Панель администратора'),
    color: isPremium ? THEME.gold : THEME.brand,
    description: `Сервер: **${text(guildName)}**`,
    footer: `${BRAND_FOOTER} • Administration`
  }).addFields(
    section('Статус', [`Тариф: ${planLabel}`, `Setup: ${record?.setupCompleted ? text(copy.admin?.panelSetupDone, 'завершён') : text(copy.admin?.panelSetupPending, 'ожидает')}`, `Режим: ${mode}`].join('\n'), true),
    section('Возможности', text(copy.admin?.panelFeatures?.(record?.plan), 'Базовые семейные функции'), true),
    section(text(copy.admin?.panelFieldChannels, 'Каналы'), [
      channelLine('Панель', channels.panel),
      channelLine('Подача заявки', channels.applications),
      channelLine('Welcome', channels.welcome),
      channelLine('Правила', channels.rules),
      channelLine('Логи', channels.logs),
      channelLine('Дисциплина', channels.disciplineLogs),
      channelLine('Апдейты', channels.updates),
      channelLine('Отчёты', channels.reports),
      channelLine('Automod', channels.automod)
    ].join('\n')),
    section(text(copy.admin?.panelFieldRoles, 'Роли'), [
      roleLine('Лидер', roles.leader),
      roleLine('Зам', roles.deputy),
      roleLine('Старший', roles.elder),
      roleLine('Участник', roles.member),
      roleLine('Новичок', roles.newbie),
      roleLine('Мут', roles.mute),
      roleLine('Автороль', roles.autorole),
      roleLine('После подтверждения', roles.verification)
    ].join('\n')),
    section('Модули', moduleLines.join('\n')),
    section('Welcome', [`Статус: ${welcome.enabled ? 'ON' : 'OFF'}`, `ЛС: ${welcome.dmEnabled ? 'ON' : 'OFF'}`, `Текст: ${welcome.message ? 'задан' : 'не задан'}`].join('\n'), true),
    section('Verification', [`Статус: ${verification.enabled ? 'ON' : 'OFF'}`, `Анкета: ${verification.questionnaireEnabled ? 'ON' : 'OFF'}`, `Роль: ${verification.roleId ? `<@&${verification.roleId}>` : 'не задана'}`].join('\n'), true),
    section('Role Menus', [`Меню: ${roleMenus.length}`, `Старые reaction roles: ${reactionRoles.length}`].join('\n'), true),
    section('Custom Commands', [`Триггеры: ${customCommands.length}`, `Premium: ${isPremium ? 'ON' : 'OFF'}`].join('\n'), true),
    section('Reports', [`Weekly: ${reportSchedule.weekly?.enabled ? 'ON' : 'OFF'}`, `Канал weekly: ${reportSchedule.weekly?.channelId ? `<#${reportSchedule.weekly.channelId}>` : 'не задан'}`, `Monthly: ${reportSchedule.monthly?.enabled ? 'ON' : 'OFF'}`, `Канал monthly: ${reportSchedule.monthly?.channelId ? `<#${reportSchedule.monthly.channelId}>` : 'не задан'}`].join('\n')),
    section('Automod', [`Инвайты: ${automod.invitesEnabled ? 'ON' : 'OFF'}`, `Ссылки: ${automod.linksEnabled ? 'ON' : 'OFF'}`, `Капс: ${automod.capsEnabled ? `ON (${automod.capsPercent || 75}% / ${automod.capsMinLength || 12}+)` : 'OFF'}`, `Упоминания: ${automod.mentionsEnabled ? `ON (${automod.mentionLimit || 5})` : 'OFF'}`, `Флуд: ${automod.spamEnabled ? `ON (${automod.spamCount || 6} / ${automod.spamWindowSeconds || 8}с)` : 'OFF'}`, `Стоп-слова: ${automod.badWordsEnabled ? `ON (${(automod.badWords || []).length})` : 'OFF'}`, `Наказание: ${automod.actionMode === 'hard' ? 'жёсткое' : 'мягкое'}`].join('\n')),
    section(text(copy.admin?.panelFieldVisuals, 'Баннеры'), [`Панель семьи: ${visuals.familyBanner || 'не задан'}`, `Подача заявки: ${visuals.applicationsBanner || 'не задан'}`].join('\n'))
  );
}

export default {
  buildAcceptLogEmbed,
  buildApplicationButtons,
  buildApplicationEmbed,
  buildApplicationsListEmbed,
  buildApplicationsPanelButtons,
  buildApplicationsPanelEmbed,
  buildAcceptModal,
  buildAiAdvisorModal,
  buildApplyModal,
  buildAdminPanelEmbed,
  buildBanListEmbed,
  buildBlacklistEmbed,
  buildCommendLogEmbed,
  buildDebugConfigEmbed,
  buildFamilyEmbeds,
  buildFamilyMenuEmbed,
  buildHelpEmbed,
  buildHelpPaginationButtons,
  buildAutomodActionEmbed,
  buildAutomodStatusEmbed,
  buildAutoroleStatusEmbed,
  buildCustomCommandsEmbed,
  buildLeaderboardEmbed,
  buildProfileEmbed,
  buildRankButtons,
  buildRoleMenuComponents,
  buildRoleMenuEmbed,
  buildRoleMenuStatusEmbed,
  buildReactionRoleStatusEmbed,
  buildRejectLogEmbed,
  buildReportScheduleEmbed,
  buildUpdateAnnouncementEmbed,
  buildVerificationModal,
  buildVerificationStatusEmbed,
  buildVoiceActivityEmbed,
  buildWelcomeButtons,
  buildWelcomeStatusEmbed,
  buildWelcomeEmbed,
  buildWarnLogEmbed,
  panelButtons
};

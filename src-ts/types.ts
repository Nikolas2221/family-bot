export type FamilyRoleKey = string;
export type BotMode = 'family' | 'server' | 'hybrid';
export type SubscriptionPlan = 'free' | 'premium';
export type ApplicationStatus = 'pending' | 'accepted' | 'rejected' | 'review';

export interface RoleDefinition {
  key: FamilyRoleKey;
  envKey: string;
  id?: string;
  name: string;
}

export interface AutoRanksConfig {
  enabled: boolean;
  intervalMs: number;
  memberMinScore: number;
  elderMinScore: number;
}

export interface GuardConfig {
  enabled: boolean;
  allowedRoles: string[];
}

export interface SupportTicketConfig {
  categoryId: string;
  supportRoleId: string;
  logChannelId: string;
  panelChannelId: string;
  pingSupport: boolean;
  cooldownSeconds: number;
  maxOpenPerUser: number;
  deleteDelaySeconds: number;
}

export interface AfkLeaveConfig {
  channelId: string;
  logChannelId: string;
  managerRoleId: string;
  approvedRoleId: string;
  useModal: boolean;
  useMessageForm: boolean;
  allowDmNotify: boolean;
  pinPanel: boolean;
  preventDuplicatePanel: boolean;
}

export interface RoleEnvEntry {
  key: string;
  value: string;
}

export interface AppConfig {
  raw: Record<string, string | undefined>;
  databaseFile: string;
  storageFile: string;
  token: string;
  telegramBotToken: string;
  telegramAdminChatId: string;
  telegramAnnouncementsChatId: string;
  discordAnnouncementsChannelId: string;
  discordAnnouncerRoleIds: string[];
  discordOnlineGuildId: string;
  guildId: string;
  channelId: string;
  hasApplicationsChannelId: boolean;
  applicationsChannelId: string;
  logChannelId: string;
  hasDisciplineLogChannelId: boolean;
  disciplineLogChannelId: string;
  messageId: string;
  updateIntervalMs: number;
  applicationCooldownMs: number;
  applicationTicketDeleteDelaySeconds: number;
  applicationDefaultRole: string;
  familyTitle: string;
  accessApplications: string[];
  accessDiscipline: string[];
  accessRanks: string[];
  ownerIds: string[];
  aiEnabled: boolean;
  aiModel: string;
  openAiApiKey: string;
  deepSeekApiKey: string;
  deepSeekBaseUrl: string;
  deepSeekModel: string;
  supportTickets: SupportTicketConfig;
  afkLeave: AfkLeaveConfig;
  autoRanks: AutoRanksConfig;
  leakGuard: GuardConfig;
  channelGuard: GuardConfig;
  roles: RoleEnvEntry[];
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
  notes: string[];
}

export interface ReleaseNoteGroups {
  added: string[];
  updated: string[];
  fixed: string[];
}

export interface CopyCatalog {
  defaults: {
    familyTitle: string;
  };
  common: Record<string, any>;
  commands: Record<string, any>;
  roles: Record<string, any>;
  family: Record<string, any>;
  applications: Record<string, any>;
  admin: Record<string, any>;
  automod: Record<string, any>;
  moderation: Record<string, any>;
  profile: Record<string, any>;
  ai: Record<string, any>;
  security: Record<string, any>;
  logs: Record<string, any>;
  discipline: Record<string, any>;
  reports: Record<string, any>;
  verification: Record<string, any>;
  reactionRoles: Record<string, any>;
  roleMenus: Record<string, any>;
  customCommands: Record<string, any>;
  ranks: Record<string, any>;
  welcome: Record<string, any>;
  [section: string]: any;
}

export type AutomodActionMode = 'soft' | 'hard';
export type AutomodRuleName = 'badWords' | 'invites' | 'links' | 'caps' | 'mentions';

export interface AutomodConfig {
  invitesEnabled: boolean;
  linksEnabled: boolean;
  capsEnabled: boolean;
  capsPercent: number;
  capsMinLength: number;
  mentionsEnabled: boolean;
  mentionLimit: number;
  spamEnabled: boolean;
  spamCount: number;
  spamWindowSeconds: number;
  badWordsEnabled: boolean;
  badWords: string[];
  actionMode: AutomodActionMode;
  timeoutMinutes: number;
}

export interface AutomodMessageInput {
  content?: string;
  mentionCount?: number;
  config?: Partial<AutomodConfig>;
}

export interface AutomodMessageMatch {
  rule: AutomodRuleName;
  detail?: string;
}

export interface AutomodSpamEvaluation {
  recent: number[];
  triggered: boolean;
}

export type CommandJson = Record<string, any>;

export interface CommandGuildLike {
  commands: {
    set(commands: CommandJson[]): Promise<unknown>;
  };
}

export interface ApplicationAnalysisInput {
  text?: string;
  [key: string]: unknown;
}

export interface MemberRecommendationInput {
  points?: number;
  warns?: number;
  commends?: number;
  messageCount?: number;
  activityScore?: number;
  voiceMinutes?: number;
  lastSeenAt?: number;
  currentRoleName?: string;
  autoTargetRoleName?: string;
  displayName?: string;
  [key: string]: unknown;
}

export interface AIService {
  aiText(systemPrompt: string, userPrompt: string): Promise<string>;
  analyzeApplication(application: ApplicationAnalysisInput): Promise<string>;
  analyzeMember(profile: MemberRecommendationInput): Promise<string>;
}

export type EmbedFactory = (...args: any[]) => any;

export interface EmbedsApi {
  panelButtons: any;
  [key: string]: any;
}

export interface ApplicationsService {
  accept(interaction: unknown, applicationId: string, userId: string, details?: Record<string, unknown>): Promise<unknown>;
  closeTicket(interaction: unknown, applicationId: string, details?: { reason?: string }): Promise<unknown>;
  getCooldownSecondsLeft(userId: string, cooldownMs: number): number;
  moveToReview(interaction: unknown, applicationId: string, userId: string): Promise<unknown>;
  reject(interaction: unknown, applicationId: string, userId: string): Promise<unknown>;
  sendApplyPanel(interaction: unknown): Promise<unknown>;
  submitApplication(interaction: unknown): Promise<unknown>;
}

export interface RankDescription {
  currentRole: unknown;
  score: number;
  autoEnabled: boolean;
  manualOnly: boolean;
  canPromote: boolean;
  canDemote: boolean;
  canAutoSync: boolean;
  autoTargetRole: unknown;
}

export interface RankActionResult {
  ok: boolean;
  code: string;
  currentRole?: unknown;
  fromRole?: unknown;
  toRole?: unknown;
  score?: number;
  targetRole?: unknown;
}

export interface RankSyncResult {
  enabled: boolean;
  changes: Array<{
    memberId: string;
    fromRole: unknown;
    toRole: unknown;
    score: number;
  }>;
  failures: Array<{
    memberId: string;
    error: unknown;
  }>;
}

export interface RankService {
  applyAutoRank(member: unknown): Promise<RankActionResult>;
  demote(member: unknown): Promise<RankActionResult>;
  describeMember(member: unknown): RankDescription;
  getCurrentRole(member: unknown): unknown;
  promote(member: unknown): Promise<RankActionResult>;
  syncAutoRanks(guild: { members: { cache: Map<string, unknown> } }): Promise<RankSyncResult>;
}

export interface ChannelOverwriteSnapshot {
  id: string;
  allow: bigint | number | string;
  deny: bigint | number | string;
  type: unknown;
}

export interface ChannelCreateOptionsShape {
  name?: string;
  type?: unknown;
  position?: number;
  parent?: string;
  permissionOverwrites?: ChannelOverwriteSnapshot[];
  reason?: string;
  topic?: string;
  nsfw?: boolean;
  rateLimitPerUser?: number;
  bitrate?: number;
  userLimit?: number;
}

export interface SecurityMemberLike {
  id?: string;
  guild?: {
    ownerId?: string;
    channels?: {
      create?(options: ChannelCreateOptionsShape): Promise<unknown>;
    };
    fetchAuditLogs?(options: { type: unknown; limit: number }): Promise<{
      entries: Map<unknown, { target?: { id?: string }; createdTimestamp: number; executor?: unknown }>;
    } | null>;
  };
  permissions?: {
    has?(permission: unknown): boolean;
  };
  roles?: {
    highest?: {
      position?: number;
    };
  };
  kickable?: boolean;
}

export interface ModuleFlags {
  family: boolean;
  applications: boolean;
  moderation: boolean;
  security: boolean;
  analytics: boolean;
  ai: boolean;
  welcome: boolean;
  automod: boolean;
  subscriptions: boolean;
  customCommands: boolean;
  music: boolean;
}

export interface WelcomeSettings {
  enabled: boolean;
  dmEnabled: boolean;
  message: string;
}

export interface VerificationSettings {
  enabled: boolean;
  questionnaireEnabled: boolean;
  roleId: string;
}

export interface ReactionRoleEntry {
  messageId: string;
  channelId: string;
  emoji: string;
  roleId: string;
}

export interface ReportScheduleSlot {
  enabled: boolean;
  channelId: string;
}

export interface ReportScheduleSettings {
  weekly: ReportScheduleSlot;
  monthly: ReportScheduleSlot;
}

export interface RoleMenuItem {
  roleId: string;
  label: string;
  emoji: string;
  description: string;
}

export interface RoleMenu {
  menuId: string;
  title: string;
  description: string;
  category: string;
  channelId: string;
  messageId: string;
  items: RoleMenuItem[];
}

export interface CustomCommandEntry {
  name: string;
  trigger: string;
  response: string;
  mode: 'contains' | 'startsWith' | 'exact';
}

export interface GuildChannels {
  panel: string;
  applications: string;
  welcome: string;
  rules: string;
  logs: string;
  disciplineLogs: string;
  updates: string;
  reports: string;
  automod: string;
}

export interface GuildRoles {
  leader: string;
  deputy: string;
  elder: string;
  member: string;
  newbie: string;
  [key: string]: string;
  mute: string;
  autorole: string;
  verification: string;
}

export interface GuildAccess {
  applications: string[];
  discipline: string[];
  ranks: string[];
}

export interface GuildVisuals {
  familyBanner: string;
  applicationsBanner: string;
}

export interface GuildFeatures {
  aiEnabled: boolean;
  autoRanksEnabled: boolean;
  leakGuardEnabled: boolean;
  channelGuardEnabled: boolean;
}

export interface GuildSettings {
  mode: BotMode;
  familyTitle: string;
  channels: GuildChannels;
  roles: GuildRoles;
  panelRoleIds: string[];
  access: GuildAccess;
  visuals: GuildVisuals;
  welcome: WelcomeSettings;
  verification: VerificationSettings;
  reactionRoles: ReactionRoleEntry[];
  reportSchedule: ReportScheduleSettings;
  roleMenus: RoleMenu[];
  customCommands: CustomCommandEntry[];
  automod: AutomodConfig;
  modules: ModuleFlags;
  features: GuildFeatures;
}

export interface GuildMaintenance {
  lastRolelessCleanupAt: string;
  lastUpdateAnnouncementId: string;
  lastCommandSignature: string;
}

export interface GuildRecord {
  guildId: string;
  guildName: string;
  ownerId: string;
  plan: SubscriptionPlan;
  setupCompleted: boolean;
  setupCompletedAt: string;
  subscriptionAssignedBy: string;
  subscriptionAssignedAt: string;
  maintenance: GuildMaintenance;
  settings: GuildSettings;
}

export interface DatabaseState {
  meta: {
    version: number;
  };
  guilds: Record<string, GuildRecord>;
}

export interface DatabaseApi {
  ensureGuild(guildId: string, defaults?: Partial<GuildRecord>): GuildRecord;
  flush(): void;
  getGuild(guildId: string): GuildRecord;
  getSubscription(guildId: string): SubscriptionPlan;
  isPremium(guildId: string): boolean;
  listGuilds(): GuildRecord[];
  markSetupComplete(guildId: string, snapshot: { guildName?: string; ownerId?: string; settings?: Partial<GuildSettings> }): GuildRecord;
  save(): void;
  setGuildSettings(guildId: string, settings: Partial<GuildSettings>): GuildRecord;
  updateGuildMaintenance(guildId: string, patch: Partial<GuildMaintenance>): GuildRecord;
  updateGuildSettings(guildId: string, patch: Partial<GuildSettings>): GuildRecord;
  setSubscription(guildId: string, payload: { plan: SubscriptionPlan; assignedBy?: string }): GuildRecord;
}

export interface MemberRecord {
  guildId?: string;
  userId?: string;
  messageCount: number;
  lastSeenAt: number;
  warns: number;
  commends: number;
  points: number;
  voiceMinutes: number;
  afkWarningSentAt: string;
}

export interface ApplicationRecord {
  id: string;
  guildId?: string;
  discordId: string;
  nickname: string;
  level: string;
  inviter: string;
  discovery: string;
  about: string;
  age: string;
  text: string;
  ticketThreadId: string;
  ticketMessageId: string;
  ticketStarterMessageId: string;
  ticketChannelId?: string;
  ticketChannelName?: string;
  ticketStatus?: 'open' | 'in_progress' | 'approved' | 'rejected' | 'closed';
  handledBy?: string;
  closedAt?: string;
  closeReason?: string;
  lastTelegramMessageAt?: number;
  pendingMessageCount?: number;
  telegramNotificationMessageId?: string;
  discordUsername?: string;
  status: ApplicationStatus | string;
  createdAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface AnnouncementRecord {
  announcementId: string;
  source: 'telegram' | 'discord' | 'system';
  type: 'announcement' | 'event';
  text: string;
  authorId: string;
  authorName: string;
  targetPlatform: 'telegram' | 'discord';
  createdAt: string;
  discordMessageId: string;
  telegramMessageId: string;
}

export interface WarnEntry {
  guildId?: string;
  userId: string;
  moderatorId: string;
  reason: string;
  createdAt: string;
}

export interface CommendEntry {
  guildId?: string;
  userId: string;
  moderatorId: string;
  reason: string;
  createdAt: string;
}

export interface BlacklistEntry {
  guildId?: string;
  userId: string;
  moderatorId: string;
  reason: string;
  createdAt: string;
  updatedAt?: string;
}

export interface DayMemberStats {
  messages: number;
  reactions: number;
  voiceMinutes: number;
}

export interface GuildDailyAnalytics {
  guildId: string;
  dayKey: string;
  joins: number;
  leaves: number;
  messagesTotal: number;
  reactionsTotal: number;
  voiceMinutesTotal: number;
  channels: Record<string, number>;
  voiceChannels: Record<string, number>;
  members: Record<string, DayMemberStats>;
}

export interface GuildPeriodAnalytics {
  guildId: string;
  dayCount: number;
  fromDayKey: string;
  toDayKey: string;
  joins: number;
  leaves: number;
  messagesTotal: number;
  reactionsTotal: number;
  voiceMinutesTotal: number;
  members: Record<string, DayMemberStats>;
  channels: Record<string, number>;
  voiceChannels: Record<string, number>;
}

export interface StoreState {
  members: Record<string, MemberRecord>;
  analytics: {
    daily: Record<string, GuildDailyAnalytics>;
    reports: Record<string, string>;
  };
  applications: ApplicationRecord[];
  announcements: AnnouncementRecord[];
  supportTickets: SupportTicketRecord[];
  supportTicketCooldowns: Record<string, number>;
  afkPanels: Record<string, AfkPanelRecord>;
  afkRequests: AfkRequestRecord[];
  cooldowns: Record<string, number>;
  warns: WarnEntry[];
  commends: CommendEntry[];
  blacklist: BlacklistEntry[];
  panelMessageId: string;
  panelMessageIds: Record<string, string>;
}

export interface AfkPanelRecord {
  guildId: string;
  channelId: string;
  messageId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AfkRequestRecord {
  id: string;
  guildId: string;
  channelId: string;
  messageId: string;
  userId: string;
  nicknameStatic: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: 'pending' | 'approved' | 'declined';
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewedByName?: string | null;
  declineReason: string | null;
  source?: 'modal' | 'message';
}

export interface SupportTicketRecord {
  channelId: string;
  channelName: string;
  userId: string;
  guildId: string;
  createdAt: string;
  status: 'open' | 'closed';
  topic: string;
  description: string;
  evidence: string;
  claimedBy: string | null;
  closedAt: string | null;
  closedBy: string | null;
  closeReason: string | null;
  firstMessageId?: string;
  addedUserIds?: string[];
}

export interface ApplicationFieldsInput {
  nickname?: string;
  level?: string;
  inviter?: string;
  discovery?: string;
  about?: string;
  age?: string;
  text?: string;
}

export type SanitizedApplicationInput =
  | { error: string }
  | {
      nickname: string;
      level: string;
      inviter: string;
      discovery: string;
      about: string;
      age: string;
      text: string;
    };

export interface StorageApi {
  getStore(): StoreState;
  save(): void;
  flush(): void;
  ensureGuildMember(guildId: string, memberId: string): MemberRecord;
  guildActivityScore(guildId: string, memberId: string): number;
  guildPointsScore(guildId: string, memberId: string): number;
  guildVoiceMinutes(guildId: string, memberId: string): number;
  sanitizeApplicationInput(fields: ApplicationFieldsInput): SanitizedApplicationInput;
  setApplicationStatus(app: ApplicationRecord, status: string, reviewerId: string): void;
  setGuildPanelMessageId(guildId: string, messageId: string, fixedMessageId?: string): void;
  getGuildPanelMessageId(guildId: string, fixedMessageId?: string): string;
  trackGuildMessage(guildId: string, memberId: string, channelId?: string): void;
  trackGuildAnalyticsMessage(guildId: string, memberId: string, channelId?: string): void;
  trackGuildPresence(guildId: string, memberId: string): void;
  addGuildWarn(payload: { guildId: string; userId: string; moderatorId: string; reason: string }): void;
  listGuildWarnsForUser(guildId: string, userId: string, limit?: number): WarnEntry[];
  clearGuildWarnsForUser(guildId: string, userId: string): number;
  addGuildCommend(payload: { guildId: string; userId: string; moderatorId: string; reason: string }): void;
  addGuildVoiceMinutes(guildId: string, memberId: string, minutes: number, channelId?: string): number;
  addGuildReaction(guildId: string, memberId: string): void;
  markGuildAfkWarningSent(guildId: string, memberId: string, value?: string): string;
  clearGuildAfkWarningSent(guildId: string, memberId: string): boolean;
  trackGuildJoin(guildId: string): number;
  trackGuildLeave(guildId: string): number;
  getGuildPeriodAnalytics(guildId: string, days?: number, now?: Date): GuildPeriodAnalytics;
  getGuildReportMarker(guildId: string, markerKey: string): string;
  setGuildReportMarker(guildId: string, markerKey: string, value: string): void;
  getGuildCooldown(guildId: string, userId: string): number;
  setGuildCooldown(guildId: string, userId: string, value?: number): void;
  createGuildApplication(payload: { guildId: string; userId: string; nickname: string; level?: string; inviter?: string; discovery?: string; about?: string; age?: string; text?: string; discordUsername?: string }): string;
  findGuildApplication(guildId: string, applicationId: string): ApplicationRecord | null;
  setApplicationTicketInfo(app: ApplicationRecord | null, ticketInfo?: Partial<Pick<ApplicationRecord, 'ticketThreadId' | 'ticketMessageId' | 'ticketStarterMessageId'>>): ApplicationRecord | null;
  listGuildRecentApplications(guildId: string, limit?: number): ApplicationRecord[];
  listGuildBlacklist(guildId: string): BlacklistEntry[];
  getGuildBlacklistEntry(guildId: string, userId: string): BlacklistEntry | null;
  isGuildBlacklisted(guildId: string, userId: string): boolean;
  addGuildBlacklistEntry(payload: { guildId: string; userId: string; moderatorId: string; reason: string }): BlacklistEntry;
  removeGuildBlacklistEntry(guildId: string, userId: string): boolean;
}

export interface GuildStorageContext {
  ensureMemberRecord(memberId: string): MemberRecord;
  getActivityScore(memberId: string): number;
  getPointsScore(memberId: string): number;
  getVoiceMinutes(memberId: string): number;
  addVoiceMinutes(memberId: string, minutes: number): number;
  addVoiceMinutesInChannel(memberId: string, minutes: number, channelId: string): number;
  recordMessage(memberId: string): void;
  recordMessageInChannel(memberId: string, channelId: string): void;
  recordAnalyticsMessage(memberId: string, channelId: string): void;
  recordPresence(memberId: string): void;
  recordReaction(memberId: string): void;
  addWarn(payload: { userId: string; moderatorId: string; reason: string }): void;
  listWarns(userId: string, limit?: number): WarnEntry[];
  clearWarns(userId: string): number;
  addCommend(payload: { userId: string; moderatorId: string; reason: string }): void;
  getCooldown(userId: string): number;
  setCooldown(userId: string, value?: number): void;
  createApplication(payload: { userId: string; nickname: string; level?: string; inviter?: string; discovery?: string; about?: string; age?: string; text?: string; discordUsername?: string }): string;
  findApplication(applicationId: string): ApplicationRecord | null;
  setApplicationTicketInfo(app: ApplicationRecord | null, ticketInfo?: Partial<Pick<ApplicationRecord, 'ticketThreadId' | 'ticketMessageId' | 'ticketStarterMessageId'>>): ApplicationRecord | null;
  listRecentApplications(limit?: number): ApplicationRecord[];
  listBlacklist(): BlacklistEntry[];
  getBlacklistEntry(userId: string): BlacklistEntry | null;
  isBlacklisted(userId: string): boolean;
  addBlacklistEntry(payload: { userId: string; moderatorId: string; reason: string }): BlacklistEntry;
  removeBlacklistEntry(userId: string): boolean;
  markAfkWarningSent(memberId: string, value?: string): string;
  clearAfkWarningSent(memberId: string): boolean;
  trackJoin(): number;
  trackLeave(): number;
  getPeriodAnalytics(days?: number, now?: Date): GuildPeriodAnalytics;
  getReportMarker(markerKey: string): string;
  setReportMarker(markerKey: string, value: string): void;
  sanitizeApplicationInput(fields: ApplicationFieldsInput): SanitizedApplicationInput;
  setApplicationStatus(app: ApplicationRecord, status: string, reviewerId: string): void;
}

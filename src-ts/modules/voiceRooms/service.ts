import {
  ChannelType,
  PermissionFlagsBits
} from 'discord.js';
import type { VoiceRoomsConfig } from '../../types';
import { VoiceRoomsStore, type VoiceRoomRecord } from './store';
import {
  buildVoiceControlPanelComponents,
  buildVoiceControlPanelEmbed,
  buildVoiceModal
} from './ui';

function ephemeral(payload: Record<string, unknown> = {}) {
  return { ...payload, flags: 64 };
}

function isVoiceRoomComponent(customId = ''): boolean {
  return customId.startsWith('vr:');
}

function userTag(user: any): string {
  return user?.tag || user?.username || user?.id || 'unknown';
}

export class VoiceRoomsService {
  private triggerChannelByGuild = new Map<string, string>();
  private cleanupTimers = new Map<string, NodeJS.Timeout>();

  constructor(
    private client: any,
    private config: VoiceRoomsConfig,
    private store: VoiceRoomsStore
  ) {}

  isEnabled(): boolean {
    return Boolean(this.config.enabled && this.config.categoryId);
  }

  stop(): void {
    for (const timer of this.cleanupTimers.values()) clearTimeout(timer);
    this.cleanupTimers.clear();
    this.store.flush();
  }

  private async sendLog(guild: any, title: string, lines: string[], color = 0x5865f2): Promise<void> {
    if (!this.config.logChannelId) return;
    const channel = await guild.channels.fetch(this.config.logChannelId).catch(() => null);
    if (!channel?.send) return;
    const { EmbedBuilder } = await import('discord.js');
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(color)
          .setTitle(title)
          .setDescription(lines.filter(Boolean).join('\n') || '—')
          .setTimestamp()
      ]
    }).catch(() => null);
  }

  private isStaff(member: any): boolean {
    if (member?.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    return this.config.staffOverrideRoleIds.some(roleId => member?.roles?.cache?.has?.(roleId));
  }

  private getRoomChannel(guild: any, channelId: string): any {
    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== ChannelType.GuildVoice) {
      throw new Error('Голосовая комната не найдена или уже удалена.');
    }
    return channel;
  }

  private async getRoomOwner(guild: any, userId: string): Promise<any> {
    return guild.members.cache.get(userId) || guild.members.fetch(userId).catch(() => null);
  }

  async ensureTriggerChannel(guild: any): Promise<string> {
    if (!this.isEnabled()) return '';
    if (this.config.triggerChannelId) {
      this.triggerChannelByGuild.set(guild.id, this.config.triggerChannelId);
      return this.config.triggerChannelId;
    }

    const category = guild.channels.cache.get(this.config.categoryId);
    if (!category || category.type !== ChannelType.GuildCategory) {
      throw new Error(`[voiceRooms] Category ${this.config.categoryId} not found`);
    }

    const existing = category.children.cache.find((channel: any) =>
      channel.type === ChannelType.GuildVoice && channel.name === this.config.triggerChannelName
    );
    if (existing) {
      this.triggerChannelByGuild.set(guild.id, existing.id);
      return existing.id;
    }

    const created = await guild.channels.create({
      name: this.config.triggerChannelName,
      type: ChannelType.GuildVoice,
      parent: this.config.categoryId,
      reason: 'Voice Rooms trigger channel'
    });
    this.triggerChannelByGuild.set(guild.id, created.id);
    return created.id;
  }

  async reconcileGuild(guild: any): Promise<void> {
    if (!this.isEnabled()) return;
    await this.ensureTriggerChannel(guild).catch(error => {
      console.error(`[voiceRooms] trigger setup failed for ${guild.id}:`, error);
    });

    let removed = 0;
    for (const room of this.store.getActiveRoomsForGuild(guild.id)) {
      const channel = guild.channels.cache.get(room.channelId);
      if (!channel || channel.type !== ChannelType.GuildVoice || channel.members.size === 0) {
        if (channel?.delete) {
          await channel.delete('Voice Rooms startup cleanup').catch(() => null);
        }
        this.store.deleteRoom(room.channelId);
        removed += 1;
      }
    }

    if (removed) {
      await this.sendLog(guild, 'Очистка Voice Rooms', [`Удалено пустых комнат: ${removed}`], 0x99aab5);
    }
  }

  async reconcileAll(): Promise<void> {
    if (!this.isEnabled()) return;
    for (const guild of this.client.guilds.cache.values()) {
      await this.reconcileGuild(guild);
    }
  }

  async handleVoiceStateUpdate(oldState: any, newState: any): Promise<boolean> {
    if (!this.isEnabled()) return false;
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return false;

    const triggerChannelId = this.triggerChannelByGuild.get(member.guild.id) || this.config.triggerChannelId;
    if (triggerChannelId && newState.channelId === triggerChannelId && oldState.channelId !== triggerChannelId) {
      await this.handleTriggerJoin(member);
      return true;
    }

    const leftChannelId = oldState.channelId;
    if (leftChannelId && leftChannelId !== newState.channelId && leftChannelId !== triggerChannelId) {
      const room = this.store.getRoomByChannelId(leftChannelId);
      if (room?.status === 'active') {
        const channel = oldState.guild.channels.cache.get(leftChannelId);
        if (!channel || channel.type !== ChannelType.GuildVoice || channel.members.size === 0) {
          this.scheduleEmptyRoomCleanup(oldState.guild, leftChannelId);
        }
      }
    }

    return false;
  }

  async handleTriggerJoin(member: any): Promise<void> {
    const guild = member.guild;
    const existing = this.store.getActiveRoomByOwner(guild.id, member.id);
    if (existing) {
      const channel = guild.channels.cache.get(existing.channelId);
      if (channel && channel.type === ChannelType.GuildVoice) {
        await member.voice.setChannel(channel).catch(() => null);
        return;
      }
      this.store.deleteRoom(existing.channelId);
    }

    const now = Date.now();
    const lastCreateAt = this.store.getLastCreateAt(member.id);
    if (lastCreateAt && now - lastCreateAt < this.config.createCooldownMs) return;

    const category = guild.channels.cache.get(this.config.categoryId);
    if (category?.children?.cache?.size >= this.config.maxRoomsInCategory) {
      await this.sendLog(guild, 'Voice Rooms: категория заполнена', [
        `Категория: ${this.config.categoryId}`,
        `Каналов: ${category.children.cache.size}`
      ], 0xf59e0b);
    }

    const room = await this.createRoomFor(member);
    this.store.setLastCreateAt(member.id, now);
    await member.voice.setChannel(room.channelId).catch(() => null);
  }

  private async createRoomFor(member: any): Promise<VoiceRoomRecord> {
    const guild = member.guild;
    const name = `Voice Room — ${member.displayName || member.user.username}`.slice(0, 100);
    const overwrites: any[] = [
      {
        id: guild.roles.everyone.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
      },
      {
        id: member.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
      },
      ...this.config.staffOverrideRoleIds.map(roleId => ({
        id: roleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak]
      }))
    ];

    const channel = await guild.channels.create({
      name,
      type: ChannelType.GuildVoice,
      parent: this.config.categoryId,
      userLimit: this.config.defaultUserLimit,
      bitrate: Math.min(this.config.defaultBitrate, guild.maximumBitrate || this.config.defaultBitrate),
      permissionOverwrites: overwrites,
      reason: `Voice Room created for ${userTag(member.user)}`
    });

    const room: VoiceRoomRecord = {
      channelId: channel.id,
      guildId: guild.id,
      ownerId: member.id,
      ownerTag: userTag(member.user),
      createdAt: Date.now(),
      status: 'active',
      locked: false,
      hidden: false
    };
    this.store.createRoom(room);
    await this.sendControlPanel(member, channel.name, channel.id);
    await this.sendLog(guild, 'Voice Room создана', [`Комната: ${channel.name}`, `Владелец: <@${member.id}>`], 0x57f287);
    return room;
  }

  private async sendControlPanel(member: any, roomName: string, channelId: string): Promise<void> {
    const message = await member.send({
      embeds: [buildVoiceControlPanelEmbed(roomName)],
      components: buildVoiceControlPanelComponents()
    }).catch(() => null);
    if (message) {
      this.store.updateRoom(channelId, {
        panelChannelId: message.channelId,
        panelMessageId: message.id
      });
    }
  }

  scheduleEmptyRoomCleanup(guild: any, channelId: string): void {
    if (this.cleanupTimers.has(channelId)) return;
    const timer = setTimeout(async () => {
      this.cleanupTimers.delete(channelId);
      const room = this.store.getRoomByChannelId(channelId);
      const channel = guild.channels.cache.get(channelId);
      if (!room || room.status !== 'active') return;
      if (channel?.type === ChannelType.GuildVoice && channel.members.size > 0) return;
      await this.deleteRoom(guild, channelId, 'комната пустая');
    }, this.config.emptyRoomGraceMs);
    this.cleanupTimers.set(channelId, timer);
  }

  async assertCanManage(guild: any, member: any, channelId: string): Promise<VoiceRoomRecord> {
    const room = this.store.getRoomByChannelId(channelId);
    if (!room || room.status !== 'active' || room.guildId !== guild.id) {
      throw new Error('Эта Voice Room не найдена или уже удалена.');
    }
    if (room.ownerId !== member.id && !this.isStaff(member)) {
      throw new Error('Вы не являетесь владельцем этой Voice Room.');
    }
    return room;
  }

  private getOwnRoom(guild: any, userId: string): VoiceRoomRecord | null {
    return this.store.getActiveRoomByOwner(guild.id, userId);
  }

  private async resolveContext(interaction: any): Promise<{ guild: any; member: any; room: VoiceRoomRecord } | null> {
    let guild = interaction.guild;
    let member = interaction.member;
    let room = guild && member ? this.getOwnRoom(guild, interaction.user.id) : null;

    if (!room) {
      room = this.store.getActiveRoomByOwnerAnyGuild(interaction.user.id);
      if (!room) return null;
      guild = this.client.guilds.cache.get(room.guildId);
      member = guild ? await this.getRoomOwner(guild, interaction.user.id) : null;
    }

    if (!guild || !member || !room) return null;
    return { guild, member, room };
  }

  async deleteRoom(guild: any, channelId: string, reason: string, actorTag = ''): Promise<void> {
    const room = this.store.getRoomByChannelId(channelId);
    const channel = guild.channels.cache.get(channelId);
    if (channel?.type === ChannelType.GuildVoice) {
      for (const member of channel.members.values()) {
        await member.voice.disconnect(reason).catch(() => null);
      }
      await channel.delete(reason).catch(() => null);
    }
    this.store.deleteRoom(channelId);
    await this.sendLog(guild, 'Voice Room удалена', [
      room ? `Владелец: <@${room.ownerId}>` : '',
      actorTag ? `Инициатор: ${actorTag}` : '',
      `Причина: ${reason}`
    ], 0xed4245);
  }

  async rename(guild: any, room: VoiceRoomRecord, name: string, actorTag: string): Promise<void> {
    const channel = this.getRoomChannel(guild, room.channelId);
    await channel.setName(name.slice(0, 100), `Voice Room renamed by ${actorTag}`);
    await this.sendLog(guild, 'Voice Room переименована', [`Новое название: ${name}`, `Инициатор: ${actorTag}`]);
  }

  async setLimit(guild: any, room: VoiceRoomRecord, limit: number, actorTag: string): Promise<void> {
    const channel = this.getRoomChannel(guild, room.channelId);
    await channel.setUserLimit(Math.max(0, Math.min(99, limit)), `Voice Room limit by ${actorTag}`);
  }

  async setBitrate(guild: any, room: VoiceRoomRecord, bitrate: number, actorTag: string): Promise<void> {
    const channel = this.getRoomChannel(guild, room.channelId);
    const ceiling = Math.min(this.config.maxBitrateCeiling, guild.maximumBitrate || this.config.maxBitrateCeiling);
    const nextBitrate = Math.max(8000, Math.min(ceiling, bitrate));
    await channel.setBitrate(nextBitrate, `Voice Room bitrate by ${actorTag}`);
  }

  async setLocked(guild: any, room: VoiceRoomRecord, locked: boolean, actorTag: string): Promise<void> {
    const channel = this.getRoomChannel(guild, room.channelId);
    await channel.permissionOverwrites.edit(guild.roles.everyone.id, { Connect: !locked }, { reason: `Voice Room ${locked ? 'locked' : 'unlocked'} by ${actorTag}` });
    this.store.updateRoom(room.channelId, { locked });
  }

  async setHidden(guild: any, room: VoiceRoomRecord, hidden: boolean, actorTag: string): Promise<void> {
    const channel = this.getRoomChannel(guild, room.channelId);
    await channel.permissionOverwrites.edit(guild.roles.everyone.id, { ViewChannel: !hidden }, { reason: `Voice Room ${hidden ? 'hidden' : 'shown'} by ${actorTag}` });
    this.store.updateRoom(room.channelId, { hidden });
  }

  async allowUser(guild: any, room: VoiceRoomRecord, target: any, actorTag: string): Promise<void> {
    const channel = this.getRoomChannel(guild, room.channelId);
    await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: true, Speak: true }, { reason: `Voice Room allowed by ${actorTag}` });
  }

  async denyUser(guild: any, room: VoiceRoomRecord, target: any, actorTag: string): Promise<void> {
    const channel = this.getRoomChannel(guild, room.channelId);
    if (target.id === room.ownerId || this.isStaff(target)) throw new Error('Нельзя убрать владельца или администратора из комнаты.');
    await channel.permissionOverwrites.delete(target.id, `Voice Room denied by ${actorTag}`).catch(() => null);
    if (target.voice?.channelId === room.channelId) await target.voice.disconnect('Voice Room access removed').catch(() => null);
  }

  async kickUser(guild: any, room: VoiceRoomRecord, target: any, actorTag: string): Promise<void> {
    if (target.id === room.ownerId || this.isStaff(target)) throw new Error('Нельзя выгнать владельца или администратора.');
    if (target.voice?.channelId !== room.channelId) throw new Error('Пользователь не находится в этой комнате.');
    await target.voice.disconnect(`Voice Room kick by ${actorTag}`);
  }

  async banUser(guild: any, room: VoiceRoomRecord, target: any, actorTag: string): Promise<void> {
    if (target.id === room.ownerId || this.isStaff(target)) throw new Error('Нельзя заблокировать владельца или администратора.');
    const channel = this.getRoomChannel(guild, room.channelId);
    await channel.permissionOverwrites.edit(target.id, { ViewChannel: false, Connect: false }, { reason: `Voice Room ban by ${actorTag}` });
    if (target.voice?.channelId === room.channelId) await target.voice.disconnect('Voice Room banned').catch(() => null);
  }

  async transferOwnership(guild: any, room: VoiceRoomRecord, target: any, actorTag: string): Promise<void> {
    if (target.user?.bot) throw new Error('Нельзя передать комнату боту.');
    if (target.voice?.channelId !== room.channelId) throw new Error('Новый владелец должен находиться в этой комнате.');
    const channel = this.getRoomChannel(guild, room.channelId);
    await channel.permissionOverwrites.delete(room.ownerId, `Voice Room transfer by ${actorTag}`).catch(() => null);
    await channel.permissionOverwrites.edit(target.id, { ViewChannel: true, Connect: true, Speak: true }, { reason: `Voice Room owner by ${actorTag}` });
    this.store.updateRoom(room.channelId, { ownerId: target.id, ownerTag: userTag(target.user) });
  }

  async handleInteraction(interaction: any): Promise<boolean> {
    if (!this.isEnabled()) return false;
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'voice') {
      await this.handleCommand(interaction);
      return true;
    }
    if (interaction.isButton?.() && isVoiceRoomComponent(interaction.customId)) {
      await this.handleButton(interaction);
      return true;
    }
    if (interaction.isModalSubmit?.() && isVoiceRoomComponent(interaction.customId)) {
      await this.handleModal(interaction);
      return true;
    }
    return false;
  }

  private async handleCommand(interaction: any): Promise<void> {
    if (!interaction.guild || !interaction.member) {
      await interaction.reply(ephemeral({ content: 'Эта команда доступна только на сервере.' }));
      return;
    }

    const room = this.getOwnRoom(interaction.guild, interaction.user.id);
    if (!room) {
      await interaction.reply(ephemeral({ content: 'У вас нет активной Voice Room. Зайдите в канал создания комнаты.' }));
      return;
    }

    const managedRoom = await this.assertCanManage(interaction.guild, interaction.member, room.channelId);
    const sub = interaction.options.getSubcommand();
    await this.runAction(interaction, interaction.guild, interaction.member, managedRoom, sub);
  }

  private async handleButton(interaction: any): Promise<void> {
    const context = await this.resolveContext(interaction);
    if (!context) {
      await interaction.reply(ephemeral({ content: 'У вас нет активной Voice Room.' }));
      return;
    }

    const { guild, member, room } = context;
    const customId = interaction.customId;
    if (customId === 'vr:delete:confirm') {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = await import('discord.js');
      await interaction.reply(ephemeral({
        content: 'Вы точно хотите удалить Voice Room?',
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('vr:delete:yes').setLabel('Да, удалить').setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId('vr:delete:no').setLabel('Отмена').setStyle(ButtonStyle.Secondary)
          )
        ]
      }));
      return;
    }
    if (customId === 'vr:delete:no') {
      await interaction.update({ content: 'Отменено.', components: [] });
      return;
    }
    if (customId === 'vr:delete:yes') {
      await this.deleteRoom(guild, room.channelId, 'удалено владельцем через панель', userTag(member.user));
      await interaction.update({ content: '🗑 Комната удалена.', components: [] });
      return;
    }

    const modalActions: Record<string, [string, string, string]> = {
      'vr:rename:modal': ['vr:rename:submit', 'Переименовать комнату', 'Новое название'],
      'vr:limit:modal': ['vr:limit:submit', 'Лимит участников', 'Число от 0 до 99'],
      'vr:bitrate:modal': ['vr:bitrate:submit', 'Битрейт', 'kbps, например 64'],
      'vr:allow:modal': ['vr:allow:submit', 'Добавить доступ', 'ID пользователя'],
      'vr:deny:modal': ['vr:deny:submit', 'Убрать доступ', 'ID пользователя'],
      'vr:kick:modal': ['vr:kick:submit', 'Выгнать пользователя', 'ID пользователя'],
      'vr:transfer:modal': ['vr:transfer:submit', 'Передать владельца', 'ID пользователя']
    };
    const modal = modalActions[customId];
    if (modal) {
      await interaction.showModal(buildVoiceModal(modal[0], modal[1], modal[2], '123456789012345678'));
      return;
    }

    const action = customId.replace('vr:', '');
    await this.runAction(interaction, guild, member, room, action, true);
  }

  private async handleModal(interaction: any): Promise<void> {
    const context = await this.resolveContext(interaction);
    if (!context) {
      await interaction.reply(ephemeral({ content: 'У вас нет активной Voice Room.' }));
      return;
    }

    const value = String(interaction.fields.getTextInputValue('value') || '').trim();
    await this.runAction(interaction, context.guild, context.member, context.room, interaction.customId.replace('vr:', '').replace(':submit', ''), true, value);
  }

  private async runAction(interaction: any, guild: any, member: any, room: VoiceRoomRecord, action: string, fromComponent = false, rawValue = ''): Promise<void> {
    try {
      const actorTag = userTag(member.user);
      if (action === 'name' || action === 'rename') {
        const value = rawValue || interaction.options.getString('название', true);
        await this.rename(guild, room, value, actorTag);
        await interaction.reply(ephemeral({ content: `Комната переименована в **${value}**.` }));
        return;
      }
      if (action === 'limit') {
        const value = rawValue ? Number(rawValue) : interaction.options.getInteger('лимит', true);
        if (!Number.isInteger(value) || value < 0 || value > 99) throw new Error('Лимит должен быть от 0 до 99.');
        await this.setLimit(guild, room, value, actorTag);
        await interaction.reply(ephemeral({ content: `Лимит установлен: ${value === 0 ? 'без лимита' : value}.` }));
        return;
      }
      if (action === 'bitrate') {
        const kbps = rawValue ? Number(rawValue) : interaction.options.getInteger('kbps', true);
        if (!Number.isInteger(kbps)) throw new Error('Битрейт должен быть числом.');
        await this.setBitrate(guild, room, kbps * 1000, actorTag);
        await interaction.reply(ephemeral({ content: `Битрейт установлен: ${kbps} kbps.` }));
        return;
      }
      if (action === 'lock' || action === 'unlock') {
        await this.setLocked(guild, room, action === 'lock', actorTag);
        await interaction.reply(ephemeral({ content: action === 'lock' ? '🔒 Комната закрыта.' : '🔓 Комната открыта.' }));
        return;
      }
      if (action === 'hide' || action === 'show') {
        await this.setHidden(guild, room, action === 'hide', actorTag);
        await interaction.reply(ephemeral({ content: action === 'hide' ? '👁 Комната скрыта.' : '🌐 Комната показана.' }));
        return;
      }
      if (action === 'delete') {
        await this.deleteRoom(guild, room.channelId, 'удалено владельцем', actorTag);
        await interaction.reply(ephemeral({ content: '🗑 Комната удалена.' }));
        return;
      }

      const target = rawValue
        ? await guild.members.fetch(rawValue).catch(() => null)
        : interaction.options.getMember('пользователь');
      if (!target) throw new Error('Пользователь не найден на сервере.');

      if (action === 'allow') await this.allowUser(guild, room, target, actorTag);
      if (action === 'deny') await this.denyUser(guild, room, target, actorTag);
      if (action === 'kick') await this.kickUser(guild, room, target, actorTag);
      if (action === 'ban') await this.banUser(guild, room, target, actorTag);
      if (action === 'transfer') await this.transferOwnership(guild, room, target, actorTag);

      const labels: Record<string, string> = {
        allow: `✅ Доступ выдан: ${userTag(target.user)}.`,
        deny: `❌ Доступ убран: ${userTag(target.user)}.`,
        kick: `👢 ${userTag(target.user)} выгнан(а).`,
        ban: `🚫 ${userTag(target.user)} заблокирован(а).`,
        transfer: `👑 Владение передано: ${userTag(target.user)}.`
      };
      await interaction.reply(ephemeral({ content: labels[action] || 'Готово.' }));
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Произошла ошибка.';
      if (fromComponent && interaction.deferred) {
        await interaction.editReply({ content: `⚠️ ${message}` }).catch(() => null);
      } else {
        await interaction.reply(ephemeral({ content: `⚠️ ${message}` })).catch(() => null);
      }
    }
  }
}

export function createVoiceRoomsService(input: { client: any; config: VoiceRoomsConfig }): VoiceRoomsService {
  return new VoiceRoomsService(input.client, input.config, new VoiceRoomsStore(input.config.dataFile));
}

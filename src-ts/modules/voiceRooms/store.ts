import { writeSnapshot } from '../../services/file-persistence';
import { readValidated, refuseEmptyRecovery } from '../../services/state-validation';

export type VoiceRoomStatus = 'active' | 'deleted';

export interface VoiceRoomRecord {
  channelId: string;
  guildId: string;
  ownerId: string;
  ownerTag: string;
  createdAt: number;
  status: VoiceRoomStatus;
  locked: boolean;
  hidden: boolean;
  panelChannelId?: string;
  panelMessageId?: string;
}

interface VoiceRoomsData {
  rooms: VoiceRoomRecord[];
  cooldowns: Record<string, number>;
}

function emptyData(): VoiceRoomsData {
  return { rooms: [], cooldowns: {} };
}

export class VoiceRoomsStore {
  private data: VoiceRoomsData = emptyData();

  constructor(private dataFile: string) {
    this.load();
  }

  private load(): void {
    const validate = (value: unknown): value is VoiceRoomsData => {
      if (!value || typeof value !== 'object') return false;
      const data = value as VoiceRoomsData;
      return Array.isArray(data.rooms) && data.rooms.every(room => room && ['channelId', 'guildId', 'ownerId', 'ownerTag'].every(key => typeof room[key as keyof VoiceRoomRecord] === 'string')
        && Number.isFinite(room.createdAt) && ['active', 'deleted'].includes(room.status) && typeof room.locked === 'boolean' && typeof room.hidden === 'boolean')
        && !!data.cooldowns && typeof data.cooldowns === 'object' && !Array.isArray(data.cooldowns) && Object.values(data.cooldowns).every(time => Number.isFinite(time) && time >= 0);
    };
    const primary = readValidated<VoiceRoomsData>(this.dataFile, validate);
    const backup = primary ? null : readValidated<VoiceRoomsData>(this.dataFile + '.bak', validate);
    if (!primary && !backup) refuseEmptyRecovery(this.dataFile);
    this.data = primary || backup || emptyData();
  }

  flush(): void { writeSnapshot(this.dataFile, JSON.stringify(this.data)); }

  createRoom(record: VoiceRoomRecord): void {
    this.data.rooms = this.data.rooms.filter(room => room.channelId !== record.channelId);
    this.data.rooms.unshift(record);
    this.flush();
  }

  getRoomByChannelId(channelId: string): VoiceRoomRecord | null {
    return this.data.rooms.find(room => room.channelId === channelId) || null;
  }

  getActiveRoomByOwner(guildId: string, ownerId: string): VoiceRoomRecord | null {
    return this.data.rooms.find(room => room.guildId === guildId && room.ownerId === ownerId && room.status === 'active') || null;
  }

  getActiveRoomByOwnerAnyGuild(ownerId: string): VoiceRoomRecord | null {
    return this.data.rooms.find(room => room.ownerId === ownerId && room.status === 'active') || null;
  }

  getActiveRoomsForGuild(guildId: string): VoiceRoomRecord[] {
    return this.data.rooms.filter(room => room.guildId === guildId && room.status === 'active');
  }

  updateRoom(channelId: string, patch: Partial<VoiceRoomRecord>): void {
    const room = this.getRoomByChannelId(channelId);
    if (!room) return;
    Object.assign(room, patch);
    this.flush();
  }

  deleteRoom(channelId: string): void {
    this.data.rooms = this.data.rooms.filter(room => room.channelId !== channelId);
    this.flush();
  }

  getLastCreateAt(userId: string): number {
    return Number(this.data.cooldowns[userId]) || 0;
  }

  setLastCreateAt(userId: string, timestamp: number): void {
    this.data.cooldowns[userId] = timestamp;
    this.flush();
  }
}

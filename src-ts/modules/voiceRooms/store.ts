import fs from 'node:fs';
import path from 'node:path';

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
    try {
      if (!fs.existsSync(this.dataFile)) {
        this.data = emptyData();
        return;
      }

      const parsed = JSON.parse(fs.readFileSync(this.dataFile, 'utf8')) as Partial<VoiceRoomsData>;
      this.data = {
        rooms: Array.isArray(parsed.rooms) ? parsed.rooms : [],
        cooldowns: parsed.cooldowns && typeof parsed.cooldowns === 'object' ? parsed.cooldowns : {}
      };
    } catch (error) {
      console.warn('[voiceRooms] failed to read store, starting with empty data:', error);
      this.data = emptyData();
    }
  }

  flush(): void {
    fs.mkdirSync(path.dirname(this.dataFile), { recursive: true });
    fs.writeFileSync(this.dataFile, JSON.stringify(this.data, null, 2));
  }

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

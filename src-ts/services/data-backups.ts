import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { validStore, validDatabase } from './state-validation';
export interface BackupSource { name: string; file: string; optional?: boolean; validate?: (value: unknown) => boolean }
interface Archive { version: number; createdAt: string; files: Array<{ name: string; sha256: string; content: string }> }
const hash = (content: string) => createHash('sha256').update(content).digest('hex');
export function createDataBackups(directory: string, sources: BackupSource[], retain = 14) {
  let last = 'ещё не создана';
  function verify(file: string): Archive {
    const archive = JSON.parse(fs.readFileSync(file, 'utf8')) as Archive;
    if (archive.version !== 1 || !Array.isArray(archive.files) || archive.files.length > sources.length) throw Error('Неверный формат или неполный backup');
    const names = new Set<string>();
    for (const entry of archive.files) {
      const source = sources.find(item => item.name === entry.name);
      if (!source || names.has(entry.name) || !/^[a-z0-9-]+$/u.test(entry.name) || typeof entry.content !== 'string' || hash(entry.content) !== entry.sha256) throw Error('Backup повреждён');
      const data: unknown = JSON.parse(entry.content);
      if (source.validate && !source.validate(data)) throw Error('Данные backup несовместимы: ' + entry.name);
      names.add(entry.name);
    }
    if (sources.some(source => !source.optional && !names.has(source.name))) throw Error('Отсутствует обязательный файл backup');
    return archive;
  }
  function restoreToEmpty(file: string, destination: string): void {
    const archive = verify(file);
    if (fs.existsSync(destination)) throw Error('Для проверки восстановления нужна новая пустая папка');
    const resolved = path.resolve(destination);
    if (sources.some(source => path.resolve(source.file).startsWith(resolved + path.sep))) throw Error('Нельзя восстанавливать поверх рабочих данных');
    fs.mkdirSync(resolved, { recursive: true, mode: 0o700 });
    for (const entry of archive.files) {
      const target = path.join(resolved, entry.name + '.json');
      fs.writeFileSync(target, entry.content, { flag: 'wx', mode: 0o600, flush: true });
      if (hash(fs.readFileSync(target, 'utf8')) !== entry.sha256) throw Error('Ошибка чтения восстановленного файла');
    }
  }
  function create(): string {
    const archive: Archive = { version: 1, createdAt: new Date().toISOString(), files: sources.filter(source => !source.optional || fs.existsSync(source.file)).map(source => {
      const content = fs.readFileSync(source.file, 'utf8');
      const data: unknown = JSON.parse(content);
      if (source.validate && !source.validate(data)) throw Error('Нельзя копировать повреждённые данные: ' + source.name);
      return { name: source.name, content, sha256: hash(content) };
    }) };
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const file = path.join(directory, 'data-' + Date.now() + '-' + randomUUID() + '.json');
    fs.writeFileSync(file + '.tmp', JSON.stringify(archive), { flag: 'wx', mode: 0o600, flush: true });
    verify(file + '.tmp'); fs.renameSync(file + '.tmp', file); last = archive.createdAt;
    const files = fs.readdirSync(directory).filter(name => /^data-\d+-[a-f0-9-]+\.json$/u.test(name)).sort().reverse();
    for (const name of files.slice(Math.max(2, retain))) fs.unlinkSync(path.join(directory, name));
    return file;
  }
  return { create, verify, restoreToEmpty, healthLines: () => ['Копия рабочих данных: ' + last] };
}
export function coreBackupSources(storage: string, database: string): BackupSource[] {
  return [{ name: 'storage', file: storage, validate: validStore }, { name: 'database', file: database, validate: value => validDatabase(value) && ((value as { meta?: { version?: unknown } }).meta?.version === undefined || (value as { meta: { version: unknown } }).meta.version === 1) }];
}
export function validateStateVersion(file: string): void {
  if (!fs.existsSync(file)) return;
  let value: { meta?: { version?: unknown } };
  try { value = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; } // Existing state recovery handles damaged JSON.
  if (!value || typeof value !== 'object') return;
  const version = value.meta?.version;
  if (version !== undefined && version !== 1) throw Error('Неподдерживаемая версия рабочих данных. Запуск остановлен до восстановления совместимой версии.');
}

export function runtimeBackupSources(storage: string, database: string, voiceRoomsFile?: string): BackupSource[] {
  return [...coreBackupSources(storage, database), ...['actions', 'admin-changes', 'discord-rate-limit', 'ai-usage'].map(name => ({ name, file: storage + '.' + name + '.json', optional: true })), ...(voiceRoomsFile ? [{ name: 'voice-rooms', file: voiceRoomsFile, optional: true }] : [])];
}

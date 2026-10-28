// Offline maintenance only. Never exports .env, browser cookies, or provider keys.
require('dotenv').config({ quiet: true });
const fs = require('node:fs');
const path = require('node:path');
const { createDataBackups, runtimeBackupSources, validateStateVersion } = require('../dist-ts/services/data-backups');
const { forgetClosedPersonalData } = require('../dist-ts/services/privacy');
const { writeSnapshot } = require('../dist-ts/services/file-persistence');
const args = process.argv.slice(2);
const option = name => args[args.indexOf(name) + 1];
try {
  const storageFile = path.resolve(process.env.STORAGE_FILE || 'dist-ts/storage.json');
  const databaseFile = path.resolve(process.env.DATABASE_FILE || 'dist-ts/database.json');
  const backups = createDataBackups(process.env.DATA_BACKUP_DIR || path.join(path.dirname(storageFile), 'data-backups'), runtimeBackupSources(storageFile, databaseFile, process.env.VOICE_ROOMS_DATA_FILE || 'data/voice-rooms.json'));
  if (args[0] === 'verify') {
    backups.verify(path.resolve(args[1])); console.log('Backup: контрольные суммы и структура проверены.');
  } else if (args[0] === 'restore-test') {
    if (!args.includes('--destination')) throw Error('Укажите --destination НОВАЯ_ПАПКА');
    backups.restoreToEmpty(path.resolve(args[1]), path.resolve(option('--destination')));
    console.log('Backup восстановлен и прочитан в отдельной папке. Рабочие данные не изменены.');
  } else if (args[0] === 'preflight') {
    validateStateVersion(databaseFile);
    backups.create(); console.log('Проверка данных и резервное копирование завершены.');
  } else if (args[0] === 'create' || args[0] === 'forget') {
    if (!args.includes('--offline')) throw Error('Остановите бот и добавьте --offline: снимок должен быть согласованным.');
    const file = backups.create();
    if (args[0] === 'forget') {
      const user = option('--user'), guild = option('--guild');
      if (!args.includes('--user') || !args.includes('--guild') || !args.includes('--confirm') || option('--confirm') !== user || !/^\d{16,20}$/u.test(user) || !/^\d{16,20}$/u.test(guild)) throw Error('Нужны --guild ID --user ID --confirm USER_ID');
      const store = JSON.parse(fs.readFileSync(storageFile, 'utf8'));
      const count = forgetClosedPersonalData(store, guild, user);
      writeSnapshot(storageFile, JSON.stringify(store));
      console.log('Удалено закрытых обращений/черновиков: ' + count + '. Активные дела, модерация и резервные копии сохранены.');
    } else console.log('Создан архив: ' + file);
  } else throw Error('Команды: create --offline | verify АРХИВ | restore-test АРХИВ --destination НОВАЯ_ПАПКА | preflight | forget --offline --guild ID --user ID --confirm ID');
} catch (error) { console.error(error instanceof Error ? error.message : 'Maintenance failed'); process.exitCode = 1; }

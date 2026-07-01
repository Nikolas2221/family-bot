const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const files = [
  path.join('dist-ts', 'ai.js'),
  path.join('dist-ts', 'automod.js'),
  path.join('dist-ts', 'applications.js'),
  path.join('dist-ts', 'commands.js'),
  path.join('dist-ts', 'config.js'),
  path.join('dist-ts', 'copy.js'),
  path.join('dist-ts', 'database.js'),
  path.join('dist-ts', 'embeds.js'),
  path.join('dist-ts', 'index.js'),
  path.join('dist-ts', 'release-notes.js'),
  path.join('dist-ts', 'ranks.js'),
  path.join('dist-ts', 'roles.js'),
  path.join('dist-ts', 'security.js'),
  path.join('dist-ts', 'storage.js'),
  path.join('tests', 'applications.test.js'),
  path.join('tests', 'automod.test.js'),
  path.join('tests', 'commands.test.js'),
  path.join('tests', 'copy-runtime.test.js'),
  path.join('tests', 'database.test.js'),
  path.join('tests', 'config.test.js'),
  path.join('tests', 'embeds.test.js'),
  path.join('tests', 'release-notes.test.js'),
  path.join('tests', 'ranks.test.js'),
  path.join('tests', 'runtime-access-helpers.test.js'),
  path.join('tests', 'runtime-automation-helpers.test.js'),
  path.join('tests', 'runtime-command-helpers.test.js'),
  path.join('tests', 'runtime-family-helpers.test.js'),
  path.join('tests', 'runtime-lifecycle-helpers.test.js'),
  path.join('tests', 'runtime-notification-helpers.test.js'),
  path.join('tests', 'storage.test.js'),
  path.join('tests', 'ts-migration.test.js'),
  path.join('tests', 'run.js')
];

for (const relativePath of files) {
  const absolutePath = path.join(root, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  new vm.Script(source, { filename: absolutePath });
  console.log(`CHECK ${relativePath}`);
}

const { main } = require(path.join(root, 'tests', 'run.js'));

Promise.resolve(main())
  .then(() => {
    console.log('CHECK OK');
  })
  .catch(error => {
    console.error(error);
    process.exit(1);
  });

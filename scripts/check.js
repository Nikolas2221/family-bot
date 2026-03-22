const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const files = [
  'ai.js',
  'applications.js',
  'commands.js',
  'config.js',
  'copy.js',
  'database.js',
  'embeds.js',
  'index.js',
  'ranks.js',
  'roles.js',
  'storage.js',
  path.join('tests', 'applications.test.js'),
  path.join('tests', 'database.test.js'),
  path.join('tests', 'config.test.js'),
  path.join('tests', 'embeds.test.js'),
  path.join('tests', 'ranks.test.js'),
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

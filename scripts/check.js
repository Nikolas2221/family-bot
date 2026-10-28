const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
function javascriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? javascriptFiles(file) : entry.name.endsWith('.js') ? [path.relative(root, file)] : [];
  });
}
const files = ['dist-ts', 'scripts', 'tests'].flatMap(directory => javascriptFiles(path.join(root, directory)));


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

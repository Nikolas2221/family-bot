const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
function missingPeers(lock) {
  const missing = [];
  for (const [key, item] of Object.entries(lock.packages || {})) {
    for (const peer of Object.keys(item.peerDependencies || {})) {
      if (item.peerDependenciesMeta?.[peer]?.optional) continue;
      let directory = key, found = false;
      while (true) {
        if (lock.packages[(directory ? directory + '/' : '') + 'node_modules/' + peer]) { found = true; break; }
        if (!directory) break;
        const index = directory.lastIndexOf('/node_modules/');
        directory = index >= 0 ? directory.slice(0, index) : '';
      }
      if (!found) missing.push(key + ' -> ' + peer);
    }
  }
  return missing;
}
async function main() {
  const lock = JSON.parse(fs.readFileSync(path.resolve(__dirname, '../package-lock.json'), 'utf8'));
  assert.deepEqual(missingPeers(lock), [], 'lock file must contain required peers even for optional platform packages');
  const incomplete = structuredClone(lock);
  delete incomplete.packages['node_modules/@emnapi/core'];
  assert.ok(missingPeers(incomplete).some(item => item.endsWith(' -> @emnapi/core')), 'detect the Linux CI failure before installation');
  console.log('PASS lockfile required peer dependencies, including optional voice/WASM platforms');
}
module.exports = { main };

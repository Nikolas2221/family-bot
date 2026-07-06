const assert = require('node:assert/strict');

const { replaceLegacyBrandText } = require('../dist-ts/services/brand-refresh');

async function main() {
  assert.equal(replaceLegacyBrandText('BRHD - Phoenix - Maintenance'), 'KLAIZ - Maintenance');
  assert.equal(replaceLegacyBrandText('BRHD • Phoenix • AI Advisor'), 'KLAIZ • AI Advisor');
  assert.equal(replaceLegacyBrandText('BRHD / Phoenix / Moderation'), 'KLAIZ / Moderation');
  assert.equal(replaceLegacyBrandText('полноценный релиз BRHD/PHOENIX 1.0'), 'полноценный релиз KLAIZ 1.0');
  assert.equal(replaceLegacyBrandText('Phoenix Intake'), 'KLAIZ Intake');
  console.log('ALL BRAND REFRESH TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };

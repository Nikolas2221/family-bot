const assert = require('node:assert/strict');
const {
  REPORT_REQUEST_DEFINITIONS,
  buildReportRequestModal,
  buildReportRequestPanel
} = require('../dist-ts/report-requests-ui');

async function main() {
  const types = Object.keys(REPORT_REQUEST_DEFINITIONS);
  assert.deepEqual(types, ['up_rank', 'contracts', 'payouts']);

  for (const type of types) {
    const panel = buildReportRequestPanel(type, {
      targetChannelId: '111111111111111111',
      logChannelId: '222222222222222222'
    });
    const button = panel.components[0].toJSON().components[0];
    assert.equal(button.custom_id, `report_request_open:${type}`);

    const modal = buildReportRequestModal(type).toJSON();
    assert.equal(modal.custom_id, `report_request_modal:${type}`);
    assert.equal(modal.components.length, 5);
  }

  console.log('ALL REPORT REQUEST UI TESTS PASSED');
}

if (require.main === module) {
  main().catch(error => {
    console.error(error);
    process.exit(1);
  });
}

module.exports = { main };

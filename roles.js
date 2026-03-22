const copy = require('./copy');

module.exports = [
  { key: 'leader', envKey: 'ROLE_LEADER', id: process.env.ROLE_LEADER, name: copy.roles.leader },
  { key: 'deputy', envKey: 'ROLE_DEPUTY', id: process.env.ROLE_DEPUTY, name: copy.roles.deputy },
  { key: 'elder', envKey: 'ROLE_ELDER', id: process.env.ROLE_ELDER, name: copy.roles.elder },
  { key: 'member', envKey: 'ROLE_MEMBER', id: process.env.ROLE_MEMBER, name: copy.roles.member },
  { key: 'newbie', envKey: 'ROLE_NEWBIE', id: process.env.ROLE_NEWBIE, name: copy.roles.newbie }
];

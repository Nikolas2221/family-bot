import copy from './copy';
import type { RoleDefinition } from './types';

export const roles: RoleDefinition[] = [
  { key: 'rank15', envKey: 'ROLE_RANK_15', id: process.env.ROLE_RANK_15, name: '15 ранг' },
  { key: 'rank14', envKey: 'ROLE_RANK_14', id: process.env.ROLE_RANK_14, name: '14 ранг' },
  { key: 'rank13', envKey: 'ROLE_RANK_13', id: process.env.ROLE_RANK_13, name: '13 ранг' },
  { key: 'rank12', envKey: 'ROLE_RANK_12', id: process.env.ROLE_RANK_12, name: '12 ранг' },
  { key: 'rank11', envKey: 'ROLE_RANK_11', id: process.env.ROLE_RANK_11, name: '11 ранг' },
  { key: 'rank10', envKey: 'ROLE_RANK_10', id: process.env.ROLE_RANK_10, name: '10 ранг' },
  { key: 'rank9', envKey: 'ROLE_RANK_9', id: process.env.ROLE_RANK_9, name: '9 ранг' },
  { key: 'rank8', envKey: 'ROLE_RANK_8', id: process.env.ROLE_RANK_8, name: '8 ранг' },
  { key: 'rank7', envKey: 'ROLE_RANK_7', id: process.env.ROLE_RANK_7, name: '7 ранг' },
  { key: 'rank6', envKey: 'ROLE_RANK_6', id: process.env.ROLE_RANK_6, name: '6 ранг' },
  { key: 'leader', envKey: 'ROLE_LEADER', id: process.env.ROLE_LEADER, name: copy.roles.leader },
  { key: 'deputy', envKey: 'ROLE_DEPUTY', id: process.env.ROLE_DEPUTY, name: copy.roles.deputy },
  { key: 'elder', envKey: 'ROLE_ELDER', id: process.env.ROLE_ELDER, name: copy.roles.elder },
  { key: 'member', envKey: 'ROLE_MEMBER', id: process.env.ROLE_MEMBER, name: copy.roles.member },
  { key: 'newbie', envKey: 'ROLE_NEWBIE', id: process.env.ROLE_NEWBIE, name: copy.roles.newbie }
];

export default roles;

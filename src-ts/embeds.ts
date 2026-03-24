import type { EmbedsApi } from './types';

const embedsJs = require('../embeds') as EmbedsApi;

export const embeds = embedsJs;
export const panelButtons = embedsJs.panelButtons;
export default embedsJs;

export type { EmbedsApi };

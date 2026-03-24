import type { CopyCatalog } from './types';

const copyJs = require('../copy') as CopyCatalog;

export const copy = copyJs;
export default copyJs;

export type { CopyCatalog };

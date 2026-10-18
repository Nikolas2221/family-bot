import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import type { ReleaseNoteGroups } from '../types';

export interface UpdateArtworkInput {
  semver: string;
  buildId: string;
  changeLines?: Partial<ReleaseNoteGroups>;
  title?: string;
  footer?: string;
  color?: string;
}
export type UpdateArtworkRenderer = (input: UpdateArtworkInput) => Promise<Buffer>;
const escape = (value: string) => value.replace(/[&<>"']/gu, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[character]!));

export function updateArtworkHtml(input: UpdateArtworkInput, banner: Buffer): string {
  const groups = input.changeLines || {};
  const color = /^#[0-9a-f]{6}$/iu.test(input.color || '') ? input.color : '#ff71bc';
  const sections = (['added', 'updated', 'fixed'] as const).map((key, index) => {
    const lines = (groups[key] || []).map(value => String(value).trim()).filter(Boolean).slice(0, 8);
    if (!lines.length) return '';
    return `<section class="group group-${index}"><h2>${['ДОБАВЛЕНО', 'ОБНОВЛЕНО', 'ИСПРАВЛЕНО'][index]}</h2><ul>${lines.map(line => `<li>${escape(line.slice(0, 280))}</li>`).join('')}</ul></section>`;
  }).join('');
  if (!sections) throw new Error('Update artwork requires release notes.');
  return `<!doctype html><html lang="ru"><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;background:#17131f;color:#fff;font-family:Arial,"Liberation Sans",sans-serif;letter-spacing:0}
    article{width:1100px}img{display:block;width:1100px;height:550px;object-fit:cover}
    main{padding:38px 58px 30px;border-top:4px solid ${color}}
    h1{font-size:54px;line-height:1.12;margin:0 0 16px;font-weight:900;overflow-wrap:anywhere}
    .meta{color:#bbb3c7;font-size:20px;margin-bottom:26px;overflow-wrap:anywhere}
    section{padding:24px 0;border-top:2px solid #32dfeb}section.group-1{border-color:${color}}
    h2{font-size:29px;line-height:1.2;margin:0 0 14px;color:#32dfeb}.group-1 h2{color:${color}}
    ul{margin:0;padding-left:25px}li{font-size:27px;line-height:1.38;margin:9px 0;overflow-wrap:anywhere}
    footer{border-top:1px solid ${color};padding-top:22px;margin-top:8px;color:#d4cadc;font-size:17px;text-align:center;overflow-wrap:anywhere}
    </style><article><img alt="KLAIZ Vice City Edition, Jason and Lucia" src="data:image/png;base64,${banner.toString('base64')}"><main>
    <h1>${escape((input.title || `ОБНОВЛЕНИЕ ${input.semver}`).slice(0, 180))}</h1>
    <div class="meta">Версия ${escape(input.semver.slice(0, 40))} · Сборка ${escape(input.buildId.slice(0, 40))}</div>
    ${sections}<footer>${escape((input.footer || 'KLAIZ · VICE CITY EDITION · ОБНОВЛЕНИЯ').slice(0, 180))}</footer>
    </main></article></html>`;
}

// Shared single-flight cache avoids one Chromium launch per guild/platform.
export function createUpdateArtworkRenderer(): UpdateArtworkRenderer {
  const cache = new Map<string, Promise<Buffer>>();
  let tail: Promise<unknown> = Promise.resolve();
  return input => {
    const key = JSON.stringify(input);
    const existing = cache.get(key);
    if (existing) return existing;
    const work = tail.then(async () => {
      const banner = fs.readFileSync(path.resolve(__dirname, '../../assets/vice-city/banner.png'));
      const html = updateArtworkHtml(input, banner);
      const browser = await chromium.launch({ headless: true, timeout: 15000 });
      try {
        const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, deviceScaleFactor: 1 });
        await page.route('**/*', route => route.abort());
        await page.setContent(html, { waitUntil: 'load', timeout: 10000 });
        await page.evaluate(() => document.fonts.ready);
        return await page.locator('article').screenshot({ type: 'png', timeout: 10000 });
      } finally { await browser.close(); }
    });
    cache.set(key, work);
    while (cache.size > 8) cache.delete(cache.keys().next().value!);
    tail = work.catch(() => undefined);
    void work.catch(() => { cache.delete(key); });
    return work;
  };
}

import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : '@playwright/test');
const root = fileURLToPath(new URL('../', import.meta.url));
const source = await readFile(path.join(root, 'docs/brand/icon.svg'), 'utf8');
const sizes = [16, 32, 48, 128];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 800, height: 420 }, deviceScaleFactor: 1 });
  const images = [];
  for (const size of sizes) {
    const { dataURL, bounds } = await page.evaluate(async ({ source, size }) => {
      const image = new Image();
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(source)}`;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0, size, size);
      const pixels = ctx.getImageData(0, 0, size, size).data;
      const bounds = { left: size, top: size, right: -1, bottom: -1 };
      for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
        if (pixels[(y * size + x) * 4 + 3] === 0) continue;
        bounds.left = Math.min(bounds.left, x); bounds.top = Math.min(bounds.top, y);
        bounds.right = Math.max(bounds.right, x); bounds.bottom = Math.max(bounds.bottom, y);
      }
      return { dataURL: canvas.toDataURL('image/png'), bounds };
    }, { source, size });
    const padding = size / 8;
    assert.deepEqual(bounds, { left: padding, top: padding, right: size - padding - 1, bottom: size - padding - 1 });
    const png = Buffer.from(dataURL.split(',')[1], 'base64');
    assert.equal(png.readUInt32BE(16), size);
    assert.equal(png.readUInt32BE(20), size);
    assert.equal(png[25], 6, 'Expected RGBA PNG');
    await writeFile(path.join(root, `extension/icons/${size}.png`), png);
    images.push({ size, dataURL });
    console.log(`${size}px RGBA icon: verified ${padding}px transparent padding`);
  }
  // Review sheet uses the actual exported PNGs at their native sizes.
  await page.setContent(`<style>
    *{box-sizing:border-box}body{margin:0;font:14px system-ui}
    section{height:210px;padding:24px 36px;display:flex;align-items:center;gap:38px}
    .light{background:#f6f7fb;color:#26344a}.dark{background:#191a20;color:#e6ebf5}
    h2{font-size:18px;width:130px}figure{margin:0;width:90px;text-align:center}
    .icon{height:132px;display:flex;align-items:center;justify-content:center}figcaption{font-size:12px}
    </style>${['light','dark'].map(theme => `<section class="${theme}"><h2>TabStash<br>${theme} background</h2>${images.map(({size,dataURL}) => `<figure><div class="icon"><img src="${dataURL}" width="${size}" height="${size}" alt="TabStash icon"></div><figcaption>${size} × ${size}</figcaption></figure>`).join('')}</section>`).join('')}`);
  await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.images].map(image => image.decode())); });
  await page.screenshot({ path: path.join(root, 'docs/store/icon-preview.png') });
} finally {
  await browser.close();
}

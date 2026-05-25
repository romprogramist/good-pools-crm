import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

function buildSvg(size: number, contentScale: number): Buffer {
  const padding = (1 - contentScale) / 2;
  const innerOffset = size * padding;
  const innerSize = size * contentScale;
  const cornerRadius = size * 0.18;
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#14b8a6"/>
      <stop offset="100%" stop-color="#0891b2"/>
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${cornerRadius}" fill="url(#g)"/>
  <g transform="translate(${innerOffset},${innerOffset}) scale(${innerSize / 24})" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none">
    <path d="M2 17c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/>
    <path d="M2 21c2 1 4 1 6 0s4-1 6 0 4 1 6 0"/>
    <path d="M6 8a4 4 0 0 1 8 0v8"/>
    <path d="M14 8h4"/>
    <circle cx="14" cy="8" r="1.4" fill="white" stroke="none"/>
  </g>
</svg>`);
}

async function render(svg: Buffer, outPath: string, size: number) {
  await mkdir(dirname(outPath), { recursive: true });
  await sharp(svg).resize(size, size).png().toFile(outPath);
  console.log(`wrote ${outPath}`);
}

(async () => {
  await render(buildSvg(192, 0.7), "public/icon-192.png", 192);
  await render(buildSvg(512, 0.7), "public/icon-512.png", 512);
  await render(buildSvg(512, 0.5), "public/icon-512-maskable.png", 512);
})().catch((err) => { console.error(err); process.exit(1); });

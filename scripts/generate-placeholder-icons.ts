import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname } from "node:path";

const teal = { r: 13, g: 148, b: 136, alpha: 1 };

async function make(path: string, size: number) {
  await mkdir(dirname(path), { recursive: true });
  await sharp({ create: { width: size, height: size, channels: 4, background: teal } })
    .png()
    .toFile(path);
  console.log(`wrote ${path}`);
}

(async () => {
  await make("public/icon-192.png", 192);
  await make("public/badge-72.png", 72);
})().catch((err) => { console.error(err); process.exit(1); });

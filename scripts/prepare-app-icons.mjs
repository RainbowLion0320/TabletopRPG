import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Package the illustrated game icon and its separately drawn themed silhouette.
const root = path.resolve(import.meta.dirname, '..');
const art = path.join(root, 'assets/ui/app-icon');
const res = path.join(root, 'android/app/src/main/res');
const web = path.join(root, 'public/icons');
const background = { r: 19, g: 37, b: 58 };
const square = await sharp(path.join(art, 'icon-square.png')).flatten({ background }).png().toBuffer();
const monochrome = await sharp(path.join(art, 'icon-monochrome.png')).trim().png().toBuffer();
if ((await sharp(monochrome).stats()).isOpaque) throw new Error('The themed icon must have a transparent silhouette background.');

function mask(size, round) {
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${round ? size / 2 : size * .13}" fill="white"/></svg>`);
}

// Color art fills the normal 72dp viewport; themed art fits the 66dp safe area.
for (const [density, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
  const folder = path.join(res, `mipmap-${density}`);
  await fs.mkdir(folder, { recursive: true });
  const legacySize = Math.round(48 * scale), layerSize = Math.round(108 * scale), safeSize = Math.round(66 * scale);
  for (const round of [false, true]) {
    await sharp(square).resize(legacySize, legacySize).ensureAlpha()
      .composite([{ input: mask(legacySize, round), blend: 'dest-in' }]).png()
      .toFile(path.join(folder, round ? 'ic_launcher_round.png' : 'ic_launcher.png'));
  }
  const painting = await sharp(square).resize(Math.round(72 * scale), Math.round(72 * scale)).png().toBuffer();
  await sharp({ create: { width: layerSize, height: layerSize, channels: 4, background: '#00000000' } })
    .composite([{ input: painting, gravity: 'centre' }]).png().toFile(path.join(folder, 'ic_launcher_foreground.png'));
  const silhouette = await sharp(monochrome).resize(safeSize, safeSize, { fit: 'contain', background: '#00000000' }).png().toBuffer();
  await sharp({ create: { width: layerSize, height: layerSize, channels: 4, background: '#00000000' } })
    .composite([{ input: silhouette, gravity: 'centre' }]).png().toFile(path.join(folder, 'ic_launcher_monochrome.png'));
}

await fs.mkdir(web, { recursive: true });
await sharp(square).resize(180, 180).png().toFile(path.join(web, 'apple-touch-icon.png'));
// A standard multi-resolution ICO avoids a tiny tab loading a full-size PNG.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(square).resize(size, size).ensureAlpha()
  .composite([{ input: mask(size, false), blend: 'dest-in' }]).png().toBuffer()));
const header = Buffer.alloc(6 + images.length * 16);
header.writeUInt16LE(1, 2); header.writeUInt16LE(images.length, 4);
let offset = header.length;
images.forEach((buffer, index) => {
  const start = 6 + index * 16;
  header[start] = sizes[index]; header[start + 1] = sizes[index];
  header.writeUInt16LE(1, start + 4); header.writeUInt16LE(32, start + 6);
  header.writeUInt32LE(buffer.length, start + 8); header.writeUInt32LE(offset, start + 12);
  offset += buffer.length;
});
await fs.writeFile(path.join(web, 'favicon.ico'), Buffer.concat([header, ...images]));
console.log('Generated color detective-game icons and a separate safe-area themed silhouette.');

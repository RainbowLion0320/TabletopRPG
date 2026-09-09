import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Package the supplied flat-color artwork; retain its geometry and antialiasing.
const root = path.resolve(import.meta.dirname, '..');
const art = path.join(root, 'assets/ui/app-icon');
const res = path.join(root, 'android/app/src/main/res');
const web = path.join(root, 'public/icons');
const background = { r: 19, g: 37, b: 58 };
const square = await sharp(path.join(art, 'icon-square.png')).flatten({ background }).png().toBuffer();
const rounded = path.join(art, 'icon-rounded.png');
const { data, info } = await sharp(path.join(art, 'icon-square.png')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// The source has only white artwork on #13253a. Recover the original symbol's
// coverage as alpha, including its blue eye opening, for adaptive/themed icons.
const symbol = Buffer.alloc(info.width * info.height * 4, 255);
let left = info.width, top = info.height, right = -1, bottom = -1;
for (let i = 0; i < data.length; i += 4) {
  const alpha = Math.round(Math.max(0, (data[i] - background.r) / (255 - background.r)) * data[i + 3]);
  symbol[i + 3] = alpha;
  if (alpha > 0) {
    const x = (i / 4) % info.width, y = Math.floor(i / 4 / info.width);
    left = Math.min(left, x); right = Math.max(right, x);
    top = Math.min(top, y); bottom = Math.max(bottom, y);
  }
}
if (right <= left || bottom <= top) throw new Error('The supplied icon has no visible symbol.');
const foreground = await sharp(symbol, { raw: { width: info.width, height: info.height, channels: 4 } })
  .extract({ left, top, width: right - left + 1, height: bottom - top + 1 }).png().toBuffer();

// Android layers are 108dp; put all artwork inside the centered 66dp safe area.
for (const [density, scale] of [['mdpi', 1], ['hdpi', 1.5], ['xhdpi', 2], ['xxhdpi', 3], ['xxxhdpi', 4]]) {
  const folder = path.join(res, `mipmap-${density}`);
  await fs.mkdir(folder, { recursive: true });
  const legacySize = Math.round(48 * scale), layerSize = Math.round(108 * scale), safeSize = Math.round(66 * scale);
  await sharp(rounded).resize(legacySize, legacySize).png().toFile(path.join(folder, 'ic_launcher.png'));
  // Circular fallback for Android 7 launchers. Mask the delivered square export.
  const circle = Buffer.alloc(legacySize * legacySize * 4, 255);
  for (let y = 0; y < legacySize; y++) for (let x = 0; x < legacySize; x++) {
    const distance = Math.hypot(x + .5 - legacySize / 2, y + .5 - legacySize / 2);
    circle[(y * legacySize + x) * 4 + 3] = Math.round(255 * Math.max(0, Math.min(1, legacySize / 2 - distance + .5)));
  }
  await sharp(square).resize(legacySize, legacySize).composite([{ input: circle, raw: { width: legacySize, height: legacySize, channels: 4 }, blend: 'dest-in' }])
    .png().toFile(path.join(folder, 'ic_launcher_round.png'));
  const logo = await sharp(foreground).resize(safeSize, safeSize, { fit: 'contain', background: '#00000000' }).png().toBuffer();
  await sharp({ create: { width: layerSize, height: layerSize, channels: 4, background: '#00000000' } })
    .composite([{ input: logo, gravity: 'centre' }]).png().toFile(path.join(folder, 'ic_launcher_foreground.png'));
}

await fs.mkdir(web, { recursive: true });
await sharp(square).resize(180, 180).png().toFile(path.join(web, 'apple-touch-icon.png'));
// A standard multi-resolution ICO avoids a tiny tab loading a full-size PNG.
const sizes = [16, 32, 48];
const images = await Promise.all(sizes.map(size => sharp(rounded).resize(size, size).png().toBuffer()));
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
console.log('Generated Android legacy, adaptive, themed and web icons from the supplied artwork.');

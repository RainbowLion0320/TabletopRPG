import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

// Packaging of the selected single frame: remove only its plain outside margin.
// The generated source stays outside Git; keep corner geometry for nine-slicing.
const source = process.argv[2];
if (!source) throw new Error('Usage: node scripts/prepare-ui-art.mjs <generated-frame.png>');
const output = path.resolve(import.meta.dirname, '../assets/ui/chrome');
await fs.mkdir(output, { recursive: true });
await sharp(source).extract({ left: 0, top: 74, width: 1983, height: 646 })
  .resize({ width: 960 }).webp({ quality: 90, effort: 6 }).toFile(path.join(output, 'brass-frame.webp'));
// Quiet inner material is tiled at native scale, never stretched across a screen.
await sharp(source).extract({ left: 900, top: 310, width: 256, height: 256 })
  .resize(128, 128).webp({ quality: 82, effort: 6 }).toFile(path.join(output, 'leather-grain.webp'));

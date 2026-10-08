import path from 'node:path';
import sharp from 'sharp';

// Convert the selected Image Gen assets for shipping, preserving their corner geometry.
const [dossier, primary] = process.argv.slice(2);
if (!dossier || !primary) throw new Error('Usage: node scripts/prepare-dossier-art.mjs <dossier.png> <primary.png>');
const directory = path.resolve(import.meta.dirname, '../assets/ui/chrome');
await sharp(dossier).resize({ width: 768 }).webp({ quality: 86, effort: 6 })
  .toFile(path.join(directory, 'dossier-mount.webp'));
await sharp(primary).trim({ background: '#000000', threshold: 15 }).resize({ width: 960 })
  .webp({ quality: 88, effort: 6 }).toFile(path.join(directory, 'primary-brass.webp'));

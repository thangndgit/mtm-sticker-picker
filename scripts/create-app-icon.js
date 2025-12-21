import sharp from 'sharp';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

async function createAppIcons() {
  const sourceIcon = join(rootDir, 'icons', 'ms-icon-310x310.png');
  
  // Tạo icon 512x512 cho macOS
  const macIcon512 = join(rootDir, 'icons', 'app-icon-512x512.png');
  await sharp(sourceIcon)
    .resize(512, 512, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toFile(macIcon512);
  console.log('Created:', macIcon512);
  
  // Tạo icon 256x256 cho Windows (từ ico sẽ được tạo tự động)
  const winIcon256 = join(rootDir, 'icons', 'app-icon-256x256.png');
  await sharp(sourceIcon)
    .resize(256, 256, { fit: 'contain', background: { r: 255, g: 255, b: 255, alpha: 0 } })
    .toFile(winIcon256);
  console.log('Created:', winIcon256);
}

createAppIcons().catch(console.error);


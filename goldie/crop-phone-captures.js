// Crop phone captures (1080x2424, 20:9) to Play's 9:16 tile (1080x1920),
// bottom-aligned so the content cards and tab bar stay and the status bar
// area drops — matches what goldie's cover-crop would show in the tile.
// Also writes the capture manifest goldie's frame step expects.

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const RAW = path.join(__dirname, 'out', 'raw', 'pixel-10-pro');
const SCENES = ['home', 'queue', 'analytics', 'settings'];
const OUT_W = 1080;
const OUT_H = 1920;

(async () => {
  for (const scene of SCENES) {
    const src = path.join(RAW, scene + '.png');
    if (!fs.existsSync(src)) {
      console.error('missing raw capture:', src);
      process.exitCode = 1;
      continue;
    }
    const meta = await sharp(src).metadata();
    const left = Math.floor((meta.width - OUT_W) / 2);
    const top = Math.max(0, meta.height - OUT_H); // bottom-aligned crop
    await sharp(src)
      .extract({ left, top, width: OUT_W, height: OUT_H })
      .png()
      .toFile(src.replace('.png', '.tmp.png'));
    fs.renameSync(src.replace('.png', '.tmp.png'), src);
    console.log(scene, '->', OUT_W + 'x' + OUT_H, '(crop top', top + ')');
  }

  const manifest = {
    device: 'pixel-10-pro',
    udid: '57181JEBF06705',
    capturedAt: new Date().toISOString(),
    screenshots: SCENES.map((scene) => ({ sceneId: scene, file: path.join(RAW, scene + '.png') })),
    preview: null,
  };
  fs.writeFileSync(path.join(RAW, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('manifest written');
})();

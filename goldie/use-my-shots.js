// use-my-shots.js — swap YOUR OWN screenshots into the goldie template.
//
// Workflow:
//   1. Take screenshots on your phone however you want (power + volume-down).
//   2. Drop them in   goldie/my-shots/   named by scene:
//        home.png  queue.png  analytics.png  settings.png  compose.png
//      (.jpg also works. Extra scenes in the config use their scene id as
//      the filename, e.g. onboarding.png.)
//   3. Run:  node goldie/use-my-shots.js
//   4. Run:  npx goldie frame   (from the goldie/ folder, config env set)
//      → fresh framed tiles with the same bezel, gradient, and headlines.
//
// Screenshots are auto-cropped to Play's 1080x1920 (bottom-aligned so the
// tab bar and cards survive; works for any input size). The capture
// manifest is rewritten automatically — no adb, no emulator, no goldie
// capture step needed.

const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const GOLDIE = __dirname;
const IN_DIR = path.join(GOLDIE, 'my-shots');
const RAW = path.join(GOLDIE, 'out', 'raw', 'pixel-10-pro');
const OUT_W = 1080;
const OUT_H = 1920;

// Scene ids must match goldie.config.ts scenes[].id
const SCENES = ['home', 'queue', 'analytics', 'settings', 'compose'];

(async () => {
  if (!fs.existsSync(IN_DIR)) {
    fs.mkdirSync(IN_DIR, { recursive: true });
    console.log('Created', IN_DIR);
    console.log('Drop your screenshots there as: ' + SCENES.join('.png, ') + '.png, then run this again.');
    return;
  }

  const files = fs.readdirSync(IN_DIR).filter((f) => /\.(png|jpe?g)$/i.test(f));
  if (!files.length) {
    console.log('No screenshots found in', IN_DIR);
    console.log('Name them by scene: ' + SCENES.join('.png / ') + '.png');
    return;
  }

  fs.mkdirSync(RAW, { recursive: true });
  const used = [];

  for (const file of files) {
    const scene = path.basename(file).replace(/\.(png|jpe?g)$/i, '').toLowerCase();
    if (!SCENES.includes(scene)) {
      console.log('skip (unknown scene name):', file, '— expected one of:', SCENES.join(', '));
      continue;
    }
    const src = path.join(IN_DIR, file);
    const dest = path.join(RAW, scene + '.png');
    const meta = await sharp(src).metadata();

    // Cover-crop to 1080x1920, bottom-aligned (keeps the tab bar + cards).
    const scale = Math.max(OUT_W / meta.width, OUT_H / meta.height);
    const scaledW = Math.round(meta.width * scale);
    const scaledH = Math.round(meta.height * scale);
    const left = Math.floor((scaledW - OUT_W) / 2);
    const top = Math.max(0, scaledH - OUT_H);

    await sharp(src)
      .resize(scaledW, scaledH)
      .extract({ left, top, width: OUT_W, height: OUT_H })
      .png()
      .toFile(dest);
    used.push(scene);
    console.log(`${scene}: ${file} (${meta.width}x${meta.height}) -> ${OUT_W}x${OUT_H}`);
  }

  if (!used.length) {
    console.log('Nothing usable found — name files by scene: ' + SCENES.join('.png, ') + '.png');
    process.exitCode = 1;
    return;
  }

  const manifest = {
    device: 'pixel-10-pro',
    udid: 'my-shots',
    capturedAt: new Date().toISOString(),
    screenshots: used.map((scene) => ({ sceneId: scene, file: path.join(RAW, scene + '.png') })),
    preview: null,
  };
  fs.writeFileSync(path.join(RAW, 'manifest.json'), JSON.stringify(manifest, null, 2));
  console.log('\nManifest updated with scenes:', used.join(', '));
  console.log('\nNext step:\n  cd goldie');
  console.log('  set GOLDIE_CONFIG=' + path.join(GOLDIE, 'goldie.config.ts'));
  console.log('  npx -y goldie@0 frame\n');
})();

// Builds the Play Store feature graphic (1024x512, required for the listing)
// from brand assets. Run: cd goldie && node make-feature-graphic.js
const sharp = require('sharp');
const path = require('path');

const W = 1024, H = 512;
const ICON = path.join(__dirname, '..', 'appsurgeicon-fullbleed.png');
const OUT = path.join(__dirname, 'out', 'feature-graphic.png');

(async () => {
  const icon = await sharp(ICON).resize(150, 150).png().toBuffer();

  const svg = Buffer.from(`<svg width='${W}' height='${H}' xmlns='http://www.w3.org/2000/svg'>
    <defs>
      <radialGradient id='glow' cx='78%' cy='18%' r='85%'>
        <stop offset='0%' stop-color='#6F9BCD' stop-opacity='0.30'/>
        <stop offset='55%' stop-color='#6F9BCD' stop-opacity='0.06'/>
        <stop offset='100%' stop-color='#6F9BCD' stop-opacity='0'/>
      </radialGradient>
    </defs>
    <rect width='${W}' height='${H}' fill='#FAF6F0'/>
    <rect width='${W}' height='${H}' fill='url(#glow)'/>
    <text x='58' y='205' font-family='Segoe UI, Helvetica, Arial, sans-serif' font-size='84' font-weight='800' fill='#1A1A1A' letter-spacing='-2'>Appsurge</text>
    <text x='60' y='262' font-family='Segoe UI, Helvetica, Arial, sans-serif' font-size='33' font-weight='600' fill='#6F9BCD'>Your app's AI social media manager</text>
    <text x='60' y='318' font-family='Segoe UI, Helvetica, Arial, sans-serif' font-size='25' fill='#6B6560'>A week of content, planned and posted on autopilot.</text>
  </svg>`);

  await sharp({ create: { width: W, height: H, channels: 4, background: '#FAF6F0' } })
    .composite([{ input: svg }, { input: icon, left: 60, top: 340 }])
    .png()
    .toFile(OUT);

  const meta = await sharp(OUT).metadata();
  console.log(`feature graphic: ${OUT} (${meta.width}x${meta.height})`);
})();

// goldie config — Appsurge Google Play store assets.
// Scenes replay argent flows from .argent/flows/ against the demo APK
// (EXPO_PUBLIC_DEMO_BUILD build — opens straight into the main app), then
// frame them into upload-ready 1080x1920 Play screenshots.
//
// iOS note: goldie's iPhone captures need a macOS host, so on this Windows
// machine the only device is the Android emulator (Play phone set).

const APP_ROOT = "C:/Users/tristan/Desktop/Appsurge App";

const config = {
  appRoot: APP_ROOT,

  // Demo release APK (rebuilt with EXPO_PUBLIC_DEMO_BUILD=1). The production
  // APK is preserved at goldie/app-release-prod-backup.apk.
  appPath: `${APP_ROOT}/android/app/build/outputs/apk/release/app-release.apk`,
  bundleId: "dev.appsurge.mobile",

  android: {
    appPath: `${APP_ROOT}/android/app/build/outputs/apk/release/app-release.apk`,
    applicationId: "dev.appsurge.mobile",
  },

  devices: ["pixel-10-pro"],
  locales: ["en-US"],
  appearance: "light",

  // Android tiles are framed with the bundled Pixel 10 Pro bezel regardless
  // of this variant; kept for studio consistency.
  frame: { variant: "17-pro-blue" },

  theme: {
    // Warm Appsurge canvas — same family as the app's #FAF6F0.
    background: "linear-gradient(165deg, #FDF9F3 0%, #FAF6F0 45%, #F0E7DA 100%)",
    headlineColor: "#1A1A1A",
    subheadColor: "#6B6560",
    fontFamily: '"DM Sans", -apple-system, system-ui, sans-serif',
    copyHeightRatio: 0.24,
    deviceWidthRatio: 0.84,
    template: "editorial",
    layout: "classic",
  },

  store: {
    name: "Appsurge",
    subtitle: { "en-US": "AI social media for your app" },
    developer: "Appsurge",
    category: "Productivity",
    rating: 4.9,
    ratingCount: "1.8K Ratings",
    ageRating: "Everyone",
    price: "Free",
    description: {
      "en-US":
        "Your app deserves a marketing team. Appsurge is that team.\n\nAppsurge is the AI social media manager built for app developers. It plans, writes, and schedules a full week of content for TikTok, Instagram, YouTube, X, and Threads — then posts it on autopilot.\n\nReview your week in minutes from your phone: approve the hooks you love, tweak the ones you don't, and watch views, engagement, and followers climb in one dashboard.",
    },
  },

  scenes: [
    {
      kind: "screenshot",
      id: "home",
      flow: "store-01-home",
      headline: { "en-US": "Your week, on autopilot" },
      subhead: { "en-US": "Appsurge plans, writes, and schedules every post for your app." },
      secondScene: "queue",
    },
    {
      kind: "screenshot",
      id: "queue",
      flow: "store-02-queue",
      headline: { "en-US": "Review in seconds" },
      subhead: { "en-US": "Approve, edit, or reject each post right from your phone." },
    },
    {
      kind: "screenshot",
      id: "analytics",
      flow: "store-03-analytics",
      headline: { "en-US": "Watch it compound" },
      subhead: { "en-US": "Views, engagement, and follower growth across every platform." },
    },
    {
      kind: "screenshot",
      id: "settings",
      flow: "store-04-settings",
      headline: { "en-US": "Five platforms, one place" },
      subhead: { "en-US": "TikTok, Instagram, YouTube, X, and Threads — connected." },
    },
    {
      kind: "screenshot",
      id: "compose",
      flow: "store-05-compose",
      headline: { "en-US": "Edit anything" },
      subhead: { "en-US": "Captions, timing, media — you always have the final word." },
    },
    {
      kind: "preview",
      id: "preview",
      segments: [
        { id: "open", flow: "store-preview-01-home" },
        { id: "review", flow: "store-preview-02-review" },
        { id: "results", flow: "store-preview-03-analytics" },
      ],
    },
  ],
};

export default config;

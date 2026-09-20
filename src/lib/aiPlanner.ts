// AI content planning through the gateway's Gemini proxy. The Gemini API
// key lives only in the Worker; this module just builds prompts and parses
// structured JSON responses.

import { generateAiContent } from './gateway';
import type { PlatformId } from '../types';

export type PlatformRecommendation = {
  platforms: PlatformId[];
  hashtags: string[];
  rationale: string;
};

export type PlannedSlot = {
  platform: PlatformId;
  day: number;
  hook: string;
  caption: string;
  hashtags: string[];
  scheduledAt?: string;
};

function jsonArray(raw: string): any {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = (fenced ? fenced[1] : raw).trim();
  const start = body.search(/[[{]/);
  if (start < 0) throw new Error('AI response did not contain JSON.');
  const sliced = body.slice(start);
  try {
    return JSON.parse(sliced);
  } catch {
    // Common failure: trailing prose after the JSON. Retry from the first
    // bracket to the last matching bracket.
    const lastBracket = Math.max(sliced.lastIndexOf(']'), sliced.lastIndexOf('}'));
    if (lastBracket > 0) return JSON.parse(sliced.slice(0, lastBracket + 1));
    throw new Error('AI response was not parseable JSON.');
  }
}

const VALID_PLATFORMS: PlatformId[] = ['tiktok', 'instagram', 'youtube', 'threads'];

function coercePlatforms(value: unknown): PlatformId[] {
  const list = Array.isArray(value) ? value : [];
  const cleaned = list
    .map((item) => String(item).toLowerCase().trim())
    .filter((item): item is PlatformId => (VALID_PLATFORMS as string[]).includes(item));
  return cleaned.length ? Array.from(new Set(cleaned)) : ['tiktok', 'instagram'];
}

function coerceStringArray(value: unknown, fallback: string[]): string[] {
  const list = Array.isArray(value) ? value : [];
  const cleaned = list.map((item) => String(item).trim().replace(/^#/, '')).filter(Boolean).slice(0, 15);
  return cleaned.length ? cleaned : fallback;
}

export async function recommendPlatformsAndHashtags(input: {
  appName: string;
  storeUrl: string;
  appleStoreUrl?: string;
}): Promise<PlatformRecommendation> {
  const prompt = [
    'You are Appsurge, a social media strategist for mobile app developers.',
    'A developer is onboarding their app onto Appsurge. Recommend the best social platforms and hashtags for it.',
    'The store listings are the source of truth: infer the app category, target audience, and what the app does from the store URLs (you know these stores). If you recognize the app, use what you know about it. If neither link is provided, work from the app name and your best knowledge of it.',
    '',
    `App name: ${input.appName}`,
    `Google Play Store URL: ${input.storeUrl || 'not provided'}`,
    `Apple App Store URL: ${input.appleStoreUrl || 'not provided'}`,
    '',
    'Pick the 2 to 4 best platforms from this exact list: tiktok, instagram, youtube, threads, x.',
    'Choose hashtags that real app marketers use on those platforms (no #, no spaces, 8-12 of them, mix of broad and niche).',
    '',
    'Respond with ONLY this JSON, no other text:',
    '{"platforms":["tiktok","instagram"],"hashtags":["appdeveloper","indiedev"],"rationale":"one or two sentences explaining the picks"}',
  ].join('\n');

  // Generous cap: thinking tokens count against maxOutputTokens on the
  // 3.x model family, and the JSON body itself is small — headroom prevents
  // silent truncation, not waste.
  const raw = await generateAiContent(prompt, 2048);
  const parsed = jsonArray(raw);
  return {
    platforms: coercePlatforms(parsed?.platforms),
    hashtags: coerceStringArray(parsed?.hashtags, ['appdeveloper', 'indiedev', 'startup']),
    rationale: typeof parsed?.rationale === 'string' ? parsed.rationale.slice(0, 400) : '',
  };
}

export async function generateWeeklyPlan(input: {
  appName: string;
  storeUrl: string;
  appleStoreUrl?: string;
  appCategory?: string;
  targetAudience?: string;
  platforms: PlatformId[];
  hashtags: string[];
}): Promise<PlannedSlot[]> {
  const platformList = input.platforms.length ? input.platforms.join(', ') : 'tiktok, instagram';
  const hashtagList = input.hashtags.length ? input.hashtags.map((tag) => `#${tag}`).join(' ') : '#appdeveloper #indiedev';

  const prompt = [
    'You are Appsurge, an AI social media content planner for mobile app developers.',
    'Create a 7-day content plan for the app below. One post per day.',
    'The store listings are the source of truth: infer the app category, audience, and features from the store URLs (you know these stores). If you recognize the app, use what you know about it. If neither link is provided, work from the app name and your best knowledge of it.',
    '',
    `App name: ${input.appName}`,
    `Google Play Store URL: ${input.storeUrl || 'not provided'}`,
    `Apple App Store URL: ${input.appleStoreUrl || 'not provided'}`,
    `Platforms to use: ${platformList}`,
    `Hashtags to weave in: ${hashtagList}`,
    '',
    'Rules for every slot:',
    '- "hook": a scroll-stopping first line, under 90 characters, specific to the app',
    '- "caption": 1-3 sentences of body copy, conversational, ends with a call to action',
    '- "hashtags": 3-5 relevant hashtags without the # symbol',
    '- "platform": pick from this list for each day: ' + platformList,
    '- "day": 1 through 7',
    '- Rotate angles across the week: feature highlight, social proof, behind the scenes, tip, problem it solves, update, community',
    '',
    'Respond with ONLY this JSON array, no other text:',
    '[{"platform":"tiktok","day":1,"hook":"...","caption":"...","hashtags":["..."]}]',
  ].join('\n');

  // 7 slots of structured JSON plus thinking headroom (see note above).
  const raw = await generateAiContent(prompt, 6144);
  const parsed = jsonArray(raw);
  const slotsRaw = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.slots) ? parsed.slots : [];
  const slots: PlannedSlot[] = slotsRaw.slice(0, 7).map((slot: any, index: number) => {
    const platform = String(slot?.platform ?? '').toLowerCase().trim();
    const hashtags = Array.isArray(slot?.hashtags)
      ? slot.hashtags.map((tag: unknown) => String(tag).trim().replace(/^#/, '')).filter(Boolean).slice(0, 6)
      : input.hashtags.slice(0, 4);
    return {
      platform: ((VALID_PLATFORMS as string[]).includes(platform) ? platform : input.platforms[index % Math.max(input.platforms.length, 1)] ?? 'tiktok') as PlatformId,
      day: typeof slot?.day === 'number' && slot.day >= 1 && slot.day <= 30 ? slot.day : index + 1,
      hook: String(slot?.hook ?? '').slice(0, 140) || `${input.appName} — day ${index + 1}`,
      caption: String(slot?.caption ?? '').slice(0, 900) || `Discover ${input.appName}. ${input.storeUrl}`.trim(),
      hashtags: hashtags.length ? hashtags : input.hashtags.slice(0, 4),
    };
  });
  if (!slots.length) throw new Error('AI returned an empty content plan.');
  return slots;
}

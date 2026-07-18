export const PHOTO_PREFERENCES = [
  "balanced",
  "people-emotion",
  "competition",
  "action-energy",
  "scenic-composed",
] as const;

export type PhotoPreference = (typeof PHOTO_PREFERENCES)[number];

export interface PreferenceProfile {
  label: string;
  focus: string;
  weights: {
    impact: number;
    story: number;
    composition: number;
    technical: number;
  };
}

export const PREFERENCE_PROFILES: Record<PhotoPreference, PreferenceProfile> = {
  balanced: {
    label: "Balanced",
    focus: "Balance memorable content, visual storytelling, intentional composition, and reliable craft.",
    weights: { impact: 0.3, story: 0.25, composition: 0.25, technical: 0.2 },
  },
  "people-emotion": {
    label: "People & emotion",
    focus: "Prioritize authentic expression, human connection, gesture, and moments that cannot be recreated.",
    weights: { impact: 0.35, story: 0.35, composition: 0.15, technical: 0.15 },
  },
  competition: {
    label: "Competition",
    focus: "Prioritize professional visual impact, deliberate composition, controlled light, and technical finish.",
    weights: { impact: 0.25, story: 0.2, composition: 0.3, technical: 0.25 },
  },
  "action-energy": {
    label: "Action & energy",
    focus: "Prioritize the decisive instant, expressive body position, readable action, and a strong sense of energy.",
    weights: { impact: 0.35, story: 0.25, composition: 0.2, technical: 0.2 },
  },
  "scenic-composed": {
    label: "Scenic & composed",
    focus: "Prioritize light, depth, geometry, atmosphere, spatial relationships, and environmental storytelling.",
    weights: { impact: 0.25, story: 0.15, composition: 0.35, technical: 0.25 },
  },
};

export function isPhotoPreference(value: unknown): value is PhotoPreference {
  return typeof value === "string" && PHOTO_PREFERENCES.includes(value as PhotoPreference);
}

export function preferenceProfile(preference: PhotoPreference): PreferenceProfile {
  return PREFERENCE_PROFILES[preference];
}

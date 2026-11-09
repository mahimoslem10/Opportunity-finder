import type { Profile } from '../types';

export interface AISettings {
  enabled: boolean;
  endpoint: string;
  apiKey: string;
  model: string;
}

export interface AIProfileCard {
  educationLevel: string;
  fieldOfStudy: string;
  expectedGraduation: string;
  citizenship: string;
  countryOfResidence: string;
  languages: string;
  englishTest: 'yes' | 'no' | '';
  skills: string[];
  experience: string[];
  interests: string;
  wantedOpportunityTypes: string[];
  wantedCountries: string[];
  fundingPreference: string;
  gpaBand: string;
}

export type AIFitLevel = 'strong' | 'partial' | 'weak';

export interface AIFitResult {
  fit: AIFitLevel;
  reason: string;
}

const AI_SETTINGS_KEY = 'opportunityFinder.aiSettings';
const AI_PROFILE_KEY = 'opportunityFinder.aiProfile';

export const DEFAULT_AI_SETTINGS: AISettings = {
  enabled: false,
  endpoint: '',
  apiKey: '',
  model: '',
};

export interface AIProfileExtras {
  englishTest: 'yes' | 'no' | '';
  interests: string;
  wantedOpportunityTypes: string[];
  wantedCountries: string[];
  fundingPreference: string;
}

export const DEFAULT_AI_EXTRAS: AIProfileExtras = {
  englishTest: '',
  interests: '',
  wantedOpportunityTypes: [],
  wantedCountries: [],
  fundingPreference: '',
};

export function loadAISettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        enabled: parsed.enabled ?? false,
        endpoint: parsed.endpoint ?? '',
        apiKey: parsed.apiKey ?? '',
        model: parsed.model ?? '',
      };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_AI_SETTINGS };
}

export function saveAISettings(settings: AISettings): void {
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

function splitList(text: string): string[] {
  return text
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function loadAIProfileExtras(): AIProfileExtras {
  try {
    const raw = localStorage.getItem(AI_PROFILE_KEY);
    if (raw) {
      return { ...DEFAULT_AI_EXTRAS, ...JSON.parse(raw) };
    }
  } catch {
    // ignore
  }
  return { ...DEFAULT_AI_EXTRAS };
}

export function saveAIProfileExtras(extras: AIProfileExtras): void {
  try {
    localStorage.setItem(AI_PROFILE_KEY, JSON.stringify(extras));
  } catch {
    // ignore
  }
}

export function buildAIProfile(profile: Profile): AIProfileCard {
  const extras = loadAIProfileExtras();
  return {
    educationLevel: profile.currentLevel,
    fieldOfStudy: profile.field,
    expectedGraduation: profile.graduationDate,
    citizenship: profile.citizenship,
    countryOfResidence: profile.residence,
    languages: profile.languages,
    englishTest: extras.englishTest,
    skills: splitList(profile.skills),
    experience: splitList(profile.experience),
    interests: extras.interests,
    wantedOpportunityTypes: extras.wantedOpportunityTypes,
    wantedCountries: extras.wantedCountries,
    fundingPreference: extras.fundingPreference,
    gpaBand: profile.gpa,
  };
}

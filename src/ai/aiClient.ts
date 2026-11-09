import type { AISettings, AIProfileCard, AIFitResult } from './storage';

export interface AIOpportunityPayload {
  title: string;
  organization: string;
  type: string;
  level: string;
  deadline: string;
  funding: string;
  description: string;
}

export function validateEndpoint(endpoint: string): string | null {
  let url: URL;
  try {
    url = new URL(endpoint.trim());
  } catch {
    return 'Enter a full web address that starts with https://';
  }
  const isLocal = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol === 'https:' || (isLocal && url.protocol === 'http:')) return null;
  return 'The endpoint must use https:// so your API key is sent encrypted.';
}

export function isAIConfigured(settings: AISettings): boolean {
  return settings.enabled && settings.endpoint.trim() !== '' && settings.apiKey.trim() !== '';
}

export function buildPrompt(profile: AIProfileCard, opp: AIOpportunityPayload): string {
  const lines: string[] = [
    'You are an opportunity matching assistant. Evaluate how well this candidate fits this opportunity.',
    '',
    'CANDIDATE PROFILE:',
    `- Education level: ${profile.educationLevel || 'not specified'}`,
    `- Field of study: ${profile.fieldOfStudy || 'not specified'}`,
    `- Expected graduation: ${profile.expectedGraduation || 'not specified'}`,
    `- Citizenship: ${profile.citizenship || 'not specified'}`,
    `- Country of residence: ${profile.countryOfResidence || 'not specified'}`,
    `- Languages: ${profile.languages || 'not specified'}`,
    `- English test passed: ${profile.englishTest || 'not specified'}`,
    `- Skills: ${profile.skills.length ? profile.skills.join(', ') : 'none'}`,
    `- Experience: ${profile.experience.length ? profile.experience.join(', ') : 'none'}`,
    `- Interests: ${profile.interests || 'not specified'}`,
    `- Wanted opportunity types: ${profile.wantedOpportunityTypes.length ? profile.wantedOpportunityTypes.join(', ') : 'any'}`,
    `- Wanted countries: ${profile.wantedCountries.length ? profile.wantedCountries.join(', ') : 'any'}`,
    `- Funding preference: ${profile.fundingPreference || 'not specified'}`,
    `- GPA band: ${profile.gpaBand || 'not specified'}`,
    '',
    'OPPORTUNITY:',
    `- Title: ${opp.title}`,
    `- Organization: ${opp.organization}`,
    `- Type: ${opp.type}`,
    `- Required level: ${opp.level}`,
    `- Deadline: ${opp.deadline || 'not specified'}`,
    `- Funding: ${opp.funding || 'not specified'}`,
    `- Description: ${opp.description || 'not specified'}`,
    '',
    'Respond with a JSON object exactly in this format (no other text):',
    '{"fit":"strong|partial|weak","reason":"one concise sentence"}',
  ];
  return lines.join('\n');
}

export function deriveModelsURL(endpoint: string): string {
  const url = endpoint.trim().replace(/\/+$/, '');
  if (url.endsWith('/chat/completions')) {
    return url.replace(/\/chat\/completions$/, '/models');
  }
  if (url.endsWith('/chat')) {
    return url.replace(/\/chat$/, '/models');
  }
  if (url.endsWith('/completions')) {
    return url.replace(/\/completions$/, '/models');
  }
  return url + '/models';
}

export async function fetchModels(settings: AISettings): Promise<string[]> {
  const modelsURL = deriveModelsURL(settings.endpoint);
  let res: Response;
  try {
    res = await fetch(modelsURL, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${settings.apiKey}`,
      },
    });
  } catch {
    throw new Error(
      'Network error fetching models. This may be a CORS restriction from the provider. You can still type a model name manually.'
    );
  }
  if (!res.ok) {
    throw new Error(`Could not fetch models (HTTP ${res.status}). You can still type a model name manually.`);
  }
  const data = await res.json();
  const models: unknown = data?.data ?? data?.models ?? [];
  if (!Array.isArray(models)) {
    throw new Error('Model list response was not in expected format. You can still type a model name manually.');
  }
  return models
    .map((m: Record<string, unknown>) => String(m?.id ?? m?.name ?? ''))
    .filter(Boolean)
    .sort();
}

export async function callAIFitCheck(
  settings: AISettings,
  profile: AIProfileCard,
  opp: AIOpportunityPayload
): Promise<AIFitResult> {
  const prompt = buildPrompt(profile, opp);
  const body = {
    model: settings.model || 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    temperature: 0.3,
    max_tokens: 200,
  };

  const res = await fetch(settings.endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`AI request failed (${res.status})`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? '';

  const match = content.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('AI response was not valid JSON');
  }

  const parsed = JSON.parse(match[0]);
  const fit = (parsed.fit || 'weak').toLowerCase() as AIFitResult['fit'];
  const validFits = ['strong', 'partial', 'weak'];
  if (!validFits.includes(fit)) {
    throw new Error('AI returned an unknown fit level');
  }

  return {
    fit: fit as AIFitResult['fit'],
    reason: String(parsed.reason || 'No reason provided'),
  };
}

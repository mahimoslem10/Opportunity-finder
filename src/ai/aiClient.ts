import type { AISettings, AIProfileCard, AIFitResult } from './storage';
import { supabase } from '../lib/supabase';

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
  if (settings.provider === 'gemini') return settings.enabled;
  return settings.enabled && settings.endpoint.trim() !== '' && settings.apiKey.trim() !== '';
}

export function isGeminiConfigured(settings: AISettings): boolean {
  return settings.enabled && settings.provider === 'gemini';
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

// --- Gemini server-side path ---

const GEMINI_MODEL = 'gemini-3.6-flash';

export interface GeminiApprovalDetails {
  provider: string;
  model: string;
  task: string;
  personalData: boolean;
  prompt: string;
}

export async function sha256Hex(text: string): Promise<string> {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, '0')
  ).join('');
}

// Build a public-info-only prompt for opportunity research.
// Contains NO personal data — only the opportunity details from public webpages.
export function buildPublicOpportunityPrompt(
  opp: AIOpportunityPayload
): string {
  const lines: string[] = [
    'You are a scholarship and opportunity research assistant.',
    'Answer questions about this public opportunity using only the details provided.',
    'Do not request or reference any personal information.',
    '',
    'OPPORTUNITY (public information):',
    `- Title: ${opp.title}`,
    `- Organization: ${opp.organization}`,
    `- Type: ${opp.type}`,
    `- Required level: ${opp.level}`,
    `- Deadline: ${opp.deadline || 'not specified'}`,
    `- Funding: ${opp.funding || 'not specified'}`,
    `- Description: ${opp.description || 'not specified'}`,
    '',
    'Provide a concise summary of the key eligibility requirements, benefits, and application steps.',
    'Keep the response under 150 words.',
  ];
  return lines.join('\n');
}

// Build a fit-check prompt that includes personal profile data.
// This requires explicit user approval before sending to Gemini.
export function buildPersonalFitPrompt(
  profile: AIProfileCard,
  opp: AIOpportunityPayload
): string {
  return buildPrompt(profile, opp);
}

// Determine if a prompt contains personal data by checking which builder was used.
export function classifyPrompt(prompt: string): boolean {
  return prompt.includes('CANDIDATE PROFILE:');
}

// Create a single-use approval token in the database.
export async function createApprovalToken(
  details: GeminiApprovalDetails
): Promise<{ id: string; error?: string }> {
  const payloadHash = await sha256Hex(details.prompt);
  const { data, error } = await supabase
    .from('ai_approval_tokens')
    .insert({
      task: details.task,
      provider: details.provider,
      model: details.model,
      payload_hash: payloadHash,
      personal_data: details.personalData,
    })
    .select('id')
    .maybeSingle();

  if (error || !data) {
    return { id: '', error: 'Could not create approval. Please try again.' };
  }
  return { id: data.id };
}

// Call the server-side Gemini edge function.
export async function callGemini(
  prompt: string,
  task: string,
  personalData: boolean,
  approvalTokenId?: string
): Promise<string> {
  const payloadHash = await sha256Hex(prompt);

  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    throw new Error('Your sign-in has expired. Please sign in again.');
  }

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/gemini-query`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      task,
      prompt,
      personalData,
      payloadHash,
      approvalTokenId,
    }),
  });

  const json = await res.json().catch(() => null);
  if (!res.ok || !json) {
    throw new Error(json?.error || `AI request failed (HTTP ${res.status}).`);
  }
  if (json.error) {
    throw new Error(json.error);
  }

  return json.content as string;
}

// Call Gemini for a public-info-only task (no personal data, no approval needed).
export async function callGeminiPublic(
  prompt: string,
  task: string
): Promise<string> {
  return callGemini(prompt, task, false);
}

// Call Gemini for a fit check that includes personal data (requires approval).
export async function callGeminiFitCheck(
  profile: AIProfileCard,
  opp: AIOpportunityPayload,
  approvalTokenId: string
): Promise<AIFitResult> {
  const prompt = buildPersonalFitPrompt(profile, opp);
  const content = await callGemini(prompt, 'fit-check', true, approvalTokenId);

  const result = parseFitResponse(content);
  return result;
}

function parseFitResponse(content: string): AIFitResult {
  // Strip markdown code fences if present (e.g. ```json ... ```)
  const cleaned = content.replace(/```(?:json)?\s*/gi, '').replace(/```/g, '').trim();

  // Try to find a JSON object in the response
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error('AI response was not valid JSON');
  }

  let parsed: { fit?: string; reason?: string };
  try {
    parsed = JSON.parse(match[0]);
  } catch {
    throw new Error('AI response was not valid JSON');
  }

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

export { GEMINI_MODEL };

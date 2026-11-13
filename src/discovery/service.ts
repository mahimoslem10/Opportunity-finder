import { supabase } from '../lib/supabase';
import type { Opportunity, OpportunityType, Level } from '../types';
import { classifyScrapedItem } from '../rules';

export interface DiscoveredItem {
  id: string;
  title: string;
  organization: string;
  link: string;
  notes: string;
  source_id: string | null;
  discovered_on: string;
  created_at: string;
  verification_status: string;
  deadline_raw: string;
  country: string;
  study_level: string;
  funding_type: string;
  last_verified_at: string | null;
  discovery_run_id: string | null;
  conflict_note: string;
}

export interface DiscoveryRun {
  id: string;
  started_at: string;
  completed_at: string | null;
  status: string;
  sources_attempted: number;
  sources_succeeded: number;
  sources_failed: number;
  new_opportunities: number;
  duplicates: number;
  updated: number;
  errors: string[];
  triggered_by: string;
}

export interface DiscoveryResult {
  success: boolean;
  runId: string;
  sourcesAttempted: number;
  sourcesSucceeded: number;
  sourcesFailed: number;
  newOpportunities: number;
  duplicates: number;
  updated: number;
  errors: string[];
  newItems: DiscoveredItem[];
  error?: string;
}

export interface SeedSource {
  id: string;
  name: string;
  url: string;
  source_type: string;
  category: string;
  is_active: boolean;
  last_checked_at: string | null;
  last_status: string;
  last_error: string;
  last_item_count: number;
}

export async function triggerDiscovery(): Promise<DiscoveryResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const token = sessionData.session?.access_token;
  if (!token) {
    return {
      success: false, runId: '', sourcesAttempted: 0, sourcesSucceeded: 0,
      sourcesFailed: 0, newOpportunities: 0, duplicates: 0, updated: 0,
      errors: [], newItems: [], error: 'Your sign-in has expired. Please sign in again.',
    };
  }

  const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/run-discovery`;
  const res = await fetch(fnUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({}),
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    return {
      success: false, runId: '', sourcesAttempted: 0, sourcesSucceeded: 0,
      sourcesFailed: 0, newOpportunities: 0, duplicates: 0, updated: 0,
      errors: [], newItems: [], error: data?.error || `Discovery failed (HTTP ${res.status}).`,
    };
  }

  return {
    success: true,
    runId: data.runId,
    sourcesAttempted: data.sourcesAttempted,
    sourcesSucceeded: data.sourcesSucceeded,
    sourcesFailed: data.sourcesFailed,
    newOpportunities: data.newOpportunities,
    duplicates: data.duplicates,
    updated: data.updated,
    errors: data.errors || [],
    newItems: (data.newItems || []).map((item: Record<string, unknown>) => ({
      id: String(item.id ?? ''),
      title: String(item.title ?? ''),
      organization: String(item.organization ?? ''),
      link: String(item.link ?? ''),
      notes: String(item.notes ?? ''),
      source_id: (item.source_id as string | null) ?? null,
      discovered_on: String(item.discovered_on ?? ''),
      created_at: String(item.created_at ?? new Date().toISOString()),
      verification_status: String(item.verification_status ?? 'unverified'),
      deadline_raw: String(item.deadline_raw ?? ''),
      country: String(item.country ?? ''),
      study_level: String(item.study_level ?? ''),
      funding_type: String(item.funding_type ?? ''),
      last_verified_at: (item.last_verified_at as string | null) ?? null,
      discovery_run_id: (item.discovery_run_id as string | null) ?? null,
      conflict_note: String(item.conflict_note ?? ''),
    })),
  };
}

export async function fetchDiscoveryRuns(limit = 10): Promise<DiscoveryRun[]> {
  const { data, error } = await supabase
    .from('discovery_runs')
    .select('*')
    .order('started_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as DiscoveryRun[];
}

export async function fetchSeedSources(): Promise<SeedSource[]> {
  const { data, error } = await supabase
    .from('discovery_seed_sources')
    .select('*')
    .order('name', { ascending: true });

  if (error || !data) return [];
  return data as SeedSource[];
}

export async function fetchDiscoveredItems(limit = 50): Promise<DiscoveredItem[]> {
  const { data, error } = await supabase
    .from('discovered')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error || !data) return [];
  return data as DiscoveredItem[];
}

export function importDiscoveredToOpportunities(items: DiscoveredItem[]): Omit<Opportunity, 'id' | 'addedOn'>[] {
  return items.map((item) => {
    const { type, requiredLevel } = classifyScrapedItem(item.title, item.notes);
    const deadline = parseDeadlineFromRaw(item.deadline_raw);

    // Map study_level to requiredLevel if classification didn't detect it
    let finalLevel: Level = requiredLevel;
    if (finalLevel === 'any' && item.study_level) {
      if (item.study_level === 'phd') finalLevel = 'phd';
      else if (item.study_level === 'master') finalLevel = 'master';
      else if (item.study_level === 'bachelor') finalLevel = 'bachelor';
    }

    // Determine requiresDegree
    const requiresDegree = item.study_level === 'phd' || item.study_level === 'master' ? 'yes' : 'no';

    // Build eligible countries from country field
    const eligibleCountries = item.country ? [item.country] : [];

    return {
      title: item.title,
      organization: item.organization || '',
      type: type as OpportunityType,
      requiredLevel: finalLevel,
      deadline,
      startDate: '',
      eligibleCountries,
      requiresDegree: requiresDegree as 'yes' | 'no',
      link: item.link,
      status: 'interested' as const,
      notes: item.notes || `Discovered: ${item.discovered_on}`,
      description: '',
      documentIds: [],
    };
  });
}

function parseDeadlineFromRaw(raw: string): string {
  if (!raw) return '';
  // Already ISO format
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  // Try to parse common formats
  const months: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04', may: '05', june: '06',
    july: '07', august: '08', september: '09', october: '10', november: '11', december: '12',
    jan: '01', feb: '02', mar: '03', apr: '04', jun: '06', jul: '07', aug: '08',
    sep: '09', oct: '10', nov: '11', dec: '12',
  };
  const m1 = raw.match(/(\d{1,2})\s+([A-Za-z]{3,9})\s+(\d{4})/i);
  if (m1) {
    const day = m1[1].padStart(2, '0');
    const mon = months[m1[2].toLowerCase()];
    if (mon) return `${m1[3]}-${mon}-${day}`;
  }
  const m2 = raw.match(/([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})/i);
  if (m2) {
    const day = m2[2].padStart(2, '0');
    const mon = months[m2[1].toLowerCase()];
    if (mon) return `${m2[3]}-${mon}-${day}`;
  }
  const m3 = raw.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m3) return `${m3[3]}-${m3[1].padStart(2, '0')}-${m3[2].padStart(2, '0')}`;
  return raw;
}

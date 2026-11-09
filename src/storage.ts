import type { AppData, Opportunity, Profile, ProfileDocument, Source } from './types';
import { classifyScrapedItem } from './rules';

const STORE_KEY = 'opportunityFinder.v2';

const DEFAULT_PROFILE: Profile = {
  currentLevel: 'bachelor',
  field: '',
  university: '',
  graduationDate: '',
  targetMasterStart: '',
  targetPhdStart: '',
  internshipStart: '',
  citizenship: '',
  residence: '',
  gpa: '',
  languages: '',
  skills: '',
  experience: '',
  preferences: '',
};

const DEFAULT_SOURCES: Source[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'Opportunities Circle',
    url: 'https://www.opportunitiescircle.com',
    type: 'webpage',
    addedOn: '2026-10-16',
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'Youth Opportunities',
    url: 'https://www.youthop.com',
    type: 'webpage',
    addedOn: '2026-10-16',
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'Oya Opportunities',
    url: 'https://oyaop.com',
    type: 'webpage',
    addedOn: '2026-10-16',
  },
  {
    id: '00000000-0000-0000-0000-000000000004',
    name: 'Opportunity Desk',
    url: 'https://opportunitydesk.org',
    type: 'webpage',
    addedOn: '2026-10-16',
  },
  {
    id: '00000000-0000-0000-0000-000000000005',
    name: 'Scholars 4 Dev',
    url: 'https://www.scholars4dev.com',
    type: 'webpage',
    addedOn: '2026-10-16',
  },
];

const DEFAULT_DATA: AppData = {
  profile: { ...DEFAULT_PROFILE },
  opportunities: [],
  sources: [...DEFAULT_SOURCES],
  documents: [],
};

const DEFAULT_SOURCE_IDS = new Set(DEFAULT_SOURCES.map((s) => s.id));

export function isDefaultSource(id: string): boolean {
  return DEFAULT_SOURCE_IDS.has(id);
}

export function withDefaultSources(sources: Source[]): Source[] {
  return [...DEFAULT_SOURCES, ...sources.filter((s) => !DEFAULT_SOURCE_IDS.has(s.id))];
}

const CLASSIFIED_KEY = 'opportunityFinder.classified';

function classifyUnlabeledOpportunities(opportunities: Opportunity[]): Opportunity[] {
  return opportunities.map((o) =>
    o.type === 'program' && o.requiredLevel === 'any'
      ? { ...o, ...classifyScrapedItem(o.title, `${o.notes} ${o.description}`) }
      : o
  );
}

export function withDocumentIds(opportunities: Opportunity[]): Opportunity[] {
  return opportunities.map((o) => (o.documentIds ? o : { ...o, documentIds: [] }));
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      const data: AppData = {
        profile: { ...DEFAULT_PROFILE, ...(parsed.profile || {}) },
        opportunities: withDocumentIds(parsed.opportunities || []),
        sources: withDefaultSources(parsed.sources || []),
        documents: parsed.documents || [],
      };
      if (!localStorage.getItem(CLASSIFIED_KEY)) {
        data.opportunities = classifyUnlabeledOpportunities(data.opportunities);
        saveData(data);
        localStorage.setItem(CLASSIFIED_KEY, '1');
      }
      return data;
    }
  } catch (e) {
    console.warn('Could not read saved data', e);
  }
  return { ...DEFAULT_DATA, sources: [...DEFAULT_SOURCES] };
}

export function saveData(data: AppData): boolean {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Could not save data', e);
    return false;
  }
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return String(Date.now() + Math.random());
}

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function migrateOldV1(): void {
  const oldRaw = localStorage.getItem('opportunityFinder.v1');
  if (!oldRaw) return;
  if (localStorage.getItem(STORE_KEY)) return;
  try {
    const old = JSON.parse(oldRaw);
    const data: AppData = {
      profile: { ...DEFAULT_PROFILE, ...(old.profile || {}) },
      opportunities: old.opportunities || [],
      sources: [],
      documents: [],
    };
    saveData(data);
  } catch {
    // ignore malformed old data
  }
}

export { DEFAULT_PROFILE, DEFAULT_DATA };

// ---- Document storage (local only) ----
// Documents are stored as metadata in localStorage. The actual file is
// kept in the browser via a data URL so it can be reopened later without
// any server. No file ever leaves the device.

const MAX_DOC_SIZE = 4 * 1024 * 1024; // 4 MB to stay within localStorage limits

export async function readFileAsDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export function createLocalDocument(
  file: File,
  docId: string,
  dataUrl: string
): ProfileDocument {
  return {
    id: docId,
    label: file.name,
    fileName: file.name,
    fileUrl: dataUrl,
    fileType: file.type || 'application/octet-stream',
    uploadedOn: todayISO(),
  };
}

export { MAX_DOC_SIZE };

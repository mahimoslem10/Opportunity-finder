import {
  createContext,
  useContext,
  useState,
  useCallback,
  type ReactNode,
} from 'react';
import type {
  AppData,
  Profile,
  Opportunity,
  Source,
  ProfileDocument,
} from './types';
import {
  loadData,
  saveData,
  generateId,
  todayISO,
  migrateOldV1,
  readFileAsDataURL,
  createLocalDocument,
  MAX_DOC_SIZE,
  isDefaultSource,
  withDefaultSources,
  withDocumentIds,
} from './storage';
import { classifyScrapedItem } from './rules';

interface AppContextValue {
  data: AppData;
  loading: boolean;
  saveProfile: (profile: Profile) => void;
  addOpportunity: (opp: Omit<Opportunity, 'id' | 'addedOn'>) => Opportunity;
  deleteOpportunity: (id: string) => void;
  updateOpportunityStatus: (id: string, status: Opportunity['status']) => void;
  updateOpportunityDescription: (id: string, description: string) => void;
  updateOpportunityDocuments: (id: string, documentIds: string[]) => void;
  updateOpportunityClassification: (
    id: string,
    changes: Partial<Pick<Opportunity, 'type' | 'requiredLevel'>>
  ) => void;
  addSource: (source: Omit<Source, 'id' | 'addedOn'>) => Source;
  deleteSource: (id: string) => void;
  scrapeSource: (source: Source) => Promise<{ found: number; error?: string }>;
  uploadDocument: (file: File, label: string) => Promise<{ error?: string }>;
  deleteDocument: (id: string) => void;
  exportData: () => string;
  importData: (json: string) => number;
  clearAll: () => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  migrateOldV1();
  const [data, setData] = useState<AppData>(() => loadData());
  const [loading, setLoading] = useState(false);

  const persist = useCallback((updater: (prev: AppData) => AppData) => {
    setData((prev) => {
      const next = updater(prev);
      saveData(next);
      return next;
    });
  }, []);

  const saveProfile = useCallback(
    (profile: Profile) => {
      persist((prev) => ({ ...prev, profile }));
    },
    [persist]
  );

  const addOpportunity = useCallback(
    (opp: Omit<Opportunity, 'id' | 'addedOn'>): Opportunity => {
      const newOpp: Opportunity = {
        ...opp,
        id: generateId(),
        addedOn: todayISO(),
      };
      persist((prev) => ({
        ...prev,
        opportunities: [...prev.opportunities, newOpp],
      }));
      return newOpp;
    },
    [persist]
  );

  const deleteOpportunity = useCallback(
    (id: string) => {
      persist((prev) => ({
        ...prev,
        opportunities: prev.opportunities.filter((o) => o.id !== id),
      }));
    },
    [persist]
  );

  const updateOpportunityStatus = useCallback(
    (id: string, status: Opportunity['status']) => {
      persist((prev) => ({
        ...prev,
        opportunities: prev.opportunities.map((o) =>
          o.id === id ? { ...o, status } : o
        ),
      }));
    },
    [persist]
  );

  const updateOpportunityDescription = useCallback(
    (id: string, description: string) => {
      persist((prev) => ({
        ...prev,
        opportunities: prev.opportunities.map((o) =>
          o.id === id ? { ...o, description } : o
        ),
      }));
    },
    [persist]
  );

  const updateOpportunityClassification = useCallback(
    (id: string, changes: Partial<Pick<Opportunity, 'type' | 'requiredLevel'>>) => {
      persist((prev) => ({
        ...prev,
        opportunities: prev.opportunities.map((o) =>
          o.id === id ? { ...o, ...changes } : o
        ),
      }));
    },
    [persist]
  );

  const updateOpportunityDocuments = useCallback(
    (id: string, documentIds: string[]) => {
      persist((prev) => ({
        ...prev,
        opportunities: prev.opportunities.map((o) =>
          o.id === id ? { ...o, documentIds } : o
        ),
      }));
    },
    [persist]
  );

  const addSource = useCallback(
    (source: Omit<Source, 'id' | 'addedOn'>): Source => {
      const newSource: Source = {
        ...source,
        id: generateId(),
        addedOn: todayISO(),
      };
      persist((prev) => ({
        ...prev,
        sources: [...prev.sources, newSource],
      }));
      return newSource;
    },
    [persist]
  );

  const deleteSource = useCallback(
    (id: string) => {
      if (isDefaultSource(id)) return;
      persist((prev) => ({
        ...prev,
        sources: prev.sources.filter((s) => s.id !== id),
      }));
    },
    [persist]
  );

  const scrapeSource = useCallback(
    async (
      source: Source
    ): Promise<{ found: number; error?: string }> => {
      try {
        const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/scrape-source`;
        const res = await fetch(fnUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
          },
          body: JSON.stringify({
            url: source.url,
            sourceType: source.type,
          }),
        });

        if (!res.ok) {
          return { found: 0, error: `Scrape failed (HTTP ${res.status})` };
        }

        const json = await res.json();
        if (json.error) {
          return { found: 0, error: json.error };
        }

        const scrapedItems: Array<{
          title: string;
          link: string;
          description: string;
        }> = json.items || [];

        if (scrapedItems.length === 0) {
          return { found: 0, error: "No items found at this URL." };
        }

        const existingLinks = new Set(
          data.opportunities.map((o) => o.link).filter(Boolean)
        );

        const newOpps: Opportunity[] = [];
        for (const item of scrapedItems) {
          if (item.link && existingLinks.has(item.link)) continue;
          if (!item.link && existingLinks.has(`title:${item.title}`)) continue;
          newOpps.push({
            id: generateId(),
            title: item.title,
            organization: "",
            ...classifyScrapedItem(item.title, item.description),
            deadline: "",
            startDate: "",
            eligibleCountries: [],
            requiresDegree: "no",
            documentIds: [],
            link: item.link,
            status: "interested",
            notes: item.description || `From: ${source.name}`,
            description: "",
            addedOn: todayISO(),
          });
          existingLinks.add(item.link || `title:${item.title}`);
        }

        if (newOpps.length > 0) {
          persist((prev) => ({
            ...prev,
            opportunities: [...newOpps, ...prev.opportunities],
          }));
        }

        return { found: newOpps.length };
      } catch {
        return { found: 0, error: "Could not connect to the scraping service." };
      }
    },
    [persist, data.opportunities]
  );

  const uploadDocument = useCallback(
    async (
      file: File,
      label: string
    ): Promise<{ error?: string }> => {
      if (file.size > MAX_DOC_SIZE) {
        return { error: `File is too large. Maximum size is ${MAX_DOC_SIZE / 1024 / 1024} MB for local storage.` };
      }
      const docId = generateId();
      let dataUrl: string;
      try {
        dataUrl = await readFileAsDataURL(file);
      } catch {
        return { error: 'Could not read the file. Please try again.' };
      }
      const doc: ProfileDocument = createLocalDocument(file, docId, dataUrl);
      doc.label = label || file.name;
      const next: AppData = { ...data, documents: [...data.documents, doc] };
      if (!saveData(next)) {
        return { error: 'Your browser has no room left for this file. Delete some documents or upload a smaller one.' };
      }
      setData(next);
      return {};
    },
    [data]
  );

  const deleteDocument = useCallback(
    (id: string) => {
      persist((prev) => ({
        ...prev,
        documents: prev.documents.filter((d) => d.id !== id),
        opportunities: prev.opportunities.map((o) => ({
          ...o,
          documentIds: o.documentIds.filter((docId) => docId !== id),
        })),
      }));
    },
    [persist]
  );

  const exportData = useCallback((): string => {
    return JSON.stringify(data, null, 2);
  }, [data]);

  const importData = useCallback((json: string): number => {
    const parsed = JSON.parse(json);
    if (!parsed.opportunities || !parsed.profile) {
      throw new Error('Not a valid backup file');
    }
    const next: AppData = {
      profile: { ...parsed.profile },
      opportunities: withDocumentIds(parsed.opportunities || []),
      sources: withDefaultSources(parsed.sources || []),
      documents: parsed.documents || [],
    };
    setData(next);
    saveData(next);
    return next.opportunities.length;
  }, []);

  const clearAll = useCallback(() => {
    const empty: AppData = {
      profile: {
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
      },
      opportunities: [],
      sources: withDefaultSources([]),
      documents: [],
    };
    setData(empty);
    saveData(empty);
  }, []);

  const value: AppContextValue = {
    data,
    loading,
    saveProfile,
    addOpportunity,
    deleteOpportunity,
    updateOpportunityStatus,
    updateOpportunityDescription,
    updateOpportunityClassification,
    updateOpportunityDocuments,
    addSource,
    deleteSource,
    scrapeSource,
    uploadDocument,
    deleteDocument,
    exportData,
    importData,
    clearAll,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}

import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Radar,
  Loader2,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  ChevronRight,
  PlusCircle,
  ExternalLink,
  ShieldCheck,
  History,
  Globe,
  Award,
  Sparkles,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { Card, Button } from '../components/ui';
import {
  triggerDiscovery,
  fetchDiscoveryRuns,
  fetchSeedSources,
  fetchDiscoveredItems,
  importDiscoveredToOpportunities,
  type DiscoveryResult,
  type DiscoveryRun,
  type SeedSource,
  type DiscoveredItem,
} from '../discovery/service';
import { loadCandidateProfile } from '../candidate/storage';
import { buildCandidateSnapshot, assessOpportunity } from '../matching/engine';
import { classifyScrapedItem } from '../rules';
import type { OpportunityType, Level } from '../types';

type Tab = 'overview' | 'discovered' | 'sources' | 'history';

export function DiscoveryPage() {
  const { data, addOpportunity } = useApp();
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [runs, setRuns] = useState<DiscoveryRun[]>([]);
  const [seeds, setSeeds] = useState<SeedSource[]>([]);
  const [discovered, setDiscovered] = useState<DiscoveredItem[]>([]);
  const [tab, setTab] = useState<Tab>('overview');
  const [importedIds, setImportedIds] = useState<Set<string>>(new Set());

  const loadData = useCallback(async () => {
    const [r, s, d] = await Promise.all([
      fetchDiscoveryRuns(10),
      fetchSeedSources(),
      fetchDiscoveredItems(60),
    ]);
    setRuns(r);
    setSeeds(s);
    setDiscovered(d);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleRunDiscovery = async () => {
    setRunning(true);
    setError(null);
    setResult(null);
    try {
      const res = await triggerDiscovery();
      if (!res.success) {
        setError(res.error || 'Discovery failed.');
      } else {
        setResult(res);
        await loadData();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Discovery failed unexpectedly.');
    } finally {
      setRunning(false);
    }
  };

  const handleImport = useCallback((item: DiscoveredItem) => {
    const opps = importDiscoveredToOpportunities([item]);
    if (opps.length > 0) {
      addOpportunity(opps[0]);
      setImportedIds((prev) => new Set(prev).add(item.id));
    }
  }, [addOpportunity]);

  const handleImportAll = useCallback(() => {
    const newItems = discovered.filter((d) => !importedIds.has(d.id));
    const opps = importDiscoveredToOpportunities(newItems);
    for (const opp of opps) {
      addOpportunity(opp);
    }
    setImportedIds((prev) => {
      const next = new Set(prev);
      for (const item of newItems) next.add(item.id);
      return next;
    });
  }, [discovered, importedIds, addOpportunity]);

  // Matching integration: assess discovered items
  const matchedItems = useMemo(() => {
    if (discovered.length === 0) return [];
    const candidateData = loadCandidateProfile();
    const snap = buildCandidateSnapshot(data.profile, candidateData.claims);
    return discovered.map((item) => {
      const { type, requiredLevel } = classifyFromItem(item);
      const opp = {
        id: item.id,
        title: item.title,
        organization: item.organization,
        type,
        requiredLevel,
        deadline: parseDeadline(item.deadline_raw),
        startDate: '',
        eligibleCountries: item.country ? [item.country] : [],
        requiresDegree: 'no' as const,
        link: item.link,
        status: 'interested' as const,
        notes: item.notes,
        description: '',
        documentIds: [],
        addedOn: item.discovered_on,
      };
      const assessment = assessOpportunity(opp, snap);
      return { item, assessment };
    });
  }, [discovered, data.profile]);

  const stats = useMemo(() => {
    const totalDiscovered = discovered.length;
    const verified = discovered.filter((d) => d.verification_status === 'verified').length;
    const secondary = discovered.filter((d) => d.verification_status === 'secondary').length;
    const unverified = discovered.filter((d) => d.verification_status === 'unverified').length;
    const lastRun = runs[0];
    return { totalDiscovered, verified, secondary, unverified, lastRun };
  }, [discovered, runs]);

  const bestMatches = useMemo(() => {
    return matchedItems
      .filter((m) => m.assessment.eligibility.status !== 'ineligible')
      .sort((a, b) => b.assessment.matchScore - a.assessment.matchScore)
      .slice(0, 5);
  }, [matchedItems]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Radar className="w-5 h-5 text-navy-600" />
          <h2 className="text-lg font-bold text-gray-900">Discovery Engine</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Automatically discovers opportunities from official scholarship portals, PhD job boards, and
          fellowship listings. Every discovered opportunity is checked against your profile by the
          local matching engine — no personal data leaves your browser.
        </p>

        <div className="p-3 rounded-lg bg-green-50 border border-green-200 mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-700 flex-shrink-0" />
            <p className="text-xs text-green-900">
              Discovery only fetches public opportunity pages. Your candidate profile and documents
              are never transmitted. Matching runs entirely in your browser.
            </p>
          </div>
        </div>

        {/* Run button + status */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <Button onClick={handleRunDiscovery} disabled={running}>
            <span className="flex items-center gap-1.5">
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Radar className="w-4 h-4" />}
              {running ? 'Discovering...' : 'Run Discovery'}
            </span>
          </Button>

          {stats.lastRun && (
            <span className="text-xs text-gray-500">
              Last run: {new Date(stats.lastRun.started_at).toLocaleString()}
              {stats.lastRun.status === 'completed' && (
                <span className="text-green-600 ml-1">— found {stats.lastRun.new_opportunities} new</span>
              )}
              {stats.lastRun.status === 'failed' && (
                <span className="text-red-600 ml-1">— failed</span>
              )}
            </span>
          )}
        </div>

        {/* Result summary */}
        {result && (
          <div className="p-3 rounded-lg bg-navy-50 border border-navy-100 mb-3">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-4 h-4 text-navy-600" />
              <span className="text-sm font-semibold text-navy-900">Discovery complete</span>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <div>
                <p className="font-bold text-navy-700">{result.newOpportunities}</p>
                <p className="text-gray-500">New opportunities</p>
              </div>
              <div>
                <p className="font-bold text-gray-700">{result.duplicates}</p>
                <p className="text-gray-500">Duplicates</p>
              </div>
              <div>
                <p className="font-bold text-green-700">{result.sourcesSucceeded}</p>
                <p className="text-gray-500">Sources OK</p>
              </div>
              <div>
                <p className="font-bold text-red-700">{result.sourcesFailed}</p>
                <p className="text-gray-500">Sources failed</p>
              </div>
            </div>
            {result.errors.length > 0 && (
              <div className="mt-2 space-y-0.5">
                {result.errors.slice(0, 3).map((err, i) => (
                  <p key={i} className="text-[11px] text-amber-700 flex items-start gap-1">
                    <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                    {err}
                  </p>
                ))}
              </div>
            )}
          </div>
        )}

        {error && (
          <div className="p-3 rounded-lg bg-red-50 border border-red-200 mb-3">
            <div className="flex items-center gap-2">
              <XCircle className="w-4 h-4 text-red-600 flex-shrink-0" />
              <p className="text-xs text-red-700">{error}</p>
            </div>
          </div>
        )}

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatBox label="Discovered" value={stats.totalDiscovered} icon={Radar} color="navy" />
          <StatBox label="Verified" value={stats.verified} icon={CheckCircle2} color="green" />
          <StatBox label="Secondary" value={stats.secondary} icon={Globe} color="blue" />
          <StatBox label="Unverified" value={stats.unverified} icon={AlertTriangle} color="amber" />
        </div>
      </Card>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-2">
        {([
          { id: 'overview', label: 'Overview' },
          { id: 'discovered', label: `Discovered (${discovered.length})` },
          { id: 'sources', label: `Sources (${seeds.length})` },
          { id: 'history', label: `History (${runs.length})` },
        ] as { id: Tab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id ? 'bg-navy-600 text-on-brand' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {bestMatches.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-navy-600" />
                <h3 className="text-sm font-bold text-gray-900">Best matches from discovery</h3>
              </div>
              <div className="space-y-2">
                {bestMatches.map(({ item, assessment }) => (
                  <DiscoveredRow
                    key={item.id}
                    item={item}
                    assessment={assessment}
                    imported={importedIds.has(item.id)}
                    onImport={() => handleImport(item)}
                  />
                ))}
              </div>
            </Card>
          )}

          {result && result.newItems.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <PlusCircle className="w-4 h-4 text-navy-600" />
                <h3 className="text-sm font-bold text-gray-900">Newly discovered</h3>
              </div>
              <div className="space-y-2">
                {result.newItems.slice(0, 10).map((item) => (
                  <SimpleDiscoveredRow key={item.id} item={item} />
                ))}
              </div>
            </Card>
          )}

          {bestMatches.length === 0 && !result && (
            <Card>
              <div className="text-center py-8">
                <Radar className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                <p className="text-sm text-gray-500 mb-3">
                  No discovered opportunities yet. Click "Run Discovery" to start finding opportunities.
                </p>
              </div>
            </Card>
          )}
        </div>
      )}

      {/* Discovered tab */}
      {tab === 'discovered' && (
        <Card>
          {discovered.length > 0 ? (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-gray-900">All discovered opportunities</h3>
                <Button variant="secondary" onClick={handleImportAll} className="text-xs !px-3 !py-1.5">
                  <span className="flex items-center gap-1">
                    <PlusCircle className="w-3.5 h-3.5" />
                    Import all
                  </span>
                </Button>
              </div>
              <div className="space-y-2">
                {matchedItems.map(({ item, assessment }) => (
                  <DiscoveredRow
                    key={item.id}
                    item={item}
                    assessment={assessment}
                    imported={importedIds.has(item.id)}
                    onImport={() => handleImport(item)}
                  />
                ))}
              </div>
            </>
          ) : (
            <EmptyState icon={Radar} text="No opportunities discovered yet. Run discovery to start finding opportunities." />
          )}
        </Card>
      )}

      {/* Sources tab */}
      {tab === 'sources' && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <Globe className="w-4 h-4 text-navy-600" />
            <h3 className="text-sm font-bold text-gray-900">Discovery sources</h3>
          </div>
          <p className="text-xs text-gray-500 mb-3">
            These are the public opportunity portals the discovery engine scans. Sources are checked
            for accessibility and rate-limited to respect each site.
          </p>
          {seeds.length > 0 ? (
            <div className="space-y-2">
              {seeds.map((seed) => (
                <div key={seed.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{seed.name}</p>
                      <a
                        href={seed.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-navy-600 hover:underline truncate block"
                      >
                        {seed.url}
                      </a>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="text-[11px] text-gray-500 capitalize">{seed.category}</span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${SOURCE_STATUS_COLORS[seed.last_status] || 'bg-gray-100 text-gray-600'}`}>
                          {seed.last_status || 'pending'}
                        </span>
                        {seed.last_checked_at && (
                          <span className="text-[11px] text-gray-400">
                            {new Date(seed.last_checked_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      {seed.last_error && (
                        <p className="text-[11px] text-red-600 mt-1">{seed.last_error}</p>
                      )}
                    </div>
                    <ExternalLink className="w-3.5 h-3.5 text-gray-400 flex-shrink-0 mt-1" />
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={Globe} text="No seed sources configured." />
          )}
        </Card>
      )}

      {/* History tab */}
      {tab === 'history' && (
        <Card>
          <div className="flex items-center gap-2 mb-3">
            <History className="w-4 h-4 text-navy-600" />
            <h3 className="text-sm font-bold text-gray-900">Discovery history</h3>
          </div>
          {runs.length > 0 ? (
            <div className="space-y-2">
              {runs.map((run) => (
                <div key={run.id} className="bg-gray-50 rounded-lg px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${RUN_STATUS_COLORS[run.status] || 'bg-gray-100 text-gray-600'}`}>
                          {run.status}
                        </span>
                        <span className="text-xs text-gray-500">
                          {new Date(run.started_at).toLocaleString()}
                        </span>
                        <span className="text-[11px] text-gray-400 capitalize">{run.triggered_by}</span>
                      </div>
                      <div className="mt-1.5 grid grid-cols-3 sm:grid-cols-5 gap-2 text-[11px]">
                        <span className="text-gray-600">Attempted: <b className="text-gray-900">{run.sources_attempted}</b></span>
                        <span className="text-gray-600">OK: <b className="text-green-700">{run.sources_succeeded}</b></span>
                        <span className="text-gray-600">Failed: <b className="text-red-700">{run.sources_failed}</b></span>
                        <span className="text-gray-600">New: <b className="text-navy-700">{run.new_opportunities}</b></span>
                        <span className="text-gray-600">Dupes: <b className="text-gray-700">{run.duplicates}</b></span>
                      </div>
                      {run.errors && run.errors.length > 0 && (
                        <div className="mt-1.5 space-y-0.5">
                          {run.errors.slice(0, 2).map((err, i) => (
                            <p key={i} className="text-[11px] text-amber-700">{err}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState icon={History} text="No discovery runs yet. Click Run Discovery to start." />
          )}
        </Card>
      )}
    </div>
  );
}

function DiscoveredRow({
  item,
  assessment,
  imported,
  onImport,
}: {
  item: DiscoveredItem;
  assessment: ReturnType<typeof assessOpportunity>;
  imported: boolean;
  onImport: () => void;
}) {
  const eligMeta = ELIG_META[assessment.eligibility.status];
  const matchScore = assessment.matchScore;

  return (
    <div className="bg-gray-50 rounded-lg px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
          {item.organization && (
            <p className="text-xs text-gray-500 truncate">{item.organization}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${eligMeta.color}`}>
              {eligMeta.label}
            </span>
            <span className="text-[11px] text-gray-500">Match: {matchScore}</span>
            {item.country && (
              <span className="text-[11px] text-gray-500">{item.country}</span>
            )}
            {item.funding_type && (
              <span className="text-[11px] text-gray-500 capitalize">
                {item.funding_type.replace(/_/g, ' ')}
              </span>
            )}
            <span className={`text-[11px] px-1.5 py-0.5 rounded-full font-medium ${VERIFICATION_COLORS[item.verification_status] || 'bg-gray-100 text-gray-600'}`}>
              {item.verification_status}
            </span>
          </div>
          {item.deadline_raw && (
            <p className="text-[11px] text-gray-500 mt-1">Deadline: {item.deadline_raw}</p>
          )}
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          {imported ? (
            <span className="text-[11px] text-green-600 flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3" />
              Imported
            </span>
          ) : (
            <button
              onClick={onImport}
              className="text-xs text-navy-600 hover:bg-navy-50 px-2 py-1 rounded-lg transition-colors flex items-center gap-1"
            >
              <PlusCircle className="w-3.5 h-3.5" />
              Import
            </button>
          )}
          {item.link && (
            <a
              href={item.link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-600"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function SimpleDiscoveredRow({ item }: { item: DiscoveredItem }) {
  return (
    <div className="bg-gray-50 rounded-lg px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{item.title}</p>
          {item.organization && <p className="text-xs text-gray-500 truncate">{item.organization}</p>}
          {item.deadline_raw && <p className="text-[11px] text-gray-500 mt-0.5">Deadline: {item.deadline_raw}</p>}
        </div>
        {item.link && (
          <a href={item.link} target="_blank" rel="noopener noreferrer" className="text-gray-400 hover:text-gray-600 flex-shrink-0">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    </div>
  );
}

function StatBox({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: typeof Radar;
  color: 'navy' | 'green' | 'blue' | 'amber' | 'red';
}) {
  const colors: Record<string, string> = {
    navy: 'bg-navy-50 text-navy-700 border-navy-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
    red: 'bg-red-50 text-red-700 border-red-100',
  };
  return (
    <div className={`p-3 rounded-lg border text-center ${colors[color]}`}>
      <Icon className="w-4 h-4 mx-auto mb-1 opacity-70" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[11px] opacity-80">{label}</p>
    </div>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Radar; text: string }) {
  return (
    <div className="text-center py-8">
      <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}

// --- Helpers ---

const ELIG_META: Record<string, { label: string; color: string }> = {
  eligible: { label: 'Eligible', color: 'bg-green-100 text-green-700' },
  potentially_eligible: { label: 'Potential', color: 'bg-blue-100 text-blue-700' },
  insufficient_info: { label: 'Unknown', color: 'bg-amber-100 text-amber-700' },
  ineligible: { label: 'Ineligible', color: 'bg-red-100 text-red-700' },
};

const VERIFICATION_COLORS: Record<string, string> = {
  verified: 'bg-green-100 text-green-700',
  secondary: 'bg-blue-100 text-blue-700',
  unverified: 'bg-amber-100 text-amber-700',
  failed: 'bg-red-100 text-red-700',
  expired: 'bg-gray-100 text-gray-600',
};

const SOURCE_STATUS_COLORS: Record<string, string> = {
  ok: 'bg-green-100 text-green-700',
  error: 'bg-red-100 text-red-700',
  empty: 'bg-amber-100 text-amber-700',
  blocked: 'bg-red-100 text-red-700',
  '': 'bg-gray-100 text-gray-500',
};

const RUN_STATUS_COLORS: Record<string, string> = {
  completed: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
  partial: 'bg-amber-100 text-amber-700',
  running: 'bg-blue-100 text-blue-700',
};

function classifyFromItem(item: DiscoveredItem): { type: OpportunityType; requiredLevel: Level } {
  const result = classifyScrapedItem(item.title, item.notes);
  let level: Level = result.requiredLevel;
  if (level === 'any' && item.study_level) {
    if (item.study_level === 'phd') level = 'phd';
    else if (item.study_level === 'master') level = 'master';
    else if (item.study_level === 'bachelor') level = 'bachelor';
  }
  return { type: result.type, requiredLevel: level };
}

function parseDeadline(raw: string): string {
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
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

import { useState, useEffect, useRef, useId } from 'react';
import {
  X,
  ExternalLink,
  Calendar,
  Building2,
  Globe,
  GraduationCap,
  Clock,
  Loader2,
  Download,
  FileText,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Send,
} from 'lucide-react';
import type { Opportunity, RuleResult } from '../types';
import { useApp } from '../AppContext';
import { applyRules, daysUntil } from '../rules';
import { Dialog } from './Dialog';
import {
  TYPE_LABELS,
  LEVEL_NAME,
  STATUS_OPTIONS,
  STATUS_COLORS,
  TYPE_OPTIONS,
  LEVEL_OPTIONS,
} from '../constants';
import { Tag, selectClass } from './ui';
import {
  loadAISettings,
  buildAIProfile,
  type AISettings,
  type AIProfileCard,
  type AIFitResult,
} from '../ai/storage';
import {
  isAIConfigured,
  buildPrompt,
  callAIFitCheck,
  type AIOpportunityPayload,
} from '../ai/aiClient';

interface OpportunityDetailProps {
  opp: Opportunity;
  profile: Parameters<typeof applyRules>[1];
  onClose: () => void;
}

interface FetchedSection {
  heading: string;
  body: string;
}

interface FetchedDetails {
  title: string;
  content: string;
  sections: FetchedSection[];
  error?: string;
  source?: string;
}

const FIT_COLORS: Record<string, string> = {
  strong: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  weak: 'bg-red-100 text-red-700',
};

const FIT_LABELS: Record<string, string> = {
  strong: 'Strong fit',
  partial: 'Partial fit',
  weak: 'Weak fit',
};

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  if (!value) return null;
  return (
    <div className="flex items-start gap-2.5">
      <div className="flex-shrink-0 mt-0.5 text-gray-400">{icon}</div>
      <div>
        <span className="text-xs font-medium text-gray-500">{label}</span>
        <p className="text-sm text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export function OpportunityDetail({ opp, profile, onClose }: OpportunityDetailProps) {
  const { data, updateOpportunityDescription, updateOpportunityStatus, updateOpportunityClassification, updateOpportunityDocuments } = useApp();
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchedSections, setFetchedSections] = useState<FetchedSection[] | null>(null);
  const [fetchedTitle, setFetchedTitle] = useState<string>('');
  const [savedToProfile, setSavedToProfile] = useState(false);
  const autoFetchedRef = useRef(false);

  // AI state
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiResult, setAiResult] = useState<AIFitResult | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);
  const titleId = useId();
  const previewTitleId = useId();
  const typeSelectId = useId();
  const levelSelectId = useId();
  const aiEnabled = loadAISettings().enabled;

  const ruleResult: RuleResult = applyRules(opp, profile);
  const days = daysUntil(opp.deadline);
  const fundingMatch = opp.notes?.match(/Funding:\s*([^.]+)/i);
  const funding = fundingMatch ? fundingMatch[1].trim() : '';
  const sourceMatch = opp.notes?.match(/Source:\s*(.+)$/i);
  const source = sourceMatch ? sourceMatch[1].trim() : '';

  const hasStoredContent = opp.description && opp.description.length > 0;
  const displaySections = fetchedSections || (hasStoredContent ? parseStoredDescription(opp.description) : null);

  const handleFetch = async () => {
    if (!opp.link) {
      setFetchError('No link available to fetch from.');
      return;
    }
    setFetching(true);
    setFetchError(null);
    setSavedToProfile(false);
    try {
      const fnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/fetch-details`;

      const res = await fetch(fnUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ url: opp.link }),
      });

      if (!res.ok) {
        setFetchError(`Fetch failed (HTTP ${res.status}). Try visiting the link directly.`);
        return;
      }
      const details: FetchedDetails = await res.json();
      if (details.error && details.sections.length === 0) {
        setFetchError(details.error);
        return;
      }
      setFetchedSections(details.sections);
      setFetchedTitle(details.title);

      const descText = formatDescriptionForStorage(details.sections, details.title);
      updateOpportunityDescription(opp.id, descText);
      setSavedToProfile(true);
    } catch {
      setFetchError('Could not connect to the fetch service. Try again later.');
    } finally {
      setFetching(false);
    }
  };

  // Auto-fetch when the detail panel opens and there's no stored content
  useEffect(() => {
    if (autoFetchedRef.current) return;
    autoFetchedRef.current = true;
    if (!hasStoredContent && opp.link) {
      handleFetch();
    }
  }, []);

  const handleAIClick = () => {
    setAiError(null);
    const settings: AISettings = loadAISettings();
    if (!settings.enabled) {
      setAiError('AI is turned off. Go to Settings and turn it on first.');
      return;
    }
    if (!isAIConfigured(settings)) {
      setAiError('AI is not configured. Go to Settings to add your endpoint and API key.');
      return;
    }
    const aiProfile: AIProfileCard = buildAIProfile(data.profile);
    const description = opp.description || (fetchedSections ? fetchedSections.map(s => `${s.heading}: ${s.body}`).join('\n') : '');
    const payload: AIOpportunityPayload = {
      title: opp.title,
      organization: opp.organization,
      type: TYPE_LABELS[opp.type],
      level: LEVEL_NAME[opp.requiredLevel || 'any'],
      deadline: opp.deadline || '',
      funding,
      description,
    };
    const prompt = buildPrompt(aiProfile, payload);
    setAiPreview(prompt);
  };

  const handleAISend = async () => {
    if (!aiPreview) return;
    setAiPreview(null);
    setAiLoading(true);
    setAiError(null);
    try {
      const settings = loadAISettings();
      const aiProfile = buildAIProfile(data.profile);
      const description = opp.description || (fetchedSections ? fetchedSections.map(s => `${s.heading}: ${s.body}`).join('\n') : '');
      const payload: AIOpportunityPayload = {
        title: opp.title,
        organization: opp.organization,
        type: TYPE_LABELS[opp.type],
        level: LEVEL_NAME[opp.requiredLevel || 'any'],
        deadline: opp.deadline || '',
        funding,
        description,
      };
      const result = await callAIFitCheck(settings, aiProfile, payload);
      setAiResult(result);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'AI request failed');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <Dialog labelledBy={titleId} onClose={onClose} className="max-w-3xl max-h-[92vh]">
        {/* Header */}
        <div className="flex items-start justify-between p-4 sm:p-5 border-b border-gray-100 flex-shrink-0">
          <div className="flex-1 min-w-0 pr-3">
            <h2 id={titleId} className="font-bold text-gray-900 text-base sm:text-lg leading-snug">
              {opp.title}
            </h2>
            {opp.organization && (
              <p className="text-sm text-gray-500 mt-0.5 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5" />
                {opp.organization}
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 p-1 flex-shrink-0"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {/* Tags row */}
          <div className="flex flex-wrap gap-1.5">
            <Tag>{TYPE_LABELS[opp.type]}</Tag>
            <Tag>{LEVEL_NAME[opp.requiredLevel || 'any']}</Tag>
            {funding && <Tag color="ok">{funding}</Tag>}
            {ruleResult.flags.map((f, i) => (
              <Tag key={`f-${i}`} color="flag">{f}</Tag>
            ))}
            {ruleResult.reasons.map((r, i) => (
              <Tag key={`r-${i}`} color="late">{r}</Tag>
            ))}
          </div>

          {/* Key info grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
            <InfoRow
              icon={<Calendar className="w-4 h-4" />}
              label="Deadline"
              value={opp.deadline ? `${opp.deadline}${days !== null && days >= 0 ? ` (${days} days left)` : ''}` : 'Not specified'}
            />
            <InfoRow
              icon={<Building2 className="w-4 h-4" />}
              label="Organization"
              value={opp.organization || 'Not specified'}
            />
            <InfoRow
              icon={<GraduationCap className="w-4 h-4" />}
              label="Required level"
              value={LEVEL_NAME[opp.requiredLevel || 'any']}
            />
            <InfoRow
              icon={<Globe className="w-4 h-4" />}
              label="Eligible countries"
              value={opp.eligibleCountries && opp.eligibleCountries.length > 0
                ? opp.eligibleCountries.join(', ')
                : 'All countries'}
            />
            <InfoRow
              icon={<Clock className="w-4 h-4" />}
              label="Requires degree"
              value={opp.requiresDegree === 'yes' ? 'Yes' : 'No'}
            />
            <InfoRow
              icon={<FileText className="w-4 h-4" />}
              label="Source"
              value={source || 'Opportunities Circle'}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor={typeSelectId} className="block text-xs font-semibold text-gray-700 mb-1.5">
                Opportunity type
              </label>
              <select
                id={typeSelectId}
                value={opp.type}
                onChange={(e) =>
                  updateOpportunityClassification(opp.id, { type: e.target.value as Opportunity['type'] })
                }
                className={selectClass}
              >
                {TYPE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor={levelSelectId} className="block text-xs font-semibold text-gray-700 mb-1.5">
                Required level
              </label>
              <select
                id={levelSelectId}
                value={opp.requiredLevel || 'any'}
                onChange={(e) =>
                  updateOpportunityClassification(opp.id, { requiredLevel: e.target.value as Opportunity['requiredLevel'] })
                }
                className={selectClass}
              >
                <option value="any">Any</option>
                {LEVEL_OPTIONS.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="p-4 rounded-lg border border-gray-200">
            <h4 className="text-sm font-semibold text-gray-900 mb-2">Documents for this application</h4>
            {data.documents.length === 0 ? (
              <p className="text-xs text-gray-500">
                You have not uploaded any documents yet. Upload them on the Documents page, then tick the ones you will submit here.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.documents.map((doc) => (
                  <li key={doc.id}>
                    <label className="flex items-center gap-2.5 text-sm text-gray-800 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={opp.documentIds.includes(doc.id)}
                        onChange={() =>
                          updateOpportunityDocuments(
                            opp.id,
                            opp.documentIds.includes(doc.id)
                              ? opp.documentIds.filter((id) => id !== doc.id)
                              : [...opp.documentIds, doc.id]
                          )
                        }
                        className="w-4 h-4 accent-navy-600"
                      />
                      {doc.label}
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* AI Fit result */}
          {aiResult && (
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="flex items-center gap-2 mb-1">
                <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${FIT_COLORS[aiResult.fit]}`}>
                  <Sparkles className="w-3 h-3 inline mr-1" />
                  {FIT_LABELS[aiResult.fit]}
                </span>
              </div>
              <p className="text-sm text-gray-700">{aiResult.reason}</p>
            </div>
          )}

          {/* Fetch error */}
          {fetchError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{fetchError}</span>
            </div>
          )}

          {aiError && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-700">
              <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>{aiError}</span>
            </div>
          )}

          {/* AI preview modal */}
          {aiPreview && (
            <Dialog labelledBy={previewTitleId} onClose={() => setAiPreview(null)} zIndex="z-[60]" className="max-w-2xl max-h-[80vh]">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                  <h3 id={previewTitleId} className="font-semibold text-gray-900 text-sm">Preview: what will be sent to the AI</h3>
                  <button onClick={() => setAiPreview(null)} className="text-gray-400 hover:text-gray-600 p-1" aria-label="Close">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto p-4">
                  <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-3 border border-gray-100">
                    {aiPreview}
                  </pre>
                </div>
                <div className="flex gap-2 p-4 border-t border-gray-100">
                  <button onClick={() => setAiPreview(null)} className="px-4 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-medium transition-colors">
                    Cancel
                  </button>
                  <button onClick={handleAISend} className="px-4 py-2 rounded-lg bg-navy-600 text-on-brand hover:bg-navy-700 text-sm font-medium transition-colors flex items-center gap-1.5">
                    <Send className="w-4 h-4" />
                    Send to AI
                  </button>
                </div>
            </Dialog>
          )}

          {/* Auto-fetch loading state */}
          {fetching && (
            <div className="flex flex-col items-center justify-center gap-2 py-8">
              <div className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin text-navy-600" />
                <span className="text-sm text-gray-500">
                  Gathering information from the web...
                </span>
              </div>
            </div>
          )}

          {/* Fetched content / description */}
          {!fetching && displaySections && displaySections.length > 0 ? (
            <div className="space-y-3">

              {fetchedTitle && fetchedTitle !== opp.title && (
                <h3 className="text-sm font-semibold text-gray-700">{fetchedTitle}</h3>
              )}
              {displaySections.map((section, i) => (
                <div key={i} className="border-l-2 border-navy-200 pl-3">
                  <h4 className="text-sm font-semibold text-gray-800 mb-1">{section.heading}</h4>
                  <p className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">{section.body}</p>
                </div>
              ))}
              {savedToProfile && (
                <p className="text-xs text-green-600 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Content saved -- you'll see it next time without re-fetching.
                </p>
              )}
            </div>
          ) : !fetching && !fetchError && !hasStoredContent ? (
            <div className="text-center py-6">
              <FileText className="w-10 h-10 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">
                {opp.link ? 'Waiting to gather information...' : 'No link available to fetch from.'}
              </p>
            </div>
          ) : null}

          {/* Notes */}
          {opp.notes && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-100">
              <h4 className="text-xs font-semibold text-amber-800 mb-1">Notes</h4>
              <p className="text-sm text-amber-900">{opp.notes}</p>
            </div>
          )}
        </div>

        {/* Footer actions */}
        <div className="flex flex-wrap items-center gap-2 p-4 border-t border-gray-100 flex-shrink-0">
          <button
            onClick={handleFetch}
            disabled={fetching || !opp.link}
            className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-navy-600 text-on-brand hover:bg-navy-700 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {fetching ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Download className="w-4 h-4" />
            )}
            {fetching ? 'Fetching...' : 'Re-fetch from web'}
          </button>

          {aiEnabled ? (
            <button
              onClick={handleAIClick}
              disabled={aiLoading}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-medium transition-colors disabled:opacity-50"
            >
              {aiLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Sparkles className="w-4 h-4" />
              )}
              AI fit check
            </button>
          ) : null}

          {opp.link && (
            <a
              href={opp.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-navy-600 hover:bg-navy-50 text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open original
            </a>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <select
              value={opp.status}
              onChange={(e) =>
                updateOpportunityStatus(opp.id, e.target.value as Opportunity['status'])
              }
              className={`${selectClass} !w-auto !py-1.5 text-xs ${STATUS_COLORS[opp.status]}`}
              aria-label="Status"
            >
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        </div>
    </Dialog>
  );
}

function formatDescriptionForStorage(sections: FetchedSection[], title: string): string {
  const parts: string[] = [];
  if (title) parts.push(`# ${title}`);
  for (const s of sections) {
    parts.push(`## ${s.heading}`);
    parts.push(s.body);
  }
  return parts.join('\n');
}

function parseStoredDescription(desc: string): FetchedSection[] | null {
  if (!desc) return null;
  const sections: FetchedSection[] = [];
  const lines = desc.split('\n');
  let currentHeading = '';
  let currentBody: string[] = [];

  for (const line of lines) {
    if (line.startsWith('## ')) {
      if (currentHeading) {
        sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
      }
      currentHeading = line.slice(3);
      currentBody = [];
    } else if (line.startsWith('# ')) {
      // skip title
    } else {
      currentBody.push(line);
    }
  }
  if (currentHeading) {
    sections.push({ heading: currentHeading, body: currentBody.join('\n').trim() });
  }
  return sections.length > 0 ? sections : null;
}

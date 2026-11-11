import { useId, useMemo, useState } from 'react';
import {
  Trash2,
  ExternalLink,
  Calendar,
  Building2,
  Sparkles,
  X,
  Send,
  Loader2,
  FileText,
} from 'lucide-react';
import type { Opportunity } from '../types';
import { useApp } from '../AppContext';
import { applyRules, daysUntil } from '../rules';
import {
  STATUS_OPTIONS,
  TYPE_LABELS,
  LEVEL_NAME,
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
  isGeminiConfigured,
  buildPrompt,
  buildPersonalFitPrompt,
  callAIFitCheck,
  callGeminiFitCheck,
  createApprovalToken,
  GEMINI_MODEL,
  type AIOpportunityPayload,
} from '../ai/aiClient';
import { OpportunityDetail } from './OpportunityDetail';
import { Dialog } from './Dialog';

interface OpportunityListProps {
  opportunities: Opportunity[];
  profile: Parameters<typeof applyRules>[1];
  showReasons: boolean;
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

function AIPreviewModal({
  promptText,
  isGemini,
  onSend,
  onCancel,
}: {
  promptText: string;
  isGemini: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
  const titleId = useId();
  return (
    <Dialog labelledBy={titleId} onClose={onCancel} className="max-w-2xl max-h-[80vh]">
      <div className="flex items-center justify-between p-4 border-b border-gray-100">
        <h2 id={titleId} className="font-semibold text-gray-900 text-sm">Review before sending to AI</h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 p-1"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {isGemini && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
              <p className="text-xs font-semibold text-amber-800 mb-1">Approval required</p>
              <p className="text-xs text-amber-900">This request includes your personal profile information. It will be sent to:</p>
              <ul className="text-xs text-amber-900 mt-1 space-y-0.5 list-disc pl-4">
                <li>Provider: Google Gemini (server-side)</li>
                <li>Model: {GEMINI_MODEL}</li>
                <li>Purpose: Evaluate how well you fit this opportunity</li>
                <li>Data: Your education level, field, country, languages, skills, and the opportunity details below</li>
              </ul>
              <p className="text-xs text-amber-900 mt-1.5">This approval applies only to this request. It will not authorize future requests.</p>
            </div>
          )}
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono bg-gray-50 rounded-lg p-3 border border-gray-100">
            {promptText}
          </pre>
        </div>
        <div className="flex gap-2 p-4 border-t border-gray-100">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg bg-gray-100 text-gray-800 hover:bg-gray-200 text-sm font-medium transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onSend}
            className="px-4 py-2 rounded-lg bg-navy-600 text-on-brand hover:bg-navy-700 text-sm font-medium transition-colors flex items-center gap-1.5"
          >
            <Send className="w-4 h-4" />
            {isGemini ? 'Approve and send' : 'Send to AI'}
          </button>
        </div>
    </Dialog>
  );
}

export function OpportunityList({
  opportunities,
  profile,
  showReasons,
}: OpportunityListProps) {
  const { updateOpportunityStatus, deleteOpportunity } = useApp();
  const [aiPreview, setAiPreview] = useState<{ prompt: string; opp: Opportunity; payload: AIOpportunityPayload; profile: AIProfileCard } | null>(null);
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  const [aiResults, setAiResults] = useState<Record<string, AIFitResult>>({});
  const [aiError, setAiError] = useState<string | null>(null);
  const [detailOpp, setDetailOpp] = useState<Opportunity | null>(null);

  const evaluated = useMemo(
    () =>
      opportunities.map((opp) => ({
        opp,
        ...applyRules(opp, profile),
      })),
    [opportunities, profile]
  );

  const handleAIClick = (opp: Opportunity) => {
    setAiError(null);
    const settings: AISettings = loadAISettings();
    if (!isAIConfigured(settings)) {
      setAiError('AI is not configured or is turned off. Go to Settings to enable it.');
      return;
    }
    const aiProfile: AIProfileCard = buildAIProfile(profile);
    const fundingMatch = opp.notes?.match(/Funding:\s*([^.]+)/i);
    const payload: AIOpportunityPayload = {
      title: opp.title,
      organization: opp.organization,
      type: TYPE_LABELS[opp.type],
      level: LEVEL_NAME[opp.requiredLevel || 'any'],
      deadline: opp.deadline || '',
      funding: fundingMatch ? fundingMatch[1].trim() : '',
      description: opp.description || '',
    };
    const prompt = isGeminiConfigured(settings)
      ? buildPersonalFitPrompt(aiProfile, payload)
      : buildPrompt(aiProfile, payload);
    setAiPreview({ prompt, opp, payload, profile: aiProfile });
  };

  const handleAISend = async () => {
    if (!aiPreview) return;
    const { opp, payload, profile: aiProfile, prompt } = aiPreview;
    const settings = loadAISettings();

    if (isGeminiConfigured(settings)) {
      const { id: tokenId, error: tokenError } = await createApprovalToken({
        provider: 'gemini',
        model: GEMINI_MODEL,
        task: 'fit-check',
        personalData: true,
        prompt,
      });
      if (tokenError || !tokenId) {
        setAiError(tokenError || 'Could not create approval. Please try again.');
        return;
      }
      setAiPreview(null);
      setAiLoading(opp.id);
      setAiError(null);
      try {
        const result = await callGeminiFitCheck(aiProfile, payload, tokenId);
        setAiResults((prev) => ({ ...prev, [opp.id]: result }));
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'AI request failed');
      } finally {
        setAiLoading(null);
      }
    } else {
      setAiPreview(null);
      setAiLoading(opp.id);
      setAiError(null);
      try {
        const result = await callAIFitCheck(settings, aiProfile, payload);
        setAiResults((prev) => ({ ...prev, [opp.id]: result }));
      } catch (err) {
        setAiError(err instanceof Error ? err.message : 'AI request failed');
      } finally {
        setAiLoading(null);
      }
    }
  };

  if (evaluated.length === 0) {
    return (
      <div className="text-center text-gray-500 py-12 text-sm">
        Nothing here yet.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {aiError && (
        <div className="mb-3 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-700 flex items-center justify-between gap-2">
          <span>{aiError}</span>
          <button
            onClick={() => setAiError(null)}
            className="text-red-400 hover:text-red-600 flex-shrink-0"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {aiPreview && (
        <AIPreviewModal
          promptText={aiPreview.prompt}
          isGemini={isGeminiConfigured(loadAISettings())}
          onSend={handleAISend}
          onCancel={() => setAiPreview(null)}
        />
      )}

      {detailOpp && (
        <OpportunityDetail
          opp={detailOpp}
          profile={profile}
          onClose={() => setDetailOpp(null)}
        />
      )}

      {evaluated.map(({ opp, reasons, flags }) => {
        const days = daysUntil(opp.deadline);
        const fitResult = aiResults[opp.id];
        const isLoading = aiLoading === opp.id;
        const hasDetails = opp.description && opp.description.length > 0;
        return (
          <div
            key={opp.id}
            className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 sm:p-5 hover:border-navy-200 hover:shadow-md transition-all cursor-pointer"
            onClick={() => setDetailOpp(opp)}
          >
            <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
              <div className="flex-1 min-w-0">
                <h3 className="font-semibold text-gray-900 text-sm sm:text-base">
                  <button
                    type="button"
                    onClick={() => setDetailOpp(opp)}
                    className="text-left hover:text-navy-700 hover:underline transition-colors rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-navy-400"
                  >
                    {opp.title}
                  </button>
                </h3>
                {opp.organization && (
                  <p className="text-xs text-gray-500 mt-0.5 flex items-center gap-1">
                    <Building2 className="w-3 h-3" />
                    {opp.organization}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  <Tag>{TYPE_LABELS[opp.type]}</Tag>
                  <Tag>{LEVEL_NAME[opp.requiredLevel || 'any']}</Tag>
                  {hasDetails && (
                    <span className="inline-flex items-center gap-0.5 text-xs text-navy-600">
                      <FileText className="w-3 h-3" />
                      Details available
                    </span>
                  )}
                </div>

                {fitResult && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${FIT_COLORS[fitResult.fit]}`}>
                      <Sparkles className="w-3 h-3 inline mr-1" />
                      {FIT_LABELS[fitResult.fit]}
                    </span>
                    <span className="text-xs text-gray-600">{fitResult.reason}</span>
                  </div>
                )}
              </div>

              <div className="sm:w-32 flex-shrink-0">
                <div className="flex items-center gap-1 text-xs text-gray-500 mb-1">
                  <Calendar className="w-3 h-3" />
                  <span className="font-medium">Deadline</span>
                </div>
                {opp.deadline ? (
                  <span className="text-sm text-gray-900">
                    {opp.deadline}
                    {days !== null && days >= 0 && (
                      <span className="text-gray-500 ml-1">({days}d)</span>
                    )}
                  </span>
                ) : (
                  <span className="text-sm text-gray-400">none</span>
                )}
              </div>

              <div className="sm:w-36 flex-shrink-0">
                <div className="text-xs text-gray-500 mb-1 font-medium sm:hidden">
                  Status
                </div>
                <select
                  value={opp.status}
                  onChange={(e) => {
                    e.stopPropagation();
                    updateOpportunityStatus(
                      opp.id,
                      e.target.value as Opportunity['status']
                    );
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className={selectClass}
                  aria-label="Status"
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="sm:w-48 flex-shrink-0">
                <div className="flex flex-wrap gap-1.5">
                  {flags.map((f, i) => (
                    <Tag key={`f-${i}`} color="flag">
                      {f}
                    </Tag>
                  ))}
                  {showReasons &&
                    reasons.map((r, i) => (
                      <Tag key={`r-${i}`} color="late">
                        {r}
                      </Tag>
                    ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  {opp.link && (
                    <a
                      href={opp.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="inline-flex items-center gap-1 text-xs text-navy-600 hover:text-navy-700 hover:underline"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Open link
                    </a>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAIClick(opp);
                    }}
                    disabled={isLoading}
                    className="inline-flex items-center gap-1 text-xs text-navy-600 hover:text-navy-700 hover:underline disabled:opacity-50"
                    aria-label="AI fit check"
                  >
                    {isLoading ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Sparkles className="w-3 h-3" />
                    )}
                    AI fit
                  </button>
                </div>
              </div>

              <div className="sm:w-auto flex-shrink-0 flex sm:block">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    if (confirm('Delete this opportunity?')) {
                      deleteOpportunity(opp.id);
                    }
                  }}
                  className="text-danger-600 hover:text-danger-700 hover:bg-danger-50 p-1.5 rounded-lg transition-colors"
                  aria-label="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

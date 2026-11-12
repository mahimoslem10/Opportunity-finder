import { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  HelpCircle,
  TrendingUp,
  Target,
  ShieldCheck,
  Award,
  Brain,
  Sparkles,
  Info,
  Lightbulb,
  Clock,
} from 'lucide-react';
import { Card, Tag, Button } from '../components/ui';
import { TYPE_LABELS, LEVEL_NAME } from '../constants';
import { daysUntil } from '../rules';
import type { RankedOpportunity } from '../matching/types';
import type { RequirementMet, EligibilityStatus } from '../matching/types';

const ELIGIBILITY_META: Record<EligibilityStatus, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  eligible: { label: 'Eligible', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  potentially_eligible: { label: 'Potentially eligible', color: 'bg-blue-100 text-blue-700', icon: HelpCircle },
  ineligible: { label: 'Not eligible', color: 'bg-red-100 text-red-700', icon: XCircle },
  insufficient_info: { label: 'Insufficient information', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
};

const REQ_META: Record<RequirementMet, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  met: { label: 'Met', color: 'text-green-700 bg-green-50 border-green-100', icon: CheckCircle2 },
  unmet: { label: 'Not met', color: 'text-red-700 bg-red-50 border-red-100', icon: XCircle },
  unknown: { label: 'Unknown', color: 'text-amber-700 bg-amber-50 border-amber-100', icon: HelpCircle },
  potentially_met: { label: 'Potentially met', color: 'text-blue-700 bg-blue-50 border-blue-100', icon: AlertTriangle },
};

interface Props {
  ranked: RankedOpportunity;
  onBack: () => void;
}

export function OpportunityAssessmentView({ ranked, onBack }: Props) {
  const { opp, assessment } = ranked;
  const eligMeta = ELIGIBILITY_META[assessment.eligibility.status];
  const ElIcon = eligMeta.icon;
  const dDays = daysUntil(opp.deadline);
  const compPercent = Math.round((assessment.competitiveness.score / assessment.competitiveness.maxScore) * 100);
  const [showImprovements, setShowImprovements] = useState(false);

  const mandatoryImprovements = assessment.potential.improvementsNeeded.filter((i) => i.mandatory);
  const optionalImprovements = assessment.potential.improvementsNeeded.filter((i) => !i.mandatory);

  return (
    <div className="space-y-5">
      {/* Back button + header */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to Intelligence
      </button>

      <Card>
        <div className="flex items-start gap-3 mb-3">
          <div className="flex-shrink-0 w-10 h-10 rounded-lg bg-navy-100 flex items-center justify-center">
            <Brain className="w-5 h-5 text-navy-600" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-gray-900 leading-snug">{opp.title}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {opp.organization || 'Unknown organization'} · {TYPE_LABELS[opp.type]} · {LEVEL_NAME[opp.requiredLevel || 'any']}
            </p>
          </div>
        </div>

        {/* Overall status badges */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${eligMeta.color}`}>
            <ElIcon className="w-3.5 h-3.5" />
            {eligMeta.label}
          </span>
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-navy-100 text-navy-700">
            <TrendingUp className="w-3.5 h-3.5" />
            {compPercent}% competitive
          </span>
          {dDays !== null && dDays >= 0 && (
            <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${
              dDays <= 14 ? 'bg-red-100 text-red-700' : dDays <= 30 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
            }`}>
              <Clock className="w-3.5 h-3.5" />
              {dDays} days left
            </span>
          )}
          {assessment.potential.canImprove && (
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
              <Lightbulb className="w-3.5 h-3.5" />
              Can improve
            </span>
          )}
        </div>

        <p className="text-sm text-gray-700">{ranked.rankReason}</p>
      </Card>

      {/* Eligibility Assessment */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-4 h-4 text-navy-600" />
          <h3 className="text-sm font-bold text-gray-900">Eligibility assessment</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">{assessment.eligibility.explanation}</p>

        <div className="space-y-2">
          {assessment.eligibility.checks.map((check) => {
            const meta = REQ_META[check.status];
            const Icon = meta.icon;
            return (
              <div key={check.id} className={`rounded-lg border p-3 ${meta.color}`}>
                <div className="flex items-start gap-2.5">
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold">{check.label}</span>
                      {check.mandatory && (
                        <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                          Mandatory
                        </span>
                      )}
                    </div>
                    <p className="text-xs mt-1 text-gray-700">{check.detail}</p>
                    {check.evidenceClaims && check.evidenceClaims.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <p className="text-[11px] font-medium text-gray-500">Verified evidence:</p>
                        {check.evidenceClaims.map((ev, i) => (
                          <p key={i} className="text-[11px] text-gray-600 italic pl-2 border-l-2 border-gray-200">
                            {ev.length > 120 ? ev.slice(0, 120) + '...' : ev}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Competitiveness Assessment */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <TrendingUp className="w-4 h-4 text-navy-600" />
          <h3 className="text-sm font-bold text-gray-900">Competitiveness assessment</h3>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>Score</span>
              <span className="font-bold text-gray-900">
                {assessment.competitiveness.score} / {assessment.competitiveness.maxScore} ({compPercent}%)
              </span>
            </div>
            <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  compPercent >= 60 ? 'bg-green-500' : compPercent >= 30 ? 'bg-amber-500' : 'bg-red-400'
                }`}
                style={{ width: `${compPercent}%` }}
              />
            </div>
          </div>
        </div>

        {/* Factors */}
        <div className="space-y-2 mb-3">
          {assessment.competitiveness.factors.map((factor) => {
            const ratio = factor.score / factor.maxScore;
            const pct = Math.round(ratio * 100);
            return (
              <div key={factor.id} className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-gray-900">{factor.label}</span>
                  <span className="text-xs text-gray-500">
                    {factor.score}/{factor.maxScore}
                  </span>
                </div>
                <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1.5">
                  <div
                    className={`h-full rounded-full ${
                      pct >= 60 ? 'bg-green-500' : pct >= 30 ? 'bg-amber-500' : 'bg-red-400'
                    }`}
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="text-[11px] text-gray-600">{factor.detail}</p>
              </div>
            );
          })}
        </div>

        {/* Strengths */}
        {assessment.competitiveness.strengths.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-green-700 mb-1.5">Strengths</p>
            <div className="space-y-1">
              {assessment.competitiveness.strengths.map((s, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Weaknesses */}
        {assessment.competitiveness.weaknesses.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-amber-700 mb-1.5">Areas to strengthen</p>
            <div className="space-y-1">
              {assessment.competitiveness.weaknesses.map((w, i) => (
                <div key={i} className="flex items-start gap-1.5 text-xs text-gray-700">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 flex-shrink-0" />
                  <span>{w}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="p-2.5 rounded-lg bg-blue-50 border border-blue-200">
          <div className="flex items-start gap-2">
            <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 flex-shrink-0" />
            <p className="text-[11px] text-blue-900">{assessment.competitiveness.disclaimer}</p>
          </div>
        </div>
      </Card>

      {/* Potential Assessment */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Lightbulb className="w-4 h-4 text-navy-600" />
          <h3 className="text-sm font-bold text-gray-900">Potential assessment</h3>
        </div>
        <p className="text-xs text-gray-500 mb-3">{assessment.potential.explanation}</p>

        {assessment.potential.improvementsNeeded.length > 0 ? (
          <div className="space-y-3">
            {/* Toggle */}
            <button
              onClick={() => setShowImprovements((v) => !v)}
              className="text-xs font-medium text-navy-600 hover:text-navy-700 flex items-center gap-1"
            >
              {showImprovements ? 'Hide' : 'Show'} improvement plan
              ({assessment.potential.improvementsNeeded.length} items)
            </button>

            {showImprovements && (
              <div className="space-y-3">
                {/* Mandatory improvements */}
                {mandatoryImprovements.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-amber-800 mb-2">
                      Mandatory improvements ({mandatoryImprovements.length})
                    </p>
                    <div className="space-y-2">
                      {mandatoryImprovements.map((imp) => (
                        <ImprovementCard key={imp.id} imp={imp} />
                      ))}
                    </div>
                  </div>
                )}

                {/* Optional improvements */}
                {optionalImprovements.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-gray-700 mb-2">
                      Optional improvements ({optionalImprovements.length})
                    </p>
                    <div className="space-y-2">
                      {optionalImprovements.map((imp) => (
                        <ImprovementCard key={imp.id} imp={imp} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-4">
            <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
            <p className="text-sm text-gray-600">
              Your profile is already strong for this opportunity. Focus on preparing a high-quality application.
            </p>
          </div>
        )}
      </Card>
    </div>
  );
}

function ImprovementCard({ imp }: { imp: import('../matching/types').ImprovementRecommendation }) {
  const priorityColors = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-gray-100 text-gray-600',
  };

  return (
    <div className={`rounded-lg border p-3 ${
      imp.mandatory ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
    }`}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <p className="text-xs font-semibold text-gray-900 flex-1">{imp.gap}</p>
        <span className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 ${priorityColors[imp.priority]}`}>
          {imp.priority}
        </span>
      </div>
      <div className="space-y-1 text-[11px] text-gray-600">
        <p><span className="font-medium text-gray-700">Why it matters:</span> {imp.whyItMatters}</p>
        <p><span className="font-medium text-gray-700">Action:</span> {imp.suggestedAction}</p>
        <p><span className="font-medium text-gray-700">Expected benefit:</span> {imp.expectedBenefit}</p>
      </div>
    </div>
  );
}

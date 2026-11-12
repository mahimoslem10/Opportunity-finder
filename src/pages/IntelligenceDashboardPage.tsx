import { useState, useMemo } from 'react';
import {
  Brain,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  TrendingUp,
  Clock,
  Target,
  Sparkles,
  ChevronRight,
  Award,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { useApp } from '../AppContext';
import { Card, Tag, selectClass } from '../components/ui';
import { loadCandidateProfile } from '../candidate/storage';
import { buildCandidateSnapshot } from '../matching/engine';
import {
  runFullAssessment,
  getBestMatches,
  getEligibleOpportunities,
  getPotentialOpportunities,
  getOpportunitiesNeedingAttention,
  getMissingRequirementsSummary,
  loadImprovementProgress,
} from '../matching/ranking';
import type { RankedOpportunity } from '../matching/types';
import { OpportunityAssessmentView } from './OpportunityAssessmentPage';
import { TYPE_LABELS, LEVEL_NAME } from '../constants';
import { daysUntil } from '../rules';

const ELIGIBILITY_META = {
  eligible: { label: 'Eligible', color: 'bg-green-100 text-green-700', icon: CheckCircle2 },
  potentially_eligible: { label: 'Potentially eligible', color: 'bg-blue-100 text-blue-700', icon: HelpCircle },
  ineligible: { label: 'Not eligible', color: 'bg-red-100 text-red-700', icon: XCircle },
  insufficient_info: { label: 'Insufficient info', color: 'bg-amber-100 text-amber-700', icon: AlertTriangle },
};

type DashboardTab = 'overview' | 'best' | 'eligible' | 'potential' | 'attention';

export function IntelligenceDashboardPage() {
  const { data } = useApp();
  const [selectedOpp, setSelectedOpp] = useState<RankedOpportunity | null>(null);
  const [tab, setTab] = useState<DashboardTab>('overview');

  const result = useMemo(() => {
    const candidateData = loadCandidateProfile();
    const snap = buildCandidateSnapshot(data.profile, candidateData.claims);
    const progress = loadImprovementProgress();
    return runFullAssessment(data.opportunities, snap, progress);
  }, [data.opportunities, data.profile]);

  const bestMatches = useMemo(() => getBestMatches(result.ranked, 5), [result.ranked]);
  const eligible = useMemo(() => getEligibleOpportunities(result.ranked), [result.ranked]);
  const potential = useMemo(() => getPotentialOpportunities(result.ranked), [result.ranked]);
  const attention = useMemo(() => getOpportunitiesNeedingAttention(result.ranked), [result.ranked]);
  const missingReqs = useMemo(() => getMissingRequirementsSummary(result.assessments), [result.assessments]);

  const stats = useMemo(() => {
    const total = result.assessments.length;
    const eligibleCount = result.assessments.filter((a) => a.eligibility.status === 'eligible').length;
    const potentialCount = result.assessments.filter((a) =>
      a.eligibility.status === 'potentially_eligible' || a.eligibility.status === 'insufficient_info'
    ).length;
    const ineligibleCount = result.assessments.filter((a) => a.eligibility.status === 'ineligible').length;
    const avgComp = total > 0
      ? Math.round(result.assessments.reduce((s, a) => s + a.competitiveness.score / a.competitiveness.maxScore, 0) / total * 100)
      : 0;
    return { total, eligibleCount, potentialCount, ineligibleCount, avgComp };
  }, [result.assessments]);

  if (selectedOpp) {
    return (
      <OpportunityAssessmentView
        ranked={selectedOpp}
        onBack={() => setSelectedOpp(null)}
      />
    );
  }

  if (data.opportunities.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <Brain className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">No opportunities to analyze yet</h2>
          <p className="text-sm text-gray-500">
            Add opportunities from the Dashboard or Sources page to see intelligent matching.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <Card>
        <div className="flex items-center gap-2 mb-1">
          <Brain className="w-5 h-5 text-navy-600" />
          <h2 className="text-lg font-bold text-gray-900">Opportunity Intelligence</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Every opportunity is evaluated against your verified candidate profile using explainable rules.
          See eligibility, competitiveness, and a personalized improvement plan for each one.
        </p>

        <div className="p-3 rounded-lg bg-green-50 border border-green-200 mb-4">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-green-700 flex-shrink-0" />
            <p className="text-xs text-green-900">
              All matching runs locally in your browser using your verified profile claims. No personal data
              is sent to any external AI. Existing AI Fit Check remains available per-opportunity with approval.
            </p>
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <StatBox label="Total" value={stats.total} icon={Target} color="navy" />
          <StatBox label="Eligible" value={stats.eligibleCount} icon={CheckCircle2} color="green" />
          <StatBox label="Potential" value={stats.potentialCount} icon={HelpCircle} color="blue" />
          <StatBox label="Not eligible" value={stats.ineligibleCount} icon={XCircle} color="red" />
          <StatBox label="Avg comp." value={`${stats.avgComp}%`} icon={TrendingUp} color="amber" />
        </div>
      </Card>

      {/* Tab navigation */}
      <div className="flex flex-wrap gap-2">
        {([
          { id: 'overview', label: 'Overview' },
          { id: 'best', label: `Best matches (${bestMatches.length})` },
          { id: 'eligible', label: `Eligible (${eligible.length})` },
          { id: 'potential', label: `Potential (${potential.length})` },
          { id: 'attention', label: `Needs attention (${attention.length})` },
        ] as { id: DashboardTab; label: string }[]).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              tab === t.id
                ? 'bg-navy-600 text-on-brand'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Overview tab */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* Best matches preview */}
          {bestMatches.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Sparkles className="w-4 h-4 text-navy-600" />
                <h3 className="text-sm font-bold text-gray-900">Top recommended opportunities</h3>
              </div>
              <div className="space-y-2">
                {bestMatches.slice(0, 3).map((r) => (
                  <RankedOppRow key={r.opp.id} ranked={r} onClick={() => setSelectedOpp(r)} />
                ))}
              </div>
            </Card>
          )}

          {/* Missing requirements summary */}
          {missingReqs.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-gray-900">Common missing requirements</h3>
              </div>
              <div className="space-y-2">
                {missingReqs.slice(0, 6).map((req, i) => (
                  <div key={i} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 truncate">{req.label}</p>
                      <p className="text-xs text-gray-500">
                        Affects {req.count} opportunity{req.count !== 1 ? 's' : ''}
                      </p>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Recommended next actions */}
          {result.improvements.length > 0 && (
            <Card>
              <div className="flex items-center gap-2 mb-3">
                <Target className="w-4 h-4 text-navy-600" />
                <h3 className="text-sm font-bold text-gray-900">Recommended next actions</h3>
              </div>
              <div className="space-y-2">
                {result.improvements.slice(0, 4).map((action) => (
                  <div
                    key={action.id}
                    className={`rounded-lg px-3 py-2.5 border ${
                      action.mandatory
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-gray-900">{action.gap}</p>
                        <p className="text-xs text-gray-600 mt-0.5">{action.suggestedAction}</p>
                        <p className="text-[11px] text-gray-500 mt-1">
                          Helps with: {action.oppTitles.slice(0, 2).join(', ')}
                          {action.oppTitles.length > 2 && ` +${action.oppTitles.length - 2} more`}
                        </p>
                      </div>
                      <PriorityBadge priority={action.priority} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-gray-400 mt-3">
                See the Improvement page for the full roadmap and progress tracking.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Best matches tab */}
      {tab === 'best' && (
        <Card>
          {bestMatches.length > 0 ? (
            <div className="space-y-2">
              {bestMatches.map((r) => (
                <RankedOppRow key={r.opp.id} ranked={r} onClick={() => setSelectedOpp(r)} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Sparkles} text="No eligible opportunities found yet. Add more profile information or upload documents to improve matching." />
          )}
        </Card>
      )}

      {/* Eligible tab */}
      {tab === 'eligible' && (
        <Card>
          {eligible.length > 0 ? (
            <div className="space-y-2">
              {eligible.map((r) => (
                <RankedOppRow key={r.opp.id} ranked={r} onClick={() => setSelectedOpp(r)} />
              ))}
            </div>
          ) : (
            <EmptyState icon={CheckCircle2} text="No fully eligible opportunities found. Complete your profile to get eligibility assessments." />
          )}
        </Card>
      )}

      {/* Potential tab */}
      {tab === 'potential' && (
        <Card>
          {potential.length > 0 ? (
            <div className="space-y-2">
              {potential.map((r) => (
                <RankedOppRow key={r.opp.id} ranked={r} onClick={() => setSelectedOpp(r)} />
              ))}
            </div>
          ) : (
            <EmptyState icon={HelpCircle} text="No potential opportunities. All are either eligible or not eligible." />
          )}
        </Card>
      )}

      {/* Attention tab */}
      {tab === 'attention' && (
        <Card>
          {attention.length > 0 ? (
            <div className="space-y-2">
              {attention.map((r) => (
                <RankedOppRow key={r.opp.id} ranked={r} onClick={() => setSelectedOpp(r)} />
              ))}
            </div>
          ) : (
            <EmptyState icon={Clock} text="No opportunities with urgent deadlines right now." />
          )}
        </Card>
      )}
    </div>
  );
}

function RankedOppRow({ ranked, onClick }: { ranked: RankedOpportunity; onClick: () => void }) {
  const { opp, assessment, rank } = ranked;
  const eligMeta = ELIGIBILITY_META[assessment.eligibility.status];
  const ElIcon = eligMeta.icon;
  const dDays = daysUntil(opp.deadline);
  const compPercent = Math.round((assessment.competitiveness.score / assessment.competitiveness.maxScore) * 100);

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between gap-3 bg-gray-50 hover:bg-gray-100 rounded-lg px-4 py-3 transition-colors text-left"
    >
      <div className="min-w-0 flex-1 flex items-center gap-3">
        <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-navy-100 flex items-center justify-center text-xs font-bold text-navy-700">
          #{rank}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-gray-900 truncate">{opp.title}</p>
          <p className="text-xs text-gray-500 truncate">
            {opp.organization || 'Unknown organization'} · {TYPE_LABELS[opp.type]}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${eligMeta.color}`}>
              <ElIcon className="w-3 h-3" />
              {eligMeta.label}
            </span>
            <span className="text-[11px] text-gray-500">
              Competitiveness: {compPercent}%
            </span>
            {dDays !== null && dDays >= 0 && dDays <= 30 && (
              <span className="text-[11px] font-medium text-red-600">
                {dDays} days left
              </span>
            )}
          </div>
        </div>
      </div>
      <ChevronRight className="w-4 h-4 text-gray-400 flex-shrink-0" />
    </button>
  );
}

function StatBox({ label, value, icon: Icon, color }: {
  label: string;
  value: string | number;
  icon: typeof Target;
  color: 'navy' | 'green' | 'blue' | 'red' | 'amber';
}) {
  const colors = {
    navy: 'bg-navy-50 text-navy-700 border-navy-100',
    green: 'bg-green-50 text-green-700 border-green-100',
    blue: 'bg-blue-50 text-blue-700 border-blue-100',
    red: 'bg-red-50 text-red-700 border-red-100',
    amber: 'bg-amber-50 text-amber-700 border-amber-100',
  };
  return (
    <div className={`p-3 rounded-lg border text-center ${colors[color]}`}>
      <Icon className="w-4 h-4 mx-auto mb-1 opacity-70" />
      <p className="text-lg font-bold">{value}</p>
      <p className="text-[11px] opacity-80">{label}</p>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: 'high' | 'medium' | 'low' }) {
  const colors = {
    high: 'bg-red-100 text-red-700',
    medium: 'bg-amber-100 text-amber-700',
    low: 'bg-gray-100 text-gray-600',
  };
  return (
    <span className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-medium flex-shrink-0 ${colors[priority]}`}>
      {priority.charAt(0).toUpperCase() + priority.slice(1)} priority
    </span>
  );
}

function EmptyState({ icon: Icon, text }: { icon: typeof Target; text: string }) {
  return (
    <div className="text-center py-8">
      <Icon className="w-10 h-10 text-gray-300 mx-auto mb-3" />
      <p className="text-sm text-gray-400">{text}</p>
    </div>
  );
}

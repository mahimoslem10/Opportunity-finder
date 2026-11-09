import { useState, useMemo } from 'react';
import { useApp } from '../AppContext';
import { Card, selectClass } from '../components/ui';
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Globe,
  GraduationCap,
  FileText,
  TrendingUp,
  Telescope,
  Info,
} from 'lucide-react';
import type { Opportunity, Profile, ProfileDocument } from '../types';
import { LEVEL_RANK, LEVEL_NAME, TYPE_LABELS } from '../constants';
import { daysUntil } from '../rules';

interface GapItem {
  category: string;
  status: 'met' | 'gap' | 'warning';
  detail: string;
  action: string;
}

interface GapAnalysis {
  opp: Opportunity;
  gaps: GapItem[];
  metCount: number;
  totalCount: number;
  readinessScore: number;
}

function analyzeGap(opp: Opportunity, profile: Profile, documents: ProfileDocument[]): GapAnalysis {
  const gaps: GapItem[] = [];

  // 1. Education level
  const oppLevel = opp.requiredLevel || 'any';
  if (oppLevel === 'any') {
    gaps.push({
      category: 'Education level',
      status: 'met',
      detail: 'No specific level required -- open to all.',
      action: '',
    });
  } else {
    const oppRank = LEVEL_RANK[oppLevel];
    const myRank = LEVEL_RANK[profile.currentLevel || 'bachelor'];
    if (myRank >= oppRank) {
      gaps.push({
        category: 'Education level',
        status: 'met',
        detail: `Requires ${LEVEL_NAME[oppLevel]}, you are at ${LEVEL_NAME[profile.currentLevel || 'bachelor']}.`,
        action: '',
      });
    } else {
      const target = oppLevel === 'phd' ? profile.targetPhdStart : oppLevel === 'master' ? profile.targetMasterStart : '';
      gaps.push({
        category: 'Education level',
        status: 'gap',
        detail: `Requires ${LEVEL_NAME[oppLevel]}, you are at ${LEVEL_NAME[profile.currentLevel || 'bachelor']}.`,
        action: target
          ? `Your target start is ${target}. Check if this aligns with the opportunity timeline.`
          : `Set your target ${LEVEL_NAME[oppLevel]} start date in your profile to plan ahead.`,
      });
    }
  }

  // 2. Degree completion
  if (opp.requiresDegree === 'yes') {
    if (profile.graduationDate) {
      const gradDate = profile.graduationDate;
      const oppDeadline = opp.deadline || '';
      if (oppDeadline && gradDate > oppDeadline.slice(0, 7)) {
        gaps.push({
          category: 'Degree completion',
          status: 'gap',
          detail: `This opportunity requires a completed degree by ${oppDeadline.slice(0, 7)}, but your graduation is ${gradDate}.`,
          action: 'Look for opportunities with later deadlines or that accept current students.',
        });
      } else {
        gaps.push({
          category: 'Degree completion',
          status: 'met',
          detail: `Requires a completed degree. Your graduation is ${gradDate}.`,
          action: '',
        });
      }
    } else {
      gaps.push({
        category: 'Degree completion',
        status: 'warning',
        detail: 'Requires a completed degree, but your graduation date is not set.',
        action: 'Add your expected graduation date in your profile to check this requirement.',
      });
    }
  }

  // 3. Country eligibility
  const allowed = (opp.eligibleCountries || [])
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length > 0) {
    const mine = [profile.citizenship, profile.residence]
      .map((c) => (c || '').trim().toLowerCase())
      .filter(Boolean);
    if (mine.length === 0) {
      gaps.push({
        category: 'Country eligibility',
        status: 'warning',
        detail: `Eligible: ${opp.eligibleCountries.join(', ')}. Your citizenship/residence is not set.`,
        action: 'Add your citizenship and country of residence in your profile to check eligibility.',
      });
    } else {
      const ok = mine.some((c) => allowed.includes(c));
      if (ok) {
        gaps.push({
          category: 'Country eligibility',
          status: 'met',
          detail: `You are eligible based on your citizenship/residence.`,
          action: '',
        });
      } else {
        gaps.push({
          category: 'Country eligibility',
          status: 'gap',
          detail: `Eligible: ${opp.eligibleCountries.join(', ')}. Your country: ${mine.join(', ')}.`,
          action: 'This opportunity is restricted to specific countries. Look for similar ones without restrictions.',
        });
      }
    }
  }

  // 4. Deadline
  const dDays = daysUntil(opp.deadline);
  if (opp.deadline && dDays !== null) {
    if (dDays < 0) {
      gaps.push({
        category: 'Deadline',
        status: 'gap',
        detail: `Deadline passed on ${opp.deadline}.`,
        action: 'This opportunity is no longer available.',
      });
    } else if (dDays <= 14) {
      gaps.push({
        category: 'Deadline',
        status: 'warning',
        detail: `Deadline is ${opp.deadline} -- only ${dDays} days left.`,
        action: 'Prioritize this application immediately. Gather documents and submit as soon as possible.',
      });
    } else if (dDays <= 60) {
      gaps.push({
        category: 'Deadline',
        status: 'warning',
        detail: `Deadline is ${opp.deadline} -- ${dDays} days left.`,
        action: 'Start preparing your application materials now.',
      });
    } else {
      gaps.push({
        category: 'Deadline',
        status: 'met',
        detail: `Deadline is ${opp.deadline} -- ${dDays} days left. Plenty of time.`,
        action: '',
      });
    }
  } else {
    gaps.push({
      category: 'Deadline',
      status: 'warning',
      detail: 'No deadline specified.',
      action: 'Check the opportunity page for deadline details.',
    });
  }

  // 5. Profile completeness
  const profileFields = [
    { key: 'field', label: 'Field of study' },
    { key: 'university', label: 'University' },
    { key: 'gpa', label: 'GPA' },
    { key: 'languages', label: 'Languages' },
    { key: 'skills', label: 'Skills' },
    { key: 'experience', label: 'Experience' },
  ] as const;

  const missing = profileFields.filter((f) => !(profile as unknown as Record<string, string>)[f.key]?.trim());
  if (missing.length === 0) {
    gaps.push({
      category: 'Profile completeness',
      status: 'met',
      detail: 'Your profile is complete with all key fields filled in.',
      action: '',
    });
  } else if (missing.length <= 2) {
    gaps.push({
      category: 'Profile completeness',
      status: 'warning',
      detail: `Missing: ${missing.map((m) => m.label).join(', ')}.`,
      action: 'Fill in the remaining profile fields to strengthen your applications.',
    });
  } else {
    gaps.push({
      category: 'Profile completeness',
      status: 'gap',
      detail: `Missing: ${missing.map((m) => m.label).join(', ')}.`,
      action: 'Your profile needs more detail. Visit the Profile page to add this information.',
    });
  }

  // 6. Description available
  if (opp.description && opp.description.length > 100) {
    gaps.push({
      category: 'Opportunity details',
      status: 'met',
      detail: 'Full details have been fetched and are available.',
      action: '',
    });
  } else {
    gaps.push({
      category: 'Opportunity details',
      status: 'warning',
      detail: 'Full details not yet fetched from the web.',
      action: 'Open this opportunity and click "Re-fetch from web" to get the complete description.',
    });
  }

  // 7. Documents
  const attachedDocs = documents.filter((d) => opp.documentIds.includes(d.id));
  if (documents.length === 0) {
    gaps.push({
      category: 'Documents',
      status: 'warning',
      detail: 'You have not uploaded any documents yet.',
      action: 'Upload your CV and certificates on the Documents page.',
    });
  } else if (attachedDocs.length === 0) {
    gaps.push({
      category: 'Documents',
      status: 'warning',
      detail: 'No documents are attached to this opportunity.',
      action: 'Open this opportunity and tick the documents you will submit.',
    });
  } else {
    gaps.push({
      category: 'Documents',
      status: 'met',
      detail: `${attachedDocs.length} document(s) attached: ${attachedDocs.map((d) => d.label).join(', ')}.`,
      action: '',
    });
  }

  const metCount = gaps.filter((g) => g.status === 'met').length;
  const totalCount = gaps.length;
  const readinessScore = Math.round((metCount / totalCount) * 100);

  return { opp, gaps, metCount, totalCount, readinessScore };
}

const STATUS_ICONS = {
  met: CheckCircle2,
  gap: XCircle,
  warning: AlertTriangle,
};

const STATUS_COLORS = {
  met: 'text-green-600 bg-green-50 border-green-100',
  gap: 'text-red-600 bg-red-50 border-red-100',
  warning: 'text-amber-600 bg-amber-50 border-amber-100',
};

const CATEGORY_ICONS: Record<string, typeof Clock> = {
  'Education level': GraduationCap,
  'Degree completion': GraduationCap,
  'Country eligibility': Globe,
  'Deadline': Clock,
  'Profile completeness': FileText,
  'Opportunity details': Info,
  'Documents': FileText,
};

type SortMode = 'score' | 'deadline' | 'gaps';

export function GapAnalysisPage() {
  const { data } = useApp();
  const [sortMode, setSortMode] = useState<SortMode>('score');
  const [filterMode, setFilterMode] = useState<'all' | 'gaps'>('all');

  const analyses = useMemo(() => {
    const results = data.opportunities.map((opp) => analyzeGap(opp, data.profile, data.documents));
    return results;
  }, [data.opportunities, data.profile, data.documents]);

  const sorted = useMemo(() => {
    const filtered = filterMode === 'gaps'
      ? analyses.filter((a) => a.gaps.some((g) => g.status === 'gap'))
      : analyses;

    return [...filtered].sort((a, b) => {
      if (sortMode === 'score') return b.readinessScore - a.readinessScore;
      if (sortMode === 'deadline') {
        const aDays = daysUntil(a.opp.deadline);
        const bDays = daysUntil(b.opp.deadline);
        if (aDays === null && bDays === null) return 0;
        if (aDays === null) return 1;
        if (bDays === null) return -1;
        return aDays - bDays;
      }
      // gaps: most gaps first
      const aGaps = a.gaps.filter((g) => g.status === 'gap').length;
      const bGaps = b.gaps.filter((g) => g.status === 'gap').length;
      return bGaps - aGaps;
    });
  }, [analyses, sortMode, filterMode]);

  const overallScore = useMemo(() => {
    if (analyses.length === 0) return 0;
    return Math.round(analyses.reduce((sum, a) => sum + a.readinessScore, 0) / analyses.length);
  }, [analyses]);

  if (data.opportunities.length === 0) {
    return (
      <Card>
        <div className="text-center py-12">
          <Telescope className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <h2 className="text-lg font-bold text-gray-900 mb-1">No opportunities yet</h2>
          <p className="text-sm text-gray-500">
            Add opportunities to see a gap analysis against your profile.
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      {/* Overview card */}
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <TrendingUp className="w-5 h-5 text-navy-600" />
          <h2 className="text-lg font-bold text-gray-900">Gap Analysis</h2>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          See how your profile matches up against each opportunity. Green items
          are met, amber items need attention, red items are gaps you need to
          address.
        </p>

        <div className="grid grid-cols-3 gap-3 mb-4">
          <div className="text-center p-3 rounded-lg bg-gray-50 border border-gray-100">
            <p className="text-2xl font-bold text-navy-600">{overallScore}%</p>
            <p className="text-xs text-gray-500 mt-1">Avg readiness</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-green-50 border border-green-100">
            <p className="text-2xl font-bold text-green-600">
              {analyses.filter((a) => a.readinessScore >= 80).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Ready to apply</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-amber-50 border border-amber-100">
            <p className="text-2xl font-bold text-amber-600">
              {analyses.filter((a) => a.gaps.some((g) => g.status === 'gap')).length}
            </p>
            <p className="text-xs text-gray-500 mt-1">Have gaps</p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Sort by</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className={`${selectClass} !w-auto !py-1.5 text-xs`}
            >
              <option value="score">Readiness score</option>
              <option value="deadline">Deadline urgency</option>
              <option value="gaps">Most gaps</option>
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Filter</span>
            <select
              value={filterMode}
              onChange={(e) => setFilterMode(e.target.value as 'all' | 'gaps')}
              className={`${selectClass} !w-auto !py-1.5 text-xs`}
            >
              <option value="all">All opportunities</option>
              <option value="gaps">Only with gaps</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Per-opportunity analysis */}
      <div className="space-y-3">
        {sorted.map((analysis) => (
          <GapCard key={analysis.opp.id} analysis={analysis} />
        ))}
      </div>
    </div>
  );
}

function GapCard({ analysis }: { analysis: GapAnalysis }) {
  const [expanded, setExpanded] = useState(false);
  const { opp, gaps, readinessScore } = analysis;

  const scoreColor =
    readinessScore >= 80
      ? 'text-green-600 bg-green-100'
      : readinessScore >= 50
        ? 'text-amber-600 bg-amber-100'
        : 'text-red-600 bg-red-100';

  return (
    <Card>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full text-left"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-sm text-gray-900 truncate">
              {opp.title}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              {opp.organization} - {TYPE_LABELS[opp.type]}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className={`text-xs font-bold rounded-full px-2.5 py-1 ${scoreColor}`}>
              {readinessScore}%
            </span>
          </div>
        </div>

        {/* Quick summary bar */}
        <div className="flex gap-1 mt-3">
          {gaps.map((g, i) => (
            <div
              key={i}
              className={`h-1.5 flex-1 rounded-full ${
                g.status === 'met'
                  ? 'bg-green-400'
                  : g.status === 'warning'
                    ? 'bg-amber-400'
                    : 'bg-red-400'
              }`}
              title={g.category}
            />
          ))}
        </div>

        {/* Compact gap count */}
        <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
          <span className="text-green-600">
            {gaps.filter((g) => g.status === 'met').length} met
          </span>
          <span className="text-amber-600">
            {gaps.filter((g) => g.status === 'warning').length} warnings
          </span>
          <span className="text-red-600">
            {gaps.filter((g) => g.status === 'gap').length} gaps
          </span>
        </div>
      </button>

      {expanded && (
        <div className="mt-4 space-y-2 border-t border-gray-100 pt-4">
          {gaps.map((gap, i) => {
            const Icon = STATUS_ICONS[gap.status];
            const CatIcon = CATEGORY_ICONS[gap.category] || Info;
            return (
              <div
                key={i}
                className={`rounded-lg border p-3 ${STATUS_COLORS[gap.status]}`}
              >
                <div className="flex items-start gap-2.5">
                  <Icon className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <CatIcon className="w-3.5 h-3.5" />
                      <span className="text-xs font-semibold">{gap.category}</span>
                    </div>
                    <p className="text-xs mt-1 text-gray-700">{gap.detail}</p>
                    {gap.action && (
                      <p className="text-xs mt-1.5 text-gray-600 italic">
                        {gap.action}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

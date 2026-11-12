import type {
  OpportunityAssessment,
  RankedOpportunity,
  CandidateSnapshot,
  ImprovementAction,
  ImprovementProgress,
  ImprovementRecommendation,
} from './types';
import type { Opportunity } from '../types';
import { daysUntil } from '../rules';
import { assessOpportunity, assessAllOpportunities } from './engine';

const PROGRESS_KEY = 'opportunityFinder.improvementProgress';

export function loadImprovementProgress(): ImprovementProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    // ignore
  }
  return {};
}

export function saveImprovementProgress(progress: ImprovementProgress): void {
  try {
    localStorage.setItem(PROGRESS_KEY, JSON.stringify(progress));
  } catch {
    // ignore
  }
}

// --- Opportunity ranking ---

export function rankOpportunities(
  assessments: OpportunityAssessment[]
): RankedOpportunity[] {
  const scored = assessments.map((a) => {
    const days = daysUntil(a.opp.deadline);
    const deadlineUrgency = days !== null && days >= 0 ? Math.max(0, 60 - days) / 60 : 0;

    // Eligibility tier (primary sort)
    const eligTier: Record<string, number> = {
      eligible: 4,
      potentially_eligible: 3,
      insufficient_info: 2,
      ineligible: 1,
    };
    const eligScore = eligTier[a.eligibility.status] * 25;

    // Competitiveness (secondary)
    const compRatio = a.competitiveness.score / a.competitiveness.maxScore;
    const compScore = compRatio * 30;

    // Potential
    const potScore = a.potential.canImprove ? 15 : 10;

    // Deadline urgency bonus
    const deadlineScore = deadlineUrgency * 15;

    // Relevance: match score
    const relScore = a.matchScore * 0.15;

    const totalScore = eligScore + compScore + potScore + deadlineScore + relScore;

    return { assessment: a, totalScore, days };
  });

  scored.sort((a, b) => {
    // Never rank ineligible above eligible without explanation
    const aIneligible = a.assessment.eligibility.status === 'ineligible';
    const bIneligible = b.assessment.eligibility.status === 'ineligible';
    if (aIneligible && !bIneligible) return 1;
    if (!aIneligible && bIneligible) return -1;

    // Then by total score
    if (Math.abs(a.totalScore - b.totalScore) > 0.5) {
      return b.totalScore - a.totalScore;
    }

    // Tiebreak by deadline
    if (a.days !== null && b.days !== null) return a.days - b.days;
    return 0;
  });

  return scored.map((s, i) => ({
    opp: s.assessment.opp,
    assessment: s.assessment,
    rank: i + 1,
    rankReason: s.assessment.rankReason,
  }));
}

// --- Improvement aggregation ---

export function aggregateImprovements(
  assessments: OpportunityAssessment[],
  progress: ImprovementProgress
): ImprovementAction[] {
  // Collect all recommendations
  const allRecs: ImprovementRecommendation[] = [];
  for (const a of assessments) {
    allRecs.push(...a.potential.improvementsNeeded);
  }

  // Group by gap similarity
  const groups: Map<string, ImprovementRecommendation[]> = new Map();
  for (const rec of allRecs) {
    const key = normalizeGapKey(rec.gap);
    const existing = groups.get(key) ?? [];
    existing.push(rec);
    groups.set(key, existing);
  }

  // Build aggregated actions
  const actions: ImprovementAction[] = [];
  for (const [, recs] of groups) {
    const first = recs[0];
    const oppIds = [...new Set(recs.map((r) => r.oppId))];
    const oppTitles = [...new Set(recs.map((r) => r.oppTitle))];

    // Use the highest priority across all recs
    const priority = recs.some((r) => r.priority === 'high') ? 'high' :
      recs.some((r) => r.priority === 'medium') ? 'medium' : 'low';

    const mandatory = recs.some((r) => r.mandatory);

    const actionId = `action-${normalizeGapKey(first.gap)}`;
    const existingProgress = progress[actionId];

    actions.push({
      id: actionId,
      gap: first.gap,
      whyItMatters: first.whyItMatters,
      suggestedAction: first.suggestedAction,
      priority,
      expectedBenefit: first.expectedBenefit,
      mandatory,
      oppIds,
      oppTitles,
      completed: existingProgress?.completed ?? false,
      completedOn: existingProgress?.completedOn,
    });
  }

  // Sort: mandatory first, then by priority, then by number of opportunities affected
  const priorityOrder: Record<string, number> = { high: 0, medium: 1, low: 2 };
  actions.sort((a, b) => {
    if (a.mandatory !== b.mandatory) return a.mandatory ? -1 : 1;
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return b.oppIds.length - a.oppIds.length;
  });

  return actions;
}

function normalizeGapKey(gap: string): string {
  return gap
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// --- Full pipeline ---

export function runFullAssessment(
  opportunities: Opportunity[],
  snap: CandidateSnapshot,
  progress: ImprovementProgress
): {
  assessments: OpportunityAssessment[];
  ranked: RankedOpportunity[];
  improvements: ImprovementAction[];
} {
  const assessments = assessAllOpportunities(opportunities, snap);
  const ranked = rankOpportunities(assessments);
  const improvements = aggregateImprovements(assessments, progress);
  return { assessments, ranked, improvements };
}

// --- Convenience selectors ---

export function getBestMatches(ranked: RankedOpportunity[], limit = 5): RankedOpportunity[] {
  return ranked
    .filter((r) => r.assessment.eligibility.status !== 'ineligible')
    .slice(0, limit);
}

export function getEligibleOpportunities(ranked: RankedOpportunity[]): RankedOpportunity[] {
  return ranked.filter((r) => r.assessment.eligibility.status === 'eligible');
}

export function getPotentialOpportunities(ranked: RankedOpportunity[]): RankedOpportunity[] {
  return ranked.filter(
    (r) =>
      r.assessment.eligibility.status === 'potentially_eligible' ||
      r.assessment.eligibility.status === 'insufficient_info'
  );
}

export function getOpportunitiesNeedingAttention(ranked: RankedOpportunity[]): RankedOpportunity[] {
  const days = (r: RankedOpportunity) => daysUntil(r.opp.deadline);
  return ranked
    .filter((r) => {
      const d = days(r);
      return d !== null && d >= 0 && d <= 30 &&
        r.assessment.eligibility.status !== 'ineligible';
    })
    .sort((a, b) => (days(a) ?? 999) - (days(b) ?? 999));
}

export function getMissingRequirementsSummary(assessments: OpportunityAssessment[]): {
  label: string;
  count: number;
  oppIds: string[];
}[] {
  const summary = new Map<string, { count: number; oppIds: string[] }>();
  for (const a of assessments) {
    for (const check of a.eligibility.checks) {
      if (check.status === 'unknown' || check.status === 'unmet') {
        const key = check.label;
        const existing = summary.get(key) ?? { count: 0, oppIds: [] };
        existing.count += 1;
        existing.oppIds.push(a.oppId);
        summary.set(key, existing);
      }
    }
  }
  return Array.from(summary.entries())
    .map(([label, data]) => ({ label, ...data }))
    .sort((a, b) => b.count - a.count);
}

import type { Level, Opportunity, OpportunityType, Profile, RuleResult } from './types';
import { LEVEL_RANK, LEVEL_NAME } from './constants';

export function monthsBetween(_fromISO: string | null, toYM: string): number | null {
  if (!toYM) return null;
  const parts = toYM.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (isNaN(y) || isNaN(m)) return null;
  const now = new Date();
  return (y - now.getFullYear()) * 12 + (m - (now.getMonth() + 1));
}

export function daysUntil(dateISO: string): number | null {
  if (!dateISO) return null;
  const d = new Date(dateISO + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((d.getTime() - now.getTime()) / 86400000);
}

export function applyRules(opp: Opportunity, profile: Profile): RuleResult {
  const reasons: string[] = [];
  const flags: string[] = [];
  let bin: RuleResult['bin'] = 'active';
  const cur = LEVEL_RANK[profile.currentLevel || 'bachelor'];

  // 2. Deadline gate
  const dDays = daysUntil(opp.deadline);
  if (dDays !== null && dDays < 0) {
    bin = 'archive';
    reasons.push('Deadline has passed');
  }

  // 3. Country gate
  const allowed = (opp.eligibleCountries || [])
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);
  if (allowed.length) {
    const mine = [profile.citizenship, profile.residence]
      .map((c) => (c || '').trim().toLowerCase())
      .filter(Boolean);
    const ok = mine.some((c) => allowed.includes(c));
    if (mine.length && !ok) {
      bin = 'archive';
      reasons.push('Country restriction');
    }
  }

  // 1. Level gate
  const req = opp.requiredLevel || 'any';
  if (LEVEL_RANK[req] > cur) {
    const target =
      req === 'phd'
        ? profile.targetPhdStart
        : req === 'master'
          ? profile.targetMasterStart
          : '';
    const m = monthsBetween(null, target);
    if (m === null || m > 12) {
      if (bin === 'active') bin = 'later';
      reasons.push(
        `Unlock when you reach ${LEVEL_NAME[req]}${target ? ` (target ${target})` : ''}`
      );
    }
  }

  // 5. Graduation-timing gate
  if (opp.requiresDegree === 'yes' && profile.graduationDate && opp.deadline) {
    if (profile.graduationDate > opp.deadline.slice(0, 7)) {
      if (bin === 'active') bin = 'later';
      reasons.push('Needs a completed degree before the deadline');
    }
  }

  // 4. Internship window
  if (
    opp.type === 'internship' &&
    opp.startDate &&
    opp.startDate.startsWith('2027') &&
    dDays !== null &&
    dDays >= 0 &&
    dDays <= 60
  ) {
    flags.push('Closes within 60 days');
  }

  return { bin, reasons, flags };
}

const TYPE_KEYWORDS: [OpportunityType, RegExp][] = [
  ['scholarship', /scholarship|bursary|stipend/i],
  ['fellowship', /fellowship/i],
  ['internship', /internship|intern\b/i],
  ['grant', /\bgrant|funding call/i],
  ['competition', /competition|challenge|hackathon|contest/i],
  ['conference', /conference|symposium|summit/i],
  ['training', /training|course|workshop|bootcamp/i],
  ['volunteer', /volunteer/i],
  ['job', /\bjob\b|vacancy|position|career/i],
];

const LEVEL_KEYWORDS: [Level, RegExp][] = [
  ['phd', /\bph\.?d\b|doctoral|doctorate/i],
  ['master', /master'?s?\b|\bm\.?sc\b|\bmba\b/i],
  ['bachelor', /bachelor|undergraduate/i],
];

export function classifyScrapedItem(
  title: string,
  description: string
): { type: OpportunityType; requiredLevel: Level } {
  const text = `${title} ${description}`;
  const type = TYPE_KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? 'program';
  const requiredLevel = LEVEL_KEYWORDS.find(([, re]) => re.test(text))?.[0] ?? 'any';
  return { type, requiredLevel };
}

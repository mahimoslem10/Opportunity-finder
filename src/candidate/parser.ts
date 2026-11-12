import type { ExtractedClaim, ClaimCategory, DocumentExtraction } from './types';
import { genId } from './storage';

interface DocContext {
  docId: string;
  docLabel: string;
}

interface RawClaim {
  category: ClaimCategory;
  text: string;
  evidence: string;
  offset: number;
  metadata?: { date?: string; institution?: string; title?: string };
}

const YEAR_RE = /\b(19|20)\d{2}\b/g;
const DATE_RE =
  /\b(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\.?\d{4}\b/i;

function findDates(text: string): string[] {
  const dates: string[] = [];
  const d = text.match(DATE_RE);
  if (d) dates.push(d[0]);
  const years = text.match(YEAR_RE);
  if (years) dates.push(...years.slice(0, 2));
  return dates;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 15);
}

// Section header detection
const SECTION_PATTERNS: { category: ClaimCategory; patterns: RegExp[] }[] = [
  { category: 'summary', patterns: [/^\s*(summary|profile|objective|about me|professional summary)/i] },
  { category: 'education', patterns: [/^\s*(education|academic|qualifications?|academic background)/i] },
  { category: 'certificate', patterns: [/^\s*(certifications?|certificates?|licenses?)/i] },
  { category: 'skill', patterns: [/^\s*(skills?|technical skills?|core competenc)/i] },
  { category: 'experience', patterns: [/^\s*(experience|employment|work history|professional experience)/i] },
  { category: 'project', patterns: [/^\s*(projects?|portfolio|notable projects)/i] },
  { category: 'research', patterns: [/^\s*(research|publications?|papers?)/i] },
  { category: 'award', patterns: [/^\s*(awards?|honors?|honours?|achievements?|recognitions?)/i] },
  { category: 'language', patterns: [/^\s*(languages?|language skills?)/i] },
];

function detectSection(line: string): ClaimCategory | null {
  const lower = line.trim();
  if (!lower || lower.length > 60) return null;
  for (const { category, patterns } of SECTION_PATTERNS) {
    if (patterns.some((p) => p.test(lower))) return category;
  }
  return null;
}

// Inline keyword-based classification
const KEYWORD_PATTERNS: { category: ClaimCategory; keywords: RegExp[] }[] = [
  { category: 'education', keywords: [/\b(bachelor|master|phd|doctorate|b\.?sc|m\.?sc|b\.?a|m\.?a|b\.?eng|m\.?eng|degree|university|college|institute|school of|faculty of|gpa|grade|transcript|graduated|enrolled)\b/i] },
  { category: 'certificate', keywords: [/\b(certif(?:ied|ication|icate)?|licensed?|accredited|toefl|ielts|gre|gmat|sat|pmp|cissp|aws|google cloud|azure|ccna|comptia)\b/i] },
  { category: 'skill', keywords: [/\b(proficient|skilled|experienced in|expertise|competent|knowledge of|familiar with|tools|technologies|programming|framework)\b/i] },
  { category: 'experience', keywords: [/\b(worked|employed|intern(ship)?|position|role|responsib|developed|managed|led|team|company|corporation|inc\.|ltd\.|years? of experience)\b/i] },
  { category: 'project', keywords: [/\b(project|built|developed|created|designed|implemented|deployed|application|app|system|platform|website)\b/i] },
  { category: 'research', keywords: [/\b(research|paper|publication|published|journal|conference|thesis|dissertation|study|investigation|co-author)\b/i] },
  { category: 'award', keywords: [/\b(award|honored|honoured|prize|winner|recipient|scholarship|fellowship|recognized|achievement|dean'?s list|distinction)\b/i] },
  { category: 'language', keywords: [/\b(fluent|native|bilingual|proficient in|languages?:|english|arabic|french|spanish|german|chinese|urdu|hindi|persian|turkish|kurdish)\b/i] },
];

function classifySentence(text: string, currentSection: ClaimCategory | null): ClaimCategory {
  if (currentSection && currentSection !== 'summary') return currentSection;
  for (const { category, keywords } of KEYWORD_PATTERNS) {
    if (keywords.some((k) => k.test(text))) return category;
  }
  return currentSection ?? 'other';
}

export function parseClaims(
  extraction: DocumentExtraction,
  ctx: DocContext
): ExtractedClaim[] {
  if (extraction.status !== 'extracted' || !extraction.text) return [];

  const lines = extraction.text.split(/\n+/);
  const rawClaims: RawClaim[] = [];
  let currentSection: ClaimCategory | null = null;
  let offset = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      offset += line.length + 1;
      continue;
    }

    const section = detectSection(trimmed);
    if (section) {
      currentSection = section;
      offset += line.length + 1;
      continue;
    }

    const sentences = splitSentences(trimmed);
    for (const sentence of sentences) {
      if (sentence.length < 20) continue;
      const category = classifySentence(sentence, currentSection);
      const dates = findDates(sentence);
      const institution = extractInstitution(sentence);
      rawClaims.push({
        category,
        text: sentence,
        evidence: sentence,
        offset: offset + trimmed.indexOf(sentence),
        metadata: {
          date: dates[0],
          institution: institution ?? undefined,
        },
      });
    }
    offset += line.length + 1;
  }

  // Deduplicate near-identical claims within the same document
  const seen = new Set<string>();
  const unique: RawClaim[] = [];
  for (const rc of rawClaims) {
    const key = rc.text.toLowerCase().replace(/\s+/g, ' ').trim();
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(rc);
  }

  // Limit to most relevant 200 claims to keep storage manageable
  const limited = unique.slice(0, 200);

  return limited.map((rc) => ({
    id: genId(),
    category: rc.category,
    text: rc.text,
    evidence: rc.evidence,
    sourceDocId: ctx.docId,
    sourceDocLabel: ctx.docLabel,
    sourceOffset: rc.offset,
    extractionStatus: 'extracted' as const,
    verification: 'unverified' as const,
    conflictIds: [],
    metadata: rc.metadata,
  }));
}

function extractInstitution(text: string): string | null {
  const uniMatch = text.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:University|Institute|College|School|Faculty)\b/
  );
  if (uniMatch) return uniMatch[0];
  const uniMatch2 = text.match(
    /\b(?:University|Institute|College)\s+of\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/
  );
  if (uniMatch2) return uniMatch2[0];
  return null;
}

// --- Conflict detection ---

interface ConflictPair {
  claimA: string;
  claimB: string;
}

export function detectConflicts(claims: ExtractedClaim[]): ConflictPair[] {
  const pairs: ConflictPair[] = [];
  // Detect same-category claims with conflicting dates
  const byCategory = new Map<ClaimCategory, ExtractedClaim[]>();
  for (const c of claims) {
    if (!c.metadata?.date) continue;
    const arr = byCategory.get(c.category) ?? [];
    arr.push(c);
    byCategory.set(c.category, arr);
  }

  for (const [, group] of byCategory) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i];
        const b = group[j];
        if (a.metadata?.date && b.metadata?.date && a.metadata.date !== b.metadata.date) {
          // Check if they refer to similar things (same institution or similar text)
          const sameInst =
            a.metadata.institution &&
            b.metadata.institution &&
            a.metadata.institution.toLowerCase() === b.metadata.institution.toLowerCase();
          const textSimilar = jaccardSimilar(a.text, b.text) > 0.4;
          if (sameInst || textSimilar) {
            pairs.push({ claimA: a.id, claimB: b.id });
          }
        }
      }
    }
  }

  return pairs;
}

function jaccardSimilar(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const setB = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  const union = setA.size + setB.size - intersection;
  return intersection / union;
}

export function applyConflicts(
  claims: ExtractedClaim[],
  conflicts: ConflictPair[]
): ExtractedClaim[] {
  const conflictMap = new Map<string, string[]>();
  for (const { claimA, claimB } of conflicts) {
    conflictMap.set(claimA, [...(conflictMap.get(claimA) ?? []), claimB]);
    conflictMap.set(claimB, [...(conflictMap.get(claimB) ?? []), claimA]);
  }
  return claims.map((c) => {
    const ids = conflictMap.get(c.id);
    if (ids && ids.length > 0) {
      return {
        ...c,
        conflictIds: ids,
        verification: c.verification === 'unverified' ? 'conflict' : c.verification,
      };
    }
    return c;
  });
}

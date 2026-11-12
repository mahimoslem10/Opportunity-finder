import type { CandidateProfileData, ExtractedClaim, DocumentExtraction } from './types';

const KEY = 'opportunityFinder.candidateProfile';

export function emptyCandidateProfile(): CandidateProfileData {
  return { claims: [], extractions: {}, updatedAt: new Date().toISOString() };
}

export function loadCandidateProfile(): CandidateProfileData {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        claims: Array.isArray(parsed.claims) ? parsed.claims : [],
        extractions: parsed.extractions && typeof parsed.extractions === 'object' ? parsed.extractions : {},
        updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      };
    }
  } catch {
    // ignore
  }
  return emptyCandidateProfile();
}

export function saveCandidateProfile(data: CandidateProfileData): boolean {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...data, updatedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

export function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return String(Date.now() + Math.random());
}

export function upsertExtraction(
  data: CandidateProfileData,
  extraction: DocumentExtraction
): CandidateProfileData {
  return {
    ...data,
    extractions: { ...data.extractions, [extraction.docId]: extraction },
    updatedAt: new Date().toISOString(),
  };
}

export function setClaims(
  data: CandidateProfileData,
  claims: ExtractedClaim[]
): CandidateProfileData {
  return { ...data, claims, updatedAt: new Date().toISOString() };
}

export function updateClaim(
  data: CandidateProfileData,
  claimId: string,
  patch: Partial<ExtractedClaim>
): CandidateProfileData {
  return {
    ...data,
    claims: data.claims.map((c) => (c.id === claimId ? { ...c, ...patch } : c)),
    updatedAt: new Date().toISOString(),
  };
}

export function deleteClaim(data: CandidateProfileData, claimId: string): CandidateProfileData {
  return {
    ...data,
    claims: data.claims
      .filter((c) => c.id !== claimId)
      .map((c) => ({
        ...c,
        conflictIds: c.conflictIds.filter((id) => id !== claimId),
      })),
    updatedAt: new Date().toISOString(),
  };
}

export function removeDocData(data: CandidateProfileData, docId: string): CandidateProfileData {
  const { [docId]: _removed, ...restExtractions } = data.extractions;
  return {
    ...data,
    extractions: restExtractions,
    claims: data.claims.filter((c) => c.sourceDocId !== docId),
    updatedAt: new Date().toISOString(),
  };
}

export type ExtractionStatus = 'pending' | 'processing' | 'extracted' | 'unsupported' | 'error';

export type ClaimCategory =
  | 'summary'
  | 'education'
  | 'qualification'
  | 'certificate'
  | 'skill'
  | 'experience'
  | 'project'
  | 'research'
  | 'award'
  | 'language'
  | 'other';

export type ClaimVerification = 'unverified' | 'approved' | 'rejected' | 'conflict';

export interface ExtractedClaim {
  id: string;
  category: ClaimCategory;
  text: string;
  evidence: string;
  sourceDocId: string;
  sourceDocLabel: string;
  sourceOffset: number;
  extractionStatus: ExtractionStatus;
  verification: ClaimVerification;
  conflictIds: string[];
  metadata?: {
    date?: string;
    institution?: string;
    title?: string;
  };
}

export interface DocumentExtraction {
  docId: string;
  status: ExtractionStatus;
  text: string;
  charCount: number;
  error?: string;
  extractedAt?: string;
  ocrUsed: boolean;
}

export interface CandidateProfileData {
  claims: ExtractedClaim[];
  extractions: Record<string, DocumentExtraction>;
  updatedAt: string;
}

export interface CandidateProfileSummary {
  summary: ExtractedClaim[];
  education: ExtractedClaim[];
  qualifications: ExtractedClaim[];
  certificates: ExtractedClaim[];
  skills: ExtractedClaim[];
  experience: ExtractedClaim[];
  projects: ExtractedClaim[];
  research: ExtractedClaim[];
  awards: ExtractedClaim[];
  languages: ExtractedClaim[];
  other: ExtractedClaim[];
}

export const CATEGORY_LABELS: Record<ClaimCategory, string> = {
  summary: 'Summary',
  education: 'Education',
  qualification: 'Qualifications',
  certificate: 'Certificates',
  skill: 'Skills',
  experience: 'Work experience',
  project: 'Projects',
  research: 'Research',
  award: 'Awards',
  language: 'Languages',
  other: 'Other',
};

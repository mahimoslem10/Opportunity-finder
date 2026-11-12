import type { ExtractedClaim, ClaimCategory } from '../candidate/types';
import type { Opportunity, Profile } from '../types';
import type { AISettings, AIProfileCard } from '../ai/storage';

export type EligibilityStatus = 'eligible' | 'potentially_eligible' | 'ineligible' | 'insufficient_info';

export type RequirementMet = 'met' | 'unmet' | 'unknown' | 'potentially_met';

export interface RequirementCheck {
  id: string;
  category: string;
  label: string;
  status: RequirementMet;
  detail: string;
  evidenceClaims?: string[];
  mandatory: boolean;
}

export interface EligibilityAssessment {
  status: EligibilityStatus;
  checks: RequirementCheck[];
  mandatoryUnmet: number;
  mandatoryMet: number;
  mandatoryUnknown: number;
  explanation: string;
}

export interface CompetitivenessFactor {
  id: string;
  label: string;
  score: number;
  maxScore: number;
  detail: string;
  evidenceClaims?: string[];
}

export interface CompetitivenessAssessment {
  score: number;
  maxScore: number;
  factors: CompetitivenessFactor[];
  strengths: string[];
  weaknesses: string[];
  disclaimer: string;
}

export interface PotentialAssessment {
  canImprove: boolean;
  improvementsNeeded: ImprovementRecommendation[];
  potentialScore: number;
  explanation: string;
}

export interface ImprovementRecommendation {
  id: string;
  gap: string;
  whyItMatters: string;
  suggestedAction: string;
  priority: 'high' | 'medium' | 'low';
  expectedBenefit: string;
  supportingRequirement: string;
  mandatory: boolean;
  oppId: string;
  oppTitle: string;
}

export interface OpportunityAssessment {
  oppId: string;
  opp: Opportunity;
  eligibility: EligibilityAssessment;
  competitiveness: CompetitivenessAssessment;
  potential: PotentialAssessment;
  matchScore: number;
  rankReason: string;
}

export interface CandidateSnapshot {
  profile: Profile;
  verifiedClaims: ExtractedClaim[];
  unverifiedClaims: ExtractedClaim[];
  claimsByCategory: Map<ClaimCategory, ExtractedClaim[]>;
  aiProfile?: AIProfileCard;
  aiSettings?: AISettings;
}

export interface ImprovementAction {
  id: string;
  gap: string;
  whyItMatters: string;
  suggestedAction: string;
  priority: 'high' | 'medium' | 'low';
  expectedBenefit: string;
  mandatory: boolean;
  oppIds: string[];
  oppTitles: string[];
  completed: boolean;
  completedOn?: string;
}

export type ImprovementProgress = Record<string, ImprovementAction>;

export interface RankedOpportunity {
  opp: Opportunity;
  assessment: OpportunityAssessment;
  rank: number;
  rankReason: string;
}

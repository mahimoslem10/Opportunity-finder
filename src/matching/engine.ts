import type {
  EligibilityAssessment,
  RequirementCheck,
  RequirementMet,
  CompetitivenessAssessment,
  CompetitivenessFactor,
  PotentialAssessment,
  ImprovementRecommendation,
  OpportunityAssessment,
  CandidateSnapshot,
  EligibilityStatus,
} from './types';
import type { Opportunity, Profile } from '../types';
import type { ExtractedClaim, ClaimCategory } from '../candidate/types';
import { LEVEL_RANK, LEVEL_NAME } from '../constants';
import { daysUntil } from '../rules';

let checkIdCounter = 0;
function nextCheckId(): string {
  checkIdCounter += 1;
  return `chk-${checkIdCounter}`;
}

let recIdCounter = 0;
function nextRecId(): string {
  recIdCounter += 1;
  return `rec-${recIdCounter}`;
}

// --- Candidate snapshot builder ---

export function buildCandidateSnapshot(
  profile: Profile,
  claims: ExtractedClaim[]
): CandidateSnapshot {
  const verifiedClaims = claims.filter((c) => c.verification === 'approved');
  const unverifiedClaims = claims.filter(
    (c) => c.verification === 'unverified' || c.verification === 'conflict'
  );
  const claimsByCategory = new Map<ClaimCategory, ExtractedClaim[]>();
  for (const cat of [
    'summary', 'education', 'qualification', 'certificate',
    'skill', 'experience', 'project', 'research', 'award', 'language', 'other',
  ] as ClaimCategory[]) {
    claimsByCategory.set(cat, verifiedClaims.filter((c) => c.category === cat));
  }
  return { profile, verifiedClaims, unverifiedClaims, claimsByCategory };
}

// --- Text matching utilities ---

function normalize(text: string): string {
  return text.toLowerCase().trim();
}

function containsAny(text: string, keywords: string[]): boolean {
  const lower = text.toLowerCase();
  return keywords.some((k) => lower.includes(k.toLowerCase()));
}

function jaccardSimilar(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  const setB = new Set(b.toLowerCase().split(/\W+/).filter((w) => w.length > 3));
  if (setA.size === 0 || setB.size === 0) return 0;
  let intersection = 0;
  for (const w of setA) if (setB.has(w)) intersection++;
  return intersection / (setA.size + setB.size - intersection);
}

// Extract keywords from opportunity description/notes for requirement detection
function getOppText(opp: Opportunity): string {
  return normalize(`${opp.title} ${opp.description} ${opp.notes}`);
}

// --- Requirement extraction from opportunity text ---

interface ExtractedRequirement {
  type: string;
  label: string;
  detected: boolean;
  keywords: string[];
}

function detectRequirements(opp: Opportunity): ExtractedRequirement[] {
  const text = getOppText(opp);
  const reqs: ExtractedRequirement[] = [];

  // Language requirements
  const langKeywords = ['english', 'french', 'german', 'spanish', 'arabic', 'chinese', 'toefl', 'ielts', 'language proficiency', 'language requirement'];
  const detectedLangs = langKeywords.filter((k) => text.includes(k));
  reqs.push({
    type: 'language',
    label: 'Language proficiency',
    detected: detectedLangs.length > 0,
    keywords: detectedLangs,
  });

  // Research experience
  reqs.push({
    type: 'research',
    label: 'Research experience',
    detected: containsAny(text, ['research', 'publication', 'paper', 'thesis', 'dissertation', 'academic output']),
    keywords: ['research', 'publication', 'paper'],
  });

  // Work experience
  reqs.push({
    type: 'experience',
    label: 'Work experience',
    detected: containsAny(text, ['experience', 'work history', 'employment', 'professional background', 'years of experience']),
    keywords: ['experience', 'work', 'employment'],
  });

  // Specific skills (technical)
  const skillKeywords = ['programming', 'python', 'java', 'javascript', 'react', 'machine learning', 'data analysis', 'statistics', 'matlab', 'r programming', 'engineering', 'design', 'marketing', 'leadership'];
  const detectedSkills = skillKeywords.filter((k) => text.includes(k));
  reqs.push({
    type: 'skill',
    label: 'Specific skills',
    detected: detectedSkills.length > 0,
    keywords: detectedSkills,
  });

  // GPA / academic excellence
  reqs.push({
    type: 'gpa',
    label: 'Academic excellence (GPA/grades)',
    detected: containsAny(text, ['gpa', 'grade point', 'academic excellence', 'first class', 'distinction', 'minimum grade', 'cumulative']),
    keywords: ['gpa', 'grade', 'academic'],
  });

  // Certificates
  reqs.push({
    type: 'certificate',
    label: 'Certifications',
    detected: containsAny(text, ['certificate', 'certification', 'licensed', 'professional qualification']),
    keywords: ['certificate', 'certification'],
  });

  // Projects / portfolio
  reqs.push({
    type: 'project',
    label: 'Projects or portfolio',
    detected: containsAny(text, ['portfolio', 'project', 'sample work', 'github', 'demonstrate']),
    keywords: ['project', 'portfolio'],
  });

  // Age restriction
  const ageMatch = text.match(/(?:age|under|below)\s*(\d{2})/);
  reqs.push({
    type: 'age',
    label: 'Age restriction',
    detected: ageMatch !== null,
    keywords: ageMatch ? [ageMatch[0]] : [],
  });

  // Recommendation letters
  reqs.push({
    type: 'recommendation',
    label: 'Recommendation letters',
    detected: containsAny(text, ['recommendation', 'reference letter', 'letter of recommendation', 'referee']),
    keywords: ['recommendation', 'reference'],
  });

  // Application documents (CV, motivation letter, etc.)
  reqs.push({
    type: 'application_docs',
    label: 'Application documents (CV, motivation letter)',
    detected: containsAny(text, ['cv', 'resume', 'curriculum vitae', 'motivation letter', 'cover letter', 'personal statement', 'statement of purpose']),
    keywords: ['cv', 'resume', 'motivation letter'],
  });

  return reqs;
}

// --- Eligibility Assessment ---

function checkEducationLevel(opp: Opportunity, snap: CandidateSnapshot): RequirementCheck {
  const reqLevel = opp.requiredLevel || 'any';
  const myLevel = snap.profile.currentLevel || 'bachelor';

  if (reqLevel === 'any') {
    return {
      id: nextCheckId(),
      category: 'education',
      label: 'Education level',
      status: 'met',
      detail: `No specific education level required — open to all levels.`,
      mandatory: false,
    };
  }

  const oppRank = LEVEL_RANK[reqLevel];
  const myRank = LEVEL_RANK[myLevel];

  if (myRank >= oppRank) {
    const eduClaims = snap.claimsByCategory.get('education') ?? [];
    return {
      id: nextCheckId(),
      category: 'education',
      label: `Education level: ${LEVEL_NAME[reqLevel]}`,
      status: 'met',
      detail: `Requires ${LEVEL_NAME[reqLevel]}, you are at ${LEVEL_NAME[myLevel]}.`,
      evidenceClaims: eduClaims.slice(0, 3).map((c) => c.text),
      mandatory: true,
    };
  }

  // Check target dates
  const target = reqLevel === 'phd' ? snap.profile.targetPhdStart : reqLevel === 'master' ? snap.profile.targetMasterStart : '';
  if (target) {
    return {
      id: nextCheckId(),
      category: 'education',
      label: `Education level: ${LEVEL_NAME[reqLevel]}`,
      status: 'potentially_met',
      detail: `Requires ${LEVEL_NAME[reqLevel]}, you are at ${LEVEL_NAME[myLevel]}. Your target start is ${target}.`,
      mandatory: true,
    };
  }

  return {
    id: nextCheckId(),
    category: 'education',
    label: `Education level: ${LEVEL_NAME[reqLevel]}`,
    status: 'unmet',
    detail: `Requires ${LEVEL_NAME[reqLevel]}, you are at ${LEVEL_NAME[myLevel]}. No target date set for advancing.`,
    mandatory: true,
  };
}

function checkDegreeCompletion(opp: Opportunity, snap: CandidateSnapshot): RequirementCheck {
  if (opp.requiresDegree !== 'yes') {
    return {
      id: nextCheckId(),
      category: 'degree',
      label: 'Completed degree',
      status: 'met',
      detail: 'A completed degree is not explicitly required.',
      mandatory: false,
    };
  }

  const gradDate = snap.profile.graduationDate;
  if (!gradDate) {
    return {
      id: nextCheckId(),
      category: 'degree',
      label: 'Completed degree by deadline',
      status: 'unknown',
      detail: 'Requires a completed degree, but your graduation date is not set.',
      mandatory: true,
    };
  }

  if (opp.deadline && gradDate > opp.deadline.slice(0, 7)) {
    return {
      id: nextCheckId(),
      category: 'degree',
      label: 'Completed degree by deadline',
      status: 'unmet',
      detail: `Requires a completed degree by ${opp.deadline.slice(0, 7)}, but your graduation is ${gradDate}.`,
      mandatory: true,
    };
  }

  return {
    id: nextCheckId(),
    category: 'degree',
    label: 'Completed degree by deadline',
    status: 'met',
    detail: `Requires a completed degree. Your graduation is ${gradDate}.`,
    mandatory: true,
  };
}

function checkCountryEligibility(opp: Opportunity, snap: CandidateSnapshot): RequirementCheck {
  const allowed = (opp.eligibleCountries || [])
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean);

  if (allowed.length === 0) {
    return {
      id: nextCheckId(),
      category: 'country',
      label: 'Nationality / residency',
      status: 'met',
      detail: 'No nationality or residency restrictions specified — open to all countries.',
      mandatory: false,
    };
  }

  const mine = [snap.profile.citizenship, snap.profile.residence]
    .map((c) => (c || '').trim().toLowerCase())
    .filter(Boolean);

  if (mine.length === 0) {
    return {
      id: nextCheckId(),
      category: 'country',
      label: 'Nationality / residency',
      status: 'unknown',
      detail: `Eligible countries: ${opp.eligibleCountries.join(', ')}. Your citizenship and residence are not set.`,
      mandatory: true,
    };
  }

  const ok = mine.some((c) => allowed.includes(c));
  if (ok) {
    return {
      id: nextCheckId(),
      category: 'country',
      label: 'Nationality / residency',
      status: 'met',
      detail: `You are eligible based on your citizenship or residence.`,
      mandatory: true,
    };
  }

  return {
    id: nextCheckId(),
    category: 'country',
    label: 'Nationality / residency',
    status: 'unmet',
    detail: `Eligible: ${opp.eligibleCountries.join(', ')}. Your countries: ${mine.join(', ')}.`,
    mandatory: true,
  };
}

function checkDeadline(opp: Opportunity): RequirementCheck {
  const dDays = daysUntil(opp.deadline);
  if (!opp.deadline || dDays === null) {
    return {
      id: nextCheckId(),
      category: 'deadline',
      label: 'Application deadline',
      status: 'unknown',
      detail: 'No deadline specified.',
      mandatory: false,
    };
  }
  if (dDays < 0) {
    return {
      id: nextCheckId(),
      category: 'deadline',
      label: 'Application deadline',
      status: 'unmet',
      detail: `Deadline passed on ${opp.deadline}.`,
      mandatory: true,
    };
  }
  return {
    id: nextCheckId(),
    category: 'deadline',
    label: 'Application deadline',
    status: 'met',
    detail: `Deadline is ${opp.deadline} — ${dDays} days remaining.`,
    mandatory: true,
  };
}

function checkLanguageRequirement(
  opp: Opportunity,
  snap: CandidateSnapshot,
  reqKeywords: string[]
): RequirementCheck {
  const langClaims = snap.claimsByCategory.get('language') ?? [];
  const profileLangs = normalize(snap.profile.languages);
  const hasEnglishTest = normalize(snap.profile.languages).includes('english') ||
    normalize(snap.profile.languages).includes('toefl') ||
    normalize(snap.profile.languages).includes('ielts');

  const requiresEnglish = reqKeywords.some((k) => k.includes('english') || k.includes('toefl') || k.includes('ielts'));
  const requiresOther = reqKeywords.some((k) => !k.includes('english') && !k.includes('toefl') && !k.includes('ielts') && !k.includes('language'));

  if (requiresEnglish && hasEnglishTest) {
    return {
      id: nextCheckId(),
      category: 'language',
      label: 'Language proficiency',
      status: 'met',
      detail: `English proficiency appears to be satisfied based on your profile.`,
      evidenceClaims: langClaims.slice(0, 2).map((c) => c.text),
      mandatory: true,
    };
  }

  if (requiresEnglish && !hasEnglishTest && profileLangs) {
    return {
      id: nextCheckId(),
      category: 'language',
      label: 'Language proficiency',
      status: 'potentially_met',
      detail: `English language proficiency is required. Your profile lists languages but no formal test (TOEFL/IELTS) is recorded.`,
      mandatory: true,
    };
  }

  if (requiresEnglish && !profileLangs) {
    return {
      id: nextCheckId(),
      category: 'language',
      label: 'Language proficiency',
      status: 'unknown',
      detail: `Language proficiency is required but no language information is in your profile.`,
      mandatory: true,
    };
  }

  // Other language requirements
  if (requiresOther && profileLangs) {
    const matched = reqKeywords.some((k) => profileLangs.includes(k));
    if (matched) {
      return {
        id: nextCheckId(),
        category: 'language',
        label: 'Language proficiency',
        status: 'met',
        detail: `Required language appears in your profile.`,
        mandatory: true,
      };
    }
  }

  return {
    id: nextCheckId(),
    category: 'language',
    label: 'Language proficiency',
    status: 'unknown',
    detail: `A language requirement is mentioned but cannot be verified from your profile.`,
    mandatory: true,
  };
}

function checkClaimsCategory(
  opp: Opportunity,
  snap: CandidateSnapshot,
  category: ClaimCategory,
  label: string,
  reqKeywords: string[]
): RequirementCheck {
  const claims = snap.claimsByCategory.get(category) ?? [];
  const oppText = getOppText(opp);

  if (claims.length === 0) {
    // Check profile fields as fallback
    const profileField = getProfileFieldForCategory(snap.profile, category);
    if (profileField && profileField.trim()) {
      const similarity = jaccardSimilar(profileField, oppText);
      if (similarity > 0.15) {
        return {
          id: nextCheckId(),
          category: category,
          label,
          status: 'potentially_met',
          detail: `Your profile mentions relevant ${label.toLowerCase()}, but no verified claims from documents.`,
          mandatory: false,
        };
      }
    }
    return {
      id: nextCheckId(),
      category: category,
      label,
      status: 'unknown',
      detail: `No verified ${label.toLowerCase()} evidence found. Requirement may or may not apply.`,
      mandatory: false,
    };
  }

  // Check if any claim matches opportunity keywords
  if (reqKeywords.length > 0) {
    const matched = claims.some((c) =>
      reqKeywords.some((k) => normalize(c.text).includes(k))
    );
    if (matched) {
      return {
        id: nextCheckId(),
        category,
        label,
        status: 'met',
        detail: `Verified ${label.toLowerCase()} evidence matches opportunity requirements.`,
        evidenceClaims: claims.slice(0, 3).map((c) => c.text),
        mandatory: false,
      };
    }
    // Claims exist but don't match specific keywords — still relevant
    return {
      id: nextCheckId(),
      category,
      label,
      status: 'potentially_met',
      detail: `You have verified ${label.toLowerCase()} evidence, but it may not match the specific requirement.`,
      evidenceClaims: claims.slice(0, 2).map((c) => c.text),
      mandatory: false,
    };
  }

  // No specific keywords detected — claims are generally relevant
  return {
    id: nextCheckId(),
    category,
    label,
    status: 'potentially_met',
    detail: `You have verified ${label.toLowerCase()} evidence. This opportunity does not specify detailed requirements in this area.`,
    evidenceClaims: claims.slice(0, 2).map((c) => c.text),
    mandatory: false,
  };
}

function getProfileFieldForCategory(profile: Profile, category: ClaimCategory): string {
  switch (category) {
    case 'skill': return profile.skills;
    case 'experience': return profile.experience;
    case 'language': return profile.languages;
    case 'education': return `${profile.field} ${profile.university} ${profile.gpa}`;
    default: return '';
  }
}

function checkAgeRestriction(reqKeywords: string[]): RequirementCheck {
  const ageMatch = reqKeywords[0]?.match(/(\d{2})/);
  if (!ageMatch) {
    return {
      id: nextCheckId(),
      category: 'age',
      label: 'Age restriction',
      status: 'unknown',
      detail: 'An age restriction is mentioned but could not be parsed.',
      mandatory: true,
    };
  }
  // We don't store age, so this is always unknown
  return {
    id: nextCheckId(),
    category: 'age',
    label: `Age restriction (under ${ageMatch[1]})`,
    status: 'unknown',
    detail: `This opportunity has an age restriction (under ${ageMatch[1]}). Your age is not stored in your profile — check manually.`,
    mandatory: true,
  };
}

export function assessEligibility(
  opp: Opportunity,
  snap: CandidateSnapshot
): EligibilityAssessment {
  const checks: RequirementCheck[] = [];

  // Core checks (from existing gap analysis logic, now enriched)
  checks.push(checkEducationLevel(opp, snap));
  checks.push(checkDegreeCompletion(opp, snap));
  checks.push(checkCountryEligibility(opp, snap));
  checks.push(checkDeadline(opp));

  // Detected requirement checks
  const detectedReqs = detectRequirements(opp);

  for (const req of detectedReqs) {
    if (!req.detected) {
      // Only include non-detected requirements if they're standard checks
      // Skip to avoid clutter — only show detected requirements
      continue;
    }

    switch (req.type) {
      case 'language':
        checks.push(checkLanguageRequirement(opp, snap, req.keywords));
        break;
      case 'research':
        checks.push(checkClaimsCategory(opp, snap, 'research', req.label, req.keywords));
        break;
      case 'experience':
        checks.push(checkClaimsCategory(opp, snap, 'experience', req.label, req.keywords));
        break;
      case 'skill':
        checks.push(checkClaimsCategory(opp, snap, 'skill', req.label, req.keywords));
        break;
      case 'gpa':
        checks.push(checkClaimsCategory(opp, snap, 'education', req.label, req.keywords));
        break;
      case 'certificate':
        checks.push(checkClaimsCategory(opp, snap, 'certificate', req.label, req.keywords));
        break;
      case 'project':
        checks.push(checkClaimsCategory(opp, snap, 'project', req.label, req.keywords));
        break;
      case 'age':
        checks.push(checkAgeRestriction(req.keywords));
        break;
      case 'recommendation':
        checks.push({
          id: nextCheckId(),
          category: 'recommendation',
          label: 'Recommendation letters',
          status: 'unknown',
          detail: 'Recommendation letters are required. Check if you have referees who can provide these.',
          mandatory: true,
        });
        break;
      case 'application_docs':
        checks.push({
          id: nextCheckId(),
          category: 'application_docs',
          label: 'Application documents',
          status: 'unknown',
          detail: 'Standard application documents (CV, motivation letter) are required. Prepare these materials.',
          mandatory: true,
        });
        break;
    }
  }

  // Calculate status
  const mandatory = checks.filter((c) => c.mandatory);
  const mandatoryUnmet = mandatory.filter((c) => c.status === 'unmet').length;
  const mandatoryMet = mandatory.filter((c) => c.status === 'met').length;
  const mandatoryUnknown = mandatory.filter((c) => c.status === 'unknown').length;
  const mandatoryPotentially = mandatory.filter((c) => c.status === 'potentially_met').length;

  let status: EligibilityStatus;
  let explanation: string;

  if (mandatoryUnmet > 0) {
    status = 'ineligible';
    const unmetLabels = mandatory.filter((c) => c.status === 'unmet').map((c) => c.label);
    explanation = `Not eligible: ${unmetLabels.join(', ')} ${unmetLabels.length === 1 ? 'is' : 'are'} not satisfied.`;
  } else if (mandatoryMet === mandatory.length && mandatoryPotentially === 0) {
    status = 'eligible';
    explanation = 'All mandatory requirements appear to be met. You are likely eligible to apply.';
  } else if (mandatoryPotentially > 0 && mandatoryUnknown === 0) {
    status = 'potentially_eligible';
    explanation = 'You may be eligible. Some requirements are potentially met but need verification.';
  } else if (mandatoryUnknown > 0) {
    status = 'insufficient_info';
    explanation = `Cannot determine eligibility: ${mandatoryUnknown} mandatory requirement${mandatoryUnknown !== 1 ? 's' : ''} need more information from your profile.`;
  } else {
    status = 'potentially_eligible';
    explanation = 'You may be eligible based on available information.';
  }

  return {
    status,
    checks,
    mandatoryUnmet,
    mandatoryMet,
    mandatoryUnknown,
    explanation,
  };
}

// --- Competitiveness Assessment ---

export function assessCompetitiveness(
  opp: Opportunity,
  snap: CandidateSnapshot
): CompetitivenessAssessment {
  const factors: CompetitivenessFactor[] = [];
  const oppText = getOppText(opp);

  // 1. Academic strength (max 25)
  const eduClaims = snap.claimsByCategory.get('education') ?? [];
  const qualClaims = snap.claimsByCategory.get('qualification') ?? [];
  const gpaText = snap.profile.gpa;
  let academicScore = 0;
  const academicDetails: string[] = [];
  if (eduClaims.length > 0) {
    academicScore += 10;
    academicDetails.push(`${eduClaims.length} verified education claim(s)`);
  }
  if (qualClaims.length > 0) {
    academicScore += 5;
    academicDetails.push(`${qualClaims.length} qualification claim(s)`);
  }
  if (gpaText) {
    const gpaNum = parseFloat(gpaText);
    if (!isNaN(gpaNum) && gpaNum > 0) {
      if (gpaNum >= 3.5 || gpaNum >= 85) {
        academicScore += 10;
        academicDetails.push('Strong GPA');
      } else if (gpaNum >= 3.0 || gpaNum >= 75) {
        academicScore += 6;
        academicDetails.push('Good GPA');
      } else {
        academicScore += 2;
        academicDetails.push('GPA below typical competitive range');
      }
    }
  }
  // Check if opportunity mentions academic excellence
  if (containsAny(oppText, ['gpa', 'academic excellence', 'first class', 'distinction']) && academicScore < 15) {
    academicDetails.push('This opportunity emphasizes academic excellence — strengthen your academic evidence');
  }
  factors.push({
    id: 'academic',
    label: 'Academic strength',
    score: Math.min(academicScore, 25),
    maxScore: 25,
    detail: academicDetails.join('. ') || 'No verified academic evidence',
    evidenceClaims: [...eduClaims, ...qualClaims].slice(0, 3).map((c) => c.text),
  });

  // 2. Relevant experience (max 20)
  const expClaims = snap.claimsByCategory.get('experience') ?? [];
  let expScore = 0;
  const expDetails: string[] = [];
  if (expClaims.length > 0) {
    expScore += Math.min(expClaims.length * 5, 15);
    expDetails.push(`${expClaims.length} verified experience claim(s)`);
    // Check relevance to opportunity
    const relevance = Math.max(...expClaims.map((c) => jaccardSimilar(c.text, oppText)), 0);
    if (relevance > 0.2) {
      expScore += 5;
      expDetails.push('Experience appears relevant to this opportunity');
    }
  }
  factors.push({
    id: 'experience',
    label: 'Relevant experience',
    score: Math.min(expScore, 20),
    maxScore: 20,
    detail: expDetails.join('. ') || 'No verified work experience',
    evidenceClaims: expClaims.slice(0, 3).map((c) => c.text),
  });

  // 3. Skills match (max 20)
  const skillClaims = snap.claimsByCategory.get('skill') ?? [];
  const profileSkills = snap.profile.skills ? snap.profile.skills.split(/[,\n]/).map((s) => s.trim().toLowerCase()).filter(Boolean) : [];
  let skillScore = 0;
  const skillDetails: string[] = [];
  const oppSkillKeywords = ['python', 'java', 'javascript', 'react', 'machine learning', 'data analysis', 'statistics', 'matlab', 'engineering', 'design', 'marketing', 'leadership', 'communication', 'writing'];
  const oppSkills = oppSkillKeywords.filter((k) => oppText.includes(k));

  if (oppSkills.length > 0) {
    const allMySkills = [...profileSkills, ...skillClaims.map((c) => normalize(c.text))];
    const matched = oppSkills.filter((os) => allMySkills.some((ms) => ms.includes(os) || os.includes(ms)));
    if (matched.length > 0) {
      skillScore += Math.min(matched.length * 4, 16);
      skillDetails.push(`Matched ${matched.length} of ${oppSkills.length} required skills: ${matched.join(', ')}`);
    } else {
      skillDetails.push(`Opportunity requires skills not found in your profile: ${oppSkills.join(', ')}`);
    }
  } else {
    if (skillClaims.length > 0 || profileSkills.length > 0) {
      skillScore += 8;
      skillDetails.push('Skills present but no specific skill requirements detected');
    }
  }
  factors.push({
    id: 'skills',
    label: 'Skills match',
    score: Math.min(skillScore, 20),
    maxScore: 20,
    detail: skillDetails.join('. ') || 'No verified skills',
    evidenceClaims: skillClaims.slice(0, 3).map((c) => c.text),
  });

  // 4. Research & projects (max 15)
  const researchClaims = snap.claimsByCategory.get('research') ?? [];
  const projectClaims = snap.claimsByCategory.get('project') ?? [];
  let researchScore = 0;
  const researchDetails: string[] = [];
  if (researchClaims.length > 0) {
    researchScore += Math.min(researchClaims.length * 4, 8);
    researchDetails.push(`${researchClaims.length} research claim(s)`);
  }
  if (projectClaims.length > 0) {
    researchScore += Math.min(projectClaims.length * 3, 7);
    researchDetails.push(`${projectClaims.length} project claim(s)`);
  }
  factors.push({
    id: 'research_projects',
    label: 'Research & projects',
    score: Math.min(researchScore, 15),
    maxScore: 15,
    detail: researchDetails.join('. ') || 'No verified research or project evidence',
    evidenceClaims: [...researchClaims, ...projectClaims].slice(0, 3).map((c) => c.text),
  });

  // 5. Achievements & awards (max 10)
  const awardClaims = snap.claimsByCategory.get('award') ?? [];
  let awardScore = 0;
  const awardDetails: string[] = [];
  if (awardClaims.length > 0) {
    awardScore += Math.min(awardClaims.length * 3, 10);
    awardDetails.push(`${awardClaims.length} award/achievement claim(s)`);
  }
  factors.push({
    id: 'awards',
    label: 'Achievements & awards',
    score: Math.min(awardScore, 10),
    maxScore: 10,
    detail: awardDetails.join('. ') || 'No verified awards or achievements',
    evidenceClaims: awardClaims.slice(0, 3).map((c) => c.text),
  });

  // 6. Languages (max 10)
  const langClaims = snap.claimsByCategory.get('language') ?? [];
  const profileLangs = snap.profile.languages ? snap.profile.languages.split(/[,\n]/).map((s) => s.trim()).filter(Boolean) : [];
  let langScore = 0;
  const langDetails: string[] = [];
  if (langClaims.length > 0 || profileLangs.length > 0) {
    langScore += 5;
    langDetails.push(`${profileLangs.length + langClaims.length} language(s) recorded`);
    if (containsAny(oppText, ['english', 'toefl', 'ielts'])) {
      const hasEnglish = profileLangs.some((l) => normalize(l).includes('english'));
      if (hasEnglish) {
        langScore += 5;
        langDetails.push('English proficiency recorded');
      } else {
        langDetails.push('English required but not confirmed in profile');
      }
    } else {
      langScore += 3;
    }
  }
  factors.push({
    id: 'languages',
    label: 'Language proficiency',
    score: Math.min(langScore, 10),
    maxScore: 10,
    detail: langDetails.join('. ') || 'No language information',
    evidenceClaims: langClaims.slice(0, 2).map((c) => c.text),
  });

  const totalScore = factors.reduce((sum, f) => sum + f.score, 0);
  const maxScore = factors.reduce((sum, f) => sum + f.maxScore, 0);

  const strengths = factors
    .filter((f) => f.score / f.maxScore >= 0.6)
    .map((f) => `${f.label}: ${f.detail}`);

  const weaknesses = factors
    .filter((f) => f.score / f.maxScore < 0.3)
    .map((f) => `${f.label}: ${f.detail}`);

  return {
    score: totalScore,
    maxScore,
    factors,
    strengths,
    weaknesses,
    disclaimer: 'This is an internal indicative assessment based on your verified profile evidence. It is not an official admission probability or guarantee of acceptance.',
  };
}

// --- Potential Assessment ---

export function assessPotential(
  opp: Opportunity,
  snap: CandidateSnapshot,
  eligibility: EligibilityAssessment,
  competitiveness: CompetitivenessAssessment
): PotentialAssessment {
  const improvements: ImprovementRecommendation[] = [];

  // Check if ineligible due to fixable reasons
  const isEligible = eligibility.status === 'eligible' || eligibility.status === 'potentially_eligible';
  const isIneligible = eligibility.status === 'ineligible';

  // Generate recommendations from unmet requirements
  for (const check of eligibility.checks) {
    if (check.status === 'unmet' && check.mandatory) {
      // Only recommend if potentially fixable
      if (check.category === 'education') {
        improvements.push({
          id: nextRecId(),
          gap: `Education level requirement: ${check.label}`,
          whyItMatters: 'This is a mandatory requirement. Without meeting it, you cannot apply.',
          suggestedAction: `Plan to advance your education to the required level. Set a target date in your profile.`,
          priority: 'high',
          expectedBenefit: 'Meeting this requirement will make you eligible for this and similar opportunities.',
          supportingRequirement: check.label,
          mandatory: true,
          oppId: opp.id,
          oppTitle: opp.title,
        });
      } else if (check.category === 'country') {
        // Country is not fixable — skip
        continue;
      } else if (check.category === 'deadline') {
        // Passed deadline — skip
        continue;
      }
    }

    if (check.status === 'unknown' && check.mandatory) {
      if (check.category === 'degree') {
        improvements.push({
          id: nextRecId(),
          gap: 'Graduation date not set',
          whyItMatters: 'This opportunity requires a completed degree by the deadline.',
          suggestedAction: 'Add your expected graduation date to your profile.',
          priority: 'high',
          expectedBenefit: 'Confirms whether you meet the degree completion requirement.',
          supportingRequirement: check.label,
          mandatory: true,
          oppId: opp.id,
          oppTitle: opp.title,
        });
      } else if (check.category === 'country') {
        improvements.push({
          id: nextRecId(),
          gap: 'Citizenship and residence not set',
          whyItMatters: 'This opportunity has country restrictions. Without your information, eligibility cannot be determined.',
          suggestedAction: 'Add your citizenship and country of residence to your profile.',
          priority: 'high',
          expectedBenefit: 'Determines whether you are eligible for country-restricted opportunities.',
          supportingRequirement: check.label,
          mandatory: true,
          oppId: opp.id,
          oppTitle: opp.title,
        });
      } else if (check.category === 'language') {
        improvements.push({
          id: nextRecId(),
          gap: 'Language proficiency not confirmed',
          whyItMatters: 'This opportunity requires language proficiency that is not documented in your profile.',
          suggestedAction: 'Take a language proficiency test (e.g., TOEFL, IELTS) and add the result to your profile.',
          priority: 'high',
          expectedBenefit: 'Confirms you meet the language requirement and strengthens your application.',
          supportingRequirement: check.label,
          mandatory: true,
          oppId: opp.id,
          oppTitle: opp.title,
        });
      } else if (check.category === 'recommendation') {
        improvements.push({
          id: nextRecId(),
          gap: 'Recommendation letters needed',
          whyItMatters: 'This opportunity requires recommendation letters.',
          suggestedAction: 'Identify and contact potential referees (professors, employers) who can write strong letters.',
          priority: 'medium',
          expectedBenefit: 'Having ready referees speeds up your application and improves quality.',
          supportingRequirement: check.label,
          mandatory: true,
          oppId: opp.id,
          oppTitle: opp.title,
        });
      } else if (check.category === 'application_docs') {
        improvements.push({
          id: nextRecId(),
          gap: 'Application documents needed',
          whyItMatters: 'Standard application documents (CV, motivation letter) are required.',
          suggestedAction: 'Prepare and refine your CV and a motivation/statement letter tailored to this opportunity.',
          priority: 'medium',
          expectedBenefit: 'Well-prepared documents significantly improve your application quality.',
          supportingRequirement: check.label,
          mandatory: true,
          oppId: opp.id,
          oppTitle: opp.title,
        });
      } else if (check.category === 'age') {
        improvements.push({
          id: nextRecId(),
          gap: 'Age restriction needs manual verification',
          whyItMatters: 'This opportunity has an age restriction that cannot be checked automatically.',
          suggestedAction: 'Check the opportunity details and verify you meet the age requirement.',
          priority: 'high',
          expectedBenefit: 'Confirms eligibility before you invest time in the application.',
          supportingRequirement: check.label,
          mandatory: true,
          oppId: opp.id,
          oppTitle: opp.title,
        });
      }
    }
  }

  // Generate recommendations from competitiveness weaknesses
  for (const factor of competitiveness.factors) {
    if (factor.score / factor.maxScore < 0.3) {
      const isMandatory = eligibility.checks.some(
        (c) => c.status === 'unmet' && c.category === factor.id
      );

      let action = '';
      let benefit = '';
      let priority: 'high' | 'medium' | 'low' = 'medium';

      switch (factor.id) {
        case 'academic':
          action = 'Strengthen your academic record — consider additional coursework, research, or improving your GPA if still studying.';
          benefit = 'A stronger academic record is one of the most important factors for competitive scholarships.';
          priority = 'high';
          break;
        case 'experience':
          action = 'Seek relevant internship, work, or volunteer experience in your field.';
          benefit = 'Practical experience demonstrates capability and commitment to your field.';
          priority = 'medium';
          break;
        case 'skills':
          action = 'Develop the specific skills mentioned in the opportunity description through courses, projects, or self-study.';
          benefit = 'Matching required skills directly improves your competitiveness for this opportunity.';
          priority = 'medium';
          break;
        case 'research_projects':
          action = 'Engage in research projects or build a portfolio of relevant projects.';
          benefit = 'Research and project evidence demonstrates practical capability beyond coursework.';
          priority = 'low';
          break;
        case 'awards':
          action = 'Participate in competitions, apply for smaller awards, or seek recognition in your field.';
          benefit = 'Awards and recognition distinguish you from other candidates.';
          priority = 'low';
          break;
        case 'languages':
          action = 'Improve your language proficiency, particularly in the required language.';
          benefit = 'Strong language skills are often a decisive factor for international opportunities.';
          priority = 'medium';
          break;
      }

      if (action) {
        improvements.push({
          id: nextRecId(),
          gap: `Weak ${factor.label.toLowerCase()}: ${factor.detail}`,
          whyItMatters: 'This area is below the competitive threshold for this opportunity.',
          suggestedAction: action,
          priority,
          expectedBenefit: benefit,
          supportingRequirement: factor.label,
          mandatory: isMandatory,
          oppId: opp.id,
          oppTitle: opp.title,
        });
      }
    }
  }

  // Potential score: current competitiveness + estimated improvement
  const currentScore = competitiveness.score;
  const maxGain = improvements.reduce((sum, imp) => {
    if (imp.priority === 'high') return sum + 8;
    if (imp.priority === 'medium') return sum + 5;
    return sum + 3;
  }, 0);
  const potentialScore = Math.min(currentScore + maxGain, competitiveness.maxScore);

  const canImprove = improvements.length > 0 && !isIneligible;
  const isPermanentlyIneligible = isIneligible && eligibility.checks.some(
    (c) => c.status === 'unmet' && (c.category === 'country' || c.category === 'deadline' || c.category === 'age')
  );

  let explanation: string;
  if (isPermanentlyIneligible) {
    explanation = 'This opportunity is not available to you due to a restriction that cannot be changed (country, age, or deadline). Focus on other opportunities.';
  } else if (improvements.length === 0) {
    explanation = 'Your profile is already strong for this opportunity. Focus on preparing a high-quality application.';
  } else {
    explanation = `With ${improvements.length} improvement${improvements.length !== 1 ? 's' : ''}, your competitiveness could increase from ${currentScore}/${competitiveness.maxScore} to approximately ${potentialScore}/${competitiveness.maxScore}.`;
  }

  return {
    canImprove: canImprove && !isPermanentlyIneligible,
    improvementsNeeded: improvements,
    potentialScore,
    explanation,
  };
}

// --- Full assessment ---

export function assessOpportunity(
  opp: Opportunity,
  snap: CandidateSnapshot
): OpportunityAssessment {
  const eligibility = assessEligibility(opp, snap);
  const competitiveness = assessCompetitiveness(opp, snap);
  const potential = assessPotential(opp, snap, eligibility, competitiveness);

  // Match score: weighted combination
  const eligWeight = eligibility.status === 'eligible' ? 40 :
    eligibility.status === 'potentially_eligible' ? 25 :
    eligibility.status === 'insufficient_info' ? 10 : 0;
  const compWeight = (competitiveness.score / competitiveness.maxScore) * 35;
  const potWeight = potential.canImprove ? 15 : 10;

  const matchScore = Math.round(eligWeight + compWeight + potWeight);

  let rankReason: string;
  if (eligibility.status === 'eligible' && competitiveness.score / competitiveness.maxScore > 0.6) {
    rankReason = 'Strong match: eligible and competitive based on your verified profile.';
  } else if (eligibility.status === 'eligible') {
    rankReason = 'Eligible but needs strengthening in some areas to be competitive.';
  } else if (eligibility.status === 'potentially_eligible') {
    rankReason = 'Potentially eligible — some requirements need verification.';
  } else if (eligibility.status === 'insufficient_info') {
    rankReason = 'Cannot fully assess — add more profile information to evaluate.';
  } else {
    rankReason = 'Not eligible due to unmet mandatory requirements.';
  }

  return {
    oppId: opp.id,
    opp,
    eligibility,
    competitiveness,
    potential,
    matchScore,
    rankReason,
  };
}

export function assessAllOpportunities(
  opportunities: Opportunity[],
  snap: CandidateSnapshot
): OpportunityAssessment[] {
  return opportunities.map((opp) => assessOpportunity(opp, snap));
}

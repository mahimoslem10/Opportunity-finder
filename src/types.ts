export type Level = 'any' | 'bachelor' | 'master' | 'phd' | 'graduate';
export type OpportunityType =
  | 'scholarship'
  | 'internship'
  | 'job'
  | 'program'
  | 'fellowship'
  | 'training'
  | 'conference'
  | 'volunteer'
  | 'grant'
  | 'competition';
export type OpportunityStatus =
  | 'interested'
  | 'applying'
  | 'applied'
  | 'interview'
  | 'accepted'
  | 'rejected'
  | 'skipped';
export type Bin = 'active' | 'later' | 'archive';
export type SourceType = 'rss' | 'webpage';

export interface Profile {
  currentLevel: Level;
  field: string;
  university: string;
  graduationDate: string;
  targetMasterStart: string;
  targetPhdStart: string;
  internshipStart: string;
  citizenship: string;
  residence: string;
  gpa: string;
  languages: string;
  skills: string;
  experience: string;
  preferences: string;
}

export interface Opportunity {
  id: string;
  title: string;
  organization: string;
  type: OpportunityType;
  requiredLevel: Level;
  deadline: string;
  startDate: string;
  eligibleCountries: string[];
  requiresDegree: 'yes' | 'no';
  link: string;
  status: OpportunityStatus;
  notes: string;
  description: string;
  documentIds: string[];
  addedOn: string;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  type: SourceType;
  addedOn: string;
}

export interface AppData {
  profile: Profile;
  opportunities: Opportunity[];
  sources: Source[];
  documents: ProfileDocument[];
}

export interface ProfileDocument {
  id: string;
  label: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploadedOn: string;
}

export interface RuleResult {
  bin: Bin;
  reasons: string[];
  flags: string[];
}

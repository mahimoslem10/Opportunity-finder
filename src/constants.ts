import type { DocumentCategory, Level, OpportunityStatus, OpportunityType } from './types';

export const DOCUMENT_CATEGORIES: Record<DocumentCategory, string> = {
  cv: 'CV / Resume',
  academic: 'Academic qualifications',
  certificate: 'Certificates',
  employment: 'Employment documents',
  projects: 'Projects and portfolios',
  research: 'Research documents',
  awards: 'Awards and achievements',
  other: 'Other documents',
};

export const LEVEL_RANK: Record<Level, number> = {
  any: 0,
  bachelor: 1,
  graduate: 2,
  master: 2,
  phd: 3,
};

export const LEVEL_NAME: Record<Level, string> = {
  any: 'Any',
  bachelor: "Bachelor's",
  master: "Master's",
  phd: 'PhD',
  graduate: 'Completed degree',
};

export const LEVEL_OPTIONS: { value: Level; label: string }[] = [
  { value: 'bachelor', label: "Bachelor's" },
  { value: 'master', label: "Master's" },
  { value: 'phd', label: 'PhD' },
  { value: 'graduate', label: 'Completed degree' },
];

export const TYPE_OPTIONS: { value: OpportunityType; label: string }[] = [
  { value: 'scholarship', label: 'Scholarship' },
  { value: 'fellowship', label: 'Fellowship' },
  { value: 'internship', label: 'Internship' },
  { value: 'job', label: 'Job' },
  { value: 'training', label: 'Training' },
  { value: 'conference', label: 'Conference' },
  { value: 'volunteer', label: 'Volunteer' },
  { value: 'grant', label: 'Grant' },
  { value: 'competition', label: 'Competition' },
  { value: 'program', label: 'Program' },
];

export const STATUS_OPTIONS: { value: OpportunityStatus; label: string }[] = [
  { value: 'interested', label: 'Interested' },
  { value: 'applying', label: 'Applying' },
  { value: 'applied', label: 'Applied' },
  { value: 'interview', label: 'Interview' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'skipped', label: 'Skipped' },
];

export const STATUS_COLORS: Record<OpportunityStatus, string> = {
  interested: 'bg-gray-100 text-gray-700',
  applying: 'bg-blue-100 text-blue-700',
  applied: 'bg-indigo-100 text-indigo-700',
  interview: 'bg-amber-100 text-amber-700',
  accepted: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  skipped: 'bg-gray-100 text-gray-500',
};

export const TYPE_LABELS: Record<OpportunityType, string> = {
  scholarship: 'Scholarship',
  fellowship: 'Fellowship',
  internship: 'Internship',
  job: 'Job',
  training: 'Training',
  conference: 'Conference',
  volunteer: 'Volunteer',
  grant: 'Grant',
  competition: 'Competition',
  program: 'Program',
};

export const STATUS_LABELS: Record<OpportunityStatus, string> = {
  interested: 'Interested',
  applying: 'Applying',
  applied: 'Applied',
  interview: 'Interview',
  accepted: 'Accepted',
  rejected: 'Rejected',
  skipped: 'Skipped',
};

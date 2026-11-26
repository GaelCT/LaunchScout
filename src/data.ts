import researchData from './research-data/kern-county.json';
import { safeExternalUrl, safePublicContactUrl } from './urls';

export type Opportunity = 'Internship' | 'Full-time' | 'Technical role';

export interface ResearchSource {
  label: string;
  url: string;
  sourceType: string;
  checkedAt: string;
  supports: string[];
}

export interface Opening {
  id: string;
  title: string;
  roleType: string;
  status: string;
  location: string | null;
  studentSuitability: string;
  experienceRequirements: string | null;
  educationRequirements: string | null;
  skills: string[];
  workArrangement: string | null;
  pay: {
    min: number;
    max: number;
    currency: string;
    period: string;
    verification: string;
  } | null;
  citizenshipOrClearance: string | null;
  applicationUrl: string | null;
  checkedAt: string;
  closedDate: string | null;
  notes: string | null;
  sources: string[];
}

export interface Company {
  id: string;
  name: string;
  city: string;
  companyTypeLabel: string;
  industry: string;
  industries: string[];
  tagline: string;
  description: string;
  opportunities: Opportunity[];
  founded: number | null;
  team: string | null;
  color: string;
  initials: string;
  verificationDate: string;
  companyType: string;
  localConnection: {
    type: string;
    city: string | null;
    county: string;
    state: string;
    note?: string;
  };
  potentialStudentFit: { skillAreas: string[]; note: string };
  publicLinks: { website: string | null; careers: string | null; contact: string | null };
  roleSearch: { status: string; checkedAt: string; note: string };
  openings: Opening[];
  studentPrograms: Array<Record<string, unknown>>;
  sources: ResearchSource[];
}

interface CompanyRecord extends Omit<
  Company,
  | 'city'
  | 'companyTypeLabel'
  | 'industry'
  | 'industries'
  | 'tagline'
  | 'opportunities'
  | 'founded'
  | 'team'
  | 'color'
  | 'initials'
  | 'verificationDate'
> {
  industry: string[];
  foundedYear?: number;
  launchYear?: number;
  employeeRange?: string | null;
}

interface ResearchDataset {
  schemaVersion: number;
  dataset: {
    name: string;
    scope: { county: string; state: string; country: string };
    sourceSnapshotDate: string;
    roleRecheckDays: number;
    companyRecheckDays: number;
    note: string;
  };
  companies: CompanyRecord[];
  programs: Array<Record<string, unknown>>;
  ecosystemResources: Array<Record<string, unknown>>;
  verificationQueue: Array<Record<string, unknown>>;
}

const dataset = researchData as unknown as ResearchDataset;

function initials(name: string): string {
  return name
    .replace(/\([^)]*\)/g, '')
    .split(/[\s/-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toLowerCase();
}

function colorFor(industries: string[]): string {
  const label = industries.join(' ').toLowerCase();
  if (/health|clinical|neural/.test(label)) return 'lavender';
  if (/energy|aerospace|defense|utility/.test(label)) return 'peach';
  if (/climate|food|government|public/.test(label)) return 'sand';
  return 'sage';
}

function opportunityFor(roleType: string): Opportunity {
  if (roleType === 'internship') return 'Internship';
  if (roleType === 'full_time') return 'Full-time';
  return 'Technical role';
}

function isOpenAtSnapshot(opening: Opening): boolean {
  return opening.status === 'open_at_snapshot' || opening.status === 'open_reported_verify_live';
}

export const companies: Company[] = dataset.companies.map((record) => {
  const industries = record.industry;
  const city = record.localConnection.city ?? 'Kern County';
  const openRoles = record.openings.filter(isOpenAtSnapshot);
  return {
    ...record,
    city,
    companyTypeLabel: record.companyType
      .split('_')
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(' '),
    industry: industries[0] ?? 'Other',
    industries,
    tagline: record.companyType
      .split('_')
      .map((word) => word[0].toUpperCase() + word.slice(1))
      .join(' '),
    opportunities: [...new Set(openRoles.map((opening) => opportunityFor(opening.roleType)))],
    founded: record.foundedYear ?? record.launchYear ?? null,
    team: record.employeeRange ?? null,
    color: colorFor(industries),
    initials: initials(record.name),
    verificationDate: record.roleSearch.checkedAt,
    publicLinks: {
      website: safeExternalUrl(record.publicLinks.website),
      careers: safeExternalUrl(record.publicLinks.careers),
      contact: safePublicContactUrl(record.publicLinks.contact),
    },
    openings: record.openings.map((opening) => ({
      ...opening,
      applicationUrl: safeExternalUrl(opening.applicationUrl),
    })),
    sources: record.sources.flatMap((source) => {
      const url = safeExternalUrl(source.url);
      return url ? [{ ...source, url }] : [];
    }),
  };
});

export const cities = [...new Set(companies.map((company) => company.city))].sort();
export const companyTypes = [
  ...new Set(companies.map((company) => company.companyTypeLabel)),
].sort();
export const industries = [...new Set(companies.flatMap((company) => company.industries))].sort();
export const opportunityTypes: Opportunity[] = [
  ...new Set(companies.flatMap((company) => company.opportunities)),
].sort();
export const datasetInfo = dataset.dataset;
export const programs = dataset.programs;
export const ecosystemResources = dataset.ecosystemResources;
export const verificationQueue = dataset.verificationQueue;

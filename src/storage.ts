import { cities, companies, industries, opportunityTypes } from './data';

export const STORAGE_KEY = 'launchscout.preferences.v1';
export interface Filters {
  city: string;
  industry: string;
  opportunity: string;
}
export interface Preferences {
  saved: string[];
  rejected: string[];
  filters: Filters;
  theme: 'light' | 'dark';
}
export const emptyFilters: Filters = { city: '', industry: '', opportunity: '' };
export const emptyPreferences: Preferences = {
  saved: [],
  rejected: [],
  filters: { ...emptyFilters },
  theme: 'light',
};
const ids = new Set(companies.map((c) => c.id));

export function loadPreferences(): { preferences: Preferences; error: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { preferences: emptyPreferences, error: false };
    const value = JSON.parse(raw);
    const cleanIds = (input: unknown): string[] =>
      Array.isArray(input)
        ? [...new Set(input.filter((id): id is string => typeof id === 'string' && ids.has(id)))]
        : [];
    const rejected = cleanIds(value?.rejected);
    const saved = cleanIds(value?.saved).filter((id) => !rejected.includes(id));
    const filter = (input: unknown, options: string[]) =>
      typeof input === 'string' && options.includes(input) ? input : '';
    return {
      preferences: {
        saved,
        rejected,
        theme: value?.theme === 'dark' ? 'dark' : 'light',
        filters: {
          city: filter(value?.filters?.city, cities),
          industry: filter(value?.filters?.industry, industries),
          opportunity: filter(value?.filters?.opportunity, opportunityTypes),
        },
      },
      error: false,
    };
  } catch {
    return { preferences: emptyPreferences, error: true };
  }
}

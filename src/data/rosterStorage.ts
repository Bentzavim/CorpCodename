import { SEED_MEMBERS, type MemberRecord } from './members';

// Browser-only. The server builds its boards from SEED_MEMBERS directly, so
// nothing here may be imported from api/ or server/.

const STORAGE_KEY = 'corpcodename:roster:v1';

export function loadRoster(): MemberRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return SEED_MEMBERS;
    const parsed = JSON.parse(raw) as MemberRecord[];
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : SEED_MEMBERS;
  } catch {
    return SEED_MEMBERS;
  }
}

export function saveRoster(records: MemberRecord[]): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

export function clearRoster(): void {
  localStorage.removeItem(STORAGE_KEY);
}

export function hasImportedRoster(): boolean {
  return localStorage.getItem(STORAGE_KEY) !== null;
}

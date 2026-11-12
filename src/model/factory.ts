import type { Tournament, TournamentFormat, TournamentSettings } from './types';

export function newId(): string {
  return crypto.randomUUID();
}

/** Исходные настройки для заданного числа команд: группы примерно по 4, один кубок на половину команд. */
export function defaultSettings(teamCount = 16): TournamentSettings {
  const groupCount = Math.max(1, Math.floor(teamCount / 4));
  let cupSize = 2;
  while (cupSize * 4 <= teamCount) cupSize *= 2;
  return {
    teamCount,
    prelim: {
      kind: 'groups',
      groupType: 'roundRobin',
      groupCount,
      drawMode: 'seeded',
      seededCount: groupCount,
    },
    cups: [{ name: 'Кубок A', size: cupSize, thirdPlaceMatch: false }],
  };
}

export function createTournament(name: string, date: string, format: TournamentFormat): Tournament {
  const now = new Date().toISOString();
  return {
    id: newId(),
    name,
    date,
    format,
    createdAt: now,
    updatedAt: now,
    stage: 'teams',
    settings: defaultSettings(),
    teams: [],
    groups: [],
    swissRounds: [],
    cups: [],
  };
}

/** Дополняет турниры, сохранённые предыдущими версиями приложения. */
export function normalizeTournament(t: Tournament): Tournament {
  return t.format ? t : { ...t, format: 'triplet' };
}

/** Минимальная проверка структуры при импорте из файла. */
export function isTournament(value: unknown): value is Tournament {
  if (typeof value !== 'object' || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.id === 'string' &&
    typeof t.name === 'string' &&
    typeof t.settings === 'object' &&
    t.settings !== null &&
    Array.isArray(t.teams) &&
    Array.isArray(t.groups) &&
    Array.isArray(t.swissRounds) &&
    Array.isArray(t.cups)
  );
}

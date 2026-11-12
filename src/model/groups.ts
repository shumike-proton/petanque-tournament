import { frenchSchedule } from './french';
import { isPlayed, newMatch } from './match';
import { groupSizes } from './settings';
import { sortByRating } from './team';
import type { Group, GroupsSettings, Id, Match, Team } from './types';

type Random = () => number;

function shuffle<T>(items: T[], random: Random): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export function groupName(index: number, groupCount: number): string {
  return groupCount <= 26 ? `Группа ${String.fromCharCode(65 + index)}` : `Группа ${index + 1}`;
}

/**
 * Распределение команд по группам. Возвращает списки id, внутри группы — по убыванию рейтинга.
 *  - snake: все команды «змейкой» по рейтингу, без случайности;
 *  - seeded: лучшие по рейтингу (сеяные) случайно и поровну по группам, остальные случайно.
 */
export function drawGroups(teams: Team[], settings: GroupsSettings, random: Random = Math.random): Id[][] {
  const g = settings.groupCount;
  const ranked = sortByRating(teams);
  const rank = new Map(ranked.map((t, i) => [t.id, i]));
  const groups: Id[][] = Array.from({ length: g }, () => []);

  if (settings.drawMode === 'snake') {
    ranked.forEach((team, i) => {
      const row = Math.floor(i / g);
      const pos = i % g;
      groups[row % 2 === 0 ? pos : g - 1 - pos]!.push(team.id);
    });
  } else {
    const seeded = shuffle(ranked.slice(0, settings.seededCount), random);
    seeded.forEach((team, i) => groups[i % g]!.push(team.id));
    // Остальные заполняют группы до нужного размера; какие группы получат лишнюю команду — тоже случайно.
    const sizes = shuffle(groupSizes(teams.length, g), random);
    const rest = shuffle(ranked.slice(settings.seededCount), random);
    let next = 0;
    groups.forEach((group, gi) => {
      while (group.length < sizes[gi]!) group.push(rest[next++]!.id);
    });
  }

  return groups.map((ids) => ids.sort((a, b) => rank.get(a)! - rank.get(b)!));
}

/** Расписание круговой группы по турам (круговой метод): каждая команда играет с каждой один раз. */
export function roundRobinSchedule(teamIds: Id[]): Match[] {
  const slots: (Id | null)[] = teamIds.length % 2 === 0 ? [...teamIds] : [...teamIds, null];
  const n = slots.length;
  const matches: Match[] = [];
  for (let round = 1; round < n; round++) {
    for (let i = 0; i < n / 2; i++) {
      const a = slots[i]!;
      const b = slots[n - 1 - i]!;
      if (a !== null && b !== null) matches.push(newMatch(a, b, round));
    }
    // Первая команда остаётся на месте, остальные сдвигаются по кругу.
    slots.splice(1, 0, slots.pop()!);
  }
  return matches;
}

/** Жеребьёвка и расписание групп — круговых или французских, по настройкам. */
export function createGroups(teams: Team[], settings: GroupsSettings, random?: Random): Group[] {
  const drawn = drawGroups(teams, settings, random);
  return drawn.map((teamIds, i) => ({
    name: groupName(i, drawn.length),
    teamIds,
    matches: settings.groupType === 'french' ? frenchSchedule(teamIds) : roundRobinSchedule(teamIds),
  }));
}

export interface StandingRow {
  teamId: Id;
  played: number;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
  diff: number;
  place: number;
}

export type Stats = Omit<StandingRow, 'place'>;

export function collectStats(teamIds: Id[], matches: Match[]): Map<Id, Stats> {
  const stats = new Map<Id, Stats>(
    teamIds.map((teamId) => [
      teamId,
      { teamId, played: 0, wins: 0, losses: 0, pointsFor: 0, pointsAgainst: 0, diff: 0 },
    ]),
  );
  for (const m of matches) {
    if (!isPlayed(m)) continue;
    const a = stats.get(m.teamA);
    const b = stats.get(m.teamB);
    if (!a || !b) continue;
    const sides: [Stats, number, number][] = [
      [a, m.scoreA, m.scoreB],
      [b, m.scoreB, m.scoreA],
    ];
    for (const [s, own, other] of sides) {
      s.played++;
      s.pointsFor += own;
      s.pointsAgainst += other;
      s.diff += own - other;
      if (own > other) s.wins++;
      else s.losses++;
    }
  }
  return stats;
}

/** Делит список на подряд идущие части с равным значением ключа (список уже отсортирован по ключу). */
function splitByKey<T>(sorted: T[], key: (item: T) => number): T[][] {
  const parts: T[][] = [];
  for (const item of sorted) {
    const last = parts[parts.length - 1];
    if (last && key(last[0]!) === key(item)) last.push(item);
    else parts.push([item]);
  }
  return parts;
}

/**
 * Места в круговой группе:
 *  1) количество побед;
 *  2) при равенстве — личные встречи: мини-таблица побед между равными командами
 *     (применяется повторно, пока она продолжает разделять команды);
 *  3) общая разница очков;
 *  4) общее количество набранных очков.
 * Если и это не разделило команды, сохраняется исходный порядок (по рейтингу).
 */
export function groupStandings(teamIds: Id[], matches: Match[]): StandingRow[] {
  const total = collectStats(teamIds, matches);
  const order = new Map(teamIds.map((id, i) => [id, i]));

  function resolveTie(tied: Id[]): Id[] {
    if (tied.length < 2) return tied;
    const inTie = new Set(tied);
    const mini = collectStats(
      tied,
      matches.filter((m) => m.teamA !== null && m.teamB !== null && inTie.has(m.teamA) && inTie.has(m.teamB)),
    );
    const miniWins = (id: Id) => mini.get(id)!.wins;
    const byMini = [...tied].sort((a, b) => miniWins(b) - miniWins(a));
    const parts = splitByKey(byMini, miniWins);
    if (parts.length > 1) return parts.flatMap(resolveTie);
    return [...tied].sort((a, b) => {
      const sa = total.get(a)!;
      const sb = total.get(b)!;
      return sb.diff - sa.diff || sb.pointsFor - sa.pointsFor || order.get(a)! - order.get(b)!;
    });
  }

  const wins = (id: Id) => total.get(id)!.wins;
  const byWins = [...teamIds].sort((a, b) => wins(b) - wins(a) || order.get(a)! - order.get(b)!);
  return splitByKey(byWins, wins)
    .flatMap(resolveTie)
    .map((teamId, i) => ({ ...total.get(teamId)!, place: i + 1 }));
}

export function isGroupComplete(group: Group): boolean {
  return group.matches.every(isPlayed);
}

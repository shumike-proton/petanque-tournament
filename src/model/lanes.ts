import type { CupBracket, Group, Match, SwissRound, Tournament } from './types';

/** Сдвиг дорожек между турами швейцарки по умолчанию. */
export const DEFAULT_LANE_SHIFT = 3;

const lane = (index: number, total: number) => String((((index % total) + total) % total) + 1);

/**
 * Дорожки тура швейцарки: пары идут по порядку, первый тур — с первой дорожки, каждый следующий
 * сдвигается на shift дорожек (второй тур начинается с дорожки shift + 1). Нумерация идёт по кругу:
 * после последней дорожки — снова первая.
 */
export function withSwissLanes(round: SwissRound, shift: number): SwissRound {
  const total = round.matches.length;
  if (total === 0) return round;
  const offset = (round.number - 1) * shift;
  return { ...round, matches: round.matches.map((m, i) => ({ ...m, lane: lane(i + offset, total) })) };
}

/** Число одновременных игр группы в одном туре. */
const pairsInGroup = (group: Group) => Math.floor(group.teamIds.length / 2);

/** Сколько дорожек занято в предварительном раунде. */
export function prelimLaneCount(t: Tournament): number {
  return t.settings.prelim.kind === 'swiss'
    ? Math.floor(t.teams.length / 2)
    : t.groups.reduce((sum, g) => sum + pairsInGroup(g), 0);
}

/**
 * Дорожки групп: в первом туре группы занимают дорожки по порядку, начиная с группы A с первой
 * дорожки. В каждом следующем туре все сдвигаются на число пар в группе (если в группе 3 пары,
 * второй тур группы A начинается с дорожки 4), нумерация идёт по кругу.
 */
export function withGroupLanes(groups: Group[]): Group[] {
  const pairs = groups.map(pairsInGroup);
  const total = pairs.reduce((sum, n) => sum + n, 0);
  if (total === 0) return groups;
  const shift = Math.max(...pairs);
  let start = 0;
  return groups.map((group, g) => {
    const groupStart = start;
    start += pairs[g]!;
    const indexInRound = new Map<number, number>();
    return {
      ...group,
      matches: group.matches.map((m) => {
        const round = m.round ?? 1;
        const index = indexInRound.get(round) ?? 0;
        indexInRound.set(round, index + 1);
        return { ...m, lane: lane(groupStart + index + (round - 1) * shift, total) };
      }),
    };
  });
}

/**
 * Дорожки плей-офф. В каждом раунде игры всех кубков идут по порядку кубков, и каждая игра получает
 * свободную дорожку с наименьшим номером, на которой этот кубок ещё не играл. Так кубок в следующих
 * раундах не возвращается на свои прежние дорожки, пока хватает дорожек (laneCount — сколько их
 * было занято в предварительном раунде). Если свободных «новых» дорожек нет, берётся дорожка,
 * на которой кубок не играл в предыдущем раунде, а затем любая свободная.
 */
export function withPlayoffLanes(cups: CupBracket[], laneCount: number): CupBracket[] {
  const firstRoundGames = cups.reduce((sum, c) => sum + (c.rounds[0]?.matches.length ?? 0), 0);
  const total = Math.max(laneCount, firstRoundGames, 1);
  const usedByCup = cups.map(() => new Set<number>());
  const previousByCup = cups.map(() => new Set<number>());
  const result = cups.map((c) => ({ ...c, rounds: c.rounds.map((r) => ({ ...r, matches: [...r.matches] })) }));
  const roundCount = Math.max(0, ...cups.map((c) => c.rounds.length));

  for (let r = 0; r < roundCount; r++) {
    const taken = new Set<number>();
    const pick = (cupIndex: number): number => {
      const free = Array.from({ length: total }, (_, i) => i + 1).filter((n) => !taken.has(n));
      const chosen =
        free.find((n) => !usedByCup[cupIndex]!.has(n)) ??
        free.find((n) => !previousByCup[cupIndex]!.has(n)) ??
        free[0] ??
        taken.size + 1;
      taken.add(chosen);
      return chosen;
    };
    const current = cups.map(() => new Set<number>());
    result.forEach((cup, cupIndex) => {
      const assign = (m: Match): Match => {
        const n = pick(cupIndex);
        current[cupIndex]!.add(n);
        return { ...m, lane: String(n) };
      };
      const round = cup.rounds[r];
      if (!round) return;
      round.matches = round.matches.map(assign);
      if (r === cup.rounds.length - 1 && cup.thirdPlaceMatch) cup.thirdPlaceMatch = assign(cup.thirdPlaceMatch);
    });
    current.forEach((lanes, cupIndex) => {
      lanes.forEach((n) => usedByCup[cupIndex]!.add(n));
      previousByCup[cupIndex] = lanes;
    });
  }
  return result;
}

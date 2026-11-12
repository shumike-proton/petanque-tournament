import { describe, expect, it } from 'vitest';
import { frenchSchedule } from './french';
import { roundRobinSchedule } from './groups';
import { withGroupLanes, withPlayoffLanes, withSwissLanes } from './lanes';
import { newMatch } from './match';
import { createBracket } from './playoff';
import type { CupBracket, Group, SwissRound } from './types';

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

describe('дорожки швейцарки', () => {
  const round = (number: number, games: number): SwissRound => ({
    number,
    byeTeamId: null,
    matches: Array.from({ length: games }, (_, i) => newMatch(`a${i}`, `b${i}`, number)),
  });
  const lanes = (r: SwissRound) => r.matches.map((m) => m.lane);

  it('первый тур — с первой дорожки по порядку', () => {
    expect(lanes(withSwissLanes(round(1, 8), 3))).toEqual(['1', '2', '3', '4', '5', '6', '7', '8']);
  });

  it('второй тур сдвигается на 3 дорожки и идёт по кругу', () => {
    expect(lanes(withSwissLanes(round(2, 8), 3))).toEqual(['4', '5', '6', '7', '8', '1', '2', '3']);
    expect(lanes(withSwissLanes(round(3, 8), 3))[0]).toBe('7');
    expect(lanes(withSwissLanes(round(4, 8), 3))[0]).toBe('2');
  });

  it('сдвиг задаётся', () => {
    expect(lanes(withSwissLanes(round(2, 8), 5))[0]).toBe('6');
    expect(lanes(withSwissLanes(round(2, 8), 0))[0]).toBe('1');
  });
});

describe('дорожки групп', () => {
  const group = (name: string, size: number): Group => {
    const teamIds = ids(name, size);
    return { name, teamIds, matches: roundRobinSchedule(teamIds) };
  };
  const lanesOf = (g: Group, round: number) => g.matches.filter((m) => m.round === round).map((m) => m.lane);

  it('группы по 6 команд: первый тур по порядку групп, второй сдвинут на 3', () => {
    const [a, b] = withGroupLanes([group('A', 6), group('B', 6)]) as [Group, Group];
    expect(lanesOf(a, 1)).toEqual(['1', '2', '3']);
    expect(lanesOf(b, 1)).toEqual(['4', '5', '6']);
    expect(lanesOf(a, 2)).toEqual(['4', '5', '6']);
    expect(lanesOf(b, 2)).toEqual(['1', '2', '3']);
    expect(lanesOf(a, 3)).toEqual(['1', '2', '3']);
  });

  it('четыре группы по 4 команды: в одном туре дорожки не повторяются', () => {
    const groups = withGroupLanes([group('A', 4), group('B', 4), group('C', 4), group('D', 4)]);
    for (const round of [1, 2, 3]) {
      const lanes = groups.flatMap((g) => lanesOf(g, round));
      expect(new Set(lanes).size).toBe(8);
    }
    expect(lanesOf(groups[0]!, 2)).toEqual(['3', '4']);
    expect(lanesOf(groups[3]!, 2)).toEqual(['1', '2']);
  });

  it('французские группы: участники ещё не известны, дорожки уже назначены', () => {
    const teamIds = ids('A', 4);
    const [g] = withGroupLanes([{ name: 'A', teamIds, matches: frenchSchedule(teamIds) }]) as [Group];
    expect(g.matches.every((m) => m.lane !== undefined)).toBe(true);
    expect(lanesOf(g, 1)).toEqual(['1', '2']);
  });
});

describe('дорожки плей-офф', () => {
  const cup = (name: string, size: number, third = false): CupBracket =>
    createBracket({ name, size, thirdPlaceMatch: third }, ids(name, size), {});
  const roundLanes = (c: CupBracket, r: number) => c.rounds[r]!.matches.map((m) => Number(m.lane));

  it('один кубок на 8 при восьми дорожках: дорожки не повторяются ни в одном раунде', () => {
    const [a] = withPlayoffLanes([cup('A', 8, true)], 8) as [CupBracket];
    expect(roundLanes(a, 0)).toEqual([1, 2, 3, 4]);
    expect(roundLanes(a, 1)).toEqual([5, 6]);
    expect(roundLanes(a, 2)).toEqual([7]);
    expect(a.thirdPlaceMatch!.lane).toBe('8');
  });

  it('два кубка: в следующих раундах кубок не играет на своих прежних дорожках', () => {
    const [a, b] = withPlayoffLanes([cup('A', 8), cup('B', 8)], 8) as [CupBracket, CupBracket];
    expect(roundLanes(a, 0)).toEqual([1, 2, 3, 4]);
    expect(roundLanes(b, 0)).toEqual([5, 6, 7, 8]);
    for (const c of [a, b]) {
      const all = c.rounds.flatMap((_, r) => roundLanes(c, r));
      expect(new Set(all).size).toBe(all.length);
    }
    // В одном раунде дорожки разных кубков не совпадают.
    for (const r of [0, 1, 2]) {
      const both = [...roundLanes(a, r), ...roundLanes(b, r)];
      expect(new Set(both).size).toBe(both.length);
    }
  });

  it('дорожек мало: повторов внутри раунда всё равно нет, соседние раунды кубка не совпадают', () => {
    const [a] = withPlayoffLanes([cup('A', 8)], 4) as [CupBracket];
    expect(roundLanes(a, 0)).toEqual([1, 2, 3, 4]);
    expect(new Set(roundLanes(a, 1)).size).toBe(2);
    const semis = roundLanes(a, 1);
    expect(semis.includes(roundLanes(a, 2)[0]!)).toBe(false);
  });
});

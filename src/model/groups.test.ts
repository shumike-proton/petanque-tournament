import { describe, expect, it } from 'vitest';
import { drawGroups, groupStandings, roundRobinSchedule } from './groups';
import type { GroupsSettings, Match, Team } from './types';

/** Команды Т1…Тn, рейтинг убывает с номером. */
const makeTeams = (n: number): Team[] =>
  Array.from({ length: n }, (_, i) => ({ id: `Т${i + 1}`, name: `Т${i + 1}`, players: [], manualRating: 1000 - i }));

const settings = (over: Partial<GroupsSettings>): GroupsSettings => ({
  kind: 'groups',
  groupType: 'roundRobin',
  groupCount: 4,
  drawMode: 'snake',
  seededCount: 0,
  ...over,
});

/** Детерминированный генератор случайных чисел для тестов. */
function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

describe('drawGroups', () => {
  it('змейка по рейтингу', () => {
    expect(drawGroups(makeTeams(8), settings({ groupCount: 4 }))).toEqual([
      ['Т1', 'Т8'],
      ['Т2', 'Т7'],
      ['Т3', 'Т6'],
      ['Т4', 'Т5'],
    ]);
  });

  it('змейка при неравных группах: разница не больше одной команды', () => {
    const sizes = drawGroups(makeTeams(14), settings({ groupCount: 4 })).map((g) => g.length);
    expect(sizes.reduce((a, b) => a + b)).toBe(14);
    expect(Math.max(...sizes) - Math.min(...sizes)).toBe(1);
  });

  it('сеяные расходятся поровну по группам, все команды распределены', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const groups = drawGroups(
        makeTeams(14),
        settings({ groupCount: 4, drawMode: 'seeded', seededCount: 8 }),
        seededRandom(seed),
      );
      const seededIds = new Set(['Т1', 'Т2', 'Т3', 'Т4', 'Т5', 'Т6', 'Т7', 'Т8']);
      expect(groups.map((g) => g.filter((id) => seededIds.has(id)).length)).toEqual([2, 2, 2, 2]);
      expect(groups.map((g) => g.length).sort()).toEqual([3, 3, 4, 4]);
      expect(new Set(groups.flat()).size).toBe(14);
    }
  });

  it('жеребьёвка даёт разные результаты', () => {
    const draw = (seed: number) =>
      JSON.stringify(drawGroups(makeTeams(16), settings({ drawMode: 'seeded', seededCount: 4 }), seededRandom(seed)));
    expect(new Set([1, 2, 3, 4, 5].map(draw)).size).toBeGreaterThan(1);
  });
});

describe('roundRobinSchedule', () => {
  const pairs = (matches: Match[]) => matches.map((m) => [m.teamA, m.teamB].sort().join('-')).sort();

  it('4 команды: 3 тура по 2 игры, каждый с каждым', () => {
    const matches = roundRobinSchedule(['A', 'B', 'C', 'D']);
    expect(pairs(matches)).toEqual(['A-B', 'A-C', 'A-D', 'B-C', 'B-D', 'C-D']);
    for (const round of [1, 2, 3]) {
      const inRound = matches.filter((m) => m.round === round);
      expect(inRound).toHaveLength(2);
      expect(new Set(inRound.flatMap((m) => [m.teamA, m.teamB])).size).toBe(4);
    }
  });

  it('5 команд: 5 туров по 2 игры, одна команда свободна', () => {
    const matches = roundRobinSchedule(['A', 'B', 'C', 'D', 'E']);
    expect(matches).toHaveLength(10);
    expect(new Set(pairs(matches)).size).toBe(10);
    expect(Math.max(...matches.map((m) => m.round!))).toBe(5);
  });
});

describe('groupStandings', () => {
  let n = 0;
  const game = (teamA: string, scoreA: number, teamB: string, scoreB: number): Match => ({
    id: String(n++),
    teamA,
    teamB,
    scoreA,
    scoreB,
  });
  const places = (ids: string[], matches: Match[]) => groupStandings(ids, matches).map((r) => r.teamId);

  it('по количеству побед, со статистикой', () => {
    const rows = groupStandings(
      ['A', 'B', 'C'],
      [game('A', 13, 'B', 5), game('A', 13, 'C', 7), game('B', 13, 'C', 12)],
    );
    expect(rows.map((r) => r.teamId)).toEqual(['A', 'B', 'C']);
    expect(rows[0]).toMatchObject({ played: 2, wins: 2, losses: 0, pointsFor: 26, pointsAgainst: 12, diff: 14, place: 1 });
    expect(rows[2]).toMatchObject({ wins: 0, losses: 2, diff: -7, place: 3 });
  });

  it('две команды с равными победами — личная встреча важнее разницы', () => {
    // B и C по 2 победы; у C разница лучше, но B выиграл у C.
    const matches = [
      game('A', 13, 'B', 0),
      game('A', 13, 'C', 12),
      game('A', 13, 'D', 0),
      game('B', 13, 'C', 12),
      game('B', 13, 'D', 12),
      game('C', 13, 'D', 0),
    ];
    expect(places(['A', 'B', 'C', 'D'], matches)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('круг из трёх команд — общая разница, затем набранные очки', () => {
    // A>B, B>C, C>A; все по 1 победе в мини-таблице. Все трое обыграли D.
    const matches = [
      game('A', 13, 'B', 10),
      game('B', 13, 'C', 5),
      game('C', 13, 'A', 12),
      game('A', 13, 'D', 0),
      game('B', 13, 'D', 0),
      game('C', 13, 'D', 0),
    ];
    // Разница: A = +3 −1 +13 = 15, B = −3 +8 +13 = 18, C = −8 +1 +13 = 6.
    expect(places(['A', 'B', 'C', 'D'], matches)).toEqual(['B', 'A', 'C', 'D']);
  });

  it('мини-таблица из трёх команд разделяет их по победам между собой', () => {
    // A, B, C по 2 победы. Между собой: A обыграл B и C, B обыграл C.
    // У C лучшая общая разница, но в мини-таблице он последний.
    const matches = [
      game('A', 13, 'B', 12),
      game('A', 13, 'C', 12),
      game('B', 13, 'C', 12),
      game('D', 13, 'A', 0),
      game('E', 13, 'A', 0),
      game('D', 13, 'B', 0),
      game('B', 13, 'E', 12),
      game('C', 13, 'D', 0),
      game('C', 13, 'E', 0),
      game('D', 13, 'E', 12),
    ];
    expect(places(['A', 'B', 'C', 'D', 'E'], matches)).toEqual(['D', 'A', 'B', 'C', 'E']);
  });

  it('частичная мини-таблица: после разделения личная встреча применяется повторно', () => {
    // Четыре команды по 2 победы из 5 (все проиграли X, обыграли Y… упрощённо задаём только игры между ними
    // и по одной игре с аутсайдером). Между собой: A 2 победы, B 2, C 1, D 1; A обыграл B, D обыграл C.
    const matches = [
      game('A', 13, 'B', 12),
      game('A', 13, 'C', 12),
      game('D', 13, 'A', 12),
      game('B', 13, 'C', 12),
      game('B', 13, 'D', 12),
      game('D', 13, 'C', 0),
      game('C', 13, 'Z', 0),
    ];
    // Победы всего: A 2, B 2, C 2 (одна над Z), D 2. Мини: A 2, B 2, D 2, C 0 → C последний из четырёх;
    // среди A, B, D круг (A>B, B>D, D>A) → разница: D = +1 −1 +13 = 13, A = +1 +1 −1 = 1, B = −1 +1 +1 = 1;
    // у A и B разница равна → набранные очки: A = 38, B = 38 → исходный порядок.
    expect(places(['A', 'B', 'C', 'D', 'Z'], matches)).toEqual(['D', 'A', 'B', 'C', 'Z']);
  });

  it('незаполненные и некорректные результаты не учитываются', () => {
    const rows = groupStandings(
      ['A', 'B'],
      [{ id: 'x', teamA: 'A', teamB: 'B', scoreA: 13, scoreB: null }, game('A', 7, 'B', 7)],
    );
    expect(rows.every((r) => r.played === 0)).toBe(true);
  });
});

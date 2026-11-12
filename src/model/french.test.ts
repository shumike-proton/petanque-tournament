import { describe, expect, it } from 'vitest';
import { frenchSchedule, frenchStandings, resolveFrenchGroup } from './french';
import { isGroupComplete } from './groups';
import type { FrenchSlot, Group } from './types';

const makeGroup = (...teamIds: string[]): Group => ({
  name: 'Группа A',
  teamIds,
  matches: frenchSchedule(teamIds),
});

/** Вводит счёт игры и пересчитывает участников следующих игр. */
function play(group: Group, slot: FrenchSlot, scoreA: number, scoreB: number): Group {
  return resolveFrenchGroup({
    ...group,
    matches: group.matches.map((m) => (m.slot === slot ? { ...m, scoreA, scoreB } : m)),
  });
}

const teamsOf = (group: Group, slot: FrenchSlot) => {
  const m = group.matches.find((x) => x.slot === slot)!;
  return [m.teamA, m.teamB];
};
const places = (group: Group) => Object.fromEntries(frenchStandings(group).map((r) => [r.teamId, r.place]));

describe('французская группа из 4 команд', () => {
  it('первый тур: 1–4 и 2–3', () => {
    const g = makeGroup('A', 'B', 'C', 'D');
    expect(teamsOf(g, 'r1a')).toEqual(['A', 'D']);
    expect(teamsOf(g, 'r1b')).toEqual(['B', 'C']);
    expect(teamsOf(g, 'winners')).toEqual([null, null]);
  });

  it('полный розыгрыш и места', () => {
    let g = makeGroup('A', 'B', 'C', 'D');
    g = play(g, 'r1a', 13, 5); // A обыграл D
    expect(teamsOf(g, 'winners')).toEqual(['A', null]);
    g = play(g, 'r1b', 7, 13); // C обыграл B
    expect(teamsOf(g, 'winners')).toEqual(['A', 'C']);
    expect(teamsOf(g, 'losers')).toEqual(['D', 'B']);
    expect(places(g)).toEqual({ A: null, B: null, C: null, D: null });

    g = play(g, 'winners', 10, 13); // C — первое место
    g = play(g, 'losers', 13, 12); // D обыграл B, B — четвёртое место
    expect(teamsOf(g, 'barrage')).toEqual(['A', 'D']);
    expect(places(g)).toEqual({ A: null, B: 4, C: 1, D: null });
    expect(isGroupComplete(g)).toBe(false);

    g = play(g, 'barrage', 13, 2); // A — второе, D — третье
    expect(places(g)).toEqual({ A: 2, B: 4, C: 1, D: 3 });
    expect(frenchStandings(g).map((r) => r.teamId)).toEqual(['C', 'A', 'D', 'B']);
    expect(isGroupComplete(g)).toBe(true);

    const a = frenchStandings(g).find((r) => r.teamId === 'A')!;
    expect(a).toMatchObject({ played: 3, wins: 2, losses: 1, pointsFor: 36, pointsAgainst: 20, diff: 16 });
  });

  it('исправление результата первого тура сбрасывает зависящие от него игры', () => {
    let g = makeGroup('A', 'B', 'C', 'D');
    g = play(g, 'r1a', 13, 5);
    g = play(g, 'r1b', 13, 7);
    g = play(g, 'winners', 13, 0);
    g = play(g, 'losers', 13, 0);
    g = play(g, 'barrage', 13, 0);
    expect(isGroupComplete(g)).toBe(true);

    g = play(g, 'r1a', 5, 13); // на самом деле выиграл D
    expect(teamsOf(g, 'winners')).toEqual(['D', 'B']);
    expect(teamsOf(g, 'losers')).toEqual(['A', 'C']);
    expect(teamsOf(g, 'barrage')).toEqual([null, null]);
    expect(g.matches.filter((m) => m.scoreA !== null).map((m) => m.slot)).toEqual(['r1a', 'r1b']);
  });

  it('исправление счёта без смены победителя ничего не сбрасывает', () => {
    let g = makeGroup('A', 'B', 'C', 'D');
    g = play(g, 'r1a', 13, 5);
    g = play(g, 'r1b', 13, 7);
    g = play(g, 'winners', 13, 0);
    const before = g;
    g = play(g, 'r1a', 13, 6);
    expect(g.matches.find((m) => m.slot === 'winners')).toBe(before.matches.find((m) => m.slot === 'winners'));
  });
});

describe('французская группа из 3 команд', () => {
  it('первая по рейтингу пропускает первый тур', () => {
    const g = makeGroup('A', 'B', 'C');
    expect(g.matches.map((m) => m.slot)).toEqual(['r1b', 'winners', 'barrage']);
    expect(teamsOf(g, 'r1b')).toEqual(['B', 'C']);
    expect(teamsOf(resolveFrenchGroup(g), 'winners')).toEqual(['A', null]);
  });

  it('полный розыгрыш и места', () => {
    let g = makeGroup('A', 'B', 'C');
    g = play(g, 'r1b', 13, 9); // B обыграл C
    expect(teamsOf(g, 'winners')).toEqual(['A', 'B']);
    g = play(g, 'winners', 8, 13); // B — первое место
    expect(teamsOf(g, 'barrage')).toEqual(['A', 'C']);
    expect(places(g)).toEqual({ A: null, B: 1, C: null });
    g = play(g, 'barrage', 11, 13); // C — второе, A — третье
    expect(places(g)).toEqual({ A: 3, B: 1, C: 2 });
    expect(isGroupComplete(g)).toBe(true);
  });
});

it('группа другого размера недопустима', () => {
  expect(() => frenchSchedule(['A', 'B'])).toThrow();
});

import { describe, expect, it } from 'vitest';
import { roundRobinSchedule } from './groups';
import {
  createBracket,
  cupPodium,
  firstRoundSlots,
  placeTeamInBracket,
  meetingRound,
  placesAfterDeclines,
  qualifiedCups,
  qualifyFromGroups,
  resolveBracket,
  seedFromGroups,
  seedOrder,
  type Qualifier,
} from './playoff';
import type { CupBracket, CupSettings, Group, Team } from './types';

const cup = (name: string, size: number, thirdPlaceMatch = false): CupSettings => ({ name, size, thirdPlaceMatch });

/**
 * Круговая группа, в которой команда с меньшим номером всегда выигрывает 13:(loserScore).
 * Итоговый порядок совпадает с порядком в списке.
 */
function orderedGroup(name: string, teamIds: string[], loserScore: (winner: string, loser: string) => number = () => 5): Group {
  const index = new Map(teamIds.map((id, i) => [id, i]));
  const matches = roundRobinSchedule(teamIds).map((m) => {
    const aWins = index.get(m.teamA!)! < index.get(m.teamB!)!;
    const [winner, loser] = aWins ? [m.teamA!, m.teamB!] : [m.teamB!, m.teamA!];
    const score = loserScore(winner, loser);
    return aWins ? { ...m, scoreA: 13, scoreB: score } : { ...m, scoreA: score, scoreB: 13 };
  });
  return { name, teamIds, matches };
}

const teamsOf = (groups: Group[], declined: string[] = []): Team[] =>
  groups.flatMap((g) => g.teamIds).map((id) => ({ id, name: id, players: [], declinedPlayoff: declined.includes(id) }));

const letters = 'ABCDEFGH';
/** n групп по size команд: A1…A4, B1…B4 и т. д. */
const makeGroups = (n: number, size: number): Group[] =>
  Array.from({ length: n }, (_, g) =>
    orderedGroup(`Группа ${letters[g]}`, Array.from({ length: size }, (_, i) => `${letters[g]}${i + 1}`)),
  );

describe('placesAfterDeclines', () => {
  const declined = (...ids: string[]) => new Set(ids);
  it('без отказов', () => {
    expect(placesAfterDeclines(['A', 'B', 'C'], declined())).toEqual(['A', 'B', 'C']);
  });
  it('место отказавшейся занимает следующая, остальные сдвигаются', () => {
    expect(placesAfterDeclines(['A', 'B', 'C', 'D'], declined('A'))).toEqual(['B', 'C', 'D']);
    expect(placesAfterDeclines(['A', 'B', 'C', 'D'], declined('B'))).toEqual(['A', 'C', 'D']);
  });
  it('если отказалась и следующая — место остаётся пустым', () => {
    expect(placesAfterDeclines(['A', 'B', 'C', 'D'], declined('A', 'B'))).toEqual([null, 'C', 'D']);
    expect(placesAfterDeclines(['A', 'B', 'C', 'D'], declined('C', 'D'))).toEqual(['A', 'B']);
  });
});

describe('qualifyFromGroups', () => {
  it('4 группы, кубки A и B по 8: первые–вторые места в A, третьи–четвёртые в B', () => {
    const groups = makeGroups(4, 4);
    const { cups, errors } = qualifyFromGroups(groups, 'roundRobin', teamsOf(groups), [cup('A', 8), cup('B', 8)]);
    expect(errors).toEqual([]);
    // Порядок — по местам и по порядку групп.
    expect(cups[0]!.qualifiers.map((q) => q.teamId)).toEqual(['A1', 'B1', 'C1', 'D1', 'A2', 'B2', 'C2', 'D2']);
    expect(cups[1]!.qualifiers.map((q) => q.teamId)).toEqual(['A3', 'B3', 'C3', 'D3', 'A4', 'B4', 'C4', 'D4']);
  });

  it('3 группы, кубок на 8: первые, вторые и две лучшие третьи', () => {
    // Третьи места отличаются игрой со вторым местом: B3 проиграла 12:13, C3 — 10:13, A3 — 5:13.
    const score = (best: string, mid: string) => (winner: string, loser: string) =>
      loser.endsWith('3') && winner.endsWith('2') ? (loser === best ? 12 : loser === mid ? 10 : 5) : 5;
    const groups = ['A', 'B', 'C'].map((g) =>
      orderedGroup(`Группа ${g}`, [1, 2, 3, 4].map((i) => `${g}${i}`), score('B3', 'C3')),
    );
    const { cups, rest } = qualifyFromGroups(groups, 'roundRobin', teamsOf(groups), [cup('A', 8), cup('B', 2)]);
    expect(cups[0]!.qualifiers.map((q) => q.teamId)).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'B3', 'C3']);
    // В кубок B — оставшаяся третья и лучшая из четвёртых (у всех равные показатели → по рейтингу).
    expect(cups[1]!.qualifiers.map((q) => q.teamId)).toEqual(['A3', 'A4']);
    expect(rest.map((q) => q.teamId)).toEqual(['B4', 'C4']);
  });

  it('группы разного размера: в большой группе игры с последним местом не учитываются', () => {
    // A3 (группа из 4) выиграла только у A4 — эта игра отбрасывается, остаётся 0 побед и разница −16.
    // B3 и C3 (группы из 3) тоже без побед, но разница лучше: −2 и −14.
    const groups = [
      orderedGroup('Группа A', ['A1', 'A2', 'A3', 'A4']),
      orderedGroup('Группа B', ['B1', 'B2', 'B3'], () => 12),
      orderedGroup('Группа C', ['C1', 'C2', 'C3'], () => 6),
    ];
    const { cups, rest } = qualifyFromGroups(groups, 'roundRobin', teamsOf(groups), [cup('A', 8)]);
    expect(cups[0]!.qualifiers.map((q) => q.teamId)).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'B3', 'C3']);
    expect(rest.map((q) => q.teamId)).toEqual(['A3', 'A4']);
  });

  it('победы над первыми двумя местами важнее общей разницы', () => {
    // В группе A круг из трёх команд с одной победой: A3 обыграла A2, но по разнице осталась третьей.
    let n = 0;
    const game = (teamA: string, scoreA: number, teamB: string, scoreB: number) => ({ id: `g${n++}`, teamA, teamB, scoreA, scoreB });
    const a: Group = {
      name: 'Группа A',
      teamIds: ['A1', 'A2', 'A3', 'A4'],
      matches: [
        game('A1', 13, 'A2', 0),
        game('A1', 13, 'A3', 0),
        game('A1', 13, 'A4', 0),
        game('A3', 13, 'A2', 12),
        game('A2', 13, 'A4', 0),
        game('A4', 13, 'A3', 12),
      ],
    };
    // B3 и C3: одна победа (над четвёртым местом), разница −1 — лучше, чем −13 у A3.
    const groups = [
      a,
      orderedGroup('Группа B', ['B1', 'B2', 'B3', 'B4'], () => 12),
      orderedGroup('Группа C', ['C1', 'C2', 'C3', 'C4'], () => 12),
    ];
    const { cups } = qualifyFromGroups(groups, 'roundRobin', teamsOf(groups), [cup('A', 8)]);
    expect(cups[0]!.qualifiers.map((q) => q.teamId)).toEqual(['A1', 'B1', 'C1', 'A2', 'B2', 'C2', 'A3', 'B3']);
  });

  it('французские группы: команды разных групп не сравниваются, берётся порядок групп', () => {
    const groups = makeGroups(3, 3);
    const { cups } = qualifyFromGroups(groups, 'french', teamsOf(groups), [cup('A', 4)]);
    // Игр французского формата здесь нет, поэтому места не определены — проверяем только,
    // что при неполном месте берутся первые по порядку групп, а не «лучшие».
    expect(cups[0]!.qualifiers).toHaveLength(4);
    expect(cups[0]!.qualifiers[3]!.groupIndex).toBe(0);
  });

  it('отказ: место занимает следующая команда группы', () => {
    const groups = makeGroups(2, 4);
    const { cups } = qualifyFromGroups(groups, 'roundRobin', teamsOf(groups, ['A2']), [cup('A', 4), cup('B', 2)]);
    expect(cups[0]!.qualifiers.map((q) => q.teamId)).toEqual(['A1', 'B1', 'A3', 'B2']);
    expect(cups[1]!.qualifiers.map((q) => q.teamId)).toEqual(['A4', 'B3']);
  });

  it('двойной отказ: место занимает лучшая команда со следующим местом', () => {
    const groups = makeGroups(2, 4);
    const { cups, errors } = qualifyFromGroups(groups, 'roundRobin', teamsOf(groups, ['A1', 'A2']), [cup('A', 4)]);
    expect(errors).toEqual([]);
    // Первые места: только B1 (у группы A место пусто); вторые: A3 и B2;
    // оставшееся место — лучшая из третьих: B3 (одна победа) против A4 (ни одной).
    expect(cups[0]!.qualifiers.map((q) => q.teamId).sort()).toEqual(['A3', 'B1', 'B2', 'B3']);
  });

  it('не хватает команд', () => {
    const groups = makeGroups(2, 3);
    expect(qualifyFromGroups(groups, 'roundRobin', teamsOf(groups, ['A1']), [cup('A', 4), cup('B', 2)]).errors).toHaveLength(1);
  });
});

describe('qualifiedCups', () => {
  it('все группы сыграны — отмечены все прошедшие', () => {
    const groups = makeGroups(4, 4);
    const map = qualifiedCups(groups, 'roundRobin', teamsOf(groups), [cup('A', 8), cup('B', 4)]);
    expect(map.get('A1')).toBe('A');
    expect(map.get('D2')).toBe('A');
    expect(map.get('A3')).toBe('B');
    expect(map.get('A4')).toBeUndefined();
  });

  it('пока идут игры — только гарантированные места в завершённых группах', () => {
    const groups = makeGroups(3, 4);
    groups[2] = { ...groups[2]!, matches: groups[2]!.matches.map((m, i) => (i === 0 ? { ...m, scoreA: null } : m)) };
    const map = qualifiedCups(groups, 'roundRobin', teamsOf(groups), [cup('A', 8)]);
    expect(map.get('A1')).toBe('A');
    expect(map.get('A2')).toBe('A');
    expect(map.has('A3')).toBe(false); // третьи места сравниваются между группами
    expect(map.has('C1')).toBe(false); // группа не доиграна
  });
});

describe('посев', () => {
  it('seedOrder: первый с последним', () => {
    expect(seedOrder(2)).toEqual([1, 2]);
    expect(seedOrder(4)).toEqual([1, 4, 2, 3]);
    expect(seedOrder(8)).toEqual([1, 8, 4, 5, 2, 7, 3, 6]);
  });

  it('meetingRound', () => {
    expect(meetingRound(0, 1)).toBe(1);
    expect(meetingRound(0, 3)).toBe(2);
    expect(meetingRound(0, 7)).toBe(3);
  });

  /** Раунд встречи двух команд в сетке, построенной по посеву. */
  function meet(seeds: string[], a: string, b: string): number {
    const order = seedOrder(seeds.length);
    const position = (id: string) => order.indexOf(seeds.indexOf(id) + 1);
    return meetingRound(position(a), position(b));
  }

  const qualifiersOf = (groups: Group[], size: number): Qualifier[] =>
    qualifyFromGroups(groups, 'roundRobin', teamsOf(groups), [cup('A', size)]).cups[0]!.qualifiers;

  it.each([
    [2, 4],
    [4, 8],
    [8, 16],
  ])('%i группы, кубок на %i: первое и второе места группы встречаются только в финале', (groupCount, size) => {
    const groups = makeGroups(groupCount, 4);
    const seeds = seedFromGroups(qualifiersOf(groups, size));
    expect(new Set(seeds).size).toBe(size);
    for (const g of letters.slice(0, groupCount)) {
      expect(meet(seeds, `${g}1`, `${g}2`)).toBe(Math.log2(size));
    }
    // Первые места не встречаются между собой в первом раунде.
    expect(seeds.slice(0, groupCount).every((id) => id.endsWith('1'))).toBe(true);
  });

  /** Пары первого раунда в порядке сетки. */
  function firstRound(seeds: string[]): string[] {
    const order = seedOrder(seeds.length);
    const byPosition = order.map((seed) => seeds[seed - 1]!);
    return Array.from({ length: seeds.length / 2 }, (_, i) => `${byPosition[2 * i]}-${byPosition[2 * i + 1]}`);
  }

  it('постоянная схема сетки, когда места выходят целиком', () => {
    // 2 группы, полуфиналы.
    expect(firstRound(seedFromGroups(qualifiersOf(makeGroups(2, 4), 4)))).toEqual(['A1-B2', 'B1-A2']);
    // 4 группы, четвертьфиналы.
    expect(firstRound(seedFromGroups(qualifiersOf(makeGroups(4, 4), 8)))).toEqual(['A1-D2', 'C1-B2', 'B1-C2', 'D1-A2']);
    // 8 групп, 1/8 финала.
    expect(firstRound(seedFromGroups(qualifiersOf(makeGroups(8, 4), 16)))).toEqual([
      'A1-H2', 'E1-D2', 'C1-F2', 'G1-B2', 'B1-G2', 'F1-C2', 'D1-E2', 'H1-A2',
    ]);
    // Только первые места четырёх групп.
    expect(firstRound(seedFromGroups(qualifiersOf(makeGroups(4, 4), 4)))).toEqual(['A1-C1', 'B1-D1']);
    // Одна группа: первый с четвёртым, второй с третьим.
    expect(firstRound(seedFromGroups(qualifiersOf(makeGroups(1, 4), 4)))).toEqual(['A1-A4', 'A2-A3']);
    // 2 группы, места 1–4.
    expect(firstRound(seedFromGroups(qualifiersOf(makeGroups(2, 4), 8)))).toEqual(['A1-B4', 'B2-A3', 'B1-A4', 'A2-B3']);
  });

  it('второй кубок из третьих и четвёртых мест строится по той же схеме', () => {
    const groups = makeGroups(4, 4);
    const plan = qualifyFromGroups(groups, 'roundRobin', teamsOf(groups), [cup('A', 8), cup('B', 8)]);
    expect(firstRound(seedFromGroups(plan.cups[1]!.qualifiers))).toEqual(['A3-D4', 'C3-B4', 'B3-C4', 'D3-A4']);
  });

  it('4 группы, места 1–4 (кубок на 16): команды одной группы — в разных четвертях сетки', () => {
    const groups = makeGroups(4, 4);
    const seeds = seedFromGroups(qualifiersOf(groups, 16));
    const order = seedOrder(16);
    for (const g of ['A', 'B', 'C', 'D']) {
      const quarters = [1, 2, 3, 4].map((place) => order.indexOf(seeds.indexOf(`${g}${place}`) + 1) >> 2);
      expect(new Set(quarters).size).toBe(4);
      expect(meet(seeds, `${g}1`, `${g}2`)).toBe(4);
    }
    // В первом раунде первое место играет с четвёртым, второе — с третьим.
    for (const pair of firstRound(seeds)) {
      const [a, b] = pair.split('-');
      expect(Number(a![1]) + Number(b![1])).toBe(5);
    }
  });

  it('2 группы, кубок на 8 (места 1–4): команды одной группы не встречаются в первом раунде', () => {
    const groups = makeGroups(2, 4);
    const seeds = seedFromGroups(qualifiersOf(groups, 8));
    for (const g of ['A', 'B']) {
      expect(meet(seeds, `${g}1`, `${g}2`)).toBe(3);
      for (const [x, y] of [[1, 3], [1, 4], [2, 3], [2, 4], [3, 4]]) {
        expect(meet(seeds, `${g}${x}`, `${g}${y}`)).toBeGreaterThan(1);
      }
    }
  });

  it('3 группы, кубок на 8 с лучшими третьими: первое и второе места — только в финале', () => {
    const groups = makeGroups(3, 4);
    const seeds = seedFromGroups(qualifiersOf(groups, 8));
    for (const g of ['A', 'B', 'C']) expect(meet(seeds, `${g}1`, `${g}2`)).toBe(3);
  });
});

describe('сетка', () => {
  const play = (bracket: CupBracket, round: number, index: number, scoreA: number, scoreB: number): CupBracket =>
    resolveBracket({
      ...bracket,
      rounds: bracket.rounds.map((r, ri) =>
        ri === round ? { ...r, matches: r.matches.map((m, mi) => (mi === index ? { ...m, scoreA, scoreB } : m)) } : r,
      ),
    });
  const pair = (bracket: CupBracket, round: number, index: number) => {
    const m = bracket.rounds[round]!.matches[index]!;
    return [m.teamA, m.teamB];
  };

  it('первый раунд: 1–8, 4–5, 2–7, 3–6', () => {
    const b = createBracket(cup('A', 8), ['1', '2', '3', '4', '5', '6', '7', '8'], {});
    expect(b.rounds.map((r) => r.name)).toEqual(['1/4 финала', 'Полуфинал', 'Финал']);
    expect(b.rounds[0]!.matches.map((m) => `${m.teamA}-${m.teamB}`)).toEqual(['1-8', '4-5', '2-7', '3-6']);
    expect(b.thirdPlaceMatch).toBeNull();
  });

  it('продвижение победителей, матч за 3-е место и призёры', () => {
    let b = createBracket(cup('A', 4, true), ['1', '2', '3', '4'], {});
    b = play(b, 0, 0, 13, 5); // 1 обыграл 4
    expect(pair(b, 1, 0)).toEqual(['1', null]);
    b = play(b, 0, 1, 6, 13); // 3 обыграл 2
    expect(pair(b, 1, 0)).toEqual(['1', '3']);
    expect([b.thirdPlaceMatch!.teamA, b.thirdPlaceMatch!.teamB]).toEqual(['4', '2']);
    expect(cupPodium(b)).toEqual([]);

    b = play(b, 1, 0, 11, 13);
    b = resolveBracket({ ...b, thirdPlaceMatch: { ...b.thirdPlaceMatch!, scoreA: 13, scoreB: 0 } });
    expect(cupPodium(b)).toEqual([
      { place: 1, teamId: '3' },
      { place: 2, teamId: '1' },
      { place: 3, teamId: '4' },
      { place: 4, teamId: '2' },
    ]);
  });

  it('исправление результата сбрасывает зависящие игры', () => {
    let b = createBracket(cup('A', 4), ['1', '2', '3', '4'], {});
    b = play(b, 0, 0, 13, 5);
    b = play(b, 0, 1, 13, 5);
    b = play(b, 1, 0, 13, 5);
    b = play(b, 0, 0, 5, 13);
    expect(pair(b, 1, 0)).toEqual(['4', '2']);
    expect(b.rounds[1]!.matches[0]!.scoreA).toBeNull();
  });
});

describe('ручная правка сетки', () => {
  const two = () => [
    createBracket(cup('A', 4), ['1', '2', '3', '4'], {}),
    createBracket(cup('B', 4), ['5', '6', '7', '8'], {}),
  ];

  it('обмен внутри одного кубка', () => {
    const cups = placeTeamInBracket(two(), 0, 0, '2'); // на место команды 1 ставим команду 2
    expect(firstRoundSlots(cups[0]!)).toEqual(['2', '4', '1', '3']);
    expect([...cups[0]!.seedTeamIds].sort()).toEqual(['1', '2', '3', '4']);
  });

  it('обмен между кубками', () => {
    const cups = placeTeamInBracket(two(), 0, 1, '5'); // команда 5 из кубка B вместо команды 4
    expect(firstRoundSlots(cups[0]!)).toEqual(['1', '5', '2', '3']);
    expect(firstRoundSlots(cups[1]!)).toEqual(['4', '8', '6', '7']);
  });

  it('команда не из сеток заменяет прежнюю', () => {
    const cups = placeTeamInBracket(two(), 1, 3, '9');
    expect(firstRoundSlots(cups[1]!)).toEqual(['5', '8', '6', '9']);
    expect(cups[1]!.seedTeamIds).toContain('9');
    expect(cups[1]!.seedTeamIds).not.toContain('7');
  });

  it('результаты затронутых игр сбрасываются, остальные сохраняются', () => {
    let [a, b] = two() as [CupBracket, CupBracket];
    const score = (bracket: CupBracket): CupBracket =>
      resolveBracket({
        ...bracket,
        rounds: bracket.rounds.map((r, ri) =>
          ri === 0 ? { ...r, matches: r.matches.map((m) => ({ ...m, scoreA: 13, scoreB: 5 })) } : r,
        ),
      });
    a = score(a);
    b = score(b);
    expect(a.rounds[1]!.matches[0]!.teamA).toBe('1');
    const cups = placeTeamInBracket([a, b], 0, 0, '5');
    // Игра 5–4 не сыграна, игра 2–3 сохранила счёт; финал ждёт победителя первой игры.
    expect(cups[0]!.rounds[0]!.matches.map((m) => m.scoreA)).toEqual([null, 13]);
    expect([cups[0]!.rounds[1]!.matches[0]!.teamA, cups[0]!.rounds[1]!.matches[0]!.teamB]).toEqual([null, '2']);
    expect(cups[1]!.rounds[0]!.matches.map((m) => m.scoreA)).toEqual([null, 13]);
  });

  it('та же команда на том же месте — без изменений', () => {
    const cups = two();
    expect(placeTeamInBracket(cups, 0, 0, '1')).toBe(cups);
  });
});

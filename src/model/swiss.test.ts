import { describe, expect, it } from 'vitest';
import { createTournament } from './factory';
import { isPrelimComplete, planPlayoff } from './playoff';
import { isRoundComplete, pairNextRound, swissStandings } from './swiss';
import type { SwissRound, Team, Tiebreaker, Tournament } from './types';

/** Команды Т1…Тn, рейтинг убывает с номером. */
const makeTeams = (n: number): Team[] =>
  Array.from({ length: n }, (_, i) => ({ id: `Т${i + 1}`, name: `Т${i + 1}`, players: [], manualRating: 1000 - i }));

const pairsOf = (round: SwissRound) => round.matches.map((m) => `${m.teamA}-${m.teamB}`);

/** В каждой игре тура побеждает команда с меньшим номером со счётом 13:score. */
function playByRating(round: SwissRound, score = 5): SwissRound {
  const num = (id: string | null) => Number(id!.slice(1));
  return {
    ...round,
    matches: round.matches.map((m) =>
      num(m.teamA) < num(m.teamB) ? { ...m, scoreA: 13, scoreB: score } : { ...m, scoreA: score, scoreB: 13 },
    ),
  };
}

const TB: Tiebreaker[] = ['buchholz', 'doubleBuchholz', 'diff'];

describe('пары', () => {
  it('первый тур: верхняя половина рейтинга с нижней', () => {
    const round = pairNextRound(makeTeams(8), []);
    expect(round.number).toBe(1);
    expect(pairsOf(round)).toEqual(['Т1-Т5', 'Т2-Т6', 'Т3-Т7', 'Т4-Т8']);
    expect(round.byeTeamId).toBeNull();
  });

  it('второй тур: внутри групп с равным числом побед, верхняя половина с нижней', () => {
    const teams = makeTeams(8);
    const r1 = playByRating(pairNextRound(teams, []));
    const r2 = pairNextRound(teams, [r1]);
    // Победители Т1–Т4 и проигравшие Т5–Т8.
    expect(pairsOf(r2)).toEqual(['Т1-Т3', 'Т2-Т4', 'Т5-Т7', 'Т6-Т8']);
  });

  it('внутри группы с равными победами порядок — по начальному рейтингу, а не по показателям', () => {
    const teams = makeTeams(8);
    // В первом туре Т5 обыгрывает Т1 всухую, остальные выигрывают по рейтингу с минимальным счётом.
    const r1 = {
      ...pairNextRound(teams, []),
    };
    r1.matches = r1.matches.map((m) =>
      m.teamA === 'Т1' ? { ...m, scoreA: 0, scoreB: 13 } : { ...m, scoreA: 13, scoreB: 12 },
    );
    // По разнице лидирует Т5 (+13), но пары составляются по рейтингу: победители Т2, Т3, Т4, Т5.
    expect(swissStandings(teams, [r1], ['diff'])[0]!.teamId).toBe('Т5');
    expect(pairsOf(pairNextRound(teams, [r1]))).toEqual(['Т2-Т4', 'Т3-Т5', 'Т1-Т7', 'Т6-Т8']);
  });

  it('нет повторных встреч за максимальное число туров', () => {
    for (const n of [6, 8, 9, 12]) {
      const teams = makeTeams(n);
      const rounds: SwissRound[] = [];
      const maxRounds = n % 2 === 0 ? n - 1 : n - 2;
      for (let i = 0; i < maxRounds; i++) rounds.push(playByRating(pairNextRound(teams, rounds)));
      const keys = rounds.flatMap((r) => r.matches).map((m) => [m.teamA, m.teamB].sort().join('-'));
      expect(new Set(keys).size).toBe(keys.length);
      // Каждая команда в каждом туре либо играет, либо пропускает.
      for (const r of rounds) {
        const busy = [...r.matches.flatMap((m) => [m.teamA, m.teamB]), ...(r.byeTeamId ? [r.byeTeamId] : [])];
        expect(new Set(busy).size).toBe(n);
      }
    }
  });

  it('нечётное число команд: тур пропускает последняя, и никто не пропускает дважды', () => {
    const teams = makeTeams(7);
    const rounds: SwissRound[] = [];
    for (let i = 0; i < 5; i++) rounds.push(playByRating(pairNextRound(teams, rounds)));
    expect(rounds[0]!.byeTeamId).toBe('Т7');
    expect(rounds[0]!.matches).toHaveLength(3);
    const byes = rounds.map((r) => r.byeTeamId);
    expect(new Set(byes).size).toBe(5);
  });

  it('нечётная группа: нижняя команда спускается в следующую группу', () => {
    const teams = makeTeams(6);
    const r1 = playByRating(pairNextRound(teams, []));
    // После тура: Т1, Т2, Т3 — по победе; Т4, Т5, Т6 — без побед.
    const r2 = pairNextRound(teams, [r1]);
    // Т3 спускается и играет с лучшей командой следующей группы.
    expect(pairsOf(r2)).toEqual(['Т1-Т2', 'Т3-Т4', 'Т5-Т6']);
  });
});

describe('положение команд', () => {
  it('победы, Бухгольц, двойной Бухгольц, прогресс и разница', () => {
    const teams = makeTeams(4);
    const r1 = playByRating(pairNextRound(teams, [])); // Т1-Т3, Т2-Т4
    const r2 = playByRating(pairNextRound(teams, [r1]), 10); // Т1-Т2, Т3-Т4
    expect(pairsOf(r2)).toEqual(['Т1-Т2', 'Т3-Т4']);
    const rows = Object.fromEntries(swissStandings(teams, [r1, r2], TB).map((r) => [r.teamId, r]));

    // Победы: Т1 — 2, Т2 — 1, Т3 — 1, Т4 — 0.
    expect([rows['Т1']!.wins, rows['Т2']!.wins, rows['Т3']!.wins, rows['Т4']!.wins]).toEqual([2, 1, 1, 0]);
    // Бухгольц — сумма побед соперников: Т1 играл с Т3 (1) и Т2 (1).
    expect(rows['Т1']!.buchholz).toBe(2);
    expect(rows['Т2']!.buchholz).toBe(2); // Т4 (0) + Т1 (2)
    expect(rows['Т3']!.buchholz).toBe(2); // Т1 (2) + Т4 (0)
    expect(rows['Т4']!.buchholz).toBe(2); // Т2 (1) + Т3 (1)
    // Двойной Бухгольц — сумма Бухгольцев соперников.
    expect(rows['Т1']!.doubleBuchholz).toBe(4);
    // Прогресс: Т1 — 1 + 2 = 3; Т2 — 1 + 1 = 2; Т3 — 0 + 1 = 1; Т4 — 0.
    expect([rows['Т1']!.progress, rows['Т2']!.progress, rows['Т3']!.progress, rows['Т4']!.progress]).toEqual([3, 2, 1, 0]);
    // Разница: Т1 = +8 +3 = 11; Т2 = +8 −3 = 5; Т3 = −8 +3 = −5.
    expect([rows['Т1']!.diff, rows['Т2']!.diff, rows['Т3']!.diff]).toEqual([11, 5, -5]);
  });

  it('порядок показателей меняет места', () => {
    const teams = makeTeams(4);
    const r1 = playByRating(pairNextRound(teams, []));
    const r2 = playByRating(pairNextRound(teams, [r1]), 10);
    // Т2 и Т3 — по одной победе и равный Бухгольц; прогресс у Т2 выше (2 против 1), разница тоже.
    const byProgress = swissStandings(teams, [r1, r2], ['progress']).map((r) => r.teamId);
    expect(byProgress).toEqual(['Т1', 'Т2', 'Т3', 'Т4']);
    // Делаем разницу Т3 лучше: Т3 выиграл 13:0, Т2 проиграл 0:13.
    const r2b: SwissRound = {
      ...r2,
      matches: r2.matches.map((m) => (m.teamA === 'Т3' ? { ...m, scoreA: 13, scoreB: 0 } : { ...m, scoreA: 13, scoreB: 0 })),
    };
    expect(swissStandings(teams, [r1, r2b], ['diff', 'progress']).map((r) => r.teamId)).toEqual(['Т1', 'Т3', 'Т2', 'Т4']);
    expect(swissStandings(teams, [r1, r2b], ['progress', 'diff']).map((r) => r.teamId)).toEqual(['Т1', 'Т2', 'Т3', 'Т4']);
  });

  it('пропуск тура: техническая победа без разницы и без Бухгольца', () => {
    const teams = makeTeams(3);
    const r1 = playByRating(pairNextRound(teams, [])); // Т1-Т2, Т3 пропускает
    expect(r1.byeTeamId).toBe('Т3');
    const rows = Object.fromEntries(swissStandings(teams, [r1], TB).map((r) => [r.teamId, r]));
    expect(rows['Т3']).toMatchObject({ wins: 1, played: 0, diff: 0, buchholz: 0, progress: 1, hadBye: true });
    expect(rows['Т1']).toMatchObject({ wins: 1, played: 1, diff: 8, buchholz: 0 });
    // Во втором туре пропускает другая команда.
    const r2 = pairNextRound(teams, [r1]);
    expect(r2.byeTeamId).not.toBe('Т3');
  });

  it('несыгранные игры не учитываются', () => {
    const teams = makeTeams(4);
    const r1 = pairNextRound(teams, []);
    expect(isRoundComplete(r1)).toBe(false);
    expect(swissStandings(teams, [r1], TB).every((r) => r.wins === 0 && r.played === 0)).toBe(true);
  });
});

describe('плей-офф после швейцарки', () => {
  const tournament = (declined: string[] = []): Tournament => {
    const teams = makeTeams(8).map((t) => ({ ...t, declinedPlayoff: declined.includes(t.id) }));
    const rounds: SwissRound[] = [];
    for (let i = 0; i < 3; i++) rounds.push(playByRating(pairNextRound(teams, rounds)));
    return {
      ...createTournament('Тест', '2026-01-01', 'triplet'),
      stage: 'prelim',
      teams,
      swissRounds: rounds,
      settings: {
        teamCount: 8,
        prelim: { kind: 'swiss', rounds: 3, tiebreakers: TB },
        cups: [
          { name: 'Кубок A', size: 4, thirdPlaceMatch: false },
          { name: 'Кубок B', size: 2, thirdPlaceMatch: false },
        ],
      },
    };
  };

  it('кубки по местам, первый с последним, подпись — место', () => {
    const t = tournament();
    expect(isPrelimComplete(t)).toBe(true);
    const plan = planPlayoff(t);
    expect(plan.errors).toEqual([]);
    const order = swissStandings(t.teams, t.swissRounds, TB).map((r) => r.teamId);
    expect(plan.cups[0]!.seeds).toEqual(order.slice(0, 4));
    expect(plan.cups[1]!.seeds).toEqual(order.slice(4, 6));
    expect(plan.rest.map((r) => r.teamId)).toEqual(order.slice(6));
    expect(plan.cups[0]!.labels[order[0]!]).toBe('1');
    expect(plan.cups[1]!.labels[order[5]!]).toBe('6');
  });

  it('отказ: все следующие места сдвигаются', () => {
    const base = tournament();
    const order = swissStandings(base.teams, base.swissRounds, TB).map((r) => r.teamId);
    const plan = planPlayoff(tournament([order[1]!]));
    expect(plan.cups[0]!.seeds).toEqual([order[0], order[2], order[3], order[4]]);
    expect(plan.cups[1]!.seeds).toEqual([order[5], order[6]]);
    // Подпись — фактическое место в швейцарке.
    expect(plan.cups[0]!.labels[order[2]!]).toBe('3');
  });

  it('пока туры не сыграны, плей-офф недоступен', () => {
    const t = tournament();
    expect(isPrelimComplete({ ...t, swissRounds: t.swissRounds.slice(0, 2) })).toBe(false);
  });
});

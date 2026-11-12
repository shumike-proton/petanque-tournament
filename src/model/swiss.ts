import { isPlayed, newMatch } from './match';
import { sortByRating } from './team';
import type { Id, SwissRound, Team, Tiebreaker } from './types';

export interface SwissRow {
  teamId: Id;
  place: number;
  /** Сыгранные игры (без пропуска тура). */
  played: number;
  /** Победы, включая техническую за пропуск тура. */
  wins: number;
  /** Сумма побед соперников. */
  buchholz: number;
  /** Сумма коэффициентов Бухгольца соперников. */
  doubleBuchholz: number;
  /** Сумма накопленных побед после каждого тура. */
  progress: number;
  diff: number;
  pointsFor: number;
  pointsAgainst: number;
  hadBye: boolean;
}

export function isRoundComplete(round: SwissRound): boolean {
  return round.matches.every(isPlayed);
}

/**
 * Положение команд. Места: количество побед, затем выбранные показатели по порядку,
 * при полном равенстве — рейтинг.
 * Пропуск тура — техническая победа: разница не меняется, в Бухгольц ничего не добавляется.
 */
export function swissStandings(teams: Team[], rounds: SwissRound[], tiebreakers: Tiebreaker[]): SwissRow[] {
  const ratingRank = new Map(sortByRating(teams).map((t, i) => [t.id, i]));
  const rows = new Map<Id, SwissRow>(
    teams.map((t) => [
      t.id,
      {
        teamId: t.id,
        place: 0,
        played: 0,
        wins: 0,
        buchholz: 0,
        doubleBuchholz: 0,
        progress: 0,
        diff: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        hadBye: false,
      },
    ]),
  );
  const opponents = new Map<Id, Id[]>(teams.map((t) => [t.id, []]));

  for (const round of rounds) {
    const bye = round.byeTeamId ? rows.get(round.byeTeamId) : undefined;
    if (bye) {
      bye.wins++;
      bye.hadBye = true;
    }
    for (const m of round.matches) {
      if (!isPlayed(m)) continue;
      const a = rows.get(m.teamA);
      const b = rows.get(m.teamB);
      if (!a || !b) continue;
      const sides: [SwissRow, number, number][] = [
        [a, m.scoreA, m.scoreB],
        [b, m.scoreB, m.scoreA],
      ];
      for (const [row, own, other] of sides) {
        row.played++;
        row.pointsFor += own;
        row.pointsAgainst += other;
        row.diff += own - other;
        if (own > other) row.wins++;
      }
      opponents.get(m.teamA)!.push(m.teamB);
      opponents.get(m.teamB)!.push(m.teamA);
    }
    // Прогресс: после каждого тура прибавляем победы, накопленные к этому моменту.
    for (const row of rows.values()) row.progress += row.wins;
  }

  for (const row of rows.values()) {
    row.buchholz = opponents.get(row.teamId)!.reduce((sum, id) => sum + rows.get(id)!.wins, 0);
  }
  for (const row of rows.values()) {
    row.doubleBuchholz = opponents.get(row.teamId)!.reduce((sum, id) => sum + rows.get(id)!.buchholz, 0);
  }

  return [...rows.values()]
    .sort((a, b) => {
      if (b.wins !== a.wins) return b.wins - a.wins;
      for (const tb of tiebreakers) {
        if (b[tb] !== a[tb]) return b[tb] - a[tb];
      }
      return ratingRank.get(a.teamId)! - ratingRank.get(b.teamId)!;
    })
    .map((row, i) => ({ ...row, place: i + 1 }));
}

const pairKey = (a: Id, b: Id) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Составляет пары из списка команд, упорядоченного по победам и рейтингу.
 * Классическая схема: внутри группы с равным числом побед верхняя половина играет с нижней
 * (1-я с первой из нижней половины и т. д.); при нечётном числе команд в группе нижняя
 * спускается в следующую группу. Повторные встречи запрещены — перебор с возвратом ищет
 * ближайший к идеальному вариант без повторов.
 */
function pairTeams(
  order: Id[],
  wins: Map<Id, number>,
  playedPairs: Set<string>,
  allowRepeats: boolean,
): [Id, Id][] | null {
  let budget = 200_000;

  function solve(remaining: Id[]): [Id, Id][] | null {
    if (remaining.length === 0) return [];
    if (budget-- <= 0) return null;
    const team = remaining[0]!;
    const rest = remaining.slice(1);
    const sameGroup = rest.filter((id) => wins.get(id) === wins.get(team));
    const lower = rest.filter((id) => wins.get(id) !== wins.get(team));
    // Идеальный соперник — первый из нижней половины своей группы.
    const ideal = Math.max(0, Math.floor((sameGroup.length + 1) / 2) - 1);
    const candidates = [...sameGroup.slice(ideal), ...sameGroup.slice(0, ideal).reverse(), ...lower];
    for (const opponent of candidates) {
      if (!allowRepeats && playedPairs.has(pairKey(team, opponent))) continue;
      const others = solve(rest.filter((id) => id !== opponent));
      if (others) return [[team, opponent], ...others];
    }
    return null;
  }

  return solve(order);
}

/**
 * Пары следующего тура. Команды упорядочиваются по количеству побед, а внутри группы с равным
 * числом побед — по начальному рейтингу, как в первом туре; дополнительные показатели
 * (Бухгольц, разница и т. д.) на составление пар не влияют. При нечётном числе команд тур
 * пропускает последняя в этом порядке команда, ещё не пропускавшая тур.
 */
export function pairNextRound(teams: Team[], rounds: SwissRound[]): SwissRound {
  const ratingRank = new Map(sortByRating(teams).map((t, i) => [t.id, i]));
  const rows = swissStandings(teams, rounds, []).sort(
    (a, b) => b.wins - a.wins || ratingRank.get(a.teamId)! - ratingRank.get(b.teamId)!,
  );
  const wins = new Map(rows.map((r) => [r.teamId, r.wins]));
  let order = rows.map((r) => r.teamId);

  let byeTeamId: Id | null = null;
  if (order.length % 2 === 1) {
    const candidate = [...rows].reverse().find((r) => !r.hadBye) ?? rows[rows.length - 1]!;
    byeTeamId = candidate.teamId;
    order = order.filter((id) => id !== byeTeamId);
  }

  const playedPairs = new Set(
    rounds.flatMap((r) => r.matches).flatMap((m) => (m.teamA && m.teamB ? [pairKey(m.teamA, m.teamB)] : [])),
  );
  const pairs =
    pairTeams(order, wins, playedPairs, false) ??
    // Вариант без повторных встреч не найден (слишком много туров для такого числа команд).
    pairTeams(order, wins, playedPairs, true) ??
    [];

  const number = rounds.length + 1;
  return { number, byeTeamId, matches: pairs.map(([a, b]) => newMatch(a, b, number)) };
}

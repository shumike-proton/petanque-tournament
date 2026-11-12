import { collectStats, type Stats } from './groups';
import { isPlayed, loserOf, newMatch, winnerOf } from './match';
import type { FrenchSlot, Group, Id, Match } from './types';

/*
 * Французская группа — игры до двух побед или двух поражений.
 *
 * 4 команды (номера — по рейтингу внутри группы):
 *   тур 1: 1–4 и 2–3;
 *   тур 2: матч победителей (победитель — 1-е место) и матч проигравших (проигравший — 4-е место);
 *   тур 3: стыковой матч — проигравший матча победителей с победителем матча проигравших
 *          (победитель — 2-е место, проигравший — 3-е).
 *
 * 3 команды: первая по рейтингу пропускает тур 1 и считается его победителем;
 *   тур 1: 2–3;
 *   тур 2: матч победителей — 1-я команда с победителем игры 2–3 (победитель — 1-е место);
 *   тур 3: стыковой матч — проигравший матча победителей с проигравшим игры 2–3.
 */

export const FRENCH_SLOT_LABELS: Record<FrenchSlot, string> = {
  r1a: 'Игра 1',
  r1b: 'Игра 2',
  winners: 'Матч победителей',
  losers: 'Матч проигравших',
  barrage: 'Стыковой матч',
};

function slotMatch(slot: FrenchSlot, round: number, teamA: Id | null = null, teamB: Id | null = null): Match {
  return { ...newMatch(teamA, teamB, round), slot };
}

/** Игры французской группы; участники игр 2-го и 3-го туров определяются по мере ввода результатов. */
export function frenchSchedule(teamIds: Id[]): Match[] {
  const [t1, t2, t3, t4] = teamIds;
  if (teamIds.length === 4) {
    return [
      slotMatch('r1a', 1, t1, t4),
      slotMatch('r1b', 1, t2, t3),
      slotMatch('winners', 2),
      slotMatch('losers', 2),
      slotMatch('barrage', 3),
    ];
  }
  if (teamIds.length === 3) {
    return [slotMatch('r1b', 1, t2, t3), slotMatch('winners', 2, t1), slotMatch('barrage', 3)];
  }
  throw new Error('Во французской группе должно быть 3 или 4 команды.');
}

/** Назначает участников; если они изменились, прежний результат игры сбрасывается. */
function withTeams(m: Match, teamA: Id | null, teamB: Id | null): Match {
  if (m.teamA === teamA && m.teamB === teamB) return m;
  return { ...m, teamA, teamB, scoreA: null, scoreB: null };
}

/**
 * Пересчитывает участников игр 2-го и 3-го туров по введённым результатам.
 * Вызывается после каждого изменения счёта; повторный вызов ничего не меняет.
 */
export function resolveFrenchGroup(group: Group): Group {
  const find = (slot: FrenchSlot) => group.matches.find((m) => m.slot === slot);
  const r1a = find('r1a');
  const r1b = find('r1b');
  let winners = find('winners');
  let losers = find('losers');
  let barrage = find('barrage');
  if (!r1b || !winners || !barrage) return group;

  if (r1a && losers) {
    winners = withTeams(winners, winnerOf(r1a), winnerOf(r1b));
    losers = withTeams(losers, loserOf(r1a), loserOf(r1b));
    barrage = withTeams(barrage, loserOf(winners), winnerOf(losers));
  } else {
    winners = withTeams(winners, group.teamIds[0] ?? null, winnerOf(r1b));
    barrage = withTeams(barrage, loserOf(winners), loserOf(r1b));
  }

  const updated = new Map<FrenchSlot, Match>([
    ['winners', winners],
    ['barrage', barrage],
  ]);
  if (losers) updated.set('losers', losers);
  const matches = group.matches.map((m) => (m.slot && updated.get(m.slot)) || m);
  return matches.every((m, i) => m === group.matches[i]) ? group : { ...group, matches };
}

export interface FrenchRow extends Stats {
  /** Место известно только после решающей для команды игры. */
  place: number | null;
}

/** Таблица французской группы: сначала команды с определившимся местом, затем остальные по рейтингу. */
export function frenchStandings(group: Group): FrenchRow[] {
  const find = (slot: FrenchSlot) => group.matches.find((m) => m.slot === slot);
  const winners = find('winners');
  const losers = find('losers');
  const barrage = find('barrage');

  const places = new Map<Id, number>();
  const assign = (teamId: Id | null | undefined, place: number) => {
    if (teamId) places.set(teamId, place);
  };
  if (winners) assign(winnerOf(winners), 1);
  if (barrage) {
    assign(winnerOf(barrage), 2);
    assign(loserOf(barrage), 3);
  }
  if (losers) assign(loserOf(losers), 4);

  const stats = collectStats(group.teamIds, group.matches.filter(isPlayed));
  return group.teamIds
    .map((teamId, index) => ({ ...stats.get(teamId)!, place: places.get(teamId) ?? null, index }))
    .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || a.index - b.index)
    .map(({ index: _index, ...row }) => row);
}

export interface FrenchMatchView {
  label: string;
  /** Подписи для ещё не определившихся участников. */
  placeholderA: string;
  placeholderB: string;
}

/** Подписи игры для отображения группы в виде сетки. */
export function frenchMatchView(group: Group, match: Match): FrenchMatchView {
  const four = group.teamIds.length === 4;
  switch (match.slot) {
    case 'r1a':
      return { label: 'Игра 1', placeholderA: '—', placeholderB: '—' };
    case 'r1b':
      return { label: four ? 'Игра 2' : 'Игра 1', placeholderA: '—', placeholderB: '—' };
    case 'winners':
      return {
        label: FRENCH_SLOT_LABELS.winners,
        placeholderA: 'Победитель игры 1',
        placeholderB: four ? 'Победитель игры 2' : 'Победитель игры 1',
      };
    case 'losers':
      return {
        label: FRENCH_SLOT_LABELS.losers,
        placeholderA: 'Проигравший игры 1',
        placeholderB: 'Проигравший игры 2',
      };
    case 'barrage':
      return {
        label: FRENCH_SLOT_LABELS.barrage,
        placeholderA: 'Проигравший матча победителей',
        placeholderB: four ? 'Победитель матча проигравших' : 'Проигравший игры 1',
      };
    default:
      return { label: '', placeholderA: '—', placeholderB: '—' };
  }
}

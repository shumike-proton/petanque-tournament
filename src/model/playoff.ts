import { frenchStandings } from './french';
import { groupStandings, isGroupComplete } from './groups';
import { isPlayed, loserOf, newMatch, winnerOf } from './match';
import { isRoundComplete, swissStandings, type SwissRow } from './swiss';
import { sortByRating } from './team';
import type {
  CupBracket,
  CupSettings,
  Group,
  GroupType,
  Id,
  Match,
  PlayoffRound,
  Team,
  Tournament,
} from './types';

// ───────────────────────── Выход из групп ─────────────────────────

/** Команда, вышедшая в плей-офф из группы. */
export interface Qualifier {
  teamId: Id;
  groupIndex: number;
  /** Место, которое команда занимает при выходе в плей-офф (с учётом отказов, с единицы). */
  place: number;
  /** Фактическое место в группе (с единицы). */
  groupPlace: number;
}

export interface CupEntry {
  cup: CupSettings;
  /** Команды кубка: по местам, внутри места — по порядку групп (A1, B1, C1, …, A2, B2, …). */
  qualifiers: Qualifier[];
}

export interface Qualification {
  cups: CupEntry[];
  /** Команды, не попавшие ни в один кубок, в том же порядке. */
  rest: Qualifier[];
  errors: string[];
}

/** Итоговый порядок команд в завершённой группе. */
export function groupRanking(group: Group, groupType: GroupType): Id[] {
  return groupType === 'french'
    ? frenchStandings(group).map((r) => r.teamId)
    : groupStandings(group.teamIds, group.matches).map((r) => r.teamId);
}

/**
 * Места в группе с учётом отказов от плей-офф: место отказавшейся команды занимает следующая
 * команда группы, все последующие сдвигаются. Если отказалась и следующая, место остаётся
 * пустым (null) — его займёт лучшая команда со следующим местом.
 */
export function placesAfterDeclines(ranking: Id[], declined: ReadonlySet<Id>): (Id | null)[] {
  const places: (Id | null)[] = [];
  let k = 0;
  while (k < ranking.length) {
    const current = ranking[k]!;
    const next = ranking[k + 1];
    if (!declined.has(current)) {
      places.push(current);
      k += 1;
    } else if (next !== undefined && !declined.has(next)) {
      places.push(next);
      k += 2;
    } else {
      if (next !== undefined) places.push(null);
      k += 2;
    }
  }
  while (places.length > 0 && places[places.length - 1] === null) places.pop();
  return places;
}

interface CompareStats {
  wins: number;
  top2Wins: number;
  diff: number;
  pointsFor: number;
}

/**
 * Показатели для сравнения команд с одинаковым местом из разных круговых групп:
 * победы → победы в играх с первыми двумя местами своей группы → общая разница → набранные очки.
 * Если группы разного размера, в больших группах не учитываются игры с последним местом.
 */
function compareStats(teamId: Id, group: Group, ranking: Id[], minGroupSize: number): CompareStats {
  const last = ranking.length > minGroupSize ? ranking[ranking.length - 1] : undefined;
  const top2 = new Set(ranking.slice(0, 2));
  const stats: CompareStats = { wins: 0, top2Wins: 0, diff: 0, pointsFor: 0 };
  for (const m of group.matches) {
    if (!isPlayed(m) || (m.teamA !== teamId && m.teamB !== teamId)) continue;
    const opponent = m.teamA === teamId ? m.teamB : m.teamA;
    if (opponent === last) continue;
    const [own, other] = m.teamA === teamId ? [m.scoreA, m.scoreB] : [m.scoreB, m.scoreA];
    if (own > other) {
      stats.wins++;
      if (top2.has(opponent)) stats.top2Wins++;
    }
    stats.diff += own - other;
    stats.pointsFor += own;
  }
  return stats;
}

/**
 * Распределяет команды по кубкам строго по местам: первый кубок — лучшие места, следующий — следующие.
 * Если место помещается в кубок не целиком, в круговых группах берутся лучшие команды этого места
 * по показателям. Во французских группах команды разных групп не сравниваются: кубки должны вмещать
 * места целиком (это проверяется в настройках), а при нехватке из-за отказов места берутся по порядку групп.
 */
export function qualifyFromGroups(
  groups: Group[],
  groupType: GroupType,
  teams: Team[],
  cups: CupSettings[],
): Qualification {
  const declined = new Set(teams.filter((t) => t.declinedPlayoff).map((t) => t.id));
  const ratingRank = new Map(sortByRating(teams).map((t, i) => [t.id, i]));
  const rankings = groups.map((g) => groupRanking(g, groupType));
  const minSize = Math.min(...groups.map((g) => g.teamIds.length));
  const places = rankings.map((r) => placesAfterDeclines(r, declined));
  const depth = Math.max(0, ...places.map((p) => p.length));

  /** Лучшие count команд одного места (круговые группы). */
  const pickBest = (pool: Qualifier[], count: number): Qualifier[] => {
    if (groupType === 'french') return pool.slice(0, count);
    const stats = new Map(
      pool.map((q) => [q.teamId, compareStats(q.teamId, groups[q.groupIndex]!, rankings[q.groupIndex]!, minSize)]),
    );
    return [...pool]
      .sort((x, y) => {
        const a = stats.get(x.teamId)!;
        const b = stats.get(y.teamId)!;
        return (
          b.wins - a.wins ||
          b.top2Wins - a.top2Wins ||
          b.diff - a.diff ||
          b.pointsFor - a.pointsFor ||
          ratingRank.get(x.teamId)! - ratingRank.get(y.teamId)!
        );
      })
      .slice(0, count);
  };

  const entries: CupEntry[] = cups.map((cup) => ({ cup, qualifiers: [] }));
  const rest: Qualifier[] = [];
  let cupIndex = 0;

  for (let place = 0; place < depth; place++) {
    // Команды одного места по порядку групп.
    let pool: Qualifier[] = places.flatMap((p, groupIndex) => {
      const teamId = p[place];
      if (!teamId) return [];
      return [{ teamId, groupIndex, place: place + 1, groupPlace: rankings[groupIndex]!.indexOf(teamId) + 1 }];
    });
    while (pool.length > 0) {
      const entry = entries[cupIndex];
      if (!entry) {
        rest.push(...pool);
        break;
      }
      const capacity = entry.cup.size - entry.qualifiers.length;
      const chosen = new Set(pool.length <= capacity ? pool : pickBest(pool, capacity));
      entry.qualifiers.push(...pool.filter((q) => chosen.has(q)));
      pool = pool.filter((q) => !chosen.has(q));
      if (entry.qualifiers.length === entry.cup.size) cupIndex++;
    }
  }

  const errors = entries
    .filter((e) => e.qualifiers.length < e.cup.size)
    .map((e) => `${e.cup.name}: нужно ${e.cup.size} команд, а осталось ${e.qualifiers.length}.`);
  return { cups: entries, rest, errors };
}

/**
 * Кубок для каждой прошедшей команды — для выделения в таблицах групп.
 * Когда сыграны все группы, результат точный. Пока идут игры, в завершённых группах отмечаются
 * только места, которые попадают в кубок целиком (без сравнения с другими группами).
 */
export function qualifiedCups(
  groups: Group[],
  groupType: GroupType,
  teams: Team[],
  cups: CupSettings[],
): Map<Id, string> {
  const result = new Map<Id, string>();
  if (groups.length === 0) return result;

  if (groups.every(isGroupComplete)) {
    for (const entry of qualifyFromGroups(groups, groupType, teams, cups).cups) {
      for (const q of entry.qualifiers) result.set(q.teamId, entry.cup.name);
    }
    return result;
  }

  const declined = new Set(teams.filter((t) => t.declinedPlayoff).map((t) => t.id));
  const g = groups.length;
  for (const group of groups) {
    if (!isGroupComplete(group)) continue;
    placesAfterDeclines(groupRanking(group, groupType), declined).forEach((teamId, place) => {
      if (!teamId) return;
      // Место занимает в общем порядке позиции [place·g, (place+1)·g).
      let offset = 0;
      for (const cup of cups) {
        if (place * g >= offset && (place + 1) * g <= offset + cup.size) result.set(teamId, cup.name);
        offset += cup.size;
      }
    });
  }
  return result;
}

// ───────────────────────── Сетка ─────────────────────────

/** Порядок номеров посева в сетке: 1-й с последним, 2-й в противоположной половине и т. д. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

/** Раунд, в котором встретятся команды на позициях сетки a и b (1 — первый раунд). */
export function meetingRound(a: number, b: number): number {
  let round = 0;
  while (a !== b) {
    a >>= 1;
    b >>= 1;
    round++;
  }
  return round;
}

/** Число с обратным порядком битов: 0, 1, 2, 3 → 0, 2, 1, 3 (для двух битов). */
function reverseBits(value: number, bits: number): number {
  let result = 0;
  for (let i = 0; i < bits; i++) result = (result << 1) | ((value >> i) & 1);
  return result;
}

const isPowerOfTwo = (n: number) => n > 0 && (n & (n - 1)) === 0;

/**
 * Постоянная схема сетки для случая, когда в кубок выходят места целиком (по одной команде от
 * каждой группы на каждое место). Возвращает команды по позициям сетки или null, если случай другой.
 *
 * Первые места расставляются по группам поочерёдно в верхнюю и нижнюю половину: A, C сверху, B, D снизу.
 * Вторые места — зеркально: в игру к первому месту попадает второе место той группы, чьё первое
 * место стоит в зеркальной игре. Для четырёх групп: A1–D2, C1–B2, B1–C2, D1–A2; для двух: A1–B2, B1–A2.
 * Если из группы выходит четыре места, к первому месту добавляется четвёртое, ко второму — третье,
 * из групп, стоящих в другой половине сетки.
 */
export function templatePositions(qualifiers: Qualifier[]): Id[] | null {
  const tiers: Qualifier[][] = [];
  for (const q of qualifiers) {
    const tier = tiers[tiers.length - 1];
    if (tier && tier[0]!.place === q.place) tier.push(q);
    else tiers.push([q]);
  }
  const groupCount = tiers[0]?.length ?? 0;
  if (!isPowerOfTwo(groupCount) || !isPowerOfTwo(tiers.length)) return null;
  const groupIds = tiers[0]!.map((q) => q.groupIndex).sort((a, b) => a - b);
  const sameGroups = (tier: Qualifier[]) =>
    tier.length === groupCount &&
    tier
      .map((q) => q.groupIndex)
      .sort((a, b) => a - b)
      .every((g, i) => g === groupIds[i]);
  if (!tiers.every(sameGroups)) return null;

  interface Entry {
    tier: number;
    /** Номер группы среди участвующих (0 — первая по порядку). */
    group: number;
  }
  const bits = Math.log2(groupCount);
  let entries: Entry[] = Array.from({ length: groupCount }, (_, i) => ({ tier: 0, group: reverseBits(i, bits) }));
  for (let tierCount = 1; tierCount < tiers.length; tierCount *= 2) {
    // Каждая команда получает соперника: место t играет с местом (2·tierCount − 1 − t).
    const previous = entries;
    const next: Entry[] = [];
    previous.forEach((entry) => {
      const sameTier = previous.filter((e) => e.tier === entry.tier);
      const index = sameTier.indexOf(entry);
      const partnerIndex =
        tierCount === 1 ? groupCount - 1 - index : (index + Math.floor(groupCount / 2)) % groupCount;
      next.push(entry, { tier: 2 * tierCount - 1 - entry.tier, group: sameTier[partnerIndex]!.group });
    });
    entries = next;
  }
  return entries.map((e) => tiers[e.tier]!.find((q) => q.groupIndex === groupIds[e.group])!.teamId);
}

/**
 * Посев команд из групп. Возвращает id по номерам посева (индекс 0 — первый номер).
 *
 * Если в кубок выходят места целиком, сетка строится по постоянной схеме (см. templatePositions).
 * Иначе (например, с лучшими третьими местами или после отказов) номера идут по местам и по порядку
 * групп, а внутри одного места переставляются так, чтобы команды одной группы встретились как можно
 * позже. В обоих случаях первое и второе места группы могут встретиться только в финале.
 */
export function seedFromGroups(qualifiers: Qualifier[]): Id[] {
  const template = templatePositions(qualifiers);
  if (template) {
    const bySeed: Id[] = [];
    seedOrder(template.length).forEach((seed, position) => (bySeed[seed - 1] = template[position]!));
    return bySeed;
  }
  const size = qualifiers.length;
  const order = seedOrder(size);
  const positionOfSeed = new Map(order.map((seed, position) => [seed, position]));
  const maxRound = Math.log2(size) + 1;
  const seeds: (Qualifier | undefined)[] = new Array(size).fill(undefined);

  /** Насколько поздно команда на этом номере посева встретит уже посеянных соперников по группе. */
  const separation = (q: Qualifier, seedIndex: number): number => {
    const position = positionOfSeed.get(seedIndex + 1)!;
    let min = maxRound;
    seeds.forEach((other, otherIndex) => {
      if (other && other.groupIndex === q.groupIndex) {
        min = Math.min(min, meetingRound(position, positionOfSeed.get(otherIndex + 1)!));
      }
    });
    return min;
  };

  let start = 0;
  while (start < size) {
    let end = start;
    while (end < size && qualifiers[end]!.place === qualifiers[start]!.place) end++;
    const tier = qualifiers.slice(start, end);
    const slots = Array.from({ length: tier.length }, (_, i) => start + i);
    const sep = tier.map((q) => slots.map((slot) => separation(q, slot)));
    const best = sep.map((row) => Math.max(...row));

    // Паросочетание «команда — номер»: сначала требуем лучшее возможное разведение для каждой
    // команды, при неудаче ослабляем требование на один раунд.
    for (let slack = 0; ; slack++) {
      const slotOwner: number[] = new Array(tier.length).fill(-1);
      const allowed = (team: number, s: number) => sep[team]![s]! >= best[team]! - slack;
      const tryAssign = (team: number, seen: boolean[]): boolean => {
        // Сначала свободный номер — так лучшие команды сохраняют лучшие номера посева;
        // уже посеянную команду передвигаем, только если иначе не получается.
        for (let s = 0; s < slots.length; s++) {
          if (slotOwner[s] === -1 && !seen[s] && allowed(team, s)) {
            seen[s] = true;
            slotOwner[s] = team;
            return true;
          }
        }
        for (let s = 0; s < slots.length; s++) {
          if (seen[s] || !allowed(team, s)) continue;
          seen[s] = true;
          if (tryAssign(slotOwner[s]!, seen)) {
            slotOwner[s] = team;
            return true;
          }
        }
        return false;
      };
      if (tier.every((_, team) => tryAssign(team, new Array(slots.length).fill(false)))) {
        slotOwner.forEach((team, s) => (seeds[slots[s]!] = tier[team]));
        break;
      }
    }
    start = end;
  }
  return seeds.map((q) => q!.teamId);
}

export function roundName(teamsInRound: number): string {
  if (teamsInRound === 2) return 'Финал';
  if (teamsInRound === 4) return 'Полуфинал';
  return `1/${teamsInRound / 2} финала`;
}

/** Подписи команд в сетке после групп: буква группы и место в группе, например «A1». */
export function groupSeedLabels(qualifiers: Qualifier[], groups: Group[]): Record<Id, string> {
  return Object.fromEntries(
    qualifiers.map((q) => {
      const groupName = groups[q.groupIndex]?.name ?? '';
      const letter = groupName.split(' ').pop() ?? '';
      return [q.teamId, `${letter}${q.groupPlace}`];
    }),
  );
}

/** Сетка кубка: первый раунд по номерам посева, следующие раунды заполняются по мере игр. */
export function createBracket(cup: CupSettings, seedTeamIds: Id[], seedLabels: Record<Id, string>): CupBracket {
  const size = seedTeamIds.length;
  const order = seedOrder(size);
  const rounds: PlayoffRound[] = [];
  for (let teamsInRound = size, round = 1; teamsInRound >= 2; teamsInRound /= 2, round++) {
    const matches = Array.from({ length: teamsInRound / 2 }, (_, i) =>
      round === 1
        ? newMatch(seedTeamIds[order[2 * i]! - 1]!, seedTeamIds[order[2 * i + 1]! - 1]!, round)
        : newMatch(null, null, round),
    );
    rounds.push({ name: roundName(teamsInRound), matches });
  }
  return {
    name: cup.name,
    seedTeamIds,
    seedLabels,
    rounds,
    thirdPlaceMatch: cup.thirdPlaceMatch && size >= 4 ? newMatch(null, null, rounds.length) : null,
  };
}

function withTeams(m: Match, teamA: Id | null, teamB: Id | null): Match {
  if (m.teamA === teamA && m.teamB === teamB) return m;
  return { ...m, teamA, teamB, scoreA: null, scoreB: null };
}

/**
 * Продвигает победителей по сетке (и проигравших полуфиналов — в матч за 3-е место).
 * Если после исправления результата участники игры изменились, её счёт сбрасывается.
 */
export function resolveBracket(bracket: CupBracket): CupBracket {
  const rounds: PlayoffRound[] = [];
  bracket.rounds.forEach((round, r) => {
    const previous = rounds[r - 1];
    rounds.push(
      previous
        ? {
            ...round,
            matches: round.matches.map((m, i) =>
              withTeams(m, winnerOf(previous.matches[2 * i]!), winnerOf(previous.matches[2 * i + 1]!)),
            ),
          }
        : round,
    );
  });
  const semifinals = rounds[rounds.length - 2];
  const thirdPlaceMatch =
    bracket.thirdPlaceMatch && semifinals
      ? withTeams(bracket.thirdPlaceMatch, loserOf(semifinals.matches[0]!), loserOf(semifinals.matches[1]!))
      : bracket.thirdPlaceMatch;
  return { ...bracket, rounds, thirdPlaceMatch };
}

export function bracketMatches(bracket: CupBracket): Match[] {
  const matches = bracket.rounds.flatMap((r) => r.matches);
  return bracket.thirdPlaceMatch ? [...matches, bracket.thirdPlaceMatch] : matches;
}

/** Призёры кубка: места 1–2 по финалу, 3–4 по матчу за 3-е место (если он играется). */
export function cupPodium(bracket: CupBracket): { place: number; teamId: Id }[] {
  const final = bracket.rounds[bracket.rounds.length - 1]?.matches[0];
  const podium: { place: number; teamId: Id }[] = [];
  const add = (place: number, teamId: Id | null | undefined) => {
    if (teamId) podium.push({ place, teamId });
  };
  if (final) {
    add(1, winnerOf(final));
    add(2, loserOf(final));
  }
  if (bracket.thirdPlaceMatch) {
    add(3, winnerOf(bracket.thirdPlaceMatch));
    add(4, loserOf(bracket.thirdPlaceMatch));
  }
  return podium;
}

// ───────────────────────── План плей-офф ─────────────────────────

/** Строка списка выхода в плей-офф. */
export interface PlanRow {
  teamId: Id;
  /** Название группы; null после швейцарской системы. */
  groupName: string | null;
  /** Место в группе или в итоговом положении швейцарки. */
  place: number;
}

export interface PlanCup {
  cup: CupSettings;
  rows: PlanRow[];
  /** Команды по номерам посева; пусто, если кубок не удалось заполнить. */
  seeds: Id[];
  /** Подписи команд в сетке: «A1» после групп, место после швейцарки. */
  labels: Record<Id, string>;
}

export interface PlayoffPlan {
  cups: PlanCup[];
  rest: PlanRow[];
  errors: string[];
}

function shortageErrors(cups: { cup: CupSettings; count: number }[]): string[] {
  return cups
    .filter((c) => c.count < c.cup.size)
    .map((c) => `${c.cup.name}: нужно ${c.cup.size} команд, а осталось ${c.count}.`);
}

/**
 * Выход в плей-офф после швейцарки: команды идут по итоговым местам, отказавшиеся пропускаются,
 * все последующие сдвигаются. В сетке первый номер играет с последним и так далее.
 */
function planFromSwiss(standings: SwissRow[], teams: Team[], cups: CupSettings[]): PlayoffPlan {
  const declined = new Set(teams.filter((t) => t.declinedPlayoff).map((t) => t.id));
  const rows: PlanRow[] = standings
    .filter((r) => !declined.has(r.teamId))
    .map((r) => ({ teamId: r.teamId, groupName: null, place: r.place }));
  let offset = 0;
  const planCups = cups.map((cup) => {
    const cupRows = rows.slice(offset, offset + cup.size);
    offset += cup.size;
    return {
      cup,
      rows: cupRows,
      seeds: cupRows.length === cup.size ? cupRows.map((r) => r.teamId) : [],
      labels: Object.fromEntries(cupRows.map((r) => [r.teamId, String(r.place)])),
    };
  });
  return {
    cups: planCups,
    rest: rows.slice(offset),
    errors: shortageErrors(planCups.map((c) => ({ cup: c.cup, count: c.rows.length }))),
  };
}

/** Кубок для каждой прошедшей команды после швейцарки — для выделения в таблице. */
export function swissQualifiedCups(standings: SwissRow[], teams: Team[], cups: CupSettings[]): Map<Id, string> {
  const result = new Map<Id, string>();
  for (const planCup of planFromSwiss(standings, teams, cups).cups) {
    for (const row of planCup.rows) result.set(row.teamId, planCup.cup.name);
  }
  return result;
}

/** Сыграны ли все игры предварительного раунда. */
export function isPrelimComplete(t: Tournament): boolean {
  if (t.stage === 'teams' || t.stage === 'setup') return false;
  const prelim = t.settings.prelim;
  if (prelim.kind === 'swiss') {
    return t.swissRounds.length >= prelim.rounds && t.swissRounds.every(isRoundComplete);
  }
  return t.groups.length > 0 && t.groups.every(isGroupComplete);
}

/** Кто в какой кубок выходит и как сеется — по итогам предварительного раунда. */
export function planPlayoff(t: Tournament): PlayoffPlan {
  const prelim = t.settings.prelim;
  if (prelim.kind === 'swiss') {
    return planFromSwiss(swissStandings(t.teams, t.swissRounds, prelim.tiebreakers), t.teams, t.settings.cups);
  }
  const q = qualifyFromGroups(t.groups, prelim.groupType, t.teams, t.settings.cups);
  const toRow = (x: Qualifier): PlanRow => ({
    teamId: x.teamId,
    groupName: t.groups[x.groupIndex]?.name ?? null,
    place: x.groupPlace,
  });
  return {
    cups: q.cups.map((entry) => ({
      cup: entry.cup,
      rows: entry.qualifiers.map(toRow),
      seeds: entry.qualifiers.length === entry.cup.size ? seedFromGroups(entry.qualifiers) : [],
      labels: groupSeedLabels(entry.qualifiers, t.groups),
    })),
    rest: q.rest.map(toRow),
    errors: q.errors,
  };
}

// ───────────────────────── Ручная правка сетки ─────────────────────────

/**
 * Подписи для всех команд турнира: после групп — буква группы и место («A1»), после швейцарки — место.
 * Хранятся в сетке для всех команд, чтобы при ручной замене подпись была и у новой команды.
 */
export function allSeedLabels(t: Tournament): Record<Id, string> {
  const prelim = t.settings.prelim;
  if (prelim.kind === 'swiss') {
    return Object.fromEntries(
      swissStandings(t.teams, t.swissRounds, prelim.tiebreakers).map((r) => [r.teamId, String(r.place)]),
    );
  }
  return Object.fromEntries(
    t.groups.flatMap((group) => {
      const letter = group.name.split(' ').pop() ?? '';
      return groupRanking(group, prelim.groupType).map((teamId, i) => [teamId, `${letter}${i + 1}`]);
    }),
  );
}

/** Команды первого раунда по позициям сетки (сверху вниз). */
export function firstRoundSlots(bracket: CupBracket): (Id | null)[] {
  return (bracket.rounds[0]?.matches ?? []).flatMap((m) => [m.teamA, m.teamB]);
}

function setFirstRoundSlot(bracket: CupBracket, position: number, teamId: Id | null): CupBracket {
  const first = bracket.rounds[0];
  if (!first) return bracket;
  const matchIndex = position >> 1;
  const matches = first.matches.map((m, i) => {
    if (i !== matchIndex) return m;
    const changed = position % 2 === 0 ? { ...m, teamA: teamId } : { ...m, teamB: teamId };
    // Состав игры изменился — её результат больше не действителен.
    return { ...changed, scoreA: null, scoreB: null };
  });
  const seedTeamIds = [...bracket.seedTeamIds];
  const seed = seedOrder(seedTeamIds.length)[position];
  if (seed !== undefined && teamId !== null) seedTeamIds[seed - 1] = teamId;
  return resolveBracket({ ...bracket, seedTeamIds, rounds: [{ ...first, matches }, ...bracket.rounds.slice(1)] });
}

/**
 * Ручная правка первого раунда: ставит команду на позицию сетки кубка. Если команда уже стоит
 * в какой-то сетке (этого или другого кубка), команды меняются местами; если нет — прежняя команда
 * позиции выбывает из плей-офф. Результаты игр, состав которых изменился, сбрасываются.
 */
export function placeTeamInBracket(cups: CupBracket[], cupIndex: number, position: number, teamId: Id): CupBracket[] {
  const previous = cups[cupIndex] ? (firstRoundSlots(cups[cupIndex]!)[position] ?? null) : null;
  if (previous === teamId) return cups;
  let from: { cup: number; position: number } | null = null;
  cups.forEach((cup, c) => {
    const p = firstRoundSlots(cup).indexOf(teamId);
    if (p >= 0) from = { cup: c, position: p };
  });
  const origin = from as { cup: number; position: number } | null;
  return cups.map((cup, c) => {
    let next = cup;
    if (c === cupIndex) next = setFirstRoundSlot(next, position, teamId);
    if (origin && c === origin.cup) next = setFirstRoundSlot(next, origin.position, previous);
    return next;
  });
}

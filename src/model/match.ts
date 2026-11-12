import { newId } from './factory';
import type { Id, Match } from './types';

export const MAX_SCORE = 13;

export function newMatch(teamA: Id | null, teamB: Id | null, round?: number): Match {
  return { id: newId(), teamA, teamB, scoreA: null, scoreB: null, round };
}

function isValidScore(n: number | null): n is number {
  return n !== null && Number.isInteger(n) && n >= 0 && n <= MAX_SCORE;
}

/** Результат введён полностью: оба счёта 0–13 и не равны (ничьих не бывает). */
export function isPlayed(m: Match): m is Match & { teamA: Id; teamB: Id; scoreA: number; scoreB: number } {
  return (
    m.teamA !== null &&
    m.teamB !== null &&
    isValidScore(m.scoreA) &&
    isValidScore(m.scoreB) &&
    m.scoreA !== m.scoreB
  );
}

/** Что-то введено, но результат не засчитывается. Возвращает причину или null. */
export function scoreProblem(m: Match): string | null {
  if (m.scoreA === null && m.scoreB === null) return null;
  if (m.scoreA === null || m.scoreB === null) return 'Введите счёт обеих команд';
  if (!isValidScore(m.scoreA) || !isValidScore(m.scoreB)) return `Счёт — целое число от 0 до ${MAX_SCORE}`;
  if (m.scoreA === m.scoreB) return 'Ничьих не бывает';
  return null;
}

export function hasAnyScore(m: Match): boolean {
  return m.scoreA !== null || m.scoreB !== null;
}

export function winnerOf(m: Match): Id | null {
  if (!isPlayed(m)) return null;
  return m.scoreA > m.scoreB ? m.teamA : m.teamB;
}

export function loserOf(m: Match): Id | null {
  if (!isPlayed(m)) return null;
  return m.scoreA > m.scoreB ? m.teamB : m.teamA;
}

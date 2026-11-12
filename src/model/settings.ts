import type { TournamentSettings } from './types';

export const MIN_TEAMS = 4;
export const CUP_SIZES = [2, 4, 8, 16, 32, 64] as const;
const MIN_GROUP_SIZE = 3;
const FRENCH_MAX_GROUP_SIZE = 4;

/** Размеры групп: команды делятся поровну, разница между группами не больше одной команды. */
export function groupSizes(teamCount: number, groupCount: number): number[] {
  if (!Number.isInteger(teamCount) || !Number.isInteger(groupCount) || groupCount < 1) return [];
  const base = Math.floor(teamCount / groupCount);
  const extra = teamCount % groupCount;
  return Array.from({ length: groupCount }, (_, i) => base + (i < extra ? 1 : 0));
}

/** Число туров швейцарки, достаточное для выявления единственного лидера. */
export function recommendedSwissRounds(teamCount: number): number {
  return Math.max(1, Math.ceil(Math.log2(Math.max(2, teamCount))));
}

export function cupName(index: number): string {
  return `Кубок ${String.fromCharCode('A'.charCodeAt(0) + index)}`;
}

function isPositiveInt(n: number): boolean {
  return Number.isInteger(n) && n > 0;
}

/** Проверка согласованности настроек. Пустой список — настройки корректны. */
export function validateSettings(s: TournamentSettings): string[] {
  const errors: string[] = [];
  const n = s.teamCount;

  if (!Number.isInteger(n) || n < MIN_TEAMS) {
    errors.push(`Количество команд должно быть не меньше ${MIN_TEAMS}.`);
    return errors;
  }

  const p = s.prelim;
  if (p.kind === 'groups') {
    if (!isPositiveInt(p.groupCount)) {
      errors.push('Укажите количество групп.');
    } else {
      const sizes = groupSizes(n, p.groupCount);
      const min = Math.min(...sizes);
      const max = Math.max(...sizes);
      if (min < MIN_GROUP_SIZE) {
        errors.push(`В группе должно быть не меньше ${MIN_GROUP_SIZE} команд — уменьшите количество групп.`);
      } else if (p.groupType === 'french' && max > FRENCH_MAX_GROUP_SIZE) {
        errors.push('Во французской группе может быть только 3 или 4 команды — увеличьте количество групп.');
      }
      if (p.drawMode === 'seeded') {
        if (!Number.isInteger(p.seededCount) || p.seededCount < 0) {
          errors.push('Укажите количество сеяных команд.');
        } else if (p.seededCount % p.groupCount !== 0) {
          errors.push('Количество сеяных команд должно делиться на количество групп.');
        } else if (p.seededCount / p.groupCount > min) {
          errors.push('Сеяных команд больше, чем помещается в группы.');
        }
      }
    }
  } else {
    if (!isPositiveInt(p.rounds)) {
      errors.push('Укажите количество туров.');
    } else if (p.rounds > n - 1) {
      errors.push(`Туров не может быть больше ${n - 1}: команды не встречаются дважды.`);
    }
    if (new Set(p.tiebreakers).size !== p.tiebreakers.length) {
      errors.push('Дополнительные показатели не должны повторяться.');
    }
  }

  if (s.cups.length === 0) {
    errors.push('Добавьте хотя бы один кубок плей-офф.');
  }
  const names = s.cups.map((c) => c.name.trim());
  if (names.some((name) => !name)) errors.push('У каждого кубка должно быть название.');
  if (new Set(names).size !== names.length) errors.push('Названия кубков не должны повторяться.');
  for (const cup of s.cups) {
    const label = cup.name.trim() || 'Кубок';
    if (!(CUP_SIZES as readonly number[]).includes(cup.size)) {
      errors.push(`${label}: количество команд должно быть степенью двойки.`);
    } else if (cup.thirdPlaceMatch && cup.size < 4) {
      errors.push(`${label}: матч за 3-е место возможен при 4 командах и больше.`);
    }
  }
  if (p.kind === 'groups' && p.groupType === 'french' && errors.length === 0) {
    // Команды разных французских групп не сравниваются, поэтому кубок не может
    // заканчиваться посередине места: границы кубков — только между местами.
    const sizes = groupSizes(n, p.groupCount);
    const boundaries: number[] = [];
    for (let place = 0, total = 0; place < Math.max(...sizes); place++) {
      total += sizes.filter((size) => size > place).length;
      boundaries.push(total);
    }
    let end = 0;
    for (const cup of s.cups) {
      end += cup.size;
      if (end <= n && !boundaries.includes(end)) {
        errors.push(
          `${cup.name.trim()}: во французских группах в кубок выходят места целиком, команды разных групп ` +
            `не сравниваются. Кубок заканчивается на ${end}-й команде, а места заканчиваются на: ${boundaries.join(', ')}.`,
        );
        break;
      }
    }
  }
  const playoffTeams = s.cups.reduce((sum, c) => sum + c.size, 0);
  if (playoffTeams > n) {
    errors.push(`В кубках ${playoffTeams} мест, а команд в турнире ${n}.`);
  }

  return errors;
}

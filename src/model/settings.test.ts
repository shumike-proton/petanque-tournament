import { describe, expect, it } from 'vitest';
import { defaultSettings } from './factory';
import { groupSizes, recommendedSwissRounds, validateSettings } from './settings';
import type { CupSettings, PrelimSettings, TournamentSettings } from './types';

const cup = (size: number, name = 'Кубок A', thirdPlaceMatch = false): CupSettings => ({
  name,
  size,
  thirdPlaceMatch,
});

const groups = (over: Partial<Extract<PrelimSettings, { kind: 'groups' }>> = {}): PrelimSettings => ({
  kind: 'groups',
  groupType: 'roundRobin',
  groupCount: 4,
  drawMode: 'snake',
  seededCount: 0,
  ...over,
});

const settings = (teamCount: number, prelim: PrelimSettings, cups = [cup(4)]): TournamentSettings => ({
  teamCount,
  prelim,
  cups,
});

describe('groupSizes', () => {
  it('делит поровну', () => {
    expect(groupSizes(16, 4)).toEqual([4, 4, 4, 4]);
  });
  it('разница не больше одной команды', () => {
    expect(groupSizes(14, 4)).toEqual([4, 4, 3, 3]);
  });
});

describe('recommendedSwissRounds', () => {
  it('логарифм по основанию 2 с округлением вверх', () => {
    expect(recommendedSwissRounds(16)).toBe(4);
    expect(recommendedSwissRounds(17)).toBe(5);
    expect(recommendedSwissRounds(40)).toBe(6);
  });
});

describe('validateSettings', () => {
  it('настройки по умолчанию корректны', () => {
    expect(validateSettings(defaultSettings())).toEqual([]);
  });

  it('слишком маленькие группы', () => {
    expect(validateSettings(settings(10, groups({ groupCount: 4 })))).toHaveLength(1);
  });

  it('французские группы только по 3–4 команды', () => {
    expect(validateSettings(settings(14, groups({ groupType: 'french', groupCount: 4 })))).toEqual([]);
    expect(validateSettings(settings(14, groups({ groupType: 'french', groupCount: 2 })))).toHaveLength(1);
  });

  it('французские группы: кубки вмещают места целиком', () => {
    const french = groups({ groupType: 'french', groupCount: 4 });
    // 14 команд, группы 4+4+3+3: места заканчиваются на 4, 8, 12 и 14-й команде.
    expect(validateSettings(settings(14, french, [cup(8), cup(4, 'Кубок B')]))).toEqual([]);
    expect(validateSettings(settings(14, french, [cup(4), cup(4, 'Кубок B'), cup(4, 'Кубок C')]))).toEqual([]);
    expect(validateSettings(settings(14, french, [cup(2)]))).toHaveLength(1);
    expect(validateSettings(settings(14, french, [cup(4), cup(2, 'Кубок B')]))).toHaveLength(1);
    // Для круговых групп такого ограничения нет.
    expect(validateSettings(settings(14, groups({ groupCount: 4 }), [cup(2)]))).toEqual([]);
  });

  it('сеяные делятся на количество групп', () => {
    const seeded = (seededCount: number) =>
      settings(16, groups({ drawMode: 'seeded', seededCount }));
    expect(validateSettings(seeded(8))).toEqual([]);
    expect(validateSettings(seeded(0))).toEqual([]);
    expect(validateSettings(seeded(6))).toHaveLength(1);
    expect(validateSettings(seeded(20))).toHaveLength(1);
  });

  it('швейцарка: туров меньше, чем команд', () => {
    const swiss = (rounds: number): PrelimSettings => ({ kind: 'swiss', rounds, tiebreakers: ['buchholz'] });
    expect(validateSettings(settings(8, swiss(5)))).toEqual([]);
    expect(validateSettings(settings(8, swiss(8)))).toHaveLength(1);
    expect(validateSettings(settings(8, swiss(0)))).toHaveLength(1);
  });

  it('кубки: степень двойки, мест не больше команд, уникальные названия', () => {
    const g = groups();
    expect(validateSettings(settings(16, g, [cup(8), cup(8, 'Кубок B')]))).toEqual([]);
    expect(validateSettings(settings(16, g, [cup(6)]))).toHaveLength(1);
    expect(validateSettings(settings(16, g, [cup(16), cup(8, 'Кубок B')]))).toHaveLength(1);
    expect(validateSettings(settings(16, g, [cup(4), cup(4)]))).toHaveLength(1);
    expect(validateSettings(settings(16, g, []))).toHaveLength(1);
    expect(validateSettings(settings(16, g, [cup(2, 'Кубок A', true)]))).toHaveLength(1);
  });
});

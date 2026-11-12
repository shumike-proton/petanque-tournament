import { describe, expect, it } from 'vitest';
import {
  autoName,
  emptyTeam,
  finalizeTeam,
  generateAnimalTeams,
  resizeTeams,
  sortByRating,
  teamRating,
  validateRegistration,
} from './team';
import type { Team } from './types';

const players = (...ratings: number[]) => ratings.map((rating, i) => ({ name: `Игрок ${i + 1}`, rating }));
const named = (name: string, manualRating = 0): Team => ({ id: name, name, players: [], manualRating });

describe('teamRating', () => {
  it('складывает рейтинги игроков', () => {
    expect(teamRating({ players: players(100) })).toBe(100);
    expect(teamRating({ players: players(100, 50) })).toBe(150);
    expect(teamRating({ players: players(100, 50, 25) })).toBe(175);
  });

  it('для четырёх игроков берёт трёх лучших', () => {
    expect(teamRating({ players: players(10, 100, 50, 25) })).toBe(175);
  });

  it('без состава берёт рейтинг команды', () => {
    expect(teamRating({ players: [] })).toBe(0);
    expect(teamRating({ players: [], manualRating: 300 })).toBe(300);
    expect(teamRating({ players: [{ name: ' ', rating: 0 }], manualRating: 300 })).toBe(300);
  });

  it('состав важнее рейтинга команды', () => {
    expect(teamRating({ players: players(100), manualRating: 300 })).toBe(100);
  });
});

describe('названия и список', () => {
  it('название по фамилиям игроков', () => {
    const team = { players: [{ name: 'Иванов Пётр', rating: 1 }, { name: 'Сидорова Анна', rating: 2 }] };
    expect(autoName(team)).toBe('Иванов / Сидорова');
    expect(finalizeTeam({ id: '1', name: ' ', ...team }).name).toBe('Иванов / Сидорова');
  });

  it('resizeTeams добавляет пустые и обрезает', () => {
    const teams = [named('А'), named('Б')];
    expect(resizeTeams(teams, 4)).toHaveLength(4);
    expect(resizeTeams(teams, 1)).toEqual([teams[0]]);
  });

  it('sortByRating — по убыванию, при равенстве порядок ввода', () => {
    const sorted = sortByRating([named('А', 10), named('Б', 30), named('В', 10), named('Г', 20)]);
    expect(sorted.map((t) => t.name)).toEqual(['Б', 'Г', 'А', 'В']);
  });
});

describe('validateRegistration', () => {
  const four = [named('А'), named('Б'), named('В'), named('Г')];

  it('корректный список', () => {
    expect(validateRegistration(four, 'triplet')).toEqual([]);
  });
  it('мало команд', () => {
    expect(validateRegistration(four.slice(1), 'triplet')).toHaveLength(1);
  });
  it('пустая строка', () => {
    expect(validateRegistration([...four, emptyTeam()], 'triplet')).toHaveLength(1);
  });
  it('состав не по формату', () => {
    const duo: Team = { id: 'д', name: 'Д', players: players(1, 2) };
    expect(validateRegistration([...four, duo], 'doublet')).toEqual([]);
    expect(validateRegistration([...four, duo], 'triplet')).toHaveLength(1);
  });
  it('повтор названия без учёта регистра', () => {
    expect(validateRegistration([...four, named('а')], 'triplet')).toHaveLength(1);
  });
});

describe('generateAnimalTeams', () => {
  it('создаёт нужное число команд с уникальными названиями и рейтингом', () => {
    const teams = generateAnimalTeams(100);
    expect(teams).toHaveLength(100);
    expect(new Set(teams.map((t) => t.name)).size).toBe(100);
    expect(teams.every((t) => teamRating(t) >= 100 && teamRating(t) < 1000)).toBe(true);
    expect(validateRegistration(teams, 'triplet')).toEqual([]);
  });
});

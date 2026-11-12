import { describe, expect, it } from 'vitest';
import { parseCsv, teamsFromRows } from './importTeams';
import { teamRating } from './team';

describe('parseCsv', () => {
  it('точка с запятой, BOM и перевод строк Windows', () => {
    expect(parseCsv('﻿Команда;Рейтинг\r\nВолки;120\r\n')).toEqual([
      ['Команда', 'Рейтинг'],
      ['Волки', '120'],
    ]);
  });
  it('запятая и кавычки', () => {
    expect(parseCsv('"Львы, тигры",100\n"Клуб ""Шар""",50')).toEqual([
      ['Львы, тигры', '100'],
      ['Клуб "Шар"', '50'],
    ]);
  });
});

describe('teamsFromRows', () => {
  it('формат «команда, рейтинг» с заголовком', () => {
    const { teams, errors } = teamsFromRows([
      ['Команда', 'Рейтинг'],
      ['Волки', '120'],
      ['Лисы', 95.5],
      ['', ''],
      ['Совы'],
    ], 'triplet');
    expect(errors).toEqual([]);
    expect(teams.map((t) => [t.name, teamRating(t)])).toEqual([
      ['Волки', 120],
      ['Лисы', 95.5],
      ['Совы', 0],
    ]);
  });

  it('формат с составом, десятичная запятая, название по фамилиям', () => {
    const { teams, errors } = teamsFromRows([
      ['Волки', 'Иванов', '100', 'Петров', '50,5', 'Зуев', '10', '', ''],
      ['', 'Сидоров Олег', 10, 'Кузнецов', 20, 'Попов', 30, 'Орлов', 40],
    ], 'triplet');
    expect(errors).toEqual([]);
    expect(teams[0]?.players).toHaveLength(3);
    expect(teamRating(teams[0]!)).toBe(160.5);
    expect(teams[1]?.name).toBe('Сидоров / Кузнецов / Попов / Орлов');
    expect(teamRating(teams[1]!)).toBe(90);
  });

  it('сообщает об ошибках с номером строки', () => {
    expect(teamsFromRows([['Волки', 'сто'], ['Лисы', '10']], 'triplet').errors).toHaveLength(1);
    const { errors } = teamsFromRows([
      ['Совы', '10'],
      ['Волки', 'сто'],
      ['Лисы', 'Иванов', 'много'],
      ['', '15'],
    ], 'tete');
    expect(errors).toHaveLength(3);
    expect(errors[0]).toContain('Строка 2');
  });

  it('число игроков должно соответствовать формату', () => {
    const row = (...names: string[]) => [['Волки', ...names.flatMap((n) => [n, '10'])]];
    expect(teamsFromRows(row('А'), 'tete').errors).toEqual([]);
    expect(teamsFromRows(row('А', 'Б'), 'tete').errors).toHaveLength(1);
    expect(teamsFromRows(row('А', 'Б'), 'doublet').errors).toEqual([]);
    expect(teamsFromRows(row('А', 'Б'), 'triplet').errors).toHaveLength(1);
    expect(teamsFromRows(row('А', 'Б', 'В', 'Г'), 'triplet').errors).toEqual([]);
    expect(teamsFromRows(row('А', 'Б', 'В', 'Г', 'Д'), 'triplet').errors).toHaveLength(1);
  });

  it('тет без названия называется по игроку', () => {
    expect(teamsFromRows([['', 'Иванов Пётр', '10']], 'tete').teams[0]?.name).toBe('Иванов Пётр');
  });

  it('пустой файл', () => {
    expect(teamsFromRows([], 'triplet').errors).toHaveLength(1);
  });
});

import { newId } from './factory';
import { finalizeTeam, playersRequirement, rosterFitsFormat } from './team';
import { FORMAT_LABELS, type Player, type Team, type TournamentFormat } from './types';

export type Cell = string | number | boolean | null | undefined | object;

export interface ImportResult {
  teams: Team[];
  errors: string[];
}

/** Разбор CSV: разделитель определяется по первой строке (; , или табуляция), поддерживаются кавычки. */
export function parseCsv(text: string): string[][] {
  const source = text.replace(/^﻿/, '');
  const firstLine = source.split(/\r?\n/, 1)[0] ?? '';
  const delimiter =
    [';', '\t', ','].find((d) => firstLine.includes(d)) ?? ';';

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i]!;
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && source[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function cellText(cell: Cell): string {
  return cell === null || cell === undefined ? '' : String(cell).trim();
}

function parseNumber(text: string): number | null {
  if (text === '') return null;
  const n = Number(text.replace(/\s/g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/**
 * Преобразует строки таблицы в команды. Одна строка — одна команда, два формата:
 *  - «команда, рейтинг»;
 *  - «команда, игрок 1, рейтинг 1, игрок 2, рейтинг 2, …» — число игроков должно соответствовать формату турнира.
 * Первая строка считается заголовком, если начинается со слова «Команда»/«Название» и не содержит чисел.
 * Пустые строки пропускаются.
 */
const HEADER_PATTERN = /^(команд|назван|team|name)/i;

export function teamsFromRows(rows: Cell[][], format: TournamentFormat): ImportResult {
  const teams: Team[] = [];
  const errors: string[] = [];

  rows.forEach((raw, index) => {
    const line = index + 1;
    const cells = raw.map(cellText);
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    if (cells.length === 0) return;
    if (index === 0 && HEADER_PATTERN.test(cells[0] ?? '') && cells.every((c) => parseNumber(c) === null)) return;

    const name = cells[0] ?? '';
    const rating = (text: string, what: string): number => {
      const n = parseNumber(text);
      if (n === null || n < 0) {
        errors.push(`Строка ${line}: ${what} «${text}» — ожидается неотрицательное число.`);
        return 0;
      }
      return n;
    };

    if (cells.length <= 2) {
      if (!name) {
        errors.push(`Строка ${line}: не указано название команды.`);
        return;
      }
      const manualRating = cells.length === 2 ? rating(cells[1]!, 'рейтинг команды') : 0;
      teams.push({ id: newId(), name, players: [], manualRating });
      return;
    }

    const players: Player[] = [];
    for (let i = 1; i < cells.length; i += 2) {
      const playerName = cells[i] ?? '';
      const ratingText = cells[i + 1] ?? '';
      if (!playerName && !ratingText) continue;
      if (!playerName) {
        errors.push(`Строка ${line}: рейтинг «${ratingText}» указан без имени игрока.`);
        continue;
      }
      players.push({ name: playerName, rating: ratingText ? rating(ratingText, `рейтинг игрока ${playerName}`) : 0 });
    }
    if (!rosterFitsFormat({ players }, format)) {
      errors.push(
        `Строка ${line}: игроков ${players.length}, а для формата «${FORMAT_LABELS[format]}» нужно ${playersRequirement(format)}.`,
      );
      return;
    }
    const team = finalizeTeam({ id: newId(), name, players });
    if (!team.name) {
      errors.push(`Строка ${line}: не указаны ни название команды, ни игроки.`);
      return;
    }
    teams.push(team);
  });

  if (teams.length === 0 && errors.length === 0) errors.push('В файле не найдено ни одной команды.');
  return { teams, errors };
}

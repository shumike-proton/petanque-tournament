import { parseCsv, teamsFromRows, type ImportResult } from '../model/importTeams';
import type { TournamentFormat } from '../model/types';

/** CSV из русского Excel обычно в кодировке Windows-1251, из остальных программ — в UTF-8. */
function decodeText(buffer: ArrayBuffer): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    return new TextDecoder('windows-1251').decode(buffer);
  }
}

/** Читает команды из файла CSV или Excel (.xlsx, первый лист). */
export async function readTeamsFile(file: File, format: TournamentFormat): Promise<ImportResult> {
  const name = file.name.toLowerCase();
  if (name.endsWith('.xlsx')) {
    const { readSheet } = await import('read-excel-file/browser');
    return teamsFromRows(await readSheet(file), format);
  }
  if (name.endsWith('.xls')) {
    return { teams: [], errors: ['Старый формат .xls не поддерживается — сохраните файл как .xlsx или CSV.'] };
  }
  return teamsFromRows(parseCsv(decodeText(await file.arrayBuffer())), format);
}

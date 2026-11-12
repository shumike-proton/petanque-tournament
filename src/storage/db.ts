import { createStore, del, get, set, values } from 'idb-keyval';
import { isTournament, newId, normalizeTournament } from '../model/factory';
import type { Tournament } from '../model/types';

// Турниры хранятся в IndexedDB браузера: ключ — id турнира, значение — объект целиком.
const store = createStore('petanque-tournaments', 'tournaments');

export async function listTournaments(): Promise<Tournament[]> {
  const all = await values<Tournament>(store);
  return all.map(normalizeTournament).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function loadTournament(id: string): Promise<Tournament | undefined> {
  const t = await get<Tournament>(id, store);
  return t && normalizeTournament(t);
}

export async function saveTournament(t: Tournament): Promise<Tournament> {
  const saved = { ...t, updatedAt: new Date().toISOString() };
  await set(saved.id, saved, store);
  return saved;
}

export function deleteTournament(id: string): Promise<void> {
  return del(id, store);
}

export function exportTournament(t: Tournament): void {
  const blob = new Blob([JSON.stringify(t, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${t.name.replace(/[\\/:*?"<>|]+/g, '_') || 'турнир'}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/** Импорт из JSON-файла. Турнир получает новый id, чтобы не затереть существующий. */
export async function importTournament(file: File): Promise<Tournament> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new Error('Файл не является корректным JSON.');
  }
  if (!isTournament(parsed)) throw new Error('Файл не похож на сохранённый турнир.');
  return saveTournament({ ...normalizeTournament(parsed), id: newId(), createdAt: new Date().toISOString() });
}

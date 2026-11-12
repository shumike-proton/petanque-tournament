import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { createTournament } from '../model/factory';
import { FORMAT_LABELS, type Stage, type Tournament, type TournamentFormat } from '../model/types';
import {
  deleteTournament,
  exportTournament,
  importTournament,
  listTournaments,
  saveTournament,
} from '../storage/db';

const STAGE_LABELS: Record<Stage, string> = {
  teams: 'Регистрация команд',
  setup: 'Настройка',
  prelim: 'Предварительный раунд',
  playoff: 'Плей-офф',
  finished: 'Завершён',
};

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}.${m}.${y}` : iso;
}

export function TournamentListPage() {
  const navigate = useNavigate();
  const [tournaments, setTournaments] = useState<Tournament[] | null>(null);
  const [name, setName] = useState('');
  const [date, setDate] = useState(today);
  const [format, setFormat] = useState<TournamentFormat>('triplet');
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const reload = () => listTournaments().then(setTournaments, (e) => setError(String(e)));
  useEffect(() => {
    void reload();
  }, []);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    const t = await saveTournament(createTournament(trimmed, date, format));
    navigate(`/t/${t.id}`);
  }

  async function onDelete(t: Tournament) {
    if (!confirm(`Удалить турнир «${t.name}»? Это действие нельзя отменить.`)) return;
    await deleteTournament(t.id);
    await reload();
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      await importTournament(file);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <h1>Турниры по петанку</h1>
      </header>

      <section className="card">
        <h2>Новый турнир</h2>
        <form className="row" onSubmit={onCreate}>
          <label className="field grow">
            <span>Название</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Например, Кубок города"
            />
          </label>
          <label className="field">
            <span>Дата</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
          <label className="field">
            <span>Формат</span>
            <select value={format} onChange={(e) => setFormat(e.target.value as TournamentFormat)}>
              <option value="tete">Теты (1 игрок)</option>
              <option value="doublet">Дуплеты (2 игрока)</option>
              <option value="triplet">Триплеты (3–4 игрока)</option>
            </select>
          </label>
          <button type="submit" className="primary" disabled={!name.trim()}>
            Создать
          </button>
        </form>
      </section>

      <section className="card">
        <div className="row spread">
          <h2>Сохранённые турниры</h2>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Загрузить из файла
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            hidden
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
        </div>
        {error && <p className="error">{error}</p>}
        {tournaments === null ? (
          <p className="muted">Загрузка…</p>
        ) : tournaments.length === 0 ? (
          <p className="muted">Пока нет ни одного турнира.</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th>Название</th>
                <th>Дата</th>
                <th>Формат</th>
                <th>Команд</th>
                <th>Этап</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {tournaments.map((t) => (
                <tr key={t.id}>
                  <td>
                    <Link to={`/t/${t.id}`}>{t.name}</Link>
                  </td>
                  <td>{formatDate(t.date)}</td>
                  <td>{FORMAT_LABELS[t.format]}</td>
                  <td>{t.teams.length}</td>
                  <td>{STAGE_LABELS[t.stage]}</td>
                  <td className="actions">
                    <button type="button" onClick={() => exportTournament(t)}>
                      Сохранить в файл
                    </button>
                    <button type="button" className="danger" onClick={() => void onDelete(t)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

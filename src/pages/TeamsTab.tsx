import { Fragment, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { defaultSettings } from '../model/factory';
import { validateSettings } from '../model/settings';
import {
  autoName,
  emptyTeam,
  finalizeTeam,
  generateAnimalTeams,
  isBlankTeam,
  playersRequirement,
  realPlayers,
  resizeTeams,
  sortByRating,
  teamRating,
  validateRegistration,
} from '../model/team';
import {
  FORMAT_LABELS,
  FORMAT_PLAYERS,
  type Player,
  type Team,
  type Tournament,
  type TournamentFormat,
} from '../model/types';
import { readTeamsFile } from '../storage/readTeamsFile';
import { usePrint } from './usePrint';

const DEFAULT_TEST_TEAMS = 16;
const MAX_TEAMS = 512;

interface Props {
  tournament: Tournament;
  update: (change: (t: Tournament) => Tournament) => void;
}

function formatRating(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function rosterText(team: Team): string {
  const players = realPlayers(team);
  if (players.length === 0) return '—';
  return players.map((p) => `${p.name} (${formatRating(p.rating)})`).join(', ');
}

function RatingInput(props: { value: number; onChange: (n: number) => void; label: string }) {
  return (
    <input
      type="number"
      className="num small"
      min={0}
      step="any"
      placeholder="0"
      aria-label={props.label}
      value={props.value || ''}
      onChange={(e) => props.onChange(Number(e.target.value) || 0)}
    />
  );
}

/** Список команд для печати и для просмотра после подтверждения регистрации. */
function TeamList({ teams, withRoster }: { teams: Team[]; withRoster: boolean }) {
  return (
    <table className="table">
      <thead>
        <tr>
          <th className="narrow">№</th>
          <th>Команда</th>
          {withRoster && <th>Состав</th>}
          <th className="right">Рейтинг</th>
        </tr>
      </thead>
      <tbody>
        {teams.map((team, i) => (
          <tr key={team.id}>
            <td className="narrow">{i + 1}</td>
            <td>{team.name || autoName(team)}</td>
            {withRoster && <td className="muted">{rosterText(team)}</td>}
            <td className="right">{formatRating(teamRating(team))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function TeamsTab({ tournament, update }: Props) {
  const navigate = useNavigate();
  const { teams, stage, format } = tournament;
  const maxPlayers = FORMAT_PLAYERS[format].max;
  const [count, setCount] = useState(String(teams.length));
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);
  const { mode: printMode, print } = usePrint<'roster' | 'plain'>();

  useEffect(() => setCount(String(teams.length)), [teams.length]);

  const setTeams = (next: Team[]) => update((t) => ({ ...t, teams: next }));
  const patchTeam = (id: string, patch: Partial<Team>) =>
    setTeams(teams.map((team) => (team.id === id ? { ...team, ...patch } : team)));
  const hasData = teams.some((team) => !isBlankTeam(team));
  const confirmReplace = () =>
    !hasData || confirm('Уже введённые команды будут заменены. Продолжить?');

  function applyCount() {
    const n = Math.min(MAX_TEAMS, Math.max(0, Math.trunc(Number(count)) || 0));
    setCount(String(n));
    if (n === teams.length) return;
    const dropped = teams.slice(n).filter((team) => !isBlankTeam(team));
    if (dropped.length > 0 && !confirm(`Будут удалены заполненные команды: ${dropped.length}. Продолжить?`)) {
      setCount(String(teams.length));
      return;
    }
    setTeams(resizeTeams(teams, n));
  }

  function patchPlayer(team: Team, slot: number, patch: Partial<Player>) {
    const players = Array.from(
      { length: maxPlayers },
      (_, i) => team.players[i] ?? { name: '', rating: 0 },
    );
    players[slot] = { ...players[slot]!, ...patch };
    while (players.length > 0) {
      const last = players[players.length - 1]!;
      if (last.name.trim() !== '' || last.rating) break;
      players.pop();
    }
    patchTeam(team.id, { players });
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }

  async function onImport(file: File | undefined) {
    if (!file) return;
    try {
      const result = await readTeamsFile(file, format);
      setImportErrors(result.errors);
      if (result.errors.length === 0 && confirmReplace()) setTeams(result.teams);
    } catch (e) {
      setImportErrors([`Не удалось прочитать файл: ${e instanceof Error ? e.message : String(e)}`]);
    } finally {
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  function fillWithAnimals() {
    if (!confirmReplace()) return;
    setImportErrors([]);
    setTeams(generateAnimalTeams(teams.length || DEFAULT_TEST_TEAMS));
  }

  function confirmRegistration() {
    update((t) => {
      const finalized = t.teams.map(finalizeTeam);
      const kept = { ...t.settings, teamCount: finalized.length };
      const settings = validateSettings(kept).length === 0 ? kept : defaultSettings(finalized.length);
      return { ...t, teams: finalized, settings, stage: 'setup' };
    });
    navigate(`/t/${tournament.id}/setup`);
  }

  if (stage !== 'teams') {
    return (
      <section className="card">
        <div className="row spread">
          <h2>Зарегистрировано команд: {teams.length}</h2>
          <div className="row">
            <button type="button" onClick={() => print('roster')}>
              Печать с составом
            </button>
            <button type="button" onClick={() => print('plain')}>
              Печать без состава
            </button>
            {stage === 'setup' && (
              <button type="button" onClick={() => update((t) => ({ ...t, stage: 'teams' }))}>
                Вернуться к регистрации
              </button>
            )}
          </div>
        </div>
        <p className="muted no-print">
          Регистрация подтверждена. Команды показаны по убыванию рейтинга — в этом порядке они
          участвуют в жеребьёвке.
          {stage !== 'setup' && ' Турнир уже начат, состав участников изменить нельзя.'}
        </p>
        <TeamList teams={sortByRating(teams)} withRoster={printMode !== 'plain'} />
      </section>
    );
  }

  const errors = validateRegistration(teams, format);

  return (
    <>
      {printMode && (
        <section className="card print-only">
          <h2>Список команд</h2>
          <TeamList teams={teams.filter((team) => !isBlankTeam(team))} withRoster={printMode === 'roster'} />
        </section>
      )}
      <section className="card no-print">
        <h2>Регистрация команд</h2>
        <div className="row">
          <label className="field">
            <span>Формат турнира</span>
            <select
              value={format}
              onChange={(e) => update((t) => ({ ...t, format: e.target.value as TournamentFormat }))}
            >
              {(Object.keys(FORMAT_LABELS) as TournamentFormat[]).map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABELS[f]} ({playersRequirement(f)})
                </option>
              ))}
            </select>
          </label>
          <p className="muted grow">
            В составе команды {playersRequirement(format)}. Состав можно не указывать, тогда рейтинг задаётся
            для команды. Формат можно менять до подтверждения регистрации.
          </p>
        </div>
        <div className="row top-gap">
          <label className="field">
            <span>Количество команд</span>
            <input
              type="number"
              className="num"
              min={0}
              max={MAX_TEAMS}
              value={count}
              onChange={(e) => setCount(e.target.value)}
              onBlur={applyCount}
              onKeyDown={(e) => e.key === 'Enter' && applyCount()}
            />
          </label>
          <button type="button" onClick={() => fileInput.current?.click()}>
            Загрузить из файла
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.txt,.xlsx"
            hidden
            onChange={(e) => void onImport(e.target.files?.[0])}
          />
          <button type="button" onClick={fillWithAnimals}>
            Заполнить тестовыми командами
          </button>
          <button
            type="button"
            className="danger"
            disabled={teams.length === 0}
            onClick={() => confirm('Удалить все команды?') && setTeams([])}
          >
            Очистить
          </button>
        </div>
        <div className="row top-gap">
          <button type="button" disabled={teams.length < 2} onClick={() => setTeams(sortByRating(teams))}>
            Сортировать по рейтингу
          </button>
          <button type="button" disabled={!hasData} onClick={() => print('roster')}>
            Печать с составом
          </button>
          <button type="button" disabled={!hasData} onClick={() => print('plain')}>
            Печать без состава
          </button>
        </div>
        <details className="hint">
          <summary>Формат файла</summary>
          <p>
            CSV или Excel (.xlsx), одна строка — одна команда. Первая строка может быть заголовком.
            Подходят два варианта, их можно смешивать:
          </p>
          <ul>
            <li>
              <code>Команда; Рейтинг</code>
            </li>
            <li>
              <code>
                Команда
                {Array.from({ length: maxPlayers }, (_, i) => `; Игрок ${i + 1}; Рейтинг ${i + 1}`).join('')}
              </code>{' '}
              — в составе {playersRequirement(format)}; если название пустое, оно составляется из
              фамилий игроков.
            </li>
          </ul>
          <p>
            Рейтинг команды с составом — сумма рейтингов игроков
            {maxPlayers === 4 && ', для четырёх игроков — трёх лучших'}.
          </p>
        </details>
        {importErrors.length > 0 && (
          <ul className="error errors">
            {importErrors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="card no-print">
        {teams.length === 0 ? (
          <p className="muted">
            Укажите количество команд и заполните таблицу вручную, загрузите команды из файла или
            заполните тестовыми.
          </p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th className="narrow">№</th>
                <th>Команда</th>
                <th>Состав</th>
                <th>Рейтинг</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {teams.map((team, i) => {
                const withRoster = realPlayers(team).length > 0;
                const open = expanded.has(team.id);
                return (
                  <Fragment key={team.id}>
                    <tr className={open ? 'no-border' : undefined}>
                      <td className="narrow">{i + 1}</td>
                      <td>
                        <input
                          className="wide"
                          aria-label={`Название команды ${i + 1}`}
                          placeholder={withRoster ? 'По составу' : 'Название'}
                          value={team.name}
                          onChange={(e) => patchTeam(team.id, { name: e.target.value })}
                        />
                      </td>
                      <td className="muted">{rosterText(team)}</td>
                      <td>
                        {withRoster ? (
                          formatRating(teamRating(team))
                        ) : (
                          <RatingInput
                            label={`Рейтинг команды ${i + 1}`}
                            value={team.manualRating ?? 0}
                            onChange={(manualRating) => patchTeam(team.id, { manualRating })}
                          />
                        )}
                      </td>
                      <td className="actions">
                        <button type="button" aria-expanded={open} onClick={() => toggleExpanded(team.id)}>
                          {open ? 'Скрыть состав' : 'Состав'}
                        </button>
                        <button
                          type="button"
                          className="danger"
                          aria-label={`Удалить команду ${i + 1}`}
                          onClick={() => setTeams(teams.filter((x) => x.id !== team.id))}
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td />
                        <td colSpan={4}>
                          <div className="roster">
                            {Array.from({ length: maxPlayers }, (_, slot) => {
                              const player = team.players[slot] ?? { name: '', rating: 0 };
                              return (
                                <div key={slot} className="roster-player">
                                  <input
                                    aria-label={`Игрок ${slot + 1}`}
                                    placeholder={`Игрок ${slot + 1}`}
                                    value={player.name}
                                    onChange={(e) => patchPlayer(team, slot, { name: e.target.value })}
                                  />
                                  <RatingInput
                                    label={`Рейтинг игрока ${slot + 1}`}
                                    value={player.rating}
                                    onChange={(rating) => patchPlayer(team, slot, { rating })}
                                  />
                                </div>
                              );
                            })}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
        <div className="row top-gap">
          <button
            type="button"
            disabled={teams.length >= MAX_TEAMS}
            onClick={() => setTeams([...teams, emptyTeam()])}
          >
            + Добавить команду
          </button>
        </div>
      </section>

      <section className="card no-print">
        {teams.length > 0 && errors.length > 0 && (
          <ul className="error errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="row">
          <button type="button" className="primary" disabled={errors.length > 0} onClick={confirmRegistration}>
            Подтвердить регистрацию
          </button>
          <span className="muted">
            После подтверждения список команд фиксируется и открывается настройка турнира.
          </span>
        </div>
      </section>
    </>
  );
}

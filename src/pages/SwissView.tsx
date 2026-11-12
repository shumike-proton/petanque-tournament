import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MatchRow } from '../components/MatchRow';
import { DEFAULT_LANE_SHIFT, withSwissLanes } from '../model/lanes';
import { MAX_SCORE, hasAnyScore, isPlayed } from '../model/match';
import { swissQualifiedCups } from '../model/playoff';
import { validateSettings } from '../model/settings';
import { isRoundComplete, pairNextRound, swissStandings, type SwissRow } from '../model/swiss';
import { usePrint } from './usePrint';
import { TIEBREAKER_LABELS, type Id, type Match, type SwissSettings, type Tiebreaker, type Tournament } from '../model/types';

interface Props {
  tournament: Tournament;
  swiss: SwissSettings;
  update: (change: (t: Tournament) => Tournament) => void;
}

const TIEBREAKER_SHORT: Record<Tiebreaker, string> = {
  buchholz: 'Бухгольц',
  doubleBuchholz: 'Дв. Бухгольц',
  progress: 'Прогресс',
  diff: 'Разница',
};

function formatValue(row: SwissRow, tb: Tiebreaker): string {
  const value = row[tb];
  return tb === 'diff' && value > 0 ? `+${value}` : String(value);
}

export function SwissView({ tournament, swiss, update }: Props) {
  const { stage, settings, teams, swissRounds: rounds } = tournament;
  /** Выбранная закладка: номер тура или таблица; null — показывать текущий тур. */
  const [tab, setTab] = useState<number | 'table' | null>(null);
  const { print } = usePrint<'one'>();
  const names = new Map(teams.map((t) => [t.id, t.name]));
  const teamName = (id: Id | null) => (id ? (names.get(id) ?? '?') : '—');

  const pairRound = () =>
    update((t) => {
      if (t.settings.prelim.kind !== 'swiss') return t;
      const shift = t.settings.prelim.laneShift ?? DEFAULT_LANE_SHIFT;
      const next = withSwissLanes(pairNextRound(t.teams, t.swissRounds), shift);
      return { ...t, swissRounds: [...t.swissRounds, next], stage: 'prelim' };
    });

  if (stage === 'setup') {
    const errors = validateSettings(settings);
    return (
      <section className="card">
        <h2>Швейцарская система</h2>
        {errors.length > 0 ? (
          <p className="error">
            В настройках есть ошибки — исправьте их на вкладке{' '}
            <Link to={`/t/${tournament.id}/setup`}>«Настройка»</Link>.
          </p>
        ) : (
          <>
            <p>
              Команд: {teams.length}, туров: {swiss.rounds}. Пары составляются по рейтингу: в первом туре
              верхняя половина списка играет с нижней, в следующих — так же внутри групп с равным числом побед.
              {teams.length % 2 === 1 && ' Команд нечётное число — в каждом туре одна команда пропускает игру.'}
            </p>
            <div className="row">
              <button type="button" className="primary" onClick={pairRound}>
                Сформировать 1-й тур
              </button>
              <span className="muted">После этого настройки предварительного раунда изменить нельзя.</span>
            </div>
          </>
        )}
      </section>
    );
  }

  const locked = stage !== 'prelim';
  const last = rounds[rounds.length - 1];
  const lastComplete = last ? isRoundComplete(last) : false;
  const allDone = rounds.length >= swiss.rounds && lastComplete;
  const active: number | 'table' = tab ?? (allDone ? 'table' : rounds.length);
  const shownRound = typeof active === 'number' ? rounds.find((r) => r.number === active) : undefined;
  const standings = swissStandings(teams, rounds, swiss.tiebreakers);
  const cups = allDone ? swissQualifiedCups(standings, teams, settings.cups) : new Map<Id, string>();

  /** Цвет строки по кубку, в который выходит команда. */
  const cupClass = (cupName: string | undefined) => {
    const index = settings.cups.findIndex((c) => c.name === cupName);
    return index < 0 ? undefined : `cup-color-${index % 4}`;
  };

  const changeMatch = (matchId: Id, patch: Partial<Match>) =>
    update((t) => ({
      ...t,
      swissRounds: t.swissRounds.map((r) => ({
        ...r,
        matches: r.matches.map((m) => (m.id === matchId ? { ...m, ...patch } : m)),
      })),
    }));

  const laneShift = swiss.laneShift ?? DEFAULT_LANE_SHIFT;

  const setLaneShift = (value: number) =>
    update((t) =>
      t.settings.prelim.kind === 'swiss'
        ? { ...t, settings: { ...t.settings, prelim: { ...t.settings.prelim, laneShift: value } } }
        : t,
    );

  /** Заново нумерует дорожки последнего тура (ручные исправления в нём заменяются). */
  const renumberLanes = () =>
    update((t) => ({
      ...t,
      swissRounds: t.swissRounds.map((r, i) =>
        i === t.swissRounds.length - 1 && t.settings.prelim.kind === 'swiss'
          ? withSwissLanes(r, t.settings.prelim.laneShift ?? DEFAULT_LANE_SHIFT)
          : r,
      ),
    }));

  function nextRound() {
    pairRound();
    setTab(null);
  }

  function removeLastRound() {
    if (!last) return;
    if (last.matches.some(hasAnyScore) && !confirm(`Результаты тура ${last.number} будут удалены. Продолжить?`)) {
      return;
    }
    update((t) => {
      const swissRounds = t.swissRounds.slice(0, -1);
      return { ...t, swissRounds, stage: swissRounds.length === 0 ? 'setup' : t.stage };
    });
    setTab(null);
  }

  function fillRandom() {
    update((t) => ({
      ...t,
      swissRounds: t.swissRounds.map((r, i) =>
        i < t.swissRounds.length - 1
          ? r
          : {
              ...r,
              matches: r.matches.map((m) => {
                if (isPlayed(m)) return m;
                const loser = Math.floor(Math.random() * MAX_SCORE);
                return Math.random() < 0.5
                  ? { ...m, scoreA: MAX_SCORE, scoreB: loser }
                  : { ...m, scoreA: loser, scoreB: MAX_SCORE };
              }),
            },
      ),
    }));
  }

  return (
    <>
      <section className="card no-print">
        <div className="row spread">
          <h2>
            Швейцарская система{' '}
            <small className="subtitle">
              тур {rounds.length} из {swiss.rounds}
            </small>
          </h2>
          <button type="button" onClick={() => print('one')}>
            {active === 'table' ? 'Печать положения команд' : `Печать тура ${active}`}
          </button>
        </div>
        <div className="row top-gap">
          {!locked && (
            <>
              {!lastComplete && (
                <button type="button" onClick={fillRandom} title="Для проверки работы приложения">
                  Заполнить случайными результатами
                </button>
              )}
              {lastComplete && rounds.length < swiss.rounds && (
                <button type="button" className="primary" onClick={nextRound}>
                  Сформировать тур {rounds.length + 1}
                </button>
              )}
              <button type="button" className="danger" onClick={removeLastRound}>
                Удалить тур {rounds.length}
              </button>
            </>
          )}
        </div>
        {!locked && (
          <div className="row top-gap">
            <label className="field inline">
              <span>Сдвиг дорожек между турами</span>
              <input
                type="number"
                className="num small"
                min={0}
                value={laneShift}
                onChange={(e) => setLaneShift(Math.max(0, Math.trunc(Number(e.target.value)) || 0))}
              />
            </label>
            <button type="button" onClick={renumberLanes}>
              Пронумеровать дорожки тура {rounds.length}
            </button>
            <span className="muted">
              Дорожки назначаются автоматически при составлении тура; номер можно исправить вручную.
            </span>
          </div>
        )}
        {!lastComplete && !locked && (
          <p className="muted">
            Введите результаты тура {rounds.length} — после этого можно будет составить пары следующего тура.
            Результаты предыдущих туров изменить нельзя: для исправления удалите последующие туры.
          </p>
        )}
        {allDone && !locked && (
          <p className="success">
            Все туры сыграны. Сетки формируются на вкладке{' '}
            <Link to={`/t/${tournament.id}/playoff`}>«Плей-офф»</Link>.
          </p>
        )}
        {locked && (
          <p className="muted">Плей-офф уже начат — результаты предварительного раунда изменить нельзя.</p>
        )}
      </section>

      <nav className="tabs sub" aria-label="Туры">
        {rounds.map((round) => (
          <button
            key={round.number}
            type="button"
            className={active === round.number ? 'tab active' : 'tab'}
            aria-current={active === round.number}
            onClick={() => setTab(round.number)}
          >
            Тур {round.number}
            {isRoundComplete(round) && (
              <span className="done" title="Все игры сыграны">
                {' '}
                ✓
              </span>
            )}
          </button>
        ))}
        <button
          type="button"
          className={active === 'table' ? 'tab active' : 'tab'}
          aria-current={active === 'table'}
          onClick={() => setTab('table')}
        >
          Положение команд
        </button>
      </nav>

      {shownRound && (
        <section className="card group">
          <div className="row spread">
            <h2>Тур {shownRound.number}</h2>
            <span className="muted">{isRoundComplete(shownRound) ? 'Все игры сыграны' : 'Идут игры'}</span>
          </div>
          <div className="round">
            <div className="match match-head print-only-grid">
              <span className="match-team right">Команда</span>
              <span className="match-bye">Счёт</span>
              <span className="match-team">Команда</span>
              <span>Дорожка</span>
            </div>
            {shownRound.matches.map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                teamName={teamName}
                disabled={locked || shownRound !== last}
                onChange={(patch) => changeMatch(m.id, patch)}
              />
            ))}
            {shownRound.byeTeamId && (
              <div className="match" title="Техническая победа без изменения разницы">
                <span className="match-team right">{teamName(shownRound.byeTeamId)}</span>
                <span className="match-bye muted">—</span>
                <span className="match-team">Свободен</span>
              </div>
            )}
          </div>
        </section>
      )}

      {active === 'table' && (
        <section className="card">
          <h2>
            Положение команд{' '}
            <small className="subtitle">
              {rounds.every(isRoundComplete)
                ? `после тура ${rounds.length}`
                : `тур ${rounds.length} не завершён — учтены сыгранные игры`}
            </small>
          </h2>
          <table className="table">
            <thead>
              <tr>
                <th className="narrow">Место</th>
                <th>Команда</th>
                <th className="center" title="Количество побед">
                  Победы
                </th>
                {swiss.tiebreakers.map((tb) => (
                  <th key={tb} className="center" title={TIEBREAKER_LABELS[tb]}>
                    {TIEBREAKER_SHORT[tb]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {standings.map((row) => (
                <tr key={row.teamId} className={cupClass(cups.get(row.teamId))}>
                  <td className="narrow">{row.place}</td>
                  <td>{teamName(row.teamId)}</td>
                  <td className="center place">{row.wins}</td>
                  {swiss.tiebreakers.map((tb) => (
                    <td key={tb} className="center">
                      {formatValue(row, tb)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          {allDone && (
            <p className="legend">
              {settings.cups.map((cup) => (
                <span key={cup.name} className={`legend-item ${cupClass(cup.name)}`}>
                  {cup.name}
                </span>
              ))}
            </p>
          )}
          <p className="muted note">
            Места определяются по количеству побед, затем по показателям в порядке столбцов; при полном равенстве —
            по рейтингу.
          </p>
        </section>
      )}
    </>
  );
}

import { useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { MatchBox } from '../components/MatchBox';
import { prelimLaneCount, withPlayoffLanes } from '../model/lanes';
import { MAX_SCORE, hasAnyScore, isPlayed } from '../model/match';
import {
  allSeedLabels,
  bracketMatches,
  createBracket,
  cupPodium,
  isPrelimComplete,
  placeTeamInBracket,
  planPlayoff,
  resolveBracket,
  type PlanRow,
} from '../model/playoff';
import type { CupBracket, Id, Match, Tournament } from '../model/types';
import { usePrint } from './usePrint';

interface Props {
  tournament: Tournament;
  update: (change: (t: Tournament) => Tournament) => void;
}

/*
 * Масштаб сетки при печати: вся сетка должна поместиться на один альбомный лист A4.
 * Высоту определяет первый раунд; размеры ячеек при печати заданы в styles.css (.box).
 */
const PRINT_PAGE_HEIGHT = 650; // высота листа в пикселях за вычетом полей и заголовка турнира
const PRINT_MATCH_HEIGHT = 98; // ячейка игры с отступом
const PRINT_OVERHEAD = 110; // название кубка, заголовки раундов, примечание

function printZoom(bracket: CupBracket): number {
  const firstRound = bracket.rounds[0]?.matches.length ?? 1;
  const height = PRINT_OVERHEAD + Math.max(firstRound * PRINT_MATCH_HEIGHT, 260);
  return Math.min(1, PRINT_PAGE_HEIGHT / height);
}

function Bracket(props: {
  bracket: CupBracket;
  teamName: (id: Id) => string;
  onMatchChange: (matchId: Id, patch: Partial<Match>) => void;
  /** Пояснение к подписи в скобках после названия команды. */
  labelNote: string;
  /** Ручная правка: в первом раунде вместо счёта — выбор команд. */
  edit?: { options: { id: Id; text: string }[]; onPlace: (position: number, teamId: Id) => void };
}) {
  const { bracket, teamName, onMatchChange, labelNote, edit } = props;
  const podium = cupPodium(bracket);
  const nameWithLabel = (id: Id) => {
    const label = bracket.seedLabels?.[id];
    return label ? `${teamName(id)} (${label})` : teamName(id);
  };
  const lastRound = bracket.rounds.length - 1;

  return (
    <section className="card fit-page" style={{ '--print-zoom': printZoom(bracket) } as CSSProperties}>
      <h2>{bracket.name}</h2>
      <div className="bracket">
        {bracket.rounds.map((round, r) => (
          <div key={round.name} className="bracket-round">
            <h3>{round.name}</h3>
            <div className="bracket-matches">
              {round.matches.map((m, i) =>
                r === 0 && edit ? (
                  <div key={m.id} className="box">
                    <div className="box-head">
                      <span className="muted">Игра {i + 1}</span>
                    </div>
                    {[m.teamA, m.teamB].map((teamId, side) => (
                      <div key={side} className="box-row">
                        <select
                          className="box-select"
                          aria-label={`Игра ${i + 1}, команда ${side + 1}`}
                          value={teamId ?? ''}
                          onChange={(e) => edit.onPlace(2 * i + side, e.target.value)}
                        >
                          {teamId === null && <option value="">—</option>}
                          {edit.options.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.text}
                            </option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                ) : (
                  <MatchBox
                    key={m.id}
                    match={m}
                    teamName={r === 0 ? nameWithLabel : teamName}
                    onChange={(patch) => onMatchChange(m.id, patch)}
                  />
                ),
              )}
            </div>
            {r === lastRound && bracket.thirdPlaceMatch && (
              <div className="third-place">
                <h3>Матч за 3-е место</h3>
                <MatchBox
                  match={bracket.thirdPlaceMatch}
                  teamName={teamName}
                  placeholderA="Проигравший полуфинала"
                  placeholderB="Проигравший полуфинала"
                  onChange={(patch) => onMatchChange(bracket.thirdPlaceMatch!.id, patch)}
                />
              </div>
            )}
          </div>
        ))}

        <div className="bracket-round">
          <h3>Призёры</h3>
          <ol className="places">
            {(bracket.thirdPlaceMatch ? [1, 2, 3, 4] : [1, 2]).map((place) => {
              const entry = podium.find((p) => p.place === place);
              return (
                <li key={place} className={place === 1 && entry ? 'qualified' : undefined}>
                  <span className="place-number">{place}</span>
                  <span className={entry ? 'box-team' : 'box-team muted'}>
                    {entry ? teamName(entry.teamId) : '—'}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
      <p className="muted note">{labelNote}</p>
    </section>
  );
}

export function PlayoffTab({ tournament, update }: Props) {
  const { stage, settings, teams, groups, cups } = tournament;
  const [activeCup, setActiveCup] = useState(0);
  const [editing, setEditing] = useState(false);
  // Сетки печатаются в альбомной ориентации, список выхода в плей-офф — в книжной.
  const { mode: printMode, print } = usePrint<'one' | 'all'>(stage === 'playoff' || stage === 'finished');
  const prelim = settings.prelim;
  const names = new Map(teams.map((t) => [t.id, t.name]));
  const teamName = (id: Id) => names.get(id) ?? '?';

  const swiss = prelim.kind === 'swiss';
  if (!isPrelimComplete(tournament)) {
    return (
      <section className="card">
        <p className="muted">
          Сетки плей-офф формируются после того, как сыграны все игры на вкладке{' '}
          <Link to={`/t/${tournament.id}/prelim`}>«Предварительный раунд»</Link>.
        </p>
      </section>
    );
  }

  // ── Предварительный раунд сыгран, сетки ещё не сформированы ──
  if (stage === 'prelim') {
    const qualification = planPlayoff(tournament);
    const rest = qualification.rest;
    const declinedTeams = teams.filter((t) => t.declinedPlayoff);
    const groupOf = new Map(groups.flatMap((g) => g.teamIds.map((id) => [id, g.name] as const)));
    const columns = swiss ? 4 : 5;

    const setDeclined = (teamId: Id, declinedPlayoff: boolean) =>
      update((t) => ({
        ...t,
        teams: t.teams.map((team) => (team.id === teamId ? { ...team, declinedPlayoff } : team)),
      }));

    const createBrackets = () =>
      update((t) => {
        const plan = planPlayoff(t);
        if (plan.errors.length > 0) return t;
        const labels = allSeedLabels(t);
        const brackets = plan.cups.map((c) => createBracket(c.cup, c.seeds, labels));
        return { ...t, cups: withPlayoffLanes(brackets, prelimLaneCount(t)), stage: 'playoff' };
      });

    const declineBox = (teamId: Id, checked: boolean) => (
      <input
        type="checkbox"
        aria-label={`Отказ от плей-офф: ${teamName(teamId)}`}
        checked={checked}
        onChange={(e) => setDeclined(teamId, e.target.checked)}
      />
    );

    const teamRow = (row: PlanRow, number: number | null) => (
      <tr key={row.teamId} className={number === null ? 'muted' : undefined}>
        <td className="narrow">{number}</td>
        <td>{teamName(row.teamId)}</td>
        {!swiss && <td>{row.groupName}</td>}
        <td className="center">{row.place}</td>
        <td className="center">{declineBox(row.teamId, false)}</td>
      </tr>
    );

    return (
      <>
        <section className="card">
          <div className="row spread">
            <h2>Выход в плей-офф</h2>
            <button type="button" onClick={() => print('one')}>
              Печать списка
            </button>
          </div>
          <p className="muted">
            {swiss
              ? 'Команды распределены по кубкам по итоговым местам. Если команда отказывается от участия, отметьте её — все следующие команды сдвинутся на место выше.'
              : 'Команды распределены по кубкам по местам в группах и показаны по порядку групп. Если команда отказывается от участия, отметьте её — место займёт следующая команда её группы.'}
          </p>
          <table className="table">
            <thead>
              <tr>
                <th className="narrow">№</th>
                <th>Команда</th>
                {!swiss && <th>Группа</th>}
                <th className="center">{swiss ? 'Место' : 'Место в группе'}</th>
                <th className="center">Отказ</th>
              </tr>
            </thead>
            {qualification.cups.map((entry) => (
              <tbody key={entry.cup.name}>
                <tr className="section-row">
                  <td colSpan={columns}>
                    {entry.cup.name} — {entry.cup.size} команд
                  </td>
                </tr>
                {entry.rows.map((row, i) => teamRow(row, i + 1))}
              </tbody>
            ))}
            {rest.length > 0 && (
              <tbody>
                <tr className="section-row">
                  <td colSpan={columns}>Не вышли в плей-офф</td>
                </tr>
                {rest.map((row) => teamRow(row, null))}
              </tbody>
            )}
            {declinedTeams.length > 0 && (
              <tbody>
                <tr className="section-row">
                  <td colSpan={columns}>Отказались от участия</td>
                </tr>
                {declinedTeams.map((team) => (
                  <tr key={team.id} className="muted">
                    <td className="narrow" />
                    <td>{team.name}</td>
                    {!swiss && <td>{groupOf.get(team.id)}</td>}
                    <td className="center">—</td>
                    <td className="center">{declineBox(team.id, true)}</td>
                  </tr>
                ))}
              </tbody>
            )}
          </table>
        </section>

        <section className="card no-print">
          {qualification.errors.length > 0 && (
            <ul className="error errors">
              {qualification.errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <div className="row">
            <button
              type="button"
              className="primary"
              disabled={qualification.errors.length > 0}
              onClick={createBrackets}
            >
              Сформировать сетки плей-офф
            </button>
            <span className="muted">
              После этого результаты предварительного раунда и состав кубков изменить нельзя.
            </span>
          </div>
        </section>
      </>
    );
  }

  // ── Плей-офф идёт ──
  const allMatches = cups.flatMap(bracketMatches);
  const playedCount = allMatches.filter(isPlayed).length;
  const finished = playedCount === allMatches.length;
  const shown = cups[Math.min(activeCup, cups.length - 1)];
  const isCupDone = (cup: CupBracket) => bracketMatches(cup).every(isPlayed);
  const labelNote = swiss
    ? 'В первом раунде в скобках — место команды по итогам швейцарской системы.'
    : 'В первом раунде в скобках — группа и место команды в группе.';

  const changeMatch = (matchId: Id, patch: Partial<Match>) =>
    update((t) => ({
      ...t,
      cups: t.cups.map((cup) => {
        if (!bracketMatches(cup).some((m) => m.id === matchId)) return cup;
        const apply = (m: Match) => (m.id === matchId ? { ...m, ...patch } : m);
        return resolveBracket({
          ...cup,
          rounds: cup.rounds.map((r) => ({ ...r, matches: r.matches.map(apply) })),
          thirdPlaceMatch: cup.thirdPlaceMatch && apply(cup.thirdPlaceMatch),
        });
      }),
    }));

  // Список для ручной правки: все команды турнира с подписью места; сначала уже стоящие в сетках.
  const labels = allSeedLabels(tournament);
  const inBrackets = new Set(cups.flatMap((c) => c.seedTeamIds));
  const teamOptions = [...teams]
    .sort((a, b) => Number(inBrackets.has(b.id)) - Number(inBrackets.has(a.id)) || a.name.localeCompare(b.name, 'ru'))
    .map((team) => ({
      id: team.id,
      text: `${team.name}${labels[team.id] ? ` (${labels[team.id]})` : ''}${inBrackets.has(team.id) ? '' : ' — не в сетке'}`,
    }));

  const placeTeam = (cupIndex: number, position: number, teamId: Id) =>
    update((t) => {
      const allLabels = allSeedLabels(t);
      return {
        ...t,
        cups: placeTeamInBracket(t.cups, cupIndex, position, teamId).map((c) => ({ ...c, seedLabels: allLabels })),
      };
    });

  function cancelBrackets() {
    if (allMatches.some(hasAnyScore) && !confirm('Все результаты плей-офф будут удалены. Продолжить?')) return;
    update((t) => ({ ...t, cups: [], stage: 'prelim' }));
  }

  function fillRandom() {
    const fill = (m: Match): Match => {
      if (isPlayed(m) || m.teamA === null || m.teamB === null) return m;
      const loser = Math.floor(Math.random() * MAX_SCORE);
      return Math.random() < 0.5
        ? { ...m, scoreA: MAX_SCORE, scoreB: loser }
        : { ...m, scoreA: loser, scoreB: MAX_SCORE };
    };
    update((t) => ({
      ...t,
      cups: t.cups.map((cup) => {
        let current = cup;
        // Участники каждого следующего раунда появляются после результатов предыдущего.
        for (let i = 0; i <= cup.rounds.length; i++) {
          current = resolveBracket({
            ...current,
            rounds: current.rounds.map((r) => ({ ...r, matches: r.matches.map(fill) })),
            thirdPlaceMatch: current.thirdPlaceMatch && fill(current.thirdPlaceMatch),
          });
        }
        return current;
      }),
    }));
  }

  return (
    <>
      <section className="card no-print">
        <div className="row spread">
          <h2>
            Плей-офф{' '}
            <small className="subtitle">
              сыграно {playedCount} из {allMatches.length}
            </small>
          </h2>
          <div className="row">
            <button type="button" onClick={() => print('one')}>
              Печать сетки
            </button>
            {cups.length > 1 && (
              <button type="button" onClick={() => print('all')}>
                Печать всех сеток
              </button>
            )}
          </div>
        </div>
        <div className="row top-gap">
          <div className="row">
            {!finished && (
              <button type="button" onClick={fillRandom} title="Для проверки работы приложения">
                Заполнить случайными результатами
              </button>
            )}
            <button
              type="button"
              title="Дорожки назначаются автоматически при формировании сеток; кнопка заменяет ручные исправления"
              onClick={() => update((t) => ({ ...t, cups: withPlayoffLanes(t.cups, prelimLaneCount(t)) }))}
            >
              Пронумеровать дорожки
            </button>
            <button type="button" className={editing ? 'primary' : undefined} onClick={() => setEditing(!editing)}>
              {editing ? 'Закончить правку сетки' : 'Изменить сетку вручную'}
            </button>
            <button type="button" className="danger" onClick={cancelBrackets}>
              Расформировать сетки
            </button>
          </div>
        </div>
        {editing && (
          <p className="muted">
            Выберите команду для каждого места первого раунда. Если команда уже стоит в сетке этого или другого
            кубка, команды поменяются местами; команда «не в сетке» заменит прежнюю. Результаты игр, состав
            которых изменился, сбрасываются.
          </p>
        )}
        {finished && <p className="success">Все игры плей-офф сыграны. Турнир завершён.</p>}
      </section>

      {cups.length > 1 && (
        <nav className="tabs sub" aria-label="Кубки">
          {cups.map((cup, i) => (
            <button
              key={cup.name}
              type="button"
              className={cup === shown ? 'tab active' : 'tab'}
              aria-current={cup === shown}
              onClick={() => setActiveCup(i)}
            >
              {cup.name}
              {isCupDone(cup) && (
                <span className="done" title="Все игры сыграны">
                  {' '}
                  ✓
                </span>
              )}
            </button>
          ))}
        </nav>
      )}

      {shown && (
        <div className={printMode === 'all' ? 'screen-only' : undefined}>
          <Bracket
            key={shown.name}
            bracket={shown}
            teamName={teamName}
            onMatchChange={changeMatch}
            labelNote={labelNote}
            edit={
              editing
                ? { options: teamOptions, onPlace: (position, teamId) => placeTeam(cups.indexOf(shown), position, teamId) }
                : undefined
            }
          />
        </div>
      )}
      {printMode === 'all' && (
        <div className="print-only">
          {cups.map((cup) => (
            <div key={cup.name} className="print-page">
              <Bracket bracket={cup} teamName={teamName} onMatchChange={changeMatch} labelNote={labelNote} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

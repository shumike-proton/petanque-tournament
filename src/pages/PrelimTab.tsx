import { useState } from 'react';
import { Link } from 'react-router-dom';
import { MatchBox } from '../components/MatchBox';
import { MatchRow } from '../components/MatchRow';
import { frenchMatchView, frenchStandings, resolveFrenchGroup } from '../model/french';
import { createGroups, groupStandings, isGroupComplete } from '../model/groups';
import { withGroupLanes } from '../model/lanes';
import { MAX_SCORE, hasAnyScore, isPlayed } from '../model/match';
import { qualifiedCups } from '../model/playoff';
import { validateSettings } from '../model/settings';
import type { Group, Id, Match, Tournament } from '../model/types';
import { SwissView } from './SwissView';
import { usePrint } from './usePrint';

interface Props {
  tournament: Tournament;
  update: (change: (t: Tournament) => Tournament) => void;
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

function GroupHeader({ group }: { group: Group }) {
  return (
    <div className="row spread">
      <h2>{group.name}</h2>
      <span className="muted">{isGroupComplete(group) ? 'Все игры сыграны' : 'Идут игры'}</span>
    </div>
  );
}

interface CardProps {
  group: Group;
  teamName: (id: Id | null) => string;
  onMatchChange: (matchId: Id, patch: Partial<Match>) => void;
  disabled: boolean;
  /** Кубок плей-офф для прошедших команд. */
  cups: Map<Id, string>;
}

function CupBadge({ cup }: { cup: string | undefined }) {
  return cup ? <span className="badge">{cup}</span> : null;
}

function FrenchCard({ group, teamName, onMatchChange, disabled, cups }: CardProps) {
  const rows = frenchStandings(group);
  const rounds = [1, 2, 3];

  return (
    <section className="card group wide">
      <GroupHeader group={group} />
      {group.teamIds.length === 3 && (
        <p className="muted note">
          Группа из трёх команд: {teamName(group.teamIds[0] ?? null)} пропускает первый тур и сразу играет в
          матче победителей.
        </p>
      )}

      <div className="bracket">
        {rounds.map((round) => (
          <div key={round} className="bracket-round">
            <h3>Тур {round}</h3>
            <div className="bracket-matches">
              {group.matches
                .filter((m) => m.round === round)
                .map((m) => (
                  <MatchBox
                    key={m.id}
                    match={m}
                    {...frenchMatchView(group, m)}
                    teamName={teamName}
                    disabled={disabled}
                    onChange={(patch) => onMatchChange(m.id, patch)}
                  />
                ))}
            </div>
          </div>
        ))}

        <div className="bracket-round">
          <h3>Места</h3>
          <ol className="places">
            {group.teamIds.map((_, i) => {
              const row = rows.find((r) => r.place === i + 1);
              return (
                <li key={i} className={row && cups.has(row.teamId) ? 'qualified' : undefined}>
                  <span className="place-number">{i + 1}</span>
                  <span className={row ? 'box-team' : 'box-team muted'}>{row ? teamName(row.teamId) : '—'}</span>
                  {row && <CupBadge cup={cups.get(row.teamId)} />}
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}

function RoundRobinCard({ group, teamName, onMatchChange, disabled, cups }: CardProps) {
  const standings = groupStandings(group.teamIds, group.matches);
  const rowOf = new Map(standings.map((row) => [row.teamId, row]));
  const anyPlayed = standings.some((row) => row.played > 0);
  const rounds = [...new Set(group.matches.map((m) => m.round ?? 1))].sort((a, b) => a - b);

  /** Счёт игры между двумя командами с точки зрения первой. */
  function cell(rowId: Id, colId: Id) {
    const m = group.matches.find(
      (x) => (x.teamA === rowId && x.teamB === colId) || (x.teamA === colId && x.teamB === rowId),
    );
    if (!m || !isPlayed(m)) return null;
    const [own, other] = m.teamA === rowId ? [m.scoreA, m.scoreB] : [m.scoreB, m.scoreA];
    return <span className={own > other ? 'winner' : undefined}>{`${own}:${other}`}</span>;
  }

  return (
    <section className="card group">
      <GroupHeader group={group} />

      <table className="table cross">
        <thead>
          <tr>
            <th className="narrow">№</th>
            <th>Команда</th>
            {group.teamIds.map((id, i) => (
              <th key={id} className="center">
                {i + 1}
              </th>
            ))}
            <th className="center" title="Победы">
              В
            </th>
            <th className="center" title="Набранные и пропущенные очки">
              Очки
            </th>
            <th className="center" title="Разница очков">
              ±
            </th>
            <th className="center">Место</th>
          </tr>
        </thead>
        <tbody>
          {group.teamIds.map((rowId, i) => {
            const row = rowOf.get(rowId)!;
            return (
              <tr key={rowId} className={cups.has(rowId) ? 'qualified' : undefined}>
                <td className="narrow">{i + 1}</td>
                <td>
                  {teamName(rowId)}
                  <CupBadge cup={cups.get(rowId)} />
                </td>
                {group.teamIds.map((colId) => (
                  <td key={colId} className={rowId === colId ? 'center self' : 'center'}>
                    {rowId !== colId && cell(rowId, colId)}
                  </td>
                ))}
                <td className="center">{row.wins}</td>
                <td className="center">
                  {row.pointsFor}:{row.pointsAgainst}
                </td>
                <td className="center">{signed(row.diff)}</td>
                <td className="center place">{anyPlayed ? row.place : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {rounds.map((round) => (
        <div key={round} className="round">
          <h3>Тур {round}</h3>
          {group.matches
            .filter((m) => (m.round ?? 1) === round)
            .map((m) => (
              <MatchRow
                key={m.id}
                match={m}
                teamName={teamName}
                disabled={disabled}
                onChange={(patch) => onMatchChange(m.id, patch)}
              />
            ))}
        </div>
      ))}
    </section>
  );
}

export function PrelimTab({ tournament, update }: Props) {
  const { stage, settings, teams, groups } = tournament;
  const [activeGroup, setActiveGroup] = useState(0);
  const { mode: printMode, print } = usePrint<'one' | 'all'>(
    settings.prelim.kind === 'groups' && settings.prelim.groupType === 'french',
  );
  const prelim = settings.prelim;
  const names = new Map(teams.map((t) => [t.id, t.name]));
  const teamName = (id: Id | null) => (id ? (names.get(id) ?? '?') : '—');

  if (stage === 'teams') {
    return (
      <section className="card">
        <p className="muted">
          Сначала подтвердите регистрацию на вкладке <Link to={`/t/${tournament.id}/teams`}>«Команды»</Link>.
        </p>
      </section>
    );
  }

  if (prelim.kind === 'swiss') {
    return <SwissView tournament={tournament} swiss={prelim} update={update} />;
  }

  const french = prelim.groupType === 'french';
  const title = french ? 'Французские группы' : 'Круговые группы';

  const draw = () =>
    update((t) =>
      t.settings.prelim.kind === 'groups'
        ? { ...t, groups: withGroupLanes(createGroups(t.teams, t.settings.prelim)), stage: 'prelim' }
        : t,
    );

  if (stage === 'setup') {
    const errors = validateSettings(settings);
    return (
      <section className="card">
        <h2>{title}</h2>
        {errors.length > 0 ? (
          <p className="error">
            В настройках есть ошибки — исправьте их на вкладке{' '}
            <Link to={`/t/${tournament.id}/setup`}>«Настройка»</Link>.
          </p>
        ) : (
          <>
            <p>
              Команд: {teams.length}, групп: {prelim.groupCount}.{' '}
              {prelim.drawMode === 'seeded'
                ? `Жеребьёвка: сеяных команд — ${prelim.seededCount}, остальные распределяются случайно.`
                : 'Команды распределяются «змейкой» по рейтингу, без жеребьёвки.'}
            </p>
            <div className="row">
              <button type="button" className="primary" onClick={draw}>
                {prelim.drawMode === 'seeded' ? 'Провести жеребьёвку' : 'Сформировать группы'}
              </button>
              <span className="muted">После этого настройки предварительного раунда изменить нельзя.</span>
            </div>
          </>
        )}
      </section>
    );
  }

  const allMatches = groups.flatMap((g) => g.matches);
  const playedCount = allMatches.filter(isPlayed).length;
  const started = allMatches.some(hasAnyScore);
  const finished = playedCount === allMatches.length;
  const locked = stage !== 'prelim';

  const changeMatch = (matchId: Id, patch: Partial<Match>) =>
    update((t) => ({
      ...t,
      groups: t.groups.map((g) => {
        if (!g.matches.some((m) => m.id === matchId)) return g;
        const changed = { ...g, matches: g.matches.map((m) => (m.id === matchId ? { ...m, ...patch } : m)) };
        return french ? resolveFrenchGroup(changed) : changed;
      }),
    }));

  function cancelDraw() {
    if (started && !confirm('Все введённые результаты групп будут удалены. Продолжить?')) return;
    update((t) => ({ ...t, groups: [], stage: 'setup' }));
  }

  function fillRandom() {
    const fill = (g: Group): Group => ({
      ...g,
      matches: g.matches.map((m) => {
        if (isPlayed(m) || m.teamA === null || m.teamB === null) return m;
        const loser = Math.floor(Math.random() * MAX_SCORE);
        return Math.random() < 0.5
          ? { ...m, scoreA: MAX_SCORE, scoreB: loser }
          : { ...m, scoreA: loser, scoreB: MAX_SCORE };
      }),
    });
    // Во французской группе участники следующего тура появляются после результатов предыдущего.
    const fillAll = (g: Group): Group => {
      if (!french) return fill(g);
      let current = g;
      for (let round = 0; round < 3; round++) current = resolveFrenchGroup(fill(current));
      return current;
    };
    update((t) => ({ ...t, groups: t.groups.map(fillAll) }));
  }

  const shown = groups[Math.min(activeGroup, groups.length - 1)];
  const cups = qualifiedCups(groups, prelim.groupType, teams, settings.cups);
  const Card = french ? FrenchCard : RoundRobinCard;

  return (
    <>
      <section className="card no-print">
        <div className="row spread">
          <h2>
            {title}{' '}
            <small className="subtitle">
              сыграно {playedCount} из {allMatches.length}
            </small>
          </h2>
          <div className="row">
            <button type="button" onClick={() => print('one')}>
              Печать группы
            </button>
            <button type="button" onClick={() => print('all')}>
              Печать всех групп
            </button>
          </div>
        </div>
        <div className="row top-gap">
          {!locked && (
            <>
              {!finished && (
                <button type="button" onClick={fillRandom} title="Для проверки работы приложения">
                  Заполнить случайными результатами
                </button>
              )}
              {prelim.drawMode === 'seeded' && !started && (
                <button type="button" onClick={draw}>
                  Повторить жеребьёвку
                </button>
              )}
              <button
                type="button"
                title="Дорожки назначаются автоматически при жеребьёвке; кнопка заменяет ручные исправления"
                onClick={() => update((t) => ({ ...t, groups: withGroupLanes(t.groups) }))}
              >
                Пронумеровать дорожки
              </button>
              <button type="button" className="danger" onClick={cancelDraw}>
                {prelim.drawMode === 'seeded' ? 'Отменить жеребьёвку' : 'Расформировать группы'}
              </button>
            </>
          )}
        </div>
        {finished && !locked && (
          <p className="success">
            Все игры предварительного раунда сыграны. Сетки формируются на вкладке{' '}
            <Link to={`/t/${tournament.id}/playoff`}>«Плей-офф»</Link>.
          </p>
        )}
        {locked && (
          <p className="muted">Плей-офф уже начат — результаты предварительного раунда изменить нельзя.</p>
        )}
      </section>

      <nav className="tabs sub" aria-label="Группы">
        {groups.map((group, i) => (
          <button
            key={group.name}
            type="button"
            className={group === shown ? 'tab active' : 'tab'}
            aria-current={group === shown}
            onClick={() => setActiveGroup(i)}
          >
            {group.name}
            {isGroupComplete(group) && (
              <span className="done" title="Все игры сыграны">
                {' '}
                ✓
              </span>
            )}
          </button>
        ))}
      </nav>

      {shown && (
        <div className={printMode === 'all' ? 'screen-only' : undefined}>
          <Card group={shown} teamName={teamName} onMatchChange={changeMatch} disabled={locked} cups={cups} />
        </div>
      )}
      {printMode === 'all' && (
        <div className="print-only">
          {groups.map((group) => (
            <div key={group.name} className="print-page">
              <Card group={group} teamName={teamName} onMatchChange={changeMatch} disabled cups={cups} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}

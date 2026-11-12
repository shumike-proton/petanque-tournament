import { useEffect, useState, type RefObject } from 'react';
import { Link } from 'react-router-dom';
import {
  CUP_SIZES,
  cupName,
  groupSizes,
  recommendedSwissRounds,
  validateSettings,
} from '../model/settings';
import {
  TIEBREAKER_LABELS,
  type CupSettings,
  type GroupsSettings,
  type PrelimSettings,
  type SwissSettings,
  type Tiebreaker,
  type Tournament,
  type TournamentSettings,
} from '../model/types';

const ALL_TIEBREAKERS = Object.keys(TIEBREAKER_LABELS) as Tiebreaker[];

interface Props {
  tournament: Tournament;
  update: (change: (t: Tournament) => Tournament) => void;
  /**
   * Пока есть несохранённые изменения, здесь лежит функция «сохранить»: она возвращает false,
   * если настройки с ошибками и сохранить их нельзя. Страница турнира вызывает её при переходе
   * на другую вкладку.
   */
  unsavedRef: RefObject<(() => boolean) | null>;
}

function NumberInput(props: {
  value: number;
  onChange: (n: number) => void;
  min?: number;
  disabled?: boolean;
}) {
  return (
    <input
      type="number"
      className="num"
      min={props.min ?? 0}
      value={Number.isFinite(props.value) ? props.value : ''}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value === '' ? NaN : Math.trunc(Number(e.target.value)))}
    />
  );
}

function describeGroupSizes(sizes: number[]): string {
  const counts = new Map<number, number>();
  for (const size of sizes) counts.set(size, (counts.get(size) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([size, count]) => `${count} × ${size}`)
    .join(', ');
}

export function SetupTab({ tournament, update, unsavedRef }: Props) {
  const [draft, setDraft] = useState<TournamentSettings>(tournament.settings);
  const [saved, setSaved] = useState(true);

  // После начала предварительного раунда его настройки менять нельзя, после начала плей-офф — и кубки.
  const prelimLocked = tournament.stage !== 'setup';
  const cupsLocked = tournament.stage === 'playoff' || tournament.stage === 'finished';

  const errors = validateSettings(draft);

  function change(next: TournamentSettings) {
    setDraft(next);
    setSaved(false);
  }

  function setPrelimKind(kind: PrelimSettings['kind']) {
    if (kind === draft.prelim.kind) return;
    const prelim: PrelimSettings =
      kind === 'groups'
        ? { kind: 'groups', groupType: 'roundRobin', groupCount: 4, drawMode: 'seeded', seededCount: 0 }
        : {
            kind: 'swiss',
            rounds: recommendedSwissRounds(draft.teamCount),
            tiebreakers: ['buchholz', 'doubleBuchholz', 'diff'],
          };
    change({ ...draft, prelim });
  }

  function save(): boolean {
    if (errors.length > 0) return false;
    update((t) => ({ ...t, settings: draft }));
    setSaved(true);
    return true;
  }

  useEffect(() => {
    unsavedRef.current = saved
      ? null
      : () => {
          if (save()) return true;
          alert('В настройках есть ошибки — исправьте их, чтобы сохранить.');
          return false;
        };
    return () => {
      unsavedRef.current = null;
    };
  });

  if (tournament.stage === 'teams') {
    return (
      <section className="card">
        <p className="muted">
          Настройка турнира откроется после подтверждения регистрации на вкладке{' '}
          <Link to={`/t/${tournament.id}/teams`}>«Команды»</Link>.
        </p>
      </section>
    );
  }

  const p = draft.prelim;
  const patchGroups = (patch: Partial<GroupsSettings>) =>
    p.kind === 'groups' && change({ ...draft, prelim: { ...p, ...patch } });
  const patchSwiss = (patch: Partial<SwissSettings>) =>
    p.kind === 'swiss' && change({ ...draft, prelim: { ...p, ...patch } });
  const setCups = (cups: CupSettings[]) => change({ ...draft, cups });
  const patchCup = (index: number, patch: Partial<CupSettings>) =>
    setCups(draft.cups.map((c, i) => (i === index ? { ...c, ...patch } : c)));

  function moveTiebreaker(index: number, delta: number) {
    if (p.kind !== 'swiss') return;
    const list = [...p.tiebreakers];
    const target = index + delta;
    const a = list[index];
    const b = list[target];
    if (a === undefined || b === undefined) return;
    list[index] = b;
    list[target] = a;
    patchSwiss({ tiebreakers: list });
  }

  const playoffTeams = draft.cups.reduce((sum, c) => sum + c.size, 0);

  return (
    <>
      <section className="card">
        <h2>Предварительный раунд</h2>
        {prelimLocked && (
          <p className="muted">Предварительный раунд уже начат — его настройки изменить нельзя.</p>
        )}
        <fieldset disabled={prelimLocked} className="form">
          <div className="field">
            <span>Количество команд</span>
            <strong className="value">{draft.teamCount}</strong>
          </div>

          <div className="field">
            <span>Система</span>
            <div className="choices">
              <label>
                <input type="radio" checked={p.kind === 'groups'} onChange={() => setPrelimKind('groups')} />
                Группы
              </label>
              <label>
                <input type="radio" checked={p.kind === 'swiss'} onChange={() => setPrelimKind('swiss')} />
                Швейцарская система
              </label>
            </div>
          </div>

          {p.kind === 'groups' && (
            <>
              <div className="field">
                <span>Тип групп</span>
                <div className="choices">
                  <label>
                    <input
                      type="radio"
                      checked={p.groupType === 'roundRobin'}
                      onChange={() => patchGroups({ groupType: 'roundRobin' })}
                    />
                    Круговые
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={p.groupType === 'french'}
                      onChange={() => patchGroups({ groupType: 'french' })}
                    />
                    Французские (по 3–4 команды, до двух побед или поражений)
                  </label>
                </div>
              </div>

              <label className="field">
                <span>Количество групп</span>
                <NumberInput value={p.groupCount} min={1} onChange={(groupCount) => patchGroups({ groupCount })} />
                {groupSizes(draft.teamCount, p.groupCount).length > 0 && (
                  <small>
                    Группы × команды: {describeGroupSizes(groupSizes(draft.teamCount, p.groupCount))}
                  </small>
                )}
              </label>

              <div className="field">
                <span>Распределение по группам</span>
                <div className="choices column">
                  <label>
                    <input
                      type="radio"
                      checked={p.drawMode === 'seeded'}
                      onChange={() => patchGroups({ drawMode: 'seeded' })}
                    />
                    Жеребьёвка: сеяные случайно по разным группам, остальные случайно
                  </label>
                  <label>
                    <input
                      type="radio"
                      checked={p.drawMode === 'snake'}
                      onChange={() => patchGroups({ drawMode: 'snake' })}
                    />
                    Без жеребьёвки: все команды «змейкой» по рейтингу
                  </label>
                </div>
              </div>

              {p.drawMode === 'seeded' && (
                <label className="field">
                  <span>Количество сеяных команд</span>
                  <NumberInput value={p.seededCount} onChange={(seededCount) => patchGroups({ seededCount })} />
                  <small>Лучшие по рейтингу; делится на количество групп. 0 — полностью случайная жеребьёвка.</small>
                </label>
              )}
            </>
          )}

          {p.kind === 'swiss' && (
            <>
              <label className="field">
                <span>Количество туров</span>
                <NumberInput value={p.rounds} min={1} onChange={(rounds) => patchSwiss({ rounds })} />
                <small>
                  Для {draft.teamCount} команд обычно играют {recommendedSwissRounds(draft.teamCount)}.
                </small>
              </label>

              <div className="field">
                <span>Показатели для определения мест (по порядку применения)</span>
                <ol className="ordered">
                  <li>
                    <span className="grow">Количество побед</span>
                    <small>всегда первый</small>
                  </li>
                  {p.tiebreakers.map((tb, i) => (
                    <li key={tb}>
                      <span className="grow">{TIEBREAKER_LABELS[tb]}</span>
                      <button
                        type="button"
                        aria-label={`Выше: ${TIEBREAKER_LABELS[tb]}`}
                        disabled={i === 0}
                        onClick={() => moveTiebreaker(i, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        aria-label={`Ниже: ${TIEBREAKER_LABELS[tb]}`}
                        disabled={i === p.tiebreakers.length - 1}
                        onClick={() => moveTiebreaker(i, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        aria-label={`Убрать: ${TIEBREAKER_LABELS[tb]}`}
                        onClick={() => patchSwiss({ tiebreakers: p.tiebreakers.filter((x) => x !== tb) })}
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ol>
                <div className="row">
                  {ALL_TIEBREAKERS.filter((tb) => !p.tiebreakers.includes(tb)).map((tb) => (
                    <button
                      key={tb}
                      type="button"
                      onClick={() => patchSwiss({ tiebreakers: [...p.tiebreakers, tb] })}
                    >
                      + {TIEBREAKER_LABELS[tb]}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </fieldset>
      </section>

      <section className="card">
        <h2>Плей-офф</h2>
        {cupsLocked && <p className="muted">Плей-офф уже начат — кубки изменить нельзя.</p>}
        <fieldset disabled={cupsLocked} className="form">
          <table className="table">
            <thead>
              <tr>
                <th>Кубок</th>
                <th>Команд</th>
                <th>Места</th>
                <th>Матч за 3-е место</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {draft.cups.map((cup, i) => {
                const from = draft.cups.slice(0, i).reduce((sum, c) => sum + c.size, 0) + 1;
                return (
                  <tr key={i}>
                    <td>
                      <input
                        aria-label="Название кубка"
                        value={cup.name}
                        onChange={(e) => patchCup(i, { name: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        aria-label="Количество команд в кубке"
                        value={cup.size}
                        onChange={(e) => {
                          const size = Number(e.target.value);
                          patchCup(i, { size, thirdPlaceMatch: size >= 4 && cup.thirdPlaceMatch });
                        }}
                      >
                        {CUP_SIZES.map((size) => (
                          <option key={size} value={size}>
                            {size}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      {from}–{from + cup.size - 1}
                    </td>
                    <td>
                      <input
                        type="checkbox"
                        aria-label="Матч за 3-е место"
                        checked={cup.thirdPlaceMatch}
                        disabled={cup.size < 4}
                        onChange={(e) => patchCup(i, { thirdPlaceMatch: e.target.checked })}
                      />
                    </td>
                    <td className="actions">
                      <button
                        type="button"
                        className="danger"
                        disabled={draft.cups.length === 1}
                        onClick={() => setCups(draft.cups.filter((_, j) => j !== i))}
                      >
                        Убрать
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="row spread">
            <button
              type="button"
              onClick={() => {
                const names = new Set(draft.cups.map((c) => c.name.trim()));
                let index = draft.cups.length;
                while (names.has(cupName(index))) index++;
                const last = draft.cups[draft.cups.length - 1];
                setCups([...draft.cups, { name: cupName(index), size: last?.size ?? 8, thirdPlaceMatch: false }]);
              }}
            >
              + Добавить кубок
            </button>
            <span className="muted">
              В плей-офф выходит {playoffTeams} из {draft.teamCount} команд
            </span>
          </div>
        </fieldset>
      </section>

      <section className="card">
        {errors.length > 0 && (
          <ul className="error errors">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        )}
        <div className="row">
          <button
            type="button"
            className="primary"
            disabled={errors.length > 0 || saved || cupsLocked}
            onClick={save}
          >
            Сохранить настройки
          </button>
          {saved ? (
            <span className="muted">Настройки сохранены.</span>
          ) : (
            <span className="muted">Есть несохранённые изменения.</span>
          )}
        </div>
      </section>
    </>
  );
}

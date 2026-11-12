import { useRef, type MouseEvent } from 'react';
import { Link, NavLink, useParams } from 'react-router-dom';
import { FORMAT_LABELS, type Stage } from '../model/types';
import { exportTournament } from '../storage/db';
import { PlayoffTab } from './PlayoffTab';
import { PrelimTab } from './PrelimTab';
import { SetupTab } from './SetupTab';
import { TeamsTab } from './TeamsTab';
import { useTournament } from './useTournament';

const TABS = [
  { key: 'teams', label: 'Команды' },
  { key: 'setup', label: 'Настройка' },
  { key: 'prelim', label: 'Предварительный раунд' },
  { key: 'playoff', label: 'Плей-офф' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

/** Вкладка, которая открывается по умолчанию на текущем этапе турнира. */
const STAGE_TAB: Record<Stage, TabKey> = {
  teams: 'teams',
  setup: 'setup',
  prelim: 'prelim',
  playoff: 'playoff',
  finished: 'playoff',
};

export function TournamentPage() {
  const { id, tab } = useParams();
  const { state, update } = useTournament(id);
  const unsavedSettings = useRef<(() => boolean) | null>(null);

  /** Переход к турниру с несохранёнными настройками: предлагаем сохранить, иначе остаёмся. */
  function guardUnsavedSettings(e: MouseEvent, target: string) {
    const save = unsavedSettings.current;
    if (!save || (target !== 'prelim' && target !== 'playoff')) return;
    const agreed = confirm('Настройки турнира не сохранены. Сохранить их и перейти?');
    if (!agreed || !save()) e.preventDefault();
  }

  if (state.status === 'loading') {
    return (
      <div className="page">
        <p className="muted">Загрузка…</p>
      </div>
    );
  }
  if (state.status === 'missing') {
    return (
      <div className="page">
        <p>Турнир не найден.</p>
        <Link to="/">К списку турниров</Link>
      </div>
    );
  }

  const t = state.tournament;
  const active: TabKey = TABS.find((x) => x.key === tab)?.key ?? STAGE_TAB[t.stage];

  return (
    <div className="page">
      <header className="page-header">
        <Link to="/" className="back">
          ← Все турниры
        </Link>
        <div className="row spread">
          <h1>
            {t.name}{' '}
            <small className="subtitle">
              {FORMAT_LABELS[t.format]} · {t.date.split('-').reverse().join('.')}
            </small>
          </h1>
          <button type="button" onClick={() => exportTournament(t)}>
            Сохранить в файл
          </button>
        </div>
      </header>

      <nav className="tabs">
        {TABS.map((item) => (
          <NavLink
            key={item.key}
            to={`/t/${t.id}/${item.key}`}
            className={item.key === active ? 'tab active' : 'tab'}
            onClick={(e) => guardUnsavedSettings(e, item.key)}
          >
            {item.label}
          </NavLink>
        ))}
      </nav>

      {active === 'teams' ? (
        <TeamsTab tournament={t} update={update} />
      ) : active === 'setup' ? (
        <SetupTab tournament={t} update={update} unsavedRef={unsavedSettings} />
      ) : active === 'prelim' ? (
        <PrelimTab tournament={t} update={update} />
      ) : (
        <PlayoffTab tournament={t} update={update} />
      )}
    </div>
  );
}

import { MAX_SCORE, isPlayed, scoreProblem } from '../model/match';
import type { Id, Match } from '../model/types';

interface Props {
  match: Match;
  teamName: (id: Id | null) => string;
  onChange: (patch: Partial<Match>) => void;
  disabled?: boolean;
  /** Подпись над игрой, например «Матч победителей». */
  label?: string;
}

function parseScore(text: string): number | null {
  return text.trim() === '' ? null : Number(text);
}

/** Строка игры: команды, ввод счёта и номер дорожки. */
export function MatchRow({ match, teamName, onChange, disabled, label }: Props) {
  const problem = scoreProblem(match);
  const played = isPlayed(match);
  const aWon = played && match.scoreA > match.scoreB;
  const bWon = played && match.scoreB > match.scoreA;
  const nameA = teamName(match.teamA);
  const nameB = teamName(match.teamB);

  return (
    <div className="match">
      {label && <span className="match-label muted">{label}</span>}
      <span className={aWon ? 'match-team right winner' : 'match-team right'}>{nameA}</span>
      <input
        type="number"
        className={problem ? 'score invalid' : 'score'}
        min={0}
        max={MAX_SCORE}
        aria-label={`Счёт: ${nameA}`}
        value={match.scoreA ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ scoreA: parseScore(e.target.value) })}
      />
      <span className="muted">:</span>
      <input
        type="number"
        className={problem ? 'score invalid' : 'score'}
        min={0}
        max={MAX_SCORE}
        aria-label={`Счёт: ${nameB}`}
        value={match.scoreB ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ scoreB: parseScore(e.target.value) })}
      />
      <span className={bWon ? 'match-team winner' : 'match-team'}>{nameB}</span>
      <input
        className="lane"
        aria-label={`Дорожка: ${nameA} — ${nameB}`}
        placeholder="дор."
        value={match.lane ?? ''}
        disabled={disabled}
        onChange={(e) => onChange({ lane: e.target.value || undefined })}
      />
      {problem && <span className="match-problem error">{problem}</span>}
    </div>
  );
}

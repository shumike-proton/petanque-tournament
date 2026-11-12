import { MAX_SCORE, isPlayed, scoreProblem } from '../model/match';
import type { Id, Match } from '../model/types';

interface Props {
  match: Match;
  teamName: (id: Id) => string;
  onChange: (patch: Partial<Match>) => void;
  disabled?: boolean;
  /** Подпись над игрой, например «Матч победителей». */
  label?: string;
  /** Что показывать, пока участник не определён. */
  placeholderA?: string;
  placeholderB?: string;
}

function parseScore(text: string): number | null {
  return text.trim() === '' ? null : Number(text);
}

/** Игра в виде ячейки сетки: две строки «команда — счёт», подпись и номер дорожки. */
export function MatchBox({ match, teamName, onChange, disabled, label, placeholderA, placeholderB }: Props) {
  const problem = scoreProblem(match);
  const played = isPlayed(match);
  const ready = match.teamA !== null && match.teamB !== null;
  const sides = [
    { key: 'scoreA' as const, team: match.teamA, score: match.scoreA, placeholder: placeholderA, won: played && match.scoreA > match.scoreB },
    { key: 'scoreB' as const, team: match.teamB, score: match.scoreB, placeholder: placeholderB, won: played && match.scoreB > match.scoreA },
  ];

  return (
    <div className="box">
      <div className="box-head">
        <span className="muted">{label}</span>
        <input
          className="lane"
          aria-label="Дорожка"
          placeholder="дор."
          value={match.lane ?? ''}
          disabled={disabled}
          onChange={(e) => onChange({ lane: e.target.value || undefined })}
        />
      </div>
      {sides.map((side) => {
        const name = side.team ? teamName(side.team) : (side.placeholder ?? '—');
        return (
          <div key={side.key} className={side.won ? 'box-row winner' : 'box-row'}>
            <span className={side.team ? 'box-team' : 'box-team muted'} title={name}>
              {name}
            </span>
            <input
              type="number"
              className={problem ? 'score invalid' : 'score'}
              min={0}
              max={MAX_SCORE}
              aria-label={`Счёт: ${name}`}
              value={side.score ?? ''}
              disabled={disabled || !ready}
              onChange={(e) => onChange({ [side.key]: parseScore(e.target.value) })}
            />
          </div>
        );
      })}
      {problem && <div className="box-problem error">{problem}</div>}
    </div>
  );
}

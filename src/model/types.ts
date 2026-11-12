// Модель данных турнира. Всё состояние турнира — один сериализуемый объект Tournament.

export type Id = string;

export interface Player {
  name: string;
  rating: number;
}

/** Формат турнира определяет число игроков в команде. */
export type TournamentFormat = 'tete' | 'doublet' | 'triplet';

export const FORMAT_LABELS: Record<TournamentFormat, string> = {
  tete: 'Теты',
  doublet: 'Дуплеты',
  triplet: 'Триплеты',
};

/** Допустимое число игроков: теты — 1, дуплеты — 2, триплеты — 3 или 4 (с запасным). */
export const FORMAT_PLAYERS: Record<TournamentFormat, { min: number; max: number }> = {
  tete: { min: 1, max: 1 },
  doublet: { min: 2, max: 2 },
  triplet: { min: 3, max: 4 },
};

/** Команда. Число игроков задаёт формат турнира; рейтинг считается функцией teamRating. */
export interface Team {
  id: Id;
  name: string;
  players: Player[];
  /** Рейтинг команды, заданный вручную; используется, если состав не указан. */
  manualRating?: number;
  /** Команда отказалась от участия в плей-офф — следующие места сдвигаются. */
  declinedPlayoff?: boolean;
}

/** Дополнительные показатели швейцарки. Количество побед всегда применяется первым. */
export type Tiebreaker = 'buchholz' | 'doubleBuchholz' | 'progress' | 'diff';

export const TIEBREAKER_LABELS: Record<Tiebreaker, string> = {
  buchholz: 'Коэффициент Бухгольца',
  doubleBuchholz: 'Двойной коэффициент Бухгольца',
  progress: 'Коэффициент прогресса',
  diff: 'Разница',
};

export type GroupType = 'roundRobin' | 'french';

/**
 * seeded — сеяные случайно по разным группам, остальные случайно;
 * snake — все команды «змейкой» по рейтингу, без жеребьёвки.
 */
export type DrawMode = 'seeded' | 'snake';

export interface GroupsSettings {
  kind: 'groups';
  groupType: GroupType;
  groupCount: number;
  drawMode: DrawMode;
  seededCount: number;
}

export interface SwissSettings {
  kind: 'swiss';
  rounds: number;
  /** Порядок применения после количества побед. */
  tiebreakers: Tiebreaker[];
  /** На сколько дорожек сдвигается каждый следующий тур при автонумерации (по умолчанию 3). */
  laneShift?: number;
}

export type PrelimSettings = GroupsSettings | SwissSettings;

export interface CupSettings {
  name: string;
  /** Количество команд: степень двойки (2, 4, 8, 16, 32…). */
  size: number;
  thirdPlaceMatch: boolean;
}

export interface TournamentSettings {
  /** Равно числу команд; фиксируется при подтверждении регистрации. */
  teamCount: number;
  prelim: PrelimSettings;
  cups: CupSettings[];
}

/**
 * Игры французской группы: r1a и r1b — первый тур, winners — матч победителей,
 * losers — матч проигравших, barrage — стыковой матч за второе место.
 */
export type FrenchSlot = 'r1a' | 'r1b' | 'winners' | 'losers' | 'barrage';

/** Игра. Ничьих не бывает, очки каждой команды 0–13. */
export interface Match {
  id: Id;
  teamA: Id | null;
  teamB: Id | null;
  scoreA: number | null;
  scoreB: number | null;
  /** Номер тура внутри группы. */
  round?: number;
  /** Роль игры во французской группе. */
  slot?: FrenchSlot;
  /** Номер дорожки (для печати). */
  lane?: string;
}

export interface Group {
  name: string;
  teamIds: Id[];
  matches: Match[];
}

export interface SwissRound {
  number: number;
  matches: Match[];
  /** Команда, пропускающая тур (техническая победа без разницы и без Бухгольца соперникам). */
  byeTeamId: Id | null;
}

export interface PlayoffRound {
  name: string;
  matches: Match[];
}

export interface CupBracket {
  name: string;
  /** Команды в порядке посева. */
  seedTeamIds: Id[];
  /** Подпись команды в сетке: после групп — группа и место («A1»), после швейцарки — место. */
  seedLabels?: Record<Id, string>;
  rounds: PlayoffRound[];
  thirdPlaceMatch: Match | null;
}

/**
 * Этапы по порядку: teams — регистрация команд; setup — регистрация подтверждена,
 * настраивается турнир; prelim — предварительный раунд; playoff; finished.
 */
export type Stage = 'teams' | 'setup' | 'prelim' | 'playoff' | 'finished';

export interface Tournament {
  id: Id;
  name: string;
  date: string;
  format: TournamentFormat;
  createdAt: string;
  updatedAt: string;
  stage: Stage;
  settings: TournamentSettings;
  teams: Team[];
  groups: Group[];
  swissRounds: SwissRound[];
  cups: CupBracket[];
}

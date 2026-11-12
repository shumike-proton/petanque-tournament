import { newId } from './factory';
import { MIN_TEAMS } from './settings';
import { FORMAT_LABELS, FORMAT_PLAYERS, type Player, type Team, type TournamentFormat } from './types';

/** В зачёт рейтинга команды идут не более трёх лучших игроков. */
const RATED_PLAYERS = 3;

type TeamData = Pick<Team, 'players' | 'manualRating'>;

function isBlankPlayer(p: Player): boolean {
  return p.name.trim() === '' && !p.rating;
}

/** Игроки без пустых строк редактора. */
export function realPlayers(team: Pick<Team, 'players'>): Player[] {
  return team.players.filter((p) => !isBlankPlayer(p));
}

/**
 * Рейтинг команды: сумма рейтингов игроков, для четырёх игроков — сумма трёх лучших.
 * Если состав не указан, берётся рейтинг, заданный для команды вручную.
 */
export function teamRating(team: TeamData): number {
  const players = realPlayers(team);
  if (players.length === 0) return team.manualRating ?? 0;
  return players
    .map((p) => p.rating)
    .sort((a, b) => b - a)
    .slice(0, RATED_PLAYERS)
    .reduce((sum, r) => sum + r, 0);
}

export function emptyTeam(): Team {
  return { id: newId(), name: '', players: [] };
}

export function isBlankTeam(team: Team): boolean {
  return team.name.trim() === '' && realPlayers(team).length === 0 && !team.manualRating;
}

/** Название для команд без названия: имя единственного игрока или фамилии игроков. */
export function autoName(team: Pick<Team, 'players'>): string {
  const players = realPlayers(team);
  if (players.length === 1) return players[0]!.name.trim();
  return players
    .map((p) => p.name.trim().split(/\s+/)[0] ?? '')
    .filter(Boolean)
    .join(' / ');
}

/** Меняет длину списка: добавляет пустые команды в конец или убирает последние. */
export function resizeTeams(teams: Team[], count: number): Team[] {
  if (count <= teams.length) return teams.slice(0, Math.max(0, count));
  return [...teams, ...Array.from({ length: count - teams.length }, emptyTeam)];
}

/** Убирает пустые строки состава и подставляет название командам без названия. */
export function finalizeTeam(team: Team): Team {
  const players = realPlayers(team).map((p) => ({ name: p.name.trim(), rating: p.rating }));
  return { ...team, name: team.name.trim() || autoName({ players }), players };
}

/** Требование формата к числу игроков, например «3–4 игрока». */
export function playersRequirement(format: TournamentFormat): string {
  const { min, max } = FORMAT_PLAYERS[format];
  return min === max ? `${min} ${min === 1 ? 'игрок' : 'игрока'}` : `${min}–${max} игрока`;
}

/** Состав либо не указан (тогда рейтинг задаётся для команды), либо соответствует формату. */
export function rosterFitsFormat(team: Pick<Team, 'players'>, format: TournamentFormat): boolean {
  const count = realPlayers(team).length;
  const { min, max } = FORMAT_PLAYERS[format];
  return count === 0 || (count >= min && count <= max);
}

/** Проверка перед подтверждением регистрации. Пустой список — всё в порядке. */
export function validateRegistration(teams: Team[], format: TournamentFormat): string[] {
  const errors: string[] = [];
  if (teams.length < MIN_TEAMS) {
    errors.push(`Для турнира нужно не меньше ${MIN_TEAMS} команд.`);
  }
  const finalized = teams.map(finalizeTeam);
  const unnamed = finalized.flatMap((t, i) => (t.name ? [] : [i + 1]));
  if (unnamed.length > 0) {
    errors.push(`Не заполнены команды в строках: ${unnamed.join(', ')}.`);
  }
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  for (const t of finalized) {
    if (!t.name) continue;
    const key = t.name.toLowerCase();
    if (seen.has(key)) duplicates.add(t.name);
    seen.add(key);
  }
  if (duplicates.size > 0) {
    errors.push(`Названия команд повторяются: ${[...duplicates].join(', ')}.`);
  }
  const badRoster = finalized.flatMap((t, i) => (rosterFitsFormat(t, format) ? [] : [i + 1]));
  if (badRoster.length > 0) {
    errors.push(
      `${FORMAT_LABELS[format]}: в составе должно быть ${playersRequirement(format)} — строки: ${badRoster.join(', ')}.`,
    );
  }
  const badRating = finalized.flatMap((t, i) => {
    const ratings = [t.manualRating ?? 0, ...t.players.map((p) => p.rating)];
    return ratings.every((r) => Number.isFinite(r) && r >= 0) ? [] : [i + 1];
  });
  if (badRating.length > 0) {
    errors.push(`Рейтинг должен быть неотрицательным числом — строки: ${badRating.join(', ')}.`);
  }
  return errors;
}

/** Команды по убыванию рейтинга; при равенстве сохраняется порядок ввода. */
export function sortByRating(teams: Team[]): Team[] {
  return teams
    .map((team, index) => ({ team, index, rating: teamRating(team) }))
    .sort((a, b) => b.rating - a.rating || a.index - b.index)
    .map((x) => x.team);
}

const ANIMALS = [
  'Аист', 'Альбатрос', 'Барсук', 'Белка', 'Бизон', 'Бобр', 'Буйвол', 'Варан', 'Верблюд', 'Волк',
  'Выдра', 'Гепард', 'Гиена', 'Горностай', 'Дельфин', 'Дикобраз', 'Енот', 'Ёж', 'Жираф', 'Журавль',
  'Заяц', 'Зебра', 'Зубр', 'Игуана', 'Кабан', 'Кенгуру', 'Кит', 'Коала', 'Кобра', 'Крокодил',
  'Куница', 'Лама', 'Ласка', 'Лев', 'Лемур', 'Леопард', 'Лиса', 'Лось', 'Мангуст', 'Медведь',
  'Морж', 'Нерпа', 'Носорог', 'Окапи', 'Олень', 'Орёл', 'Панда', 'Пантера', 'Песец', 'Пингвин',
  'Пума', 'Росомаха', 'Рысь', 'Сайгак', 'Слон', 'Соболь', 'Сова', 'Сокол', 'Тапир', 'Тигр',
  'Тюлень', 'Удав', 'Филин', 'Фламинго', 'Хомяк', 'Хорёк', 'Цапля', 'Черепаха', 'Шакал', 'Як',
  'Ягуар', 'Ястреб',
];

/** Тестовые команды: случайные названия животных без состава, со случайным рейтингом. */
export function generateAnimalTeams(count: number, random: () => number = Math.random): Team[] {
  const names = [...ANIMALS];
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [names[i], names[j]] = [names[j]!, names[i]!];
  }
  return Array.from({ length: count }, (_, i) => {
    const base = names[i % names.length]!;
    const series = Math.floor(i / names.length);
    return {
      id: newId(),
      name: series === 0 ? base : `${base} ${series + 1}`,
      players: [],
      manualRating: 100 + Math.floor(random() * 900),
    };
  });
}

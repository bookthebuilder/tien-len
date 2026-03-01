const STORAGE_KEY = 'tienlen_settings';

const DEFAULTS = {
  theme: 'dark',
  deckStyle: 'classic',
  numPlayers: 4,
  playerConfigs: [
    { name: 'You', isHuman: true, difficulty: null },
    { name: 'Bot 1', isHuman: false, difficulty: 'medium' },
    { name: 'Bot 2', isHuman: false, difficulty: 'medium' },
    { name: 'Bot 3', isHuman: false, difficulty: 'medium' },
  ],
};

const SCORE_KEY = 'tienlen_scores';

export class Settings {
  static load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
    } catch {
      return { ...DEFAULTS };
    }
  }

  static save(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  static applyTheme(name) {
    document.documentElement.setAttribute('data-theme', name);
  }

  static applyDeck(name) {
    document.documentElement.setAttribute('data-deck', name);
  }

  static loadScores() {
    try {
      const raw = localStorage.getItem(SCORE_KEY);
      return raw ? JSON.parse(raw) : { wins: 0, losses: 0, games: 0 };
    } catch {
      return { wins: 0, losses: 0, games: 0 };
    }
  }

  static saveScores(scores) {
    localStorage.setItem(SCORE_KEY, JSON.stringify(scores));
  }
}

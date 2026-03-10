export const RANKS = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];
export const SUITS = ['spades','clubs','diamonds','hearts'];
export const RANK_VALUES = Object.fromEntries(RANKS.map((r, i) => [r, i]));
export const SUIT_VALUES = Object.fromEntries(SUITS.map((s, i) => [s, i]));

export const SUIT_SYMBOLS = {
  spades: '\u2660',
  clubs: '\u2663',
  diamonds: '\u2666',
  hearts: '\u2665'
};

export const COMBO_TYPES = {
  SINGLE: 'single',
  PAIR: 'pair',
  TRIPLE: 'triple',
  QUAD: 'quad',
  STRAIGHT: 'straight',
  DOUBLE_SEQ: 'double_sequence',
  TRIPLE_SEQ: 'triple_seq',
};

export const GAME_PHASES = {
  SETUP: 'setup',
  DEALING: 'dealing',
  PLAYING: 'playing',
  TRICK_END: 'trick_end',
  ROUND_END: 'round_end',
  GAME_OVER: 'game_over',
};

export const AI_DIFFICULTY = { EASY: 'easy', MEDIUM: 'medium', HARD: 'hard' };

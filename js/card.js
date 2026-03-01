import { RANK_VALUES, SUIT_VALUES, SUIT_SYMBOLS } from './constants.js';

export class Card {
  constructor(rank, suit) {
    this.rank = rank;
    this.suit = suit;
    this.rankValue = RANK_VALUES[rank];
    this.suitValue = SUIT_VALUES[suit];
    this.id = `${rank}_${suit}`;
  }

  get value() { return this.rankValue * 4 + this.suitValue; }
  get isTwo() { return this.rank === '2'; }
  get symbol() { return SUIT_SYMBOLS[this.suit]; }
  get isRed() { return this.suit === 'hearts' || this.suit === 'diamonds'; }

  compareTo(other) { return this.value - other.value; }

  static compare(a, b) { return a.compareTo(b); }
}

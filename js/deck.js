import { RANKS, SUITS } from './constants.js';
import { Card } from './card.js';

export class Deck {
  constructor() {
    this.cards = [];
    for (const suit of SUITS) {
      for (const rank of RANKS) {
        this.cards.push(new Card(rank, suit));
      }
    }
  }

  shuffle() {
    for (let i = this.cards.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.cards[i], this.cards[j]] = [this.cards[j], this.cards[i]];
    }
  }

  deal(numPlayers) {
    this.shuffle();
    const perPlayer = Math.floor(52 / numPlayers);
    const hands = Array.from({ length: numPlayers }, () => []);
    for (let i = 0; i < numPlayers * perPlayer; i++) {
      hands[i % numPlayers].push(this.cards[i]);
    }
    hands.forEach(h => h.sort(Card.compare));
    return hands;
  }
}

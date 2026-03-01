export class Player {
  constructor(name, isHuman, difficulty = null, position = 0) {
    this.name = name;
    this.isHuman = isHuman;
    this.difficulty = difficulty;
    this.position = position;
    this.hand = [];
    this.hasFinished = false;
    this.finishPlace = -1;
  }

  removeCards(cards) {
    const ids = new Set(cards.map(c => c.id));
    this.hand = this.hand.filter(c => !ids.has(c.id));
  }

  sortHand() {
    this.hand.sort((a, b) => a.compareTo(b));
  }

  get cardCount() { return this.hand.length; }
}

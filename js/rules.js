import { groupBy } from './utils.js';

export class Rules {
  // Check for instant win conditions in a dealt hand
  static checkInstantWin(hand) {
    // Four 2s
    const twos = hand.filter(c => c.isTwo);
    if (twos.length === 4) return { type: 'four_twos', label: 'Four 2s!' };

    // Six pairs
    const byRank = groupBy(hand, c => c.rankValue);
    let pairCount = 0;
    for (const [, group] of byRank) {
      if (group.length >= 2) pairCount++;
    }
    if (pairCount >= 6) return { type: 'six_pairs', label: 'Six Pairs!' };

    // Dragon: 3 through 2 (all 13 ranks: 3 4 5 6 7 8 9 10 J Q K A 2)
    const twosInHand = hand.filter(c => c.isTwo);
    const uniqueNonTwoRanks = new Set(hand.filter(c => !c.isTwo).map(c => c.rankValue));
    if (twosInHand.length >= 1 && uniqueNonTwoRanks.size >= 12) {
      let isDragon = true;
      for (let i = 0; i < 12; i++) {
        if (!uniqueNonTwoRanks.has(i)) { isDragon = false; break; }
      }
      if (isDragon) return { type: 'dragon', label: 'Dragon! (3 to 2)' };
    }

    // Three triples in sequence (instant win)
    const tripleableRanks = [...byRank.entries()]
      .filter(([rv, group]) => group.length >= 3 && rv < 12)
      .sort(([a], [b]) => a - b);
    for (let i = 0; i <= tripleableRanks.length - 3; i++) {
      const [r0] = tripleableRanks[i];
      const [r1] = tripleableRanks[i + 1];
      const [r2] = tripleableRanks[i + 2];
      if (r1 === r0 + 1 && r2 === r1 + 1) {
        return { type: 'triple_sequence', label: 'Three Triples in Sequence!' };
      }
    }

    return null;
  }

  // Check if a combo contains the 3 of spades
  static containsThreeOfSpades(combo) {
    return combo.cards.some(c => c.id === '3_spades');
  }

  // Find which player has the 3 of spades
  static findThreeOfSpadesHolder(players) {
    for (let i = 0; i < players.length; i++) {
      if (players[i].hand.some(c => c.id === '3_spades')) return i;
    }
    return 0;
  }
}

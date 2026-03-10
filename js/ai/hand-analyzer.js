import { COMBO_TYPES } from '../constants.js';
import { classify, findAllCombos, canBeat } from '../combo.js';
import { groupBy } from '../utils.js';

export class HandAnalyzer {
  // Decompose hand into optimal grouping of combos (fewest plays)
  static decompose(hand) {
    if (hand.length === 0) return [];
    const best = { combos: null, count: Infinity, iterations: 0 };
    this._decompose(hand, [], best);
    return best.combos || hand.map(c => classify([c]));
  }

  static _decompose(remaining, current, best) {
    if (best.iterations++ > 500) return; // global cap
    if (remaining.length === 0) {
      if (current.length < best.count) {
        best.count = current.length;
        best.combos = [...current];
      }
      return;
    }
    if (current.length >= best.count) return; // prune

    // Try multi-card combos first (greedy: larger combos reduce count faster)
    const combos = findAllCombos(remaining);
    // Prioritize larger combos
    const multiCard = combos.filter(c => c.length > 1).sort((a, b) => b.length - a.length);

    // Limit search breadth for performance
    const tried = new Set();
    let attempts = 0;
    for (const combo of multiCard) {
      if (attempts > 20) break; // cap search per level
      if (best.iterations > 500) break;
      const key = combo.cards.map(c => c.id).sort().join(',');
      if (tried.has(key)) continue;
      tried.add(key);
      attempts++;

      const rest = remaining.filter(c => !combo.cards.some(cc => cc.id === c.id));
      current.push(combo);
      this._decompose(rest, current, best);
      current.pop();
    }

    // Also try playing everything as singles (worst case)
    const singleCount = current.length + remaining.length;
    if (singleCount < best.count) {
      best.count = singleCount;
      best.combos = [...current, ...remaining.map(c => classify([c]))];
    }
  }

  // Evaluate hand strength (lower = better = fewer moves needed)
  static evaluateHand(hand) {
    const decomp = this.decompose(hand);
    return decomp.length;
  }

  // Find all plays that beat the current trick, sorted by strength (lowest first)
  static findSortedPlays(hand, currentTrick) {
    const combos = findAllCombos(hand);
    const valid = combos.filter(combo => canBeat(currentTrick, combo));
    valid.sort((a, b) => a.topCard.value - b.topCard.value);
    return valid;
  }

  // Count how many "moves" remain after playing a given combo
  static movesAfterPlay(hand, combo) {
    const rest = hand.filter(c => !combo.cards.some(cc => cc.id === c.id));
    return this.evaluateHand(rest);
  }
}

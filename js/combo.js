import { COMBO_TYPES, RANK_VALUES } from './constants.js';
import { Card } from './card.js';
import { groupBy } from './utils.js';

export class Combo {
  constructor(cards, type) {
    this.cards = [...cards].sort(Card.compare);
    this.type = type;
    this.length = cards.length;
    this.topCard = this.cards[this.cards.length - 1];
  }

  get topRankValue() { return this.topCard.rankValue; }
  get topValue() { return this.topCard.value; }
}

// Classify a set of cards into a combo type, or return null if invalid
export function classify(cards) {
  if (!cards || cards.length === 0) return null;
  const sorted = [...cards].sort(Card.compare);
  const len = sorted.length;

  if (len === 1) return new Combo(sorted, COMBO_TYPES.SINGLE);

  if (len === 2) {
    if (sorted[0].rankValue === sorted[1].rankValue)
      return new Combo(sorted, COMBO_TYPES.PAIR);
    return null;
  }

  if (len === 3) {
    if (allSameRank(sorted)) return new Combo(sorted, COMBO_TYPES.TRIPLE);
    if (isStraight(sorted)) return new Combo(sorted, COMBO_TYPES.STRAIGHT);
    return null;
  }

  if (len === 4) {
    if (allSameRank(sorted)) return new Combo(sorted, COMBO_TYPES.QUAD);
    if (isStraight(sorted)) return new Combo(sorted, COMBO_TYPES.STRAIGHT);
    return null;
  }

  // Length 5+
  if (isStraight(sorted)) return new Combo(sorted, COMBO_TYPES.STRAIGHT);
  if (isDoubleSequence(sorted)) return new Combo(sorted, COMBO_TYPES.DOUBLE_SEQ);
  return null;
}

function allSameRank(cards) {
  return cards.every(c => c.rankValue === cards[0].rankValue);
}

function isStraight(cards) {
  if (cards.length < 3) return false;
  // No 2s allowed in straights
  if (cards.some(c => c.isTwo)) return false;
  // Check consecutive ranks (one card per rank)
  const ranks = cards.map(c => c.rankValue).sort((a, b) => a - b);
  // All ranks must be unique
  if (new Set(ranks).size !== ranks.length) return false;
  for (let i = 1; i < ranks.length; i++) {
    if (ranks[i] !== ranks[i - 1] + 1) return false;
  }
  return true;
}

function isDoubleSequence(cards) {
  if (cards.length < 6 || cards.length % 2 !== 0) return false;
  if (cards.some(c => c.isTwo)) return false;
  const byRank = groupBy(cards, c => c.rankValue);
  // Each rank group must have exactly 2 cards
  for (const [, group] of byRank) {
    if (group.length !== 2) return false;
  }
  // Ranks must be consecutive
  const rankVals = [...byRank.keys()].sort((a, b) => a - b);
  for (let i = 1; i < rankVals.length; i++) {
    if (rankVals[i] !== rankVals[i - 1] + 1) return false;
  }
  return true;
}

// Can candidate beat existing combo? Returns true/false.
// existing can be null (leading a new trick — any valid combo is fine).
export function canBeat(existing, candidate) {
  if (!candidate) return false;
  if (!existing) return true; // leading

  // 2-chop rules
  if (is2Combo(existing)) {
    return canChop(existing, candidate);
  }

  // Normal: same type, same length, higher top card
  if (candidate.type !== existing.type) return false;
  if (candidate.length !== existing.length) return false;
  return candidate.topValue > existing.topValue;
}

function is2Combo(combo) {
  if (combo.type === COMBO_TYPES.SINGLE && combo.topCard.isTwo) return true;
  if (combo.type === COMBO_TYPES.PAIR && combo.topCard.isTwo) return true;
  if (combo.type === COMBO_TYPES.TRIPLE && combo.topCard.isTwo) return true;
  return false;
}

function canChop(twosCombo, candidate) {
  // A single 2 can be beaten by:
  // - A higher single 2
  // - A quad (four of a kind)
  // - A double sequence of 3+ pairs (length >= 6)
  if (twosCombo.type === COMBO_TYPES.SINGLE) {
    if (candidate.type === COMBO_TYPES.SINGLE && candidate.topValue > twosCombo.topValue)
      return true;
    if (candidate.type === COMBO_TYPES.QUAD) return true;
    if (candidate.type === COMBO_TYPES.DOUBLE_SEQ && candidate.length >= 6) return true;
    return false;
  }

  // A pair of 2s can be beaten by:
  // - A higher pair of 2s (not possible since only rank 2 exists, but handle suit-based)
  // - A double sequence of 4+ pairs (length >= 8)
  if (twosCombo.type === COMBO_TYPES.PAIR) {
    if (candidate.type === COMBO_TYPES.PAIR && candidate.topCard.isTwo
        && candidate.topValue > twosCombo.topValue)
      return true;
    if (candidate.type === COMBO_TYPES.DOUBLE_SEQ && candidate.length >= 8) return true;
    return false;
  }

  // A triple of 2s can be beaten by:
  // - A double sequence of 5+ pairs (length >= 10)
  if (twosCombo.type === COMBO_TYPES.TRIPLE) {
    if (candidate.type === COMBO_TYPES.DOUBLE_SEQ && candidate.length >= 10) return true;
    return false;
  }

  return false;
}

// Find all valid combos from a hand
export function findAllCombos(hand) {
  const combos = [];
  const sorted = [...hand].sort(Card.compare);
  const byRank = groupBy(sorted, c => c.rankValue);

  // Singles
  for (const card of sorted) {
    combos.push(new Combo([card], COMBO_TYPES.SINGLE));
  }

  // Pairs
  for (const [, group] of byRank) {
    if (group.length >= 2) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          combos.push(new Combo([group[i], group[j]], COMBO_TYPES.PAIR));
        }
      }
    }
  }

  // Triples
  for (const [, group] of byRank) {
    if (group.length >= 3) {
      for (let i = 0; i < group.length; i++) {
        for (let j = i + 1; j < group.length; j++) {
          for (let k = j + 1; k < group.length; k++) {
            combos.push(new Combo([group[i], group[j], group[k]], COMBO_TYPES.TRIPLE));
          }
        }
      }
    }
  }

  // Quads
  for (const [, group] of byRank) {
    if (group.length === 4) {
      combos.push(new Combo([...group], COMBO_TYPES.QUAD));
    }
  }

  // Straights (3+ consecutive ranks, one card per rank, no 2s)
  const nonTwoRanks = [...byRank.entries()]
    .filter(([rv]) => rv < 12) // exclude 2s (rankValue 12)
    .sort(([a], [b]) => a - b);

  for (let startIdx = 0; startIdx < nonTwoRanks.length; startIdx++) {
    // Find max consecutive run from startIdx
    let endIdx = startIdx;
    while (endIdx + 1 < nonTwoRanks.length &&
           nonTwoRanks[endIdx + 1][0] === nonTwoRanks[endIdx][0] + 1) {
      endIdx++;
    }
    // For each valid straight length (3 to run length)
    for (let len = 3; len <= endIdx - startIdx + 1; len++) {
      // Generate all card combinations for this straight
      const rankSlice = nonTwoRanks.slice(startIdx, startIdx + len);
      generateStraightCombos(rankSlice, 0, [], combos);
    }
  }

  // Double sequences (3+ consecutive pairs, no 2s)
  const pairableRanks = nonTwoRanks.filter(([, group]) => group.length >= 2);
  for (let startIdx = 0; startIdx < pairableRanks.length; startIdx++) {
    let endIdx = startIdx;
    while (endIdx + 1 < pairableRanks.length &&
           pairableRanks[endIdx + 1][0] === pairableRanks[endIdx][0] + 1) {
      endIdx++;
    }
    for (let len = 3; len <= endIdx - startIdx + 1; len++) {
      const rankSlice = pairableRanks.slice(startIdx, startIdx + len);
      generateDoubleSeqCombos(rankSlice, 0, [], combos);
    }
  }

  return combos;
}

function generateStraightCombos(rankGroups, idx, current, result) {
  if (idx === rankGroups.length) {
    result.push(new Combo([...current], COMBO_TYPES.STRAIGHT));
    return;
  }
  const [, cards] = rankGroups[idx];
  for (const card of cards) {
    current.push(card);
    generateStraightCombos(rankGroups, idx + 1, current, result);
    current.pop();
  }
}

function generateDoubleSeqCombos(rankGroups, idx, current, result) {
  if (idx === rankGroups.length) {
    result.push(new Combo([...current], COMBO_TYPES.DOUBLE_SEQ));
    return;
  }
  const [, cards] = rankGroups[idx];
  // Pick all pairs from this rank group
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      current.push(cards[i], cards[j]);
      generateDoubleSeqCombos(rankGroups, idx + 1, current, result);
      current.pop();
      current.pop();
    }
  }
}

// Find all combos from hand that beat the current trick
export function findBeatingPlays(hand, currentTrick) {
  const allCombos = findAllCombos(hand);
  return allCombos.filter(combo => canBeat(currentTrick, combo));
}

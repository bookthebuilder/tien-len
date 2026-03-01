import { COMBO_TYPES } from '../constants.js';
import { findBeatingPlays } from '../combo.js';
import { HandAnalyzer } from './hand-analyzer.js';

export function hardPlay(hand, currentTrick, gameState) {
  const valid = HandAnalyzer.findSortedPlays(hand, currentTrick);
  if (valid.length === 0) return null;

  const myIdx = gameState.currentPlayerIndex;
  const opponentInfo = getOpponentInfo(gameState, myIdx);
  const myCards = hand.length;

  // Leading a new trick
  if (!currentTrick) {
    return chooseLead(hand, opponentInfo, myCards);
  }

  // End-game: if we can chain out remaining cards, go aggressive
  if (myCards <= 4) {
    const chainPlay = findChainOut(hand, valid, currentTrick);
    if (chainPlay) return chainPlay;
  }

  // Opponent close to winning — play highest available to block
  if (opponentInfo.minCards <= 2) {
    return valid[valid.length - 1];
  }

  // Strategic: pick the play that minimizes remaining moves
  let bestPlay = valid[0];
  let bestScore = Infinity;

  for (const play of valid) {
    const movesLeft = HandAnalyzer.movesAfterPlay(hand, play);
    // Penalize using 2s (save them)
    const twosPenalty = play.cards.some(c => c.isTwo) ? 2 : 0;
    // Penalize using quads/bombs (save them for chops)
    const bombPenalty = play.type === COMBO_TYPES.QUAD ? 3 : 0;
    const score = movesLeft + twosPenalty + bombPenalty;

    if (score < bestScore) {
      bestScore = score;
      bestPlay = play;
    }
  }

  // Strategic pass: if trick leader is far from winning and we'd waste strong cards
  if (opponentInfo.minCards > 5 && myCards > 6) {
    const leaderCards = gameState.players[gameState.trickLeaderIndex]?.cardCount || 13;
    if (leaderCards > 5 && bestPlay.cards.some(c => c.isTwo || c.rankValue >= 10)) {
      // Only play if we have a low option
      const lowPlays = valid.filter(c => c.topCard.rankValue < 10 && !c.cards.some(cc => cc.isTwo));
      if (lowPlays.length > 0) return lowPlays[0];
      // Otherwise, consider passing to save strength
      if (Math.random() < 0.4) return null;
    }
  }

  return bestPlay;
}

function chooseLead(hand, opponentInfo, myCards) {
  const decomp = HandAnalyzer.decompose(hand);
  decomp.sort((a, b) => a.topCard.value - b.topCard.value);

  // If we can empty hand in the decomposition, play in order
  if (myCards <= 5) {
    // Aggressive: lead with highest combo we can control
    const strong = decomp.filter(c => c.topCard.rankValue >= 10 || c.cards.some(cc => cc.isTwo));
    if (strong.length > 0 && decomp.length <= 3) {
      return strong[strong.length - 1]; // lead strong to maintain control
    }
  }

  // If opponents are low on cards, lead strong
  if (opponentInfo.minCards <= 3) {
    return decomp[decomp.length - 1];
  }

  // Default: lead with lowest combo, prefer multi-card
  const multi = decomp.filter(c => c.length > 1);
  if (multi.length > 0) return multi[0];
  return decomp[0];
}

function findChainOut(hand, validPlays, currentTrick) {
  // Check if playing one of the valid plays leaves a hand
  // that can be played in sequence (each subsequent combo wins the next trick alone)
  for (const play of validPlays) {
    const rest = hand.filter(c => !play.cards.some(cc => cc.id === c.id));
    if (rest.length === 0) return play; // Wins immediately
    const restDecomp = HandAnalyzer.decompose(rest);
    // If rest is just one combo, we can lead it next turn
    if (restDecomp.length === 1) return play;
  }
  return null;
}

function getOpponentInfo(gs, myIdx) {
  let minCards = Infinity;
  let totalCards = 0;
  let activeCount = 0;
  for (let i = 0; i < gs.numPlayers; i++) {
    if (i === myIdx || gs.players[i].hasFinished) continue;
    const cc = gs.players[i].cardCount;
    minCards = Math.min(minCards, cc);
    totalCards += cc;
    activeCount++;
  }
  return { minCards, totalCards, activeCount };
}

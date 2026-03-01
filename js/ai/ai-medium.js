import { findBeatingPlays } from '../combo.js';
import { HandAnalyzer } from './hand-analyzer.js';

export function mediumPlay(hand, currentTrick, gameState) {
  const valid = HandAnalyzer.findSortedPlays(hand, currentTrick);

  if (valid.length === 0) return null; // pass

  // Leading: play lowest combo from decomposition
  if (!currentTrick) {
    const decomp = HandAnalyzer.decompose(hand);
    decomp.sort((a, b) => a.topCard.value - b.topCard.value);
    // Prefer multi-card combos when leading (empties hand faster)
    const multi = decomp.filter(c => c.length > 1);
    return multi.length > 0 ? multi[0] : decomp[0];
  }

  // Check if any opponent is close to winning
  const opponentMinCards = getOpponentMinCards(gameState);

  // Save 2s unless necessary
  const nonTwoPlays = valid.filter(c => !c.cards.some(card => card.isTwo));

  if (opponentMinCards <= 2) {
    // Play strongest to block
    return valid[valid.length - 1];
  }

  if (nonTwoPlays.length > 0 && opponentMinCards > 3) {
    return nonTwoPlays[0]; // lowest non-2 play
  }

  // 10% random pass to stay unpredictable
  if (Math.random() < 0.10 && valid.length > 0) return null;

  return valid[0]; // lowest valid play
}

function getOpponentMinCards(gs) {
  let min = Infinity;
  for (let i = 0; i < gs.numPlayers; i++) {
    if (i === gs.currentPlayerIndex) continue;
    if (gs.players[i].hasFinished) continue;
    min = Math.min(min, gs.players[i].cardCount);
  }
  return min;
}

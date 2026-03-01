import { findBeatingPlays, findAllCombos } from '../combo.js';
import { pickRandom } from '../utils.js';

export function easyPlay(hand, currentTrick, _gameState) {
  const valid = findBeatingPlays(hand, currentTrick);

  if (valid.length === 0) return null; // pass

  // Leading: play random combo
  if (!currentTrick) {
    const all = findAllCombos(hand);
    return pickRandom(all);
  }

  // 30% chance to pass even with valid plays
  if (Math.random() < 0.30) return null;

  return pickRandom(valid);
}

import { AI_DIFFICULTY } from '../constants.js';
import { bus } from '../events.js';
import { delay, randInt } from '../utils.js';
import { easyPlay } from './ai-easy.js';
import { mediumPlay } from './ai-medium.js';
import { hardPlay } from './ai-hard.js';

export class AIController {
  constructor(gameState) {
    this.gameState = gameState;
  }

  async takeTurn(playerIndex) {
    const player = this.gameState.players[playerIndex];
    if (!player || player.isHuman || player.hasFinished) return;

    // Thinking delay
    const delays = {
      [AI_DIFFICULTY.EASY]: [400, 800],
      [AI_DIFFICULTY.MEDIUM]: [600, 1200],
      [AI_DIFFICULTY.HARD]: [800, 1500],
    };
    const [min, max] = delays[player.difficulty] || [500, 1000];
    await delay(randInt(min, max));

    // If game state changed during delay (e.g., game reset), bail
    if (this.gameState.currentPlayerIndex !== playerIndex) return;
    if (this.gameState.phase !== 'playing') return;
    // Wait for any animation to finish
    while (this.gameState.animating) {
      await delay(100);
    }

    const hand = [...player.hand];
    const trick = this.gameState.currentTrick;

    let play = null;
    switch (player.difficulty) {
      case AI_DIFFICULTY.EASY:
        play = easyPlay(hand, trick, this.gameState);
        break;
      case AI_DIFFICULTY.MEDIUM:
        play = mediumPlay(hand, trick, this.gameState);
        break;
      case AI_DIFFICULTY.HARD:
        play = hardPlay(hand, trick, this.gameState);
        break;
      default:
        play = mediumPlay(hand, trick, this.gameState);
    }

    if (play) {
      this.gameState.playCards(playerIndex, play.cards);
    } else {
      this.gameState.pass(playerIndex);
    }
  }
}

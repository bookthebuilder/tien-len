import { GAME_PHASES } from './constants.js';
import { Deck } from './deck.js';
import { Player } from './player.js';
import { Rules } from './rules.js';
import { classify, canBeat } from './combo.js';
import { bus } from './events.js';

export class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.phase = GAME_PHASES.SETUP;
    this.players = [];
    this.numPlayers = 4;
    this.currentPlayerIndex = 0;
    this.currentTrick = null; // Combo or null
    this.trickLeaderIndex = -1;
    this.trickPasses = new Set();
    this.finishOrder = [];
    this.isFirstGame = true;
    this.mustPlayThreeOfSpades = false;
    this.playedCards = [];
    this.lastWinnerIndex = -1;
    this.animating = false;
  }

  setupPlayers(configs) {
    this.numPlayers = configs.length;
    this.players = configs.map((cfg, i) =>
      new Player(cfg.name, cfg.isHuman, cfg.difficulty, i)
    );
  }

  deal() {
    const deck = new Deck();
    const hands = deck.deal(this.numPlayers);
    this.players.forEach((p, i) => {
      p.hand = hands[i];
      p.hasFinished = false;
      p.finishPlace = -1;
    });
    this.currentTrick = null;
    this.trickPasses = new Set();
    this.finishOrder = [];
    this.playedCards = [];
    this.mustPlayThreeOfSpades = this.isFirstGame;

    // Check instant wins
    for (let i = 0; i < this.numPlayers; i++) {
      const iw = Rules.checkInstantWin(this.players[i].hand);
      if (iw) {
        this.phase = GAME_PHASES.GAME_OVER;
        this.finishOrder = [i];
        bus.emit('instant-win', { playerIndex: i, ...iw });
        return;
      }
    }

    // Find who starts
    if (this.isFirstGame) {
      this.currentPlayerIndex = Rules.findThreeOfSpadesHolder(this.players);
    } else {
      this.currentPlayerIndex = this.lastWinnerIndex;
    }
    this.trickLeaderIndex = this.currentPlayerIndex;
    this.phase = GAME_PHASES.PLAYING;
    bus.emit('deal-complete', { startingPlayer: this.currentPlayerIndex });
    // turn-changed is emitted by the UI after deal animation completes
  }

  playCards(playerIndex, cards) {
    if (this.phase !== GAME_PHASES.PLAYING) return { success: false, message: 'Not in playing phase' };
    if (playerIndex !== this.currentPlayerIndex) return { success: false, message: 'Not your turn' };
    if (this.animating) return { success: false, message: 'Wait for animation' };

    const combo = classify(cards);
    if (!combo) return { success: false, message: 'Invalid combination' };

    // Must include 3 of spades on first play of first game
    if (this.mustPlayThreeOfSpades && this.playedCards.length === 0) {
      if (!Rules.containsThreeOfSpades(combo)) {
        return { success: false, message: 'First play must include 3\u2660' };
      }
    }

    if (!canBeat(this.currentTrick, combo)) {
      return { success: false, message: 'Must play higher than current trick' };
    }

    // Execute the play
    const player = this.players[playerIndex];
    player.removeCards(cards);
    this.currentTrick = combo;
    this.trickLeaderIndex = playerIndex;
    this.trickPasses = new Set();
    this.playedCards.push(...cards);

    bus.emit('cards-played', { playerIndex, combo, remaining: player.cardCount });

    // Check if player finished
    if (player.cardCount === 0) {
      player.hasFinished = true;
      player.finishPlace = this.finishOrder.length + 1;
      this.finishOrder.push(playerIndex);
      if (this.finishOrder.length === 1) {
        this.lastWinnerIndex = playerIndex;
      }
      bus.emit('player-finished', { playerIndex, place: player.finishPlace });
    }

    // Check if game over (only 1 or 0 players left)
    const activePlayers = this.getActivePlayers();
    if (activePlayers.length <= 1) {
      if (activePlayers.length === 1) {
        const last = activePlayers[0];
        this.players[last].hasFinished = true;
        this.players[last].finishPlace = this.finishOrder.length + 1;
        this.finishOrder.push(last);
      }
      this.phase = GAME_PHASES.GAME_OVER;
      this.isFirstGame = false;
      bus.emit('game-over', { finishOrder: [...this.finishOrder] });
      return { success: true };
    }

    this.advanceTurn();
    return { success: true };
  }

  pass(playerIndex) {
    if (this.phase !== GAME_PHASES.PLAYING) return { success: false, message: 'Not in playing phase' };
    if (playerIndex !== this.currentPlayerIndex) return { success: false, message: 'Not your turn' };
    if (this.animating) return { success: false, message: 'Wait for animation' };

    // Can't pass on a new trick if you're leading
    if (this.currentTrick === null) {
      return { success: false, message: "You must play when leading" };
    }

    // Can't pass on first play if holding 3 of spades
    if (this.mustPlayThreeOfSpades && this.playedCards.length === 0) {
      return { success: false, message: "You must play the 3\u2660" };
    }

    this.trickPasses.add(playerIndex);
    bus.emit('player-passed', { playerIndex });
    this.advanceTurn();
    return { success: true };
  }

  advanceTurn() {
    const active = this.getActivePlayers();

    // Check if all active players except trick leader have passed
    const nonLeaderActive = active.filter(i => i !== this.trickLeaderIndex);
    const allPassed = nonLeaderActive.every(i => this.trickPasses.has(i));

    if (allPassed) {
      // Trick won by leader
      bus.emit('trick-won', { playerIndex: this.trickLeaderIndex });
      this.currentTrick = null;
      this.trickPasses = new Set();

      // If trick leader has finished, pass lead to next active player
      if (this.players[this.trickLeaderIndex].hasFinished) {
        this.currentPlayerIndex = this.nextActivePlayer(this.trickLeaderIndex);
      } else {
        this.currentPlayerIndex = this.trickLeaderIndex;
      }
      this.trickLeaderIndex = this.currentPlayerIndex;
    } else {
      // Move to next active player who hasn't passed
      this.currentPlayerIndex = this.nextActivePlayer(this.currentPlayerIndex);
    }

    bus.emit('turn-changed', { playerIndex: this.currentPlayerIndex });
  }

  nextActivePlayer(fromIndex) {
    let idx = fromIndex;
    for (let i = 0; i < this.numPlayers; i++) {
      idx = (idx + 1) % this.numPlayers;
      if (!this.players[idx].hasFinished && !this.trickPasses.has(idx)) {
        return idx;
      }
    }
    // Fallback: find any active player
    for (let i = 0; i < this.numPlayers; i++) {
      idx = (idx + 1) % this.numPlayers;
      if (!this.players[idx].hasFinished) return idx;
    }
    return fromIndex;
  }

  getActivePlayers() {
    return this.players
      .map((p, i) => i)
      .filter(i => !this.players[i].hasFinished);
  }

  isCurrentPlayerHuman() {
    return this.players[this.currentPlayerIndex]?.isHuman;
  }
}

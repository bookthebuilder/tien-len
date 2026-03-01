import { GAME_PHASES, SUIT_SYMBOLS, COMBO_TYPES } from './constants.js';
import { GameState } from './game-state.js';
import { AIController } from './ai/ai-controller.js';
import { Settings } from './settings.js';
import { classify, canBeat, findBeatingPlays } from './combo.js';
import { Card } from './card.js';
import { bus } from './events.js';
import { delay } from './utils.js';
import { MultiplayerManager } from './multiplayer.js';
import { Deck } from './deck.js';

const $ = id => document.getElementById(id);

class App {
  constructor() {
    this.settings = Settings.load();
    this.scores = Settings.loadScores();
    this.gs = new GameState();
    this.ai = new AIController(this.gs);
    this.mp = new MultiplayerManager();
    this.selectedCards = [];
    this.humanPlayerIndex = 0;
    this.multipleHumans = false;
    this.mode = 'menu'; // 'menu' | 'local' | 'online'

    this.applyVisuals();
    this.bindEvents();
    this.bindUI();
    this.updateScoreDisplay();
  }

  applyVisuals() {
    Settings.applyTheme(this.settings.theme);
    Settings.applyDeck(this.settings.deckStyle);
  }

  // ========== EVENT BUS ==========

  bindEvents() {
    bus.on('deal-complete', (data) => this.onDealComplete(data));
    bus.on('turn-changed', (data) => this.onTurnChanged(data));
    bus.on('cards-played', (data) => this.onCardsPlayed(data));
    bus.on('player-passed', (data) => this.onPlayerPassed(data));
    bus.on('trick-won', (data) => this.onTrickWon(data));
    bus.on('player-finished', (data) => this.onPlayerFinished(data));
    bus.on('game-over', (data) => this.onGameOver(data));
    bus.on('instant-win', (data) => this.onInstantWin(data));
    bus.on('mp-error', (data) => {
      $('join-error').textContent = data.message;
    });
  }

  // ========== UI BINDING ==========

  bindUI() {
    // --- Main Menu ---
    $('local-play-btn').addEventListener('click', () => {
      this.showScreen('setup-overlay');
    });
    $('create-room-btn').addEventListener('click', () => {
      this.showScreen('create-overlay');
    });
    $('join-room-btn').addEventListener('click', () => {
      this.showScreen('join-overlay');
    });

    // --- Local play ---
    $('start-game-btn').addEventListener('click', () => {
      this.hideAllScreens();
      this.mode = 'local';
      this.startLocalGame();
    });

    // --- Create room ---
    document.querySelectorAll('.mp-count-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mp-count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });
    $('create-back-btn').addEventListener('click', () => this.showScreen('menu-overlay'));
    $('create-go-btn').addEventListener('click', () => this.onCreateRoom());

    // --- Join room ---
    $('join-back-btn').addEventListener('click', () => this.showScreen('menu-overlay'));
    $('join-go-btn').addEventListener('click', () => this.onJoinRoom());
    $('join-code').addEventListener('input', (e) => {
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });

    // --- Lobby ---
    $('lobby-leave-btn').addEventListener('click', () => this.onLeaveLobby());
    $('lobby-ready-btn').addEventListener('click', () => this.mp.toggleReady());
    $('lobby-start-btn').addEventListener('click', () => this.onHostStartGame());

    // --- Game actions ---
    $('play-btn').addEventListener('click', () => this.onPlayClick());
    $('pass-btn').addEventListener('click', () => this.onPassClick());

    // --- New game ---
    $('new-game-btn').addEventListener('click', () => {
      $('game-over-overlay').classList.add('hidden');
      if (this.mode === 'online') {
        this.showScreen('lobby-overlay');
        // Reset ready states
        this.mp.players.forEach(p => p.isReady = false);
        this.mp._broadcastLobby();
        this.renderLobby(this.mp.players, this.mp.maxPlayers);
      } else {
        this.startLocalGame();
      }
    });

    // --- Settings ---
    $('settings-btn').addEventListener('click', () => this.openSettings());
    $('cancel-settings').addEventListener('click', () => this.closeSettings());
    $('save-settings').addEventListener('click', () => this.saveSettings());

    document.querySelectorAll('.theme-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.theme-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Settings.applyTheme(btn.dataset.theme);
      });
    });
    document.querySelectorAll('.deck-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.deck-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        Settings.applyDeck(btn.dataset.deck);
      });
    });
    document.querySelectorAll('.count-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.count-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.renderPlayerConfigs(parseInt(btn.dataset.count));
      });
    });

    // Handoff
    $('handoff-ready-btn').addEventListener('click', () => {
      $('handoff-overlay').classList.add('hidden');
      this.renderMyHand();
    });

    // Keyboard
    document.addEventListener('keydown', (e) => {
      if (this.gs.phase !== GAME_PHASES.PLAYING) return;
      if (this.mode === 'online' && this.gs.currentPlayerIndex !== this.humanPlayerIndex) return;
      if (this.mode === 'local' && !this.gs.isCurrentPlayerHuman()) return;
      if (e.key === 'Enter') this.onPlayClick();
      if (e.key === 'Escape') this.clearSelection();
      if (e.key === ' ') { e.preventDefault(); this.onPassClick(); }
    });
  }

  // ========== SCREEN MANAGEMENT ==========

  showScreen(id) {
    const screens = ['menu-overlay', 'setup-overlay', 'create-overlay', 'join-overlay', 'lobby-overlay'];
    screens.forEach(s => $(s).classList.toggle('hidden', s !== id));
  }

  hideAllScreens() {
    ['menu-overlay', 'setup-overlay', 'create-overlay', 'join-overlay', 'lobby-overlay'].forEach(s =>
      $(s).classList.add('hidden'));
  }

  // ========== LOCAL PLAY ==========

  startLocalGame() {
    this.mode = 'local';
    const configs = this.settings.playerConfigs.slice(0, this.settings.numPlayers);
    this.gs.setupPlayers(configs);
    this.humanPlayerIndex = configs.findIndex(c => c.isHuman);
    if (this.humanPlayerIndex === -1) this.humanPlayerIndex = 0;
    this.multipleHumans = configs.filter(c => c.isHuman).length > 1;
    this.selectedCards = [];

    this._setupPanelVisibility();
    this.gs.deal();
  }

  // ========== MULTIPLAYER: CREATE ==========

  async onCreateRoom() {
    const name = $('create-name').value.trim() || 'Host';
    const countBtn = document.querySelector('.mp-count-btn.active');
    const maxPlayers = parseInt(countBtn?.dataset.count || '4');

    $('create-go-btn').disabled = true;
    $('create-go-btn').textContent = 'Creating...';

    try {
      const code = await this.mp.createRoom(name, maxPlayers);
      this.mp.onLobbyUpdate = (players, max) => this.renderLobby(players, max);
      this.mp.onGameAction = (type, payload) => this.onMpGameAction(type, payload);
      this.mp.onStateUpdate = (state) => this.onMpStateUpdate(state);

      $('lobby-room-code').textContent = code;
      this.showScreen('lobby-overlay');
      this.renderLobby(this.mp.players, maxPlayers);
    } catch (err) {
      console.error(err);
    } finally {
      $('create-go-btn').disabled = false;
      $('create-go-btn').textContent = 'Create';
    }
  }

  // ========== MULTIPLAYER: JOIN ==========

  async onJoinRoom() {
    const name = $('join-name').value.trim() || 'Player';
    const code = $('join-code').value.trim().toUpperCase();
    if (code.length !== 4) {
      $('join-error').textContent = 'Enter a 4-character room code';
      return;
    }

    $('join-error').textContent = '';
    $('join-go-btn').disabled = true;
    $('join-go-btn').textContent = 'Joining...';

    try {
      this.mp.onLobbyUpdate = (players, max) => this.renderLobby(players, max);
      this.mp.onGameAction = (type, payload) => this.onMpGameAction(type, payload);
      this.mp.onStateUpdate = (state) => this.onMpStateUpdate(state);

      await this.mp.joinRoom(code, name);

      $('lobby-room-code').textContent = code;
      this.showScreen('lobby-overlay');
    } catch (err) {
      $('join-error').textContent = 'Failed to join room';
      console.error(err);
    } finally {
      $('join-go-btn').disabled = false;
      $('join-go-btn').textContent = 'Join';
    }
  }

  // ========== LOBBY ==========

  renderLobby(players, maxPlayers) {
    const container = $('lobby-players');
    container.innerHTML = '';

    for (let i = 0; i < maxPlayers; i++) {
      const player = players.find(p => p.seat === i);
      if (player) {
        const div = document.createElement('div');
        div.className = 'lobby-player';
        const badgeClass = player.isHost ? 'host' : (player.isReady ? 'ready' : 'waiting');
        const badgeText = player.isHost ? 'Host' : (player.isReady ? 'Ready' : 'Waiting');
        div.innerHTML = `
          <span class="lobby-player-name">${player.name}</span>
          <span class="lobby-player-badge ${badgeClass}">${badgeText}</span>
        `;
        container.appendChild(div);
      } else {
        const div = document.createElement('div');
        div.className = 'lobby-slot-empty';
        div.textContent = 'Waiting for player...';
        container.appendChild(div);
      }
    }

    // Show/hide start button (host only, when all ready and enough players)
    const canStart = this.mp.isHost && players.length >= 2 &&
                     players.filter(p => !p.isHost).every(p => p.isReady);
    $('lobby-start-btn').classList.toggle('hidden', !canStart);

    // Status text
    const needed = 2 - players.length;
    if (needed > 0) {
      $('lobby-status').textContent = `Need ${needed} more player${needed > 1 ? 's' : ''} to start`;
    } else if (!canStart && this.mp.isHost) {
      $('lobby-status').textContent = 'Waiting for players to ready up';
    } else if (!this.mp.isHost) {
      $('lobby-status').textContent = 'Waiting for host to start';
    } else {
      $('lobby-status').textContent = 'Ready to start!';
    }
  }

  async onLeaveLobby() {
    await this.mp.leave();
    this.showScreen('menu-overlay');
  }

  // ========== MULTIPLAYER: GAME START ==========

  onHostStartGame() {
    if (!this.mp.isHost) return;

    // Host creates the game config and deals
    const players = this.mp.players.sort((a, b) => a.seat - b.seat);
    const numPlayers = players.length;

    // Setup game state on host
    const configs = players.map(p => ({
      name: p.name,
      isHuman: p.id === this.mp.playerId,
      difficulty: null,
    }));

    this.mode = 'online';
    this.gs.setupPlayers(configs);
    this.humanPlayerIndex = players.findIndex(p => p.id === this.mp.playerId);
    this.multipleHumans = false;
    this.selectedCards = [];

    // Deal and get the hands
    const deck = new Deck();
    const hands = deck.deal(numPlayers);
    this.gs.players.forEach((p, i) => {
      p.hand = hands[i];
      p.hasFinished = false;
      p.finishPlace = -1;
    });

    // Build serializable game start payload
    const payload = {
      players: players.map((p, i) => ({
        id: p.id,
        name: p.name,
        seat: i,
        hand: hands[i].map(c => ({ rank: c.rank, suit: c.suit })),
      })),
      numPlayers,
    };

    // Send game start to all
    this.mp.startGame(payload);

    // Host also processes game start locally
    this._startOnlineGame(payload);
  }

  onMpGameAction(type, payload) {
    if (type === 'game-start') {
      this.mode = 'online';
      this._startOnlineGame(payload);
    } else if (type === 'player-action') {
      this._handleRemoteAction(payload);
    }
  }

  async _startOnlineGame(payload) {
    this.hideAllScreens();
    const { players, numPlayers } = payload;
    const myId = this.mp.playerId;

    // Setup game state
    const configs = players.map(p => ({
      name: p.name,
      isHuman: p.id === myId,
      difficulty: null,
    }));

    this.gs.setupPlayers(configs);
    this.humanPlayerIndex = players.findIndex(p => p.id === myId);
    this.multipleHumans = false;
    this.selectedCards = [];

    // Assign hands from payload
    players.forEach((p, i) => {
      this.gs.players[i].hand = p.hand.map(c => new Card(c.rank, c.suit));
      this.gs.players[i].sortHand();
    });

    // Determine who starts (3 of spades)
    this.gs.currentTrick = null;
    this.gs.trickPasses = new Set();
    this.gs.finishOrder = [];
    this.gs.playedCards = [];
    this.gs.mustPlayThreeOfSpades = this.gs.isFirstGame;
    this.gs.phase = GAME_PHASES.PLAYING;

    // Find 3-of-spades holder
    for (let i = 0; i < numPlayers; i++) {
      if (this.gs.players[i].hand.some(c => c.id === '3_spades')) {
        this.gs.currentPlayerIndex = i;
        break;
      }
    }
    this.gs.trickLeaderIndex = this.gs.currentPlayerIndex;

    this._setupPanelVisibility();

    // Animate deal then start
    this.gs.animating = true;
    await this.animateDeal();
    this.gs.animating = false;
    this.renderAll();
    bus.emit('turn-changed', { playerIndex: this.gs.currentPlayerIndex });
  }

  // ========== MULTIPLAYER: IN-GAME ACTIONS ==========

  onPlayClickOnline() {
    if (this.gs.currentPlayerIndex !== this.humanPlayerIndex) return;
    if (this.selectedCards.length === 0) return;

    const cardData = this.selectedCards.map(c => ({ rank: c.rank, suit: c.suit }));
    // Send to all (including self via broadcast self:true)
    this.mp.sendAction({
      type: 'play',
      seat: this.humanPlayerIndex,
      cards: cardData,
    });
  }

  onPassClickOnline() {
    if (this.gs.currentPlayerIndex !== this.humanPlayerIndex) return;
    this.mp.sendAction({
      type: 'pass',
      seat: this.humanPlayerIndex,
    });
  }

  _handleRemoteAction(payload) {
    // All players process actions to keep state in sync
    if (payload.type === 'play') {
      const cards = payload.cards.map(c => {
        const found = this.gs.players[payload.seat].hand.find(
          h => h.rank === c.rank && h.suit === c.suit
        );
        return found;
      }).filter(Boolean);

      if (cards.length > 0) {
        this.gs.playCards(payload.seat, cards);
      }
    } else if (payload.type === 'pass') {
      this.gs.pass(payload.seat);
    }
  }

  onMpStateUpdate(state) {
    // For now, all clients run game logic locally from broadcast actions
    // This callback is available for future full-state sync if needed
  }

  // ========== GAME EVENT HANDLERS ==========

  async onDealComplete({ startingPlayer }) {
    this.gs.animating = true;
    await this.animateDeal();
    this.gs.animating = false;
    this.renderAll();
    bus.emit('turn-changed', { playerIndex: this.gs.currentPlayerIndex });
  }

  async onTurnChanged({ playerIndex }) {
    this.renderPanels();
    this.updateActions();
    this.updateComboHint();

    if (this.gs.phase !== GAME_PHASES.PLAYING) return;

    const player = this.gs.players[playerIndex];

    if (this.mode === 'online') {
      // In online mode, only show actions if it's my turn
      if (playerIndex === this.humanPlayerIndex) {
        this.renderMyHand();
      }
      return;
    }

    // Local mode
    if (player.isHuman) {
      if (this.multipleHumans && playerIndex !== this.humanPlayerIndex) {
        this.showHandoff(player.name);
        this.humanPlayerIndex = playerIndex;
      } else {
        this.humanPlayerIndex = playerIndex;
        this.renderMyHand();
      }
    } else {
      this.ai.takeTurn(playerIndex);
    }
  }

  async onCardsPlayed({ playerIndex, combo, remaining }) {
    this.gs.animating = true;
    await this.animatePlay(playerIndex, combo);
    this.renderTableCenter();
    this.renderOppHands();
    if (playerIndex === this.humanPlayerIndex) {
      this.selectedCards = [];
      this.renderMyHand();
    }
    this.renderPanels();
    this.gs.animating = false;

    // In online mode, broadcast state after each play (host only)
    if (this.mode === 'online' && this.mp.isHost) {
      this._broadcastGameState();
    }
  }

  async onPlayerPassed({ playerIndex }) {
    await this.showPassIndicator(playerIndex);
  }

  async onTrickWon({ playerIndex }) {
    this.showTrickLabel(`${this.gs.players[playerIndex].name} wins the trick`);
    await delay(600);
    await this.animateTrickClear();
    this.clearTableCenter();
    this.showTrickLabel('');
  }

  onPlayerFinished({ playerIndex, place }) {
    const placeStr = ['', '1st', '2nd', '3rd', '4th'][place];
    this.showMessage(`${this.gs.players[playerIndex].name}`, `Finished ${placeStr}!`, 1200);
    this.renderPanels();
  }

  onGameOver({ finishOrder }) {
    const myIdx = this.humanPlayerIndex;
    const isWinner = finishOrder[0] === myIdx;
    this.scores.games++;
    if (isWinner) this.scores.wins++;
    else this.scores.losses++;
    Settings.saveScores(this.scores);
    this.updateScoreDisplay();

    const overlay = $('game-over-overlay');
    const title = $('game-over-title');
    const results = $('game-over-results');

    title.textContent = isWinner ? 'You Win!' : 'Game Over';
    title.className = isWinner ? 'winner-text' : '';

    results.innerHTML = finishOrder.map((pi, idx) => {
      const p = this.gs.players[pi];
      const place = ['1st', '2nd', '3rd', '4th'][idx];
      const medal = ['\uD83E\uDD47', '\uD83E\uDD48', '\uD83E\uDD49', ''][idx];
      return `<div class="result-row">
        <span class="result-place">${medal} ${place}</span>
        <span class="result-name">${p.name}</span>
      </div>`;
    }).join('');

    overlay.classList.remove('hidden');
  }

  async onInstantWin({ playerIndex, label }) {
    await this.showMessage(this.gs.players[playerIndex].name, label, 3000);
    this.onGameOver({ finishOrder: [playerIndex] });
  }

  _broadcastGameState() {
    // Minimal state sync for recovery
    this.mp.broadcastState({
      currentPlayerIndex: this.gs.currentPlayerIndex,
      phase: this.gs.phase,
    });
  }

  // ========== RENDERING ==========

  _setupPanelVisibility() {
    for (let i = 0; i < 4; i++) {
      const panel = $(`panel-${i}`);
      const oppHand = $(`opp-hand-${i}`);
      if (i < this.gs.numPlayers) {
        if (panel) panel.style.display = '';
        if (oppHand && i !== this.humanPlayerIndex) oppHand.style.display = '';
        else if (oppHand) oppHand.style.display = 'none';
      } else {
        if (panel) panel.style.display = 'none';
        if (oppHand) oppHand.style.display = 'none';
      }
    }
  }

  renderAll() {
    this.renderPanels();
    this.renderMyHand();
    this.renderOppHands();
    this.renderTableCenter();
    this.updateActions();
    this.updateComboHint();
  }

  renderPanels() {
    for (let i = 0; i < this.gs.numPlayers; i++) {
      const p = this.gs.players[i];
      const panel = $(`panel-${i}`);
      if (!panel) continue;

      const isActive = this.gs.currentPlayerIndex === i && this.gs.phase === GAME_PHASES.PLAYING;
      panel.className = `player-panel ${isActive ? 'active' : ''} ${p.hasFinished ? 'finished' : ''}`;
      panel.setAttribute('data-pos', i);

      let html = `<span class="player-name">${p.name}</span>`;
      if (p.hasFinished) {
        const placeStr = ['', '1st', '2nd', '3rd', '4th'][p.finishPlace];
        html += `<span class="player-place">${placeStr}</span>`;
      } else {
        html += `<span class="player-cards-count">${p.cardCount} cards</span>`;
      }
      if (isActive && !p.isHuman && this.mode === 'local') {
        html += `<span class="player-status">thinking...</span>`;
      }
      if (isActive && this.mode === 'online' && i !== this.humanPlayerIndex) {
        html += `<span class="player-status">their turn</span>`;
      }
      panel.innerHTML = html;
    }
  }

  renderMyHand() {
    const container = $('my-hand');
    container.innerHTML = '';
    const player = this.gs.players[this.humanPlayerIndex];
    if (!player) return;

    player.hand.forEach((card, idx) => {
      const el = this.createCardElement(card, false);
      if (this.selectedCards.some(c => c.id === card.id)) {
        el.classList.add('selected');
      }
      el.style.animationDelay = `${idx * 30}ms`;
      el.addEventListener('click', () => this.toggleCardSelection(card));
      container.appendChild(el);
    });
  }

  renderOppHands() {
    for (let i = 0; i < this.gs.numPlayers; i++) {
      if (i === this.humanPlayerIndex) continue;
      const container = $(`opp-hand-${i}`);
      if (!container) continue;
      container.innerHTML = '';
      const p = this.gs.players[i];
      if (p.hasFinished) continue;

      for (let j = 0; j < p.cardCount; j++) {
        const el = this.createCardElement(null, true);
        container.appendChild(el);
      }
    }
  }

  renderTableCenter() {
    const container = $('table-center');
    container.innerHTML = '';
    if (!this.gs.currentTrick) return;

    this.gs.currentTrick.cards.forEach(card => {
      const el = this.createCardElement(card, false);
      el.classList.add('landed');
      container.appendChild(el);
    });
  }

  clearTableCenter() {
    $('table-center').innerHTML = '';
  }

  createCardElement(card, faceDown) {
    const el = document.createElement('div');
    el.className = `card${faceDown ? ' face-down' : ''}`;
    if (card) {
      el.setAttribute('data-suit', card.suit);
      el.setAttribute('data-rank', card.rank);
      el.setAttribute('data-id', card.id);
    }

    const inner = document.createElement('div');
    inner.className = 'card-inner';

    if (!faceDown && card) {
      inner.innerHTML = `
        <div class="card-corner top-left">
          <span class="card-rank">${card.rank}</span>
          <span class="card-suit-symbol">${card.symbol}</span>
        </div>
        <div class="card-center-suit">${card.symbol}</div>
        <div class="card-corner bottom-right">
          <span class="card-rank">${card.rank}</span>
          <span class="card-suit-symbol">${card.symbol}</span>
        </div>
      `;
    }

    el.appendChild(inner);
    return el;
  }

  // ========== CARD SELECTION ==========

  toggleCardSelection(card) {
    if (this.gs.currentPlayerIndex !== this.humanPlayerIndex) return;
    if (this.gs.animating) return;

    const idx = this.selectedCards.findIndex(c => c.id === card.id);
    if (idx >= 0) {
      this.selectedCards.splice(idx, 1);
    } else {
      this.selectedCards.push(card);
    }
    this.renderMyHand();
    this.updateActions();
    this.updateComboHint();
  }

  clearSelection() {
    this.selectedCards = [];
    this.renderMyHand();
    this.updateActions();
    this.updateComboHint();
  }

  updateActions() {
    const playBtn = $('play-btn');
    const passBtn = $('pass-btn');
    const actions = $('actions');

    const isMyTurn = this.gs.phase === GAME_PHASES.PLAYING &&
                     this.gs.currentPlayerIndex === this.humanPlayerIndex;

    // In local mode, also check isHuman
    if (this.mode === 'local') {
      const p = this.gs.players[this.humanPlayerIndex];
      if (!p?.isHuman) { actions.classList.add('hidden'); return; }
    }

    actions.classList.toggle('hidden', !isMyTurn);
    if (!isMyTurn) return;

    const combo = classify(this.selectedCards);
    const isValid = combo && canBeat(this.gs.currentTrick, combo);
    let meetsThreeSpades = true;
    if (this.gs.mustPlayThreeOfSpades && this.gs.playedCards.length === 0) {
      meetsThreeSpades = combo?.cards.some(c => c.id === '3_spades') ?? false;
    }
    playBtn.disabled = !isValid || !meetsThreeSpades;

    const canPass = this.gs.currentTrick !== null &&
                    !(this.gs.mustPlayThreeOfSpades && this.gs.playedCards.length === 0);
    passBtn.disabled = !canPass;
  }

  updateComboHint() {
    const hint = $('combo-hint');
    if (this.selectedCards.length === 0) { hint.textContent = ''; return; }
    const combo = classify(this.selectedCards);
    if (!combo) {
      hint.textContent = 'Invalid';
      hint.style.color = '#ef4444';
      return;
    }
    const names = {
      [COMBO_TYPES.SINGLE]: 'Single',
      [COMBO_TYPES.PAIR]: 'Pair',
      [COMBO_TYPES.TRIPLE]: 'Triple',
      [COMBO_TYPES.QUAD]: 'Four of a Kind',
      [COMBO_TYPES.STRAIGHT]: `Straight (${combo.length})`,
      [COMBO_TYPES.DOUBLE_SEQ]: `Double Sequence (${combo.length / 2} pairs)`,
    };
    const beats = canBeat(this.gs.currentTrick, combo);
    hint.textContent = names[combo.type] + (this.gs.currentTrick ? (beats ? ' \u2714' : ' \u2718') : '');
    hint.style.color = beats || !this.gs.currentTrick ? 'var(--accent)' : '#ef4444';
  }

  // ========== PLAYER ACTIONS ==========

  onPlayClick() {
    if (this.gs.currentPlayerIndex !== this.humanPlayerIndex) return;
    if (this.selectedCards.length === 0) return;

    if (this.mode === 'online') {
      // Send action to all players via broadcast
      const cardData = this.selectedCards.map(c => ({ rank: c.rank, suit: c.suit }));
      this.mp.sendAction({ type: 'play', seat: this.humanPlayerIndex, cards: cardData });
      return;
    }

    const result = this.gs.playCards(this.humanPlayerIndex, this.selectedCards);
    if (!result.success) {
      $('my-hand').classList.add('shake');
      setTimeout(() => $('my-hand').classList.remove('shake'), 350);
    }
  }

  onPassClick() {
    if (this.gs.currentPlayerIndex !== this.humanPlayerIndex) return;

    if (this.mode === 'online') {
      this.mp.sendAction({ type: 'pass', seat: this.humanPlayerIndex });
      this.selectedCards = [];
      return;
    }

    const result = this.gs.pass(this.humanPlayerIndex);
    if (!result.success) {
      $('my-hand').classList.add('shake');
      setTimeout(() => $('my-hand').classList.remove('shake'), 350);
    } else {
      this.selectedCards = [];
    }
  }

  // ========== ANIMATIONS ==========

  async animateDeal() {
    const hand = $('my-hand');
    hand.innerHTML = '';

    const player = this.gs.players[this.humanPlayerIndex];
    if (!player) return;

    for (let i = 0; i < player.hand.length; i++) {
      const card = player.hand[i];
      const el = this.createCardElement(card, false);
      el.classList.add('dealing');
      el.style.setProperty('--deal-from-y', '-200px');
      el.style.setProperty('--deal-from-x', `${(i - 6) * -15}px`);
      el.style.animationDelay = `${i * 60}ms`;
      el.addEventListener('click', () => this.toggleCardSelection(card));
      hand.appendChild(el);
      await delay(40);
    }

    for (let pi = 0; pi < this.gs.numPlayers; pi++) {
      if (pi === this.humanPlayerIndex) continue;
      const container = $(`opp-hand-${pi}`);
      if (!container) continue;
      container.innerHTML = '';
      const p = this.gs.players[pi];

      for (let j = 0; j < p.cardCount; j++) {
        const el = this.createCardElement(null, true);
        el.classList.add('dealing');
        el.style.setProperty('--deal-from-y', '100px');
        el.style.animationDelay = `${j * 30}ms`;
        container.appendChild(el);
      }
    }

    await delay(player.hand.length * 60 + 400);
  }

  async animatePlay(playerIndex, combo) {
    const center = $('table-center');
    center.innerHTML = '';

    for (const card of combo.cards) {
      const el = this.createCardElement(card, false);
      el.classList.add('playing');

      const fromY = playerIndex === this.humanPlayerIndex ? '200px' :
                    playerIndex === 2 ? '-200px' : '0px';
      const fromX = playerIndex === 1 ? '-200px' :
                    playerIndex === 3 ? '200px' : '0px';

      el.style.setProperty('--play-from-x', fromX);
      el.style.setProperty('--play-from-y', fromY);
      center.appendChild(el);
    }

    await delay(350);
  }

  async animateTrickClear() {
    const center = $('table-center');
    center.querySelectorAll('.card').forEach(el => el.classList.add('clearing'));
    await delay(400);
  }

  async showPassIndicator(playerIndex) {
    const panel = $(`panel-${playerIndex}`);
    if (!panel) return;
    const rect = panel.getBoundingClientRect();
    const indicator = document.createElement('div');
    indicator.className = 'pass-indicator show';
    indicator.textContent = 'Pass';
    indicator.style.left = `${rect.left + rect.width / 2 - 20}px`;
    indicator.style.top = `${rect.top - 10}px`;
    $('game-container').appendChild(indicator);
    await delay(1000);
    indicator.remove();
  }

  // ========== MESSAGES ==========

  async showMessage(text, sub, duration = 1500) {
    const overlay = $('message-overlay');
    $('message-text').textContent = text;
    $('message-sub').textContent = sub || '';
    overlay.classList.remove('hidden');
    await delay(duration);
    overlay.classList.add('hidden');
  }

  showTrickLabel(text) { $('trick-label').textContent = text; }

  showHandoff(name) {
    $('handoff-player-name').textContent = name;
    $('handoff-overlay').classList.remove('hidden');
    $('my-hand').innerHTML = '';
  }

  // ========== SETTINGS ==========

  openSettings() {
    $('settings-overlay').classList.remove('hidden');
    document.querySelectorAll('.theme-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.theme === this.settings.theme));
    document.querySelectorAll('.deck-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.deck === this.settings.deckStyle));
    document.querySelectorAll('.count-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.count) === this.settings.numPlayers));
    this.renderPlayerConfigs(this.settings.numPlayers);
  }

  closeSettings() {
    $('settings-overlay').classList.add('hidden');
    Settings.applyTheme(this.settings.theme);
    Settings.applyDeck(this.settings.deckStyle);
  }

  renderPlayerConfigs(count) {
    const container = $('player-configs');
    container.innerHTML = '';
    while (this.settings.playerConfigs.length < count) {
      this.settings.playerConfigs.push({
        name: `Bot ${this.settings.playerConfigs.length}`,
        isHuman: false, difficulty: 'medium'
      });
    }
    for (let i = 0; i < count; i++) {
      const cfg = this.settings.playerConfigs[i];
      const row = document.createElement('div');
      row.className = 'player-config';
      row.innerHTML = `
        <input type="text" value="${cfg.name}" data-idx="${i}" class="cfg-name" placeholder="Name">
        <select data-idx="${i}" class="cfg-type">
          <option value="human" ${cfg.isHuman ? 'selected' : ''}>Human</option>
          <option value="ai" ${!cfg.isHuman ? 'selected' : ''}>AI</option>
        </select>
        <select data-idx="${i}" class="cfg-diff" ${cfg.isHuman ? 'disabled' : ''}>
          <option value="easy" ${cfg.difficulty === 'easy' ? 'selected' : ''}>Easy</option>
          <option value="medium" ${cfg.difficulty === 'medium' ? 'selected' : ''}>Medium</option>
          <option value="hard" ${cfg.difficulty === 'hard' ? 'selected' : ''}>Hard</option>
        </select>
      `;
      container.appendChild(row);
      row.querySelector('.cfg-type').addEventListener('change', (e) => {
        row.querySelector('.cfg-diff').disabled = e.target.value === 'human';
      });
    }
  }

  saveSettings() {
    const activeTheme = document.querySelector('.theme-btn.active');
    const activeDeck = document.querySelector('.deck-btn.active');
    const activeCount = document.querySelector('.count-btn.active');

    this.settings.theme = activeTheme?.dataset.theme || 'dark';
    this.settings.deckStyle = activeDeck?.dataset.deck || 'classic';
    this.settings.numPlayers = parseInt(activeCount?.dataset.count || '4');

    const configs = [];
    const names = document.querySelectorAll('.cfg-name');
    const types = document.querySelectorAll('.cfg-type');
    const diffs = document.querySelectorAll('.cfg-diff');

    for (let i = 0; i < this.settings.numPlayers; i++) {
      configs.push({
        name: names[i]?.value || `Player ${i + 1}`,
        isHuman: types[i]?.value === 'human',
        difficulty: types[i]?.value === 'human' ? null : (diffs[i]?.value || 'medium'),
      });
    }
    this.settings.playerConfigs = configs;
    Settings.save(this.settings);
    this.applyVisuals();
    this.closeSettings();

    if (this.mode !== 'online') {
      this.startLocalGame();
    }
  }

  updateScoreDisplay() {
    $('score-display').textContent = `W: ${this.scores.wins} | L: ${this.scores.losses} | G: ${this.scores.games}`;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

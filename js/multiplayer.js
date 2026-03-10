import { bus } from './events.js';

const PARTY_HOST = window.location.hostname === 'localhost'
  ? 'localhost:1999'
  : 'tien-len.bookthebuilder.partykit.dev';

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no ambiguous chars
  let code = '';
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function generatePlayerId() {
  return 'p_' + Math.random().toString(36).slice(2, 10);
}

export class MultiplayerManager {
  constructor() {
    this.socket = null;
    this.roomCode = null;
    this.playerId = generatePlayerId();
    this.playerName = 'Player';
    this.isHost = false;
    this.players = [];
    this.maxPlayers = 4;
    this.onStateUpdate = null;
    this.onLobbyUpdate = null;
    this.onGameAction = null;
  }

  // --- HOST: Create Room ---
  async createRoom(playerName, maxPlayers) {
    this.playerName = playerName;
    this.maxPlayers = maxPlayers;
    this.isHost = true;
    this.roomCode = generateRoomCode();
    this.players = [];

    await this._connect();
    this._send('join-request', {
      id: this.playerId,
      name: playerName,
      maxPlayers,
    });
    return this.roomCode;
  }

  // --- CLIENT: Join Room ---
  async joinRoom(roomCode, playerName) {
    this.playerName = playerName;
    this.roomCode = roomCode.toUpperCase();
    this.isHost = false;

    await this._connect();
    this._send('join-request', {
      id: this.playerId,
      name: playerName,
    });
  }

  async _connect() {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }

    const { default: PartySocket } = await import('https://esm.sh/partysocket@0.0.25');

    return new Promise((resolve, reject) => {
      this.socket = new PartySocket({
        host: PARTY_HOST,
        room: this.roomCode,
      });

      this.socket.addEventListener('open', () => resolve());
      this.socket.addEventListener('error', (e) => reject(e));

      this.socket.addEventListener('close', () => {
        bus.emit('mp-disconnected', {});
      });

      this.socket.addEventListener('message', (e) => {
        let data;
        try {
          data = JSON.parse(e.data);
        } catch {
          return;
        }
        this._handleMessage(data);
      });
    });
  }

  _handleMessage({ event, payload }) {
    switch (event) {
      case 'lobby-update':
        this.players = payload.players;
        this.maxPlayers = payload.maxPlayers;
        // Derive isHost from server state
        const me = this.players.find(p => p.id === this.playerId);
        if (me) this.isHost = me.isHost;
        this.onLobbyUpdate?.(this.players, this.maxPlayers);
        break;
      case 'join-rejected':
        bus.emit('mp-error', { message: payload.reason });
        this.socket?.close();
        this.socket = null;
        break;
      case 'game-start':
        this.onGameAction?.('game-start', payload);
        break;
      case 'game-state':
        this.onStateUpdate?.(payload);
        break;
      case 'player-action':
        this.onGameAction?.('player-action', payload);
        break;
      case 'chat':
        bus.emit('mp-chat', payload);
        break;
    }
  }

  _send(event, payload) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify({ event, payload }));
    }
  }

  // --- Lobby Actions ---

  toggleReady() {
    this._send('player-ready', { id: this.playerId });
  }

  startGame(gameConfig) {
    if (!this.isHost) return;
    this._send('game-start', gameConfig);
  }

  // --- In-Game Actions ---

  sendAction(action) {
    this._send('player-action', { id: this.playerId, ...action });
  }

  broadcastState(state) {
    this._send('game-state', state);
  }

  // --- New Game (back to lobby) ---

  resetLobby() {
    if (this.isHost) {
      this._send('new-game', {});
    }
  }

  // --- Cleanup ---

  async leave() {
    if (this.socket) {
      this._send('player-leave', { id: this.playerId });
      this.socket.close();
      this.socket = null;
    }
    this.roomCode = null;
    this.players = [];
  }

  getMySeat() {
    return this.players.find(p => p.id === this.playerId)?.seat ?? -1;
  }

  getMyPlayer() {
    return this.players.find(p => p.id === this.playerId);
  }

  allReady() {
    return this.players.length >= 2 && this.players.every(p => p.isReady);
  }
}

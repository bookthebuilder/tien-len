import { getSupabase } from './supabase.js';
import { bus } from './events.js';

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
    this.supabase = null;
    this.channel = null;
    this.roomCode = null;
    this.playerId = generatePlayerId();
    this.playerName = 'Player';
    this.isHost = false;
    this.players = []; // { id, name, seat, isReady }
    this.maxPlayers = 4;
    this.onStateUpdate = null; // callback
    this.onLobbyUpdate = null; // callback
    this.onGameAction = null;  // callback
  }

  async init() {
    this.supabase = await getSupabase();
  }

  // --- HOST: Create Room ---
  async createRoom(playerName, maxPlayers) {
    await this.init();
    this.playerName = playerName;
    this.maxPlayers = maxPlayers;
    this.isHost = true;
    this.roomCode = generateRoomCode();

    this.players = [{
      id: this.playerId,
      name: playerName,
      seat: 0,
      isReady: false,
      isHost: true,
    }];

    await this._joinChannel();
    this._broadcastLobby();
    return this.roomCode;
  }

  // --- CLIENT: Join Room ---
  async joinRoom(roomCode, playerName) {
    await this.init();
    this.playerName = playerName;
    this.roomCode = roomCode.toUpperCase();
    this.isHost = false;

    await this._joinChannel();

    // Request current lobby state from host
    this.channel.send({
      type: 'broadcast',
      event: 'join-request',
      payload: { id: this.playerId, name: playerName },
    });
  }

  async _joinChannel() {
    if (this.channel) {
      await this.supabase.removeChannel(this.channel);
    }

    this.channel = this.supabase.channel(`room:${this.roomCode}`, {
      config: { broadcast: { self: true } },
    });

    // Listen for lobby updates
    this.channel.on('broadcast', { event: 'lobby-update' }, ({ payload }) => {
      this.players = payload.players;
      this.maxPlayers = payload.maxPlayers;
      this.onLobbyUpdate?.(this.players, this.maxPlayers);
    });

    // Listen for join requests (host only)
    this.channel.on('broadcast', { event: 'join-request' }, ({ payload }) => {
      if (!this.isHost) return;
      // Add player if room not full
      if (this.players.length >= this.maxPlayers) {
        this.channel.send({
          type: 'broadcast',
          event: 'join-rejected',
          payload: { id: payload.id, reason: 'Room is full' },
        });
        return;
      }
      if (this.players.some(p => p.id === payload.id)) return; // already in

      const seat = this._nextAvailableSeat();
      this.players.push({
        id: payload.id,
        name: payload.name,
        seat,
        isReady: false,
        isHost: false,
      });
      this._broadcastLobby();
    });

    // Listen for join rejection (client only)
    this.channel.on('broadcast', { event: 'join-rejected' }, ({ payload }) => {
      if (payload.id === this.playerId) {
        bus.emit('mp-error', { message: payload.reason });
      }
    });

    // Listen for ready toggle
    this.channel.on('broadcast', { event: 'player-ready' }, ({ payload }) => {
      if (!this.isHost) return;
      const p = this.players.find(pl => pl.id === payload.id);
      if (p) {
        p.isReady = payload.ready;
        this._broadcastLobby();
      }
    });

    // Listen for game start (from host)
    this.channel.on('broadcast', { event: 'game-start' }, ({ payload }) => {
      this.onGameAction?.('game-start', payload);
    });

    // Listen for game state sync (host broadcasts full state)
    this.channel.on('broadcast', { event: 'game-state' }, ({ payload }) => {
      if (this.isHost) return; // host doesn't need its own broadcast
      this.onStateUpdate?.(payload);
    });

    // Listen for player actions (all clients process for state sync)
    this.channel.on('broadcast', { event: 'player-action' }, ({ payload }) => {
      this.onGameAction?.('player-action', payload);
    });

    // Listen for player disconnect
    this.channel.on('broadcast', { event: 'player-leave' }, ({ payload }) => {
      if (!this.isHost) return;
      this.players = this.players.filter(p => p.id !== payload.id);
      this._broadcastLobby();
    });

    // Listen for chat/messages
    this.channel.on('broadcast', { event: 'chat' }, ({ payload }) => {
      bus.emit('mp-chat', payload);
    });

    await this.channel.subscribe();
  }

  _nextAvailableSeat() {
    const taken = new Set(this.players.map(p => p.seat));
    for (let i = 0; i < this.maxPlayers; i++) {
      if (!taken.has(i)) return i;
    }
    return this.players.length;
  }

  _broadcastLobby() {
    this.channel?.send({
      type: 'broadcast',
      event: 'lobby-update',
      payload: { players: this.players, maxPlayers: this.maxPlayers },
    });
  }

  // --- Lobby Actions ---

  toggleReady() {
    const me = this.players.find(p => p.id === this.playerId);
    if (!me) return;
    this.channel?.send({
      type: 'broadcast',
      event: 'player-ready',
      payload: { id: this.playerId, ready: !me.isReady },
    });
    // Optimistic update for host
    if (this.isHost) {
      me.isReady = !me.isReady;
      this._broadcastLobby();
    }
  }

  // Host starts the game
  startGame(gameConfig) {
    if (!this.isHost) return;
    this.channel?.send({
      type: 'broadcast',
      event: 'game-start',
      payload: gameConfig,
    });
  }

  // --- In-Game Actions ---

  // Client sends an action to host
  sendAction(action) {
    this.channel?.send({
      type: 'broadcast',
      event: 'player-action',
      payload: { id: this.playerId, ...action },
    });
  }

  // Host broadcasts full game state to all clients
  broadcastState(state) {
    this.channel?.send({
      type: 'broadcast',
      event: 'game-state',
      payload: state,
    });
  }

  // --- Cleanup ---

  async leave() {
    if (this.channel) {
      this.channel.send({
        type: 'broadcast',
        event: 'player-leave',
        payload: { id: this.playerId },
      });
      await this.supabase.removeChannel(this.channel);
      this.channel = null;
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

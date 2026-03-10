export default class TienLenRoom {
  constructor(room) {
    this.room = room;
    this.players = [];
    this.maxPlayers = 4;
    this.gameStarted = false;
  }

  onConnect(connection, ctx) {
    // Client sends join-request after connecting
  }

  onMessage(message, sender) {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    switch (data.event) {
      case 'join-request':
        this._handleJoin(data.payload, sender);
        break;
      case 'player-ready':
        this._handleReady(data.payload, sender);
        break;
      case 'game-start':
        this._handleGameStart(data.payload, sender);
        break;
      case 'game-state':
        this._handleGameState(data.payload, sender);
        break;
      case 'player-action':
        this._broadcast('player-action', data.payload);
        break;
      case 'player-leave':
        this._removePlayer(sender.id);
        break;
      case 'chat':
        this._broadcast('chat', data.payload);
        break;
      case 'new-game':
        this._handleNewGame(sender);
        break;
    }
  }

  onClose(connection) {
    this._removePlayer(connection.id);
  }

  // --- Handlers ---

  _handleJoin(payload, sender) {
    if (this.players.length >= this.maxPlayers) {
      this._send(sender, 'join-rejected', { reason: 'Room is full' });
      return;
    }
    if (this.players.some(p => p.id === payload.id)) {
      // Reconnecting player - update their connection ID
      const existing = this.players.find(p => p.id === payload.id);
      existing.connectionId = sender.id;
      this._broadcastLobby();
      return;
    }

    const isFirst = this.players.length === 0;
    const seat = this._nextAvailableSeat();

    this.players.push({
      id: payload.id,
      name: payload.name,
      seat,
      isReady: false,
      isHost: isFirst,
      connectionId: sender.id,
    });

    if (isFirst && payload.maxPlayers) {
      this.maxPlayers = payload.maxPlayers;
    }

    this._broadcastLobby();
  }

  _handleReady(payload, sender) {
    const p = this.players.find(pl => pl.connectionId === sender.id);
    if (p) {
      p.isReady = !p.isReady;
      this._broadcastLobby();
    }
  }

  _handleGameStart(payload, sender) {
    const p = this.players.find(pl => pl.connectionId === sender.id);
    if (!p?.isHost) return;
    this.gameStarted = true;
    this._broadcast('game-start', payload);
  }

  _handleGameState(payload, sender) {
    // Host broadcasts state to non-host clients
    const p = this.players.find(pl => pl.connectionId === sender.id);
    if (!p?.isHost) return;
    for (const conn of this.room.getConnections()) {
      if (conn.id !== sender.id) {
        this._send(conn, 'game-state', payload);
      }
    }
  }

  _handleNewGame(sender) {
    const p = this.players.find(pl => pl.connectionId === sender.id);
    if (!p?.isHost) return;
    this.gameStarted = false;
    this.players.forEach(pl => { pl.isReady = false; });
    this._broadcastLobby();
  }

  _removePlayer(connectionId) {
    const player = this.players.find(p => p.connectionId === connectionId);
    if (!player) return;

    this.players = this.players.filter(p => p.connectionId !== connectionId);

    // Promote new host if needed
    if (this.players.length > 0 && !this.players.some(p => p.isHost)) {
      this.players[0].isHost = true;
    }

    this._broadcastLobby();
  }

  _broadcastLobby() {
    this._broadcast('lobby-update', {
      players: this.players.map(({ connectionId, ...rest }) => rest),
      maxPlayers: this.maxPlayers,
    });
  }

  _broadcast(event, payload) {
    const msg = JSON.stringify({ event, payload });
    for (const conn of this.room.getConnections()) {
      conn.send(msg);
    }
  }

  _send(connection, event, payload) {
    connection.send(JSON.stringify({ event, payload }));
  }

  _nextAvailableSeat() {
    const taken = new Set(this.players.map(p => p.seat));
    for (let i = 0; i < this.maxPlayers; i++) {
      if (!taken.has(i)) return i;
    }
    return this.players.length;
  }
}

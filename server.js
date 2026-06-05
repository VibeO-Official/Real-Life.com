const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

class GameRoom {
  constructor(roomId, maxPlayers = 8) {
    this.id = roomId;
    this.maxPlayers = maxPlayers;
    this.players = new Map();
    this.gameState = {
      wave: 1,
      time: 0,
      zombies: [],
      buildings: []
    };
  }

  addPlayer(playerId, playerData) {
    this.players.set(playerId, {
      id: playerId,
      nickname: playerData.nickname,
      position: { x: 0, y: 0, z: 0 },
      rotation: 0,
      hp: 100,
      weapon: 'rifle',
      coins: 0,
      wood: 0,
      kills: 0,
      ...playerData
    });
  }

  removePlayer(playerId) {
    this.players.delete(playerId);
  }

  isFull() {
    return this.players.size >= this.maxPlayers;
  }

  isEmpty() {
    return this.players.size === 0;
  }

  broadcast(message, excludePlayerId = null) {
    const messageStr = JSON.stringify(message);
    for (const [playerId, playerWs] of playerConnections) {
      if (excludePlayerId && playerId === excludePlayerId) continue;
      if (playerWs && playerWs.readyState === WebSocket.OPEN) {
        playerWs.send(messageStr);
      }
    }
  }
}

const gameRooms = {};
const playerConnections = new Map();

wss.on('connection', (ws) => {
  let playerId = null;
  let roomId = null;
  let room = null;

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);

      switch (data.type) {
        case 'join':
          playerId = data.playerId || 'player_' + Math.random().toString(36).substr(2, 9);
          roomId = data.roomId || 'default';
          const playerNickname = data.nickname || 'Player';

          if (!gameRooms[roomId]) {
            gameRooms[roomId] = new GameRoom(roomId);
          }

          room = gameRooms[roomId];

          if (room.isFull()) {
            ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
            return;
          }

          room.addPlayer(playerId, {
            nickname: playerNickname,
            position: {
              x: (Math.random() - 0.5) * 100,
              y: 0,
              z: (Math.random() - 0.5) * 100
            }
          });

          playerConnections.set(playerId, ws);

          ws.send(JSON.stringify({
            type: 'joinSuccess',
            playerId: playerId,
            players: Array.from(room.players.values()),
            gameState: room.gameState
          }));

          room.broadcast({
            type: 'playerJoined',
            player: room.players.get(playerId)
          }, playerId);
          break;

        case 'playerUpdate':
          if (room && room.players.has(data.playerId)) {
            const player = room.players.get(data.playerId);
            player.position = data.position;
            player.rotation = data.rotation;
            player.weapon = data.weapon;

            room.broadcast({
              type: 'playerMoved',
              playerId: data.playerId,
              position: data.position,
              rotation: data.rotation,
              weapon: data.weapon
            });
          }
          break;

        case 'shoot':
          if (room) {
            room.broadcast({
              type: 'shoot',
              playerId: data.playerId,
              weaponType: data.weaponType,
              position: data.position,
              direction: data.direction
            });
          }
          break;

        case 'damage':
          if (room && room.players.has(data.targetPlayerId)) {
            const targetPlayer = room.players.get(data.targetPlayerId);
            targetPlayer.hp -= data.damage;

            if (targetPlayer.hp <= 0) {
              room.players.get(data.attackerPlayerId).kills++;
              room.broadcast({
                type: 'playerKilled',
                killedPlayerId: data.targetPlayerId,
                killerPlayerId: data.attackerPlayerId
              });
            } else {
              room.broadcast({
                type: 'playerDamaged',
                targetPlayerId: data.targetPlayerId,
                hp: targetPlayer.hp
              });
            }
          }
          break;
      }
    } catch (e) {
      console.error('Error:', e);
    }
  });

  ws.on('close', () => {
    if (playerId && room) {
      room.removePlayer(playerId);
      room.broadcast({ type: 'playerLeft', playerId: playerId });
      if (room.isEmpty()) {
        delete gameRooms[roomId];
      }
    }
    playerConnections.delete(playerId);
  });
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, () => {
  console.log(`🎮 Zombie Survival Server on ws://localhost:${PORT}`);
});

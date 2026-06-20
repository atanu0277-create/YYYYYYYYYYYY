import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { createServer } from "http";
import { Server } from "socket.io";
import { nanoid } from "nanoid";
import crypto from "crypto";

async function startServer() {
  const app = express();
  const httpServer = createServer(app);
  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });
  const PORT = 3000;

  // Real-time Game State
  const rooms = new Map();

  io.on("connection", (socket) => {
    
    socket.on("create-room", ({ playerName, color, playerCount }) => {
      const roomCode = nanoid(7);
      const hostId = socket.id;
      
      const newRoom = {
        code: roomCode,
        host: hostId,
        playerCount: parseInt(playerCount),
        players: [{
          id: socket.id,
          name: playerName.slice(0, 12),
          color: color,
          ready: true,
          online: true,
          tokens: [-1, -1, -1, -1],
          stats: { captures: 0, moves: 0 },
          rank: null,
          hasFinished: false
        }],
        started: false,
        turnIndex: 0,
        turnTimer: null,
        diceValue: null,
        diceRolled: false,
        extraTurns: 0,
        messages: [],
        spectators: [],
        history: [],
      };
      
      rooms.set(roomCode, newRoom);
      socket.join(roomCode);
      socket.emit("room-update", getRoomData(newRoom));
    });

    socket.on("join-room", ({ roomCode, playerName, color }) => {
      const room = rooms.get(roomCode);
      if (!room) return socket.emit("error-message", "Room not found.");
      if (room.started) {
        // join as spectator
        room.spectators.push(socket.id);
        socket.join(roomCode);
        socket.emit("spectator-joined", getRoomData(room));
        io.to(roomCode).emit("spectator-count", { count: room.spectators.length });
        socket.emit("game-started", getGameState(room));
        return;
      }

      const existingPlayer = room.players.find(p => p.id === socket.id);
      if (existingPlayer) {
        if (color) {
          if (room.players.some(p => p.id !== socket.id && p.color === color)) {
            return socket.emit("error-message", "Color already taken.");
          }
          existingPlayer.color = color;
        }
        if (playerName) {
          existingPlayer.name = playerName.slice(0, 12);
        }
      } else {
        if (room.players.length >= room.playerCount) {
          return socket.emit("error-message", "Room is full.");
        }
        if (color && room.players.some(p => p.color === color)) {
          return socket.emit("error-message", "Color already taken.");
        }
        
        room.players.push({
          id: socket.id,
          name: playerName.slice(0, 12),
          color: color,
          ready: false,
          online: true,
          tokens: [-1, -1, -1, -1],
          stats: { captures: 0, moves: 0 },
          rank: null,
          hasFinished: false
        });
      }
      
      socket.join(roomCode);
      io.to(roomCode).emit("room-update", getRoomData(room));
    });

    socket.on("player-ready", ({ ready }) => {
      for (const room of rooms.values()) {
        const p = room.players.find(p => p.id === socket.id);
        if (p) {
          if (ready && !p.color) {
            return socket.emit("error-message", "Please select a color first.");
          }
          p.ready = ready;
          io.to(room.code).emit("room-update", getRoomData(room));
          break;
        }
      }
    });

    socket.on("start-game", () => {
      for (const room of rooms.values()) {
        if (room.host === socket.id && !room.started) {
          if (room.players.length === room.playerCount && room.players.every(p => p.ready && p.color)) {
            room.started = true;
            io.to(room.code).emit("game-started", getGameState(room));
            startTurnTimer(room);
          }
          break;
        }
      }
    });

    socket.on("roll-dice", () => {
      for (const room of rooms.values()) {
        if (!room.started) continue;
        const currentPlayer = room.players[room.turnIndex];
        if (currentPlayer.id === socket.id && !room.diceRolled) {
          room.diceValue = crypto.randomInt(1, 7);
          room.diceRolled = true;
          room.history.push({ color: currentPlayer.color, value: room.diceValue });
          if(room.history.length > 10) room.history.shift();
          
          io.to(room.code).emit("dice-rolled", { value: room.diceValue, playerId: socket.id, history: room.history });
          
          if (!canPlayerMove(room, currentPlayer)) {
             // Auto skip if no valid moves
             setTimeout(() => { nextTurn(room); }, 1500);
          } else {
             resetTurnTimer(room); // Give time to pick
          }
          break;
        }
      }
    });

    socket.on("move-token", ({ tokenIndex }) => {
        for (const room of rooms.values()) {
            if (!room.started) continue;
            const currentPlayer = room.players[room.turnIndex];
            if (currentPlayer.id === socket.id && room.diceRolled) {
                if (tokenIndex < 0 || tokenIndex > 3) return;
                
                const moveResult = handleMove(room, currentPlayer, tokenIndex);
                if (moveResult.success) {
                    currentPlayer.stats.moves++;
                    io.to(room.code).emit("game-state-update", getGameState(room));
                    
                    if (moveResult.finished) {
                        if (currentPlayer.tokens.every(t => t === 58)) {
                            currentPlayer.hasFinished = true;
                            currentPlayer.rank = room.players.filter(p => p.hasFinished).length;
                        }
                    }

                    if (checkGameOver(room)) {
                        handleGameOver(room);
                    } else {
                        setTimeout(() => {
                           if (moveResult.earnedExtraTurn) {
                               room.diceRolled = false;
                               room.extraTurns++;
                               if (room.extraTurns > 2) {
                                   nextTurn(room); // max 3 turns
                               } else {
                                   io.to(room.code).emit("your-turn", { playerIndex: room.turnIndex, timerSeconds: 30 });
                                   resetTurnTimer(room);
                               }
                           } else {
                               nextTurn(room);
                           }
                        }, 500);
                    }
                }
                break;
            }
        }
    });

    socket.on("send-chat", ({ message }) => {
        for (const room of rooms.values()) {
            const player = room.players.find(p => p.id === socket.id);
            if (player || room.spectators.includes(socket.id)) {
                const msg = {
                    playerName: player ? player.name : "Spectator",
                    color: player ? player.color : "#999",
                    message: message.slice(0, 100),
                    timestamp: Date.now()
                };
                room.messages.push(msg);
                if (room.messages.length > 100) room.messages.shift();
                io.to(room.code).emit("chat-message", msg);
                break;
            }
        }
    });

    socket.on("disconnect", () => {
       // graceful disconnect logic omitted for brevity, but would handle host transfer and 60s timeout
       for (const room of rooms.values()) {
           const pIndex = room.players.findIndex(p => p.id === socket.id);
           if (pIndex !== -1) {
               room.players[pIndex].online = false;
               io.to(room.code).emit("room-update", getRoomData(room));
               // If host drops before start
               if (!room.started && room.host === socket.id) {
                   const firstOnline = room.players.find(p => p.online);
                   if (firstOnline) {
                       room.host = firstOnline.id;
                   } else {
                       rooms.delete(room.code);
                   }
               }
           }
       }
    });
  });

  function getRoomData(room) {
    const availableColors = ["Red", "Blue", "Green", "Yellow"].filter(c => !room.players.some(p => p.color === c));
    return {
      code: room.code,
      host: room.host,
      playerCount: room.playerCount,
      players: room.players.map(p => ({
        name: p.name, color: p.color, ready: p.ready, online: p.online, id: p.id, host: p.id === room.host
      })),
      availableColors,
      started: room.started
    };
  }

  function getGameState(room) {
    return {
      turnIndex: room.turnIndex,
      diceRolled: room.diceRolled,
      diceValue: room.diceValue,
      players: room.players,
      history: room.history
    };
  }

  function startTurnTimer(room) {
    resetTurnTimer(room);
    io.to(room.code).emit("your-turn", { playerIndex: room.turnIndex, timerSeconds: 30 });
  }

  function resetTurnTimer(room) {
    if (room.turnTimer) clearTimeout(room.turnTimer);
    room.turnTimer = setTimeout(() => {
      // time up
      nextTurn(room);
    }, 30000);
  }

  function nextTurn(room) {
    room.diceRolled = false;
    room.diceValue = null;
    room.extraTurns = 0;
    
    let iterations = 0;
    do {
        room.turnIndex = (room.turnIndex + 1) % room.players.length;
        iterations++;
    } while (room.players[room.turnIndex].hasFinished && iterations < room.players.length);

    startTurnTimer(room);
    io.to(room.code).emit("game-state-update", getGameState(room));
  }

  function checkGameOver(room) {
      return room.players.filter(p => !p.hasFinished).length <= 1;
  }

  function handleGameOver(room) {
      if (room.turnTimer) clearTimeout(room.turnTimer);
      const finished = room.players.filter(p => p.hasFinished).sort((a,b) => a.rank - b.rank);
      const remaining = room.players.filter(p => !p.hasFinished);
      const finalRanks = [...finished, ...remaining];
      io.to(room.code).emit("game-over", { 
          winnerOrder: finalRanks.map(p => ({name: p.name, color: p.color})),
          stats: finalRanks.map(p => p.stats)
      });
  }

  function canPlayerMove(room, p) {
      for (const t of p.tokens) {
          if (t === -1 && room.diceValue === 6) return true;
          if (t >= 0 && t + room.diceValue <= 58) return true;
      }
      return false;
  }

  function handleMove(room, p, tokenIndex) {
      const pos = p.tokens[tokenIndex];
      const d = room.diceValue;
      let earnedExtraTurn = (d === 6);
      let finished = false;

      if (pos === -1) {
          if (d !== 6) return { success: false };
          p.tokens[tokenIndex] = 0;
      } else {
          if (pos + d > 58) return { success: false };
          p.tokens[tokenIndex] += d;
          if (p.tokens[tokenIndex] === 58) {
              earnedExtraTurn = true;
              finished = true;
          } else if (p.tokens[tokenIndex] < 52) { // check capture
              const globalPos = getGlobalPos(p.color, p.tokens[tokenIndex]);
              const safeCells = [0, 8, 13, 21, 26, 34, 39, 47];
              if (!safeCells.includes(globalPos)) {
                  room.players.forEach(op => {
                      if (op.id !== p.id) {
                          op.tokens.forEach((ot, otIdx) => {
                              if (ot >= 0 && ot < 52 && getGlobalPos(op.color, ot) === globalPos) {
                                  // Capture
                                  op.tokens[otIdx] = -1;
                                  earnedExtraTurn = true;
                                  p.stats.captures++;
                              }
                          });
                      }
                  });
              }
          }
      }
      return { success: true, earnedExtraTurn, finished };
  }

  function getGlobalPos(color, localPos) {
      const startOffsets = { "Red": 0, "Blue": 13, "Green": 26, "Yellow": 39 };
      return (localPos + startOffsets[color]) % 52;
  }

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Note: express v4
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, "0.0.0.0", () => {
    console.log("Server running on port 3000");
  });
}

startServer();

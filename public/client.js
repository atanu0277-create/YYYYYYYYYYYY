import { trackCells, homeStretches, baseSpots, safeIndices } from './board-data.js';

const socket = io();

// UI Elements
const els = {
    loader: document.getElementById('loader'),
    menuScreen: document.getElementById('menu-screen'),
    createForm: document.getElementById('create-form'),
    joinForm: document.getElementById('join-form'),
    lobbyScreen: document.getElementById('lobby-screen'),
    gameScreen: document.getElementById('game-screen'),
    gameOverScreen: document.getElementById('game-over-screen'),
    errorMsg: document.getElementById('error-msg'),
    hostColorPicker: document.getElementById('host-color-picker'),
    
    // Lobby
    lobbyCode: document.getElementById('lobby-code'),
    playersList: document.getElementById('players-list'),
    checkReady: document.getElementById('check-ready'),
    btnStartGame: document.getElementById('btn-start-game'),
    lobbyColorPicker: document.getElementById('lobby-color-picker'),
    joinColorOptions: document.getElementById('join-color-options'),
    
    // Game
    canvas: document.getElementById('game-board'),
    turnBanner: document.getElementById('turn-banner'),
    mainDice: document.getElementById('main-dice'),
    diceContainer: document.getElementById('dice-container'),
    timerText: document.getElementById('timer-text'),
    timerPath: document.getElementById('timer-path'),
    winnerList: document.getElementById('winner-list'),
    gameRoomCode: document.getElementById('game-room-code'),
    spectatorIndicator: document.getElementById('spectator-indicator'),
    gamePlayersColumn: document.getElementById('game-players-column'),
    historyGrid: document.getElementById('history-grid'),

    // Chat
    lobbyChatMessages: document.getElementById('lobby-chat-messages'),
    lobbyChatInput: document.getElementById('lobby-chat-input'),
    gameChatMessages: document.getElementById('game-chat-messages'),
    gameChatInput: document.getElementById('game-chat-input')
};

const ctx = els.canvas.getContext('2d');
const CELL_SIZE = 38;
const OFFSET = 15;

const PALETTE = {
    Red: '#e74c3c',
    Blue: '#3498db',
    Green: '#2ecc71',
    Yellow: '#f1c40f',
    Blank: '#ffffff',
    Border: '#333'
};
const DICE_FACES = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

// State
let myPlayerId = null;
let roomState = null;
let gameState = null;
let myColor = null;
let timerInterval = null;
let tokensMoving = false; // block inputs during animation

function init() {
    els.loader.classList.add('hidden');
    els.menuScreen.classList.remove('hidden');

    // Tabs
    document.getElementById('tab-create').addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        els.createForm.classList.remove('hidden');
        els.joinForm.classList.add('hidden');
        els.errorMsg.innerText = '';
    });
    document.getElementById('tab-join').addEventListener('click', (e) => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        e.target.classList.add('active');
        els.createForm.classList.add('hidden');
        els.joinForm.classList.remove('hidden');
        els.errorMsg.innerText = '';
    });

    // Color picker
    els.hostColorPicker.addEventListener('click', (e) => {
        if(e.target.classList.contains('color-circle')) {
            els.hostColorPicker.querySelectorAll('.color-circle').forEach(c => c.classList.remove('selected'));
            e.target.classList.add('selected');
        }
    });

    // Create / Join Actions
    document.getElementById('btn-create-room').addEventListener('click', () => {
        const name = document.getElementById('host-name').value.trim();
        const color = els.hostColorPicker.querySelector('.selected').dataset.color;
        const count = document.getElementById('player-count').value;
        if (!name) return showError("Please enter your name");
        myColor = color;
        socket.emit('create-room', { playerName: name || "Player 1", color, playerCount: count });
    });

    document.getElementById('btn-join-room').addEventListener('click', () => {
        const name = document.getElementById('join-name').value.trim();
        const code = document.getElementById('join-code').value.trim();
        if (!name || !code) return showError("Name and Code required");
        socket.emit('join-room', { roomCode: code, playerName: name, color: null }); // join as pending first
    });

    document.getElementById('btn-copy-code').addEventListener('click', () => {
        navigator.clipboard.writeText(els.lobbyCode.innerText);
    });

    els.checkReady.addEventListener('change', (e) => {
        socket.emit('player-ready', { ready: e.target.checked });
    });

    els.btnStartGame.addEventListener('click', () => {
        socket.emit('start-game');
    });

    els.diceContainer.addEventListener('click', () => {
        if (!gameState || tokensMoving) return;
        const cp = gameState.players[gameState.turnIndex];
        if (cp.id === myPlayerId && !gameState.diceRolled) {
            socket.emit('roll-dice');
        }
    });

    els.canvas.addEventListener('click', handleBoardClick);

    // Chat
    document.getElementById('btn-leave-lobby').addEventListener('click', () => {
        location.reload();
    });
    document.getElementById('btn-lobby-send').addEventListener('click', () => sendChat('lobby'));
    document.getElementById('btn-game-send').addEventListener('click', () => sendChat('game'));
    els.lobbyChatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat('lobby'); });
    els.gameChatInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendChat('game'); });
}

function showError(msg) {
    els.errorMsg.innerText = msg;
    setTimeout(() => els.errorMsg.innerText = '', 3000);
}

// Socket listening
socket.on('connect', () => {
    myPlayerId = socket.id;
});

socket.on('error-message', (msg) => {
    showError(msg);
});

socket.on('room-update', (data) => {
    roomState = data;
    els.menuScreen.classList.add('hidden');
    els.lobbyScreen.classList.remove('hidden');
    els.lobbyCode.innerText = data.code;
    if (els.gameRoomCode) {
        els.gameRoomCode.innerText = data.code;
    }
    
    // Are we host?
    const me = data.players.find(p => p.id === myPlayerId);
    if (me && me.host) {
        els.btnStartGame.classList.remove('hidden');
        els.btnStartGame.disabled = !(data.players.length === data.playerCount && data.players.every(p => p.ready));
        els.lobbyColorPicker.classList.add('hidden');
    } else {
        els.btnStartGame.classList.add('hidden');
        if (me && !me.color) {
            // Need to pick color
            els.lobbyColorPicker.classList.remove('hidden');
            els.joinColorOptions.innerHTML = '';
            data.availableColors.forEach(c => {
                const cir = document.createElement('div');
                cir.className = `color-circle ${c.toLowerCase()}`;
                cir.onclick = () => {
                    socket.emit('join-room', { roomCode: data.code, playerName: me.name, color: c });
                };
                els.joinColorOptions.appendChild(cir);
            });
        } else {
            els.lobbyColorPicker.classList.add('hidden');
        }
    }

    // List players
    els.playersList.innerHTML = '';
    data.players.forEach(p => {
        els.playersList.innerHTML += `
            <div class="player-card">
                <div class="color-circle" style="width:20px;height:20px;background:${p.color ? PALETTE[p.color] : '#555'}"></div>
                <span>${p.name} ${p.host ? '👑' : ''}</span>
                <div class="player-status">
                    ${p.online ? '🟢' : '🔴'} 
                    ${p.ready ? '✅' : '⬜'}
                </div>
            </div>
        `;
    });
});

socket.on('spectator-count', (data) => {
    if (els.spectatorIndicator) {
        els.spectatorIndicator.innerText = data.count;
    }
});

socket.on('game-started', (gState) => {
    els.lobbyScreen.classList.add('hidden');
    els.gameScreen.classList.remove('hidden');
    gameState = gState;
    myColor = gameState.players.find(p => p.id === myPlayerId)?.color || 'Spectator';
    resizeCanvas();
    drawBoard();
    updateUI();
});

socket.on('game-state-update', (gState) => {
    gameState = gState;
    if(!tokensMoving) drawBoard();
    updateUI();
});

socket.on('your-turn', ({ playerIndex, timerSeconds }) => {
    startTimer(timerSeconds);
    if (gameState) {
        const cp = gameState.players[playerIndex];
        if (cp && cp.id === myPlayerId) {
            els.diceContainer.classList.remove('disabled');
        } else {
            els.diceContainer.classList.add('disabled');
        }
    } else {
        els.diceContainer.classList.remove('disabled');
    }
    els.mainDice.innerText = '⚀'; // reset looking
});

socket.on('dice-rolled', ({ value, playerId, history }) => {
    // animate dice
    els.mainDice.classList.add('roll-anim');
    let ticks = 0;
    const inter = setInterval(() => {
        els.mainDice.innerText = DICE_FACES[Math.floor(Math.random() * 6) + 1];
        ticks++;
        if (ticks > 10) {
            clearInterval(inter);
            els.mainDice.classList.remove('roll-anim');
            els.mainDice.innerText = DICE_FACES[value];
            gameState.diceValue = value;
            gameState.diceRolled = true;
            drawBoard(); // redraw highlights
        }
    }, 50);
});

socket.on('chat-message', (msg) => {
    const p = document.createElement('div');
    p.innerHTML = `<b style="color:${PALETTE[msg.color] || '#fff'}">${msg.playerName}</b>: ${msg.message}`;
    els.lobbyChatMessages.appendChild(p.cloneNode(true));
    els.gameChatMessages.appendChild(p);
    els.lobbyChatMessages.scrollTo(0, 9999);
    els.gameChatMessages.scrollTo(0, 9999);
});

socket.on('game-over', (res) => {
    els.gameScreen.classList.add('hidden');
    els.gameOverScreen.classList.remove('hidden');
    els.winnerList.innerHTML = '';
    res.winnerOrder.forEach((p, idx) => {
        els.winnerList.innerHTML += `
            <div class="player-card" style="justify-content:flex-start">
                <h2>#${idx+1}</h2>
                <div class="color-circle" style="width:20px;height:20px;background:${PALETTE[p.color]}"></div>
                <span>${p.name}</span>
            </div>
        `;
    });
});

function resizeCanvas() {
    const wrap = els.canvas.parentElement;
    const size = Math.min(wrap.clientWidth, wrap.clientHeight);
    els.canvas.style.width = `${size}px`;
    els.canvas.style.height = `${size}px`;
}
window.addEventListener('resize', resizeCanvas);


function startTimer(sec) {
    if (timerInterval) clearInterval(timerInterval);
    let rem = sec;
    els.timerText.innerText = rem;
    els.timerPath.style.transition = 'none';
    els.timerPath.style.strokeDashoffset = '0';
    setTimeout(() => {
        els.timerPath.style.transition = `stroke-dashoffset ${sec}s linear`;
        els.timerPath.style.strokeDashoffset = '100';
    }, 50);
    timerInterval = setInterval(() => {
        rem--;
        els.timerText.innerText = Math.max(0, rem);
        if (rem <= 0) clearInterval(timerInterval);
    }, 1000);
}

function updateUI() {
    if(!gameState) return;
    const cp = gameState.players[gameState.turnIndex];
    els.turnBanner.innerText = cp.id === myPlayerId ? "Your Turn!" : `${cp.name}'s Turn`;
    els.turnBanner.style.color = PALETTE[cp.color];
    
    if (cp.id !== myPlayerId || gameState.diceRolled) {
        els.diceContainer.classList.add('disabled');
    } else {
        els.diceContainer.classList.remove('disabled');
    }

    // Left Sidebar: Dynamic player cards
    if (els.gamePlayersColumn) {
        els.gamePlayersColumn.innerHTML = '';
        gameState.players.forEach((p, idx) => {
            const isActive = (idx === gameState.turnIndex);
            const statusIndicator = p.online ? '🟢' : '🔴';
            const rankLabel = p.rank ? `<span class="tag" style="background:#f1c40f;color:#000;margin-left:5px;">#${p.rank}</span>` : '';
            const isMe = p.id === myPlayerId ? ' (You)' : '';
            const movesText = p.stats ? p.stats.moves : 0;
            const capturesText = p.stats ? p.stats.captures : 0;
            
            els.gamePlayersColumn.innerHTML += `
                <div class="player-card glass ${isActive ? 'active' : ''}" style="margin-bottom:8px; padding: 12px; display: flex; align-items: center; gap: 12px; border-radius:12px;">
                    <div style="width: 24px; height: 24px; border-radius: 50%; background: ${PALETTE[p.color] || '#555'}; border: 2px solid #fff;"></div>
                    <div style="flex: 1;">
                        <span style="font-size: 14px; font-weight: 700; color: #fff;">${p.name}${isMe} ${rankLabel}</span>
                        <div style="display: flex; gap: 10px; font-size: 11px; opacity: 0.7;">
                            <span>Captures: ${capturesText}</span>
                            <span>Moves: ${movesText}</span>
                        </div>
                    </div>
                    <div>${statusIndicator}</div>
                </div>
            `;
        });
    }

    // Right Sidebar: History Roll list
    if (els.historyGrid) {
        els.historyGrid.innerHTML = '';
        if (!gameState.history || gameState.history.length === 0) {
            els.historyGrid.innerHTML = '<div class="history-empty">No rolls yet</div>';
        } else {
            gameState.history.forEach(h => {
                els.historyGrid.innerHTML += `
                    <div class="history-item" style="background: ${PALETTE[h.color] || '#555'}; text-shadow: 0 1px 2px rgba(0,0,0,0.5);">
                        ${h.value}
                    </div>
                `;
            });
        }
    }
}

// ---------------------------
// BOARD RENDERING
// ---------------------------
function drawBoard() {
    ctx.clearRect(0,0,600,600);
    
    // Draw Bases
    drawBase(0, 0, PALETTE.Yellow, baseSpots.Yellow); // Top-Left
    drawBase(9, 0, PALETTE.Red, baseSpots.Red); // Top-Right
    drawBase(0, 9, PALETTE.Green, baseSpots.Green); // Bottom-Left
    drawBase(9, 9, PALETTE.Blue, baseSpots.Blue); // Bottom-Right

    // Draw Main path
    trackCells.forEach((c, i) => {
        let isSafe = safeIndices.includes(i);
        let color = '#fff';
        if (i === 0) color = PALETTE.Red; // Red Start
        if (i === 13) color = PALETTE.Blue; // Blue start
        if (i === 26) color = PALETTE.Green; // Green start
        if (i === 39) color = PALETTE.Yellow; // Yellow start
        if (isSafe && [0,13,26,39].indexOf(i) === -1) color = '#ddd'; // safe star
        drawCell(c.c, c.r, color, isSafe);
    });

    // Draw Home Stretches
    Object.keys(homeStretches).forEach(color => {
        homeStretches[color].forEach(c => {
            drawCell(c.c, c.r, PALETTE[color], false, true);
        });
    });

    // Center Home
    ctx.fillStyle = '#111';
    ctx.fillRect(OFFSET + 6*CELL_SIZE, OFFSET + 6*CELL_SIZE, 3*CELL_SIZE, 3*CELL_SIZE);
    
    // Draw Tokens with overlapping offset logic
    if (gameState && gameState.players) {
        const tokenGroups = {};
        
        gameState.players.forEach(p => {
            p.tokens.forEach((t, tIdx) => {
                if (t === 58) return; // finished tokens hidden
                
                const coords = getCoordsFromLocal(p.color, t, tIdx);
                const key = `${coords.x.toFixed(1)},${coords.y.toFixed(1)}`;
                if (!tokenGroups[key]) tokenGroups[key] = [];
                
                const isMyTurn = (gameState.players[gameState.turnIndex].id === myPlayerId && p.id === myPlayerId);
                const isHighlight = isMyTurn && gameState.diceRolled && canMove(p, t, gameState.diceValue);
                
                tokenGroups[key].push({
                    p,
                    t,
                    tIdx,
                    isHighlight,
                    originalCoords: coords
                });
            });
        });

        // Now draw all tokens with beautiful offsets if they overlap on the same spot!
        Object.keys(tokenGroups).forEach(key => {
            const list = tokenGroups[key];
            if (list.length === 1) {
                const item = list[0];
                drawToken(item.originalCoords.x, item.originalCoords.y, PALETTE[item.p.color], item.isHighlight);
            } else {
                // multiple tokens overlap! Offset them slightly in a small circle
                const k = list.length;
                const radius = 8; // small shift
                list.forEach((item, idx) => {
                    const angle = (idx * 2 * Math.PI) / k;
                    const ox = item.originalCoords.x + Math.cos(angle) * radius;
                    const oy = item.originalCoords.y + Math.sin(angle) * radius;
                    drawToken(ox, oy, PALETTE[item.p.color], item.isHighlight);
                });
            }
        });
    }
}

function drawBase(col, row, color, spots) {
    const x = OFFSET + col * CELL_SIZE;
    const y = OFFSET + row * CELL_SIZE;
    const size = 6 * CELL_SIZE;
    
    ctx.fillStyle = color;
    ctx.fillRect(x, y, size, size);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + CELL_SIZE, y + CELL_SIZE, size - 2*CELL_SIZE, size - 2*CELL_SIZE);
    
    // spots centered inside their grid cells
    spots.forEach(sp => {
        ctx.beginPath();
        ctx.arc(OFFSET + sp.c*CELL_SIZE + CELL_SIZE/2, OFFSET + sp.r*CELL_SIZE + CELL_SIZE/2, CELL_SIZE*0.4, 0, Math.PI*2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = '#333';
        ctx.stroke();
    });
}

function drawCell(c, r, fill, isSafe, isHome = false) {
    const x = OFFSET + c * CELL_SIZE;
    const y = OFFSET + r * CELL_SIZE;
    ctx.fillStyle = fill;
    ctx.fillRect(x, y, CELL_SIZE, CELL_SIZE);
    ctx.strokeStyle = PALETTE.Border;
    ctx.lineWidth = 1;
    ctx.strokeRect(x, y, CELL_SIZE, CELL_SIZE);
    
    if (isSafe && !isHome) {
        ctx.fillStyle = '#999';
        ctx.font = '16px Arial';
        ctx.fillText('★', x + 10, y + 25);
    }
}

function drawToken(cx, cy, color, glow = false) {
    if (glow) {
        ctx.shadowBlur = 10;
        ctx.shadowColor = '#fff';
    }
    ctx.beginPath();
    ctx.arc(cx, cy, CELL_SIZE*0.35, 0, Math.PI*2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#fff';
    ctx.stroke();
    ctx.shadowBlur = 0; // reset
    
    // inner decoration
    ctx.beginPath();
    ctx.arc(cx, cy, CELL_SIZE*0.15, 0, Math.PI*2);
    ctx.strokeStyle = 'rgba(255,255,255,0.5)';
    ctx.stroke();
}

function getCoordsFromLocal(color, localPos, tIdx) {
    if (localPos === -1) {
        const sp = baseSpots[color][tIdx];
        return { x: OFFSET + sp.c*CELL_SIZE + CELL_SIZE/2, y: OFFSET + sp.r*CELL_SIZE + CELL_SIZE/2 };
    }
    if (localPos >= 0 && localPos < 52) {
        const start = {"Red":0, "Blue":13, "Green":26, "Yellow":39}[color];
        const gPos = (localPos + start) % 52;
        const cell = trackCells[gPos];
        return { x: OFFSET + cell.c*CELL_SIZE + CELL_SIZE/2, y: OFFSET + cell.r*CELL_SIZE + CELL_SIZE/2 };
    }
    if (localPos >= 52 && localPos <= 57) {
        const cell = homeStretches[color][localPos - 52];
        return { x: OFFSET + cell.c*CELL_SIZE + CELL_SIZE/2, y: OFFSET + cell.r*CELL_SIZE + CELL_SIZE/2 };
    }
    return { x: OFFSET + 7.5*CELL_SIZE, y: OFFSET + 7.5*CELL_SIZE };
}

function canMove(p, t, dice) {
    if (t === -1) return dice === 6;
    if (t >= 0 && t + dice <= 58) return true;
    return false;
}

function handleBoardClick(e) {
    if (!gameState || !gameState.diceRolled || tokensMoving) return;
    const cp = gameState.players[gameState.turnIndex];
    if (cp.id !== myPlayerId) return;

    // determine coordinates
    const rect = els.canvas.getBoundingClientRect();
    const scaleX = els.canvas.width / rect.width;
    const scaleY = els.canvas.height / rect.height;
    const cx = (e.clientX - rect.left) * scaleX;
    const cy = (e.clientY - rect.top) * scaleY;

    // We group all tokens the same way to resolve click targets accurately
    const tokenGroups = {};
    gameState.players.forEach(p => {
        p.tokens.forEach((t, tIdx) => {
            if (t === 58) return;
            const coords = getCoordsFromLocal(p.color, t, tIdx);
            const key = `${coords.x.toFixed(1)},${coords.y.toFixed(1)}`;
            if (!tokenGroups[key]) tokenGroups[key] = [];
            
            const isMyTurn = (gameState.players[gameState.turnIndex].id === myPlayerId && p.id === myPlayerId);
            const isHighlight = isMyTurn && gameState.diceRolled && canMove(p, t, gameState.diceValue);
            
            tokenGroups[key].push({
                p,
                t,
                tIdx,
                isHighlight,
                originalCoords: coords
            });
        });
    });

    let clickedTokenIdx = -1;
    
    Object.keys(tokenGroups).forEach(key => {
        const list = tokenGroups[key];
        const k = list.length;
        list.forEach((item, idx) => {
            if (item.p.id !== cp.id || !item.isHighlight) return;
            
            let ox = item.originalCoords.x;
            let oy = item.originalCoords.y;
            if (k > 1) {
                const radius = 8;
                const angle = (idx * 2 * Math.PI) / k;
                ox += Math.cos(angle) * radius;
                oy += Math.sin(angle) * radius;
            }
            
            const dist = Math.hypot(ox - cx, oy - cy);
            if (dist <= CELL_SIZE * 0.5) {
                clickedTokenIdx = item.tIdx;
            }
        });
    });

    if (clickedTokenIdx !== -1) {
        socket.emit('move-token', { tokenIndex: clickedTokenIdx });
    }
}

function sendChat(type) {
    const inp = type === 'lobby' ? els.lobbyChatInput : els.gameChatInput;
    const msg = inp.value.trim();
    if (msg) {
        socket.emit('send-chat', { message: msg });
        inp.value = '';
    }
}

init();

// ==================== SKRIBBLE CLONE — CLIENT ====================
(function () {
    'use strict';

    // ============ STATE ============
    const socket = io();
    let roomCode = '';
    let isHost = false;
    let myId = '';
    let isDrawing = false;
    let gameActive = false;

    // Drawing state
    let currentTool = 'brush'; // brush | eraser | fill
    let currentColor = '#000000';
    let currentSize = 5;
    let drawing = false;
    let lastX = 0;
    let lastY = 0;
    let strokeHistory = []; // Array of strokes, each is array of draw events
    let currentStroke = [];
    let maxTime = 80;

    // Canvas
    const canvas = document.getElementById('drawCanvas');
    const ctx = canvas.getContext('2d');

    // ============ INITIALIZATION ============
    function init() {
        const params = new URLSearchParams(window.location.search);
        roomCode = params.get('room') || '';

        const playerData = JSON.parse(sessionStorage.getItem('playerData'));
        const gameAction = sessionStorage.getItem('gameAction');

        if (!playerData) {
            // No player data — might be joining via link directly
            showJoinPrompt();
            return;
        }

        setupSocketListeners();
        setupCanvasListeners();
        setupToolbarListeners();
        setupChatListeners();
        setupSettingsListeners();

        // Wait for socket to connect, then create or join
        socket.on('connect', () => {
            myId = socket.id;

            if (gameAction === 'create') {
                // Create a new room
                sessionStorage.removeItem('gameAction');
                socket.emit('createRoom', {
                    name: playerData.name,
                    avatar: playerData.avatar
                });
            } else if (gameAction === 'join' && roomCode) {
                // Join existing room
                sessionStorage.removeItem('gameAction');
                sessionStorage.removeItem('joinCode');
                socket.emit('joinRoom', {
                    code: roomCode,
                    name: playerData.name,
                    avatar: playerData.avatar
                });
            } else if (roomCode) {
                // Joining via direct link (no gameAction set)
                socket.emit('joinRoom', {
                    code: roomCode,
                    name: playerData.name,
                    avatar: playerData.avatar
                });
            } else {
                window.location.href = '/';
            }
        });
    }

    function showJoinPrompt() {
        // For players joining via link without going through home page
        const name = prompt('Enter your name:');
        if (!name) {
            window.location.href = '/';
            return;
        }

        const avatarEmojis = ['😀', '😎', '🤠', '🥳', '😈', '👻', '🤖', '👽', '🦊', '🐱', '🐶', '🐸'];
        const randomEmoji = avatarEmojis[Math.floor(Math.random() * avatarEmojis.length)];
        const colors = ['#6C5CE7', '#00CEC9', '#FF6B6B', '#FDCB6E', '#55EFC4', '#E17055'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];

        const playerData = {
            name,
            avatar: { emoji: randomEmoji, color: randomColor }
        };
        sessionStorage.setItem('playerData', JSON.stringify(playerData));
        sessionStorage.setItem('gameAction', roomCode ? 'join' : 'create');
        if (roomCode) sessionStorage.setItem('joinCode', roomCode);

        // Re-run init with the player data now set
        init();
    }

    // ============ WAITING ROOM ============
    function setupWaitingRoom(roomData) {
        const waitingOverlay = document.getElementById('waitingOverlay');
        waitingOverlay.classList.remove('hidden');
        document.getElementById('gameContainer').classList.add('hidden');

        document.getElementById('waitingRoomCode').textContent = roomCode;
        updateWaitingPlayers(roomData.players);
        updateSettings(roomData.settings);

        if (isHost) {
            document.getElementById('btnStartGame').classList.remove('hidden');
            document.getElementById('waitingHint').classList.add('hidden');
            document.getElementById('settingsPanel').style.display = 'block';
        } else {
            document.getElementById('btnStartGame').classList.add('hidden');
            document.getElementById('waitingHint').classList.remove('hidden');
            document.getElementById('settingsPanel').style.display = 'none';
        }
    }

    function updateWaitingPlayers(players) {
        const container = document.getElementById('waitingPlayers');
        container.innerHTML = players.map(p => {
            const inner = p.avatar.customImage
                ? `<img class="custom-av" src="${p.avatar.customImage}" alt="avatar">`
                : p.avatar.emoji;
            return `
      <div class="waiting-player">
        <div class="waiting-avatar" style="background:linear-gradient(135deg, ${p.avatar.color}, ${adjustColor(p.avatar.color, -30)})">
          ${inner}
        </div>
        <span class="waiting-player-name">${escapeHtml(p.name)}</span>
      </div>
    `;
        }).join('');
    }

    // Copy room code
    document.getElementById('copyCodeBtn').addEventListener('click', () => {
        navigator.clipboard.writeText(roomCode).then(() => {
            const btn = document.getElementById('copyCodeBtn');
            btn.textContent = '✅';
            setTimeout(() => { btn.textContent = '📋'; }, 2000);
        });
    });

    // Start game button
    document.getElementById('btnStartGame').addEventListener('click', () => {
        socket.emit('startGame');
    });

    // Play again
    document.getElementById('btnPlayAgain').addEventListener('click', () => {
        document.getElementById('gameOverOverlay').classList.add('hidden');
        document.getElementById('waitingOverlay').classList.remove('hidden');
    });

    // Exit lobby
    document.getElementById('btnExitLobby').addEventListener('click', () => {
        socket.disconnect();
        window.location.href = '/';
    });

    // Leave game (mid-game)
    document.getElementById('btnLeaveGame').addEventListener('click', () => {
        if (confirm('Leave the game?')) {
            socket.disconnect();
            window.location.href = '/';
        }
    });

    // ============ SETTINGS ============
    let rounds = 3;
    let drawTime = 80;

    function setupSettingsListeners() {
        document.getElementById('roundsUp').addEventListener('click', () => {
            rounds = Math.min(rounds + 1, 10);
            document.getElementById('roundsValue').textContent = rounds;
            socket.emit('updateSettings', { rounds, drawTime });
        });
        document.getElementById('roundsDown').addEventListener('click', () => {
            rounds = Math.max(rounds - 1, 2);
            document.getElementById('roundsValue').textContent = rounds;
            socket.emit('updateSettings', { rounds, drawTime });
        });
        document.getElementById('timeUp').addEventListener('click', () => {
            drawTime = Math.min(drawTime + 10, 180);
            document.getElementById('timeValue').textContent = drawTime + 's';
            socket.emit('updateSettings', { rounds, drawTime });
        });
        document.getElementById('timeDown').addEventListener('click', () => {
            drawTime = Math.max(drawTime - 10, 30);
            document.getElementById('timeValue').textContent = drawTime + 's';
            socket.emit('updateSettings', { rounds, drawTime });
        });
    }

    function updateSettings(settings) {
        rounds = settings.rounds;
        drawTime = settings.drawTime;
        document.getElementById('roundsValue').textContent = rounds;
        document.getElementById('timeValue').textContent = drawTime + 's';
    }

    // ============ SOCKET LISTENERS ============
    function setupSocketListeners() {
        socket.on('roomCreated', (data) => {
            roomCode = data.code;
            isHost = true;
            // Update URL to include room code
            window.history.replaceState({}, '', `/game?room=${roomCode}`);
            setupWaitingRoom({ players: data.players, settings: data.settings, isHost: true });
        });

        socket.on('roomJoined', (data) => {
            roomCode = data.code;
            isHost = data.isHost;
            // Update URL to include room code
            window.history.replaceState({}, '', `/game?room=${roomCode}`);
            document.getElementById('waitingRoomCode').textContent = roomCode;
            updateWaitingPlayers(data.players);
            updateSettings(data.settings);
            setupWaitingRoom(data);
        });

        socket.on('playerJoined', (data) => {
            updateWaitingPlayers(data.players);
            updatePlayersList(data.players);
            addChatMessage({ type: 'join', message: `${data.player.name} joined!` });
        });

        socket.on('playerLeft', (data) => {
            updateWaitingPlayers(data.players);
            updatePlayersList(data.players);
            addChatMessage({ type: 'leave', message: `${data.playerName} left!` });
        });

        // Sent when only 1 player remains during an active game
        socket.on('backToWaiting', (data) => {
            // Hide all game-related overlays
            document.getElementById('gameContainer').classList.add('hidden');
            document.getElementById('wordPickerOverlay').classList.add('hidden');
            document.getElementById('gameOverOverlay').classList.add('hidden');
            document.getElementById('turnEndOverlay')?.classList.add('hidden');
            document.getElementById('pickingOverlay')?.classList.add('hidden');

            // Show waiting room again
            document.getElementById('waitingOverlay').classList.remove('hidden');
            updateWaitingPlayers(data.players);

            gameActive = false;
            isDrawing = false;

            addChatMessage({ type: 'system', message: data.message });
        });

        socket.on('becameHost', () => {
            isHost = true;
            document.getElementById('btnStartGame').classList.remove('hidden');
            document.getElementById('waitingHint').classList.add('hidden');
            document.getElementById('settingsPanel').style.display = 'block';
        });

        socket.on('settingsUpdated', (settings) => {
            updateSettings(settings);
        });

        socket.on('error', (data) => {
            alert(data.message);
        });

        // ---- GAME EVENTS ----
        socket.on('gameState', (data) => {
            if (data.state === 'picking') {
                gameActive = true;
                document.getElementById('waitingOverlay').classList.add('hidden');
                document.getElementById('gameContainer').classList.remove('hidden');
                document.getElementById('gameOverOverlay').classList.add('hidden');
                document.getElementById('turnEndOverlay').classList.add('hidden');

                isDrawing = data.drawerId === myId;
                maxTime = drawTime;

                document.getElementById('roundInfo').textContent = `Round ${data.round} / ${data.totalRounds}`;
                updatePlayersList(data.players);

                if (isDrawing) {
                    document.getElementById('wordHint').textContent = 'Choose a word...';
                    document.getElementById('toolbar').classList.add('hidden');
                    canvas.style.cursor = 'default';
                    document.getElementById('chatInput').disabled = true;
                    document.getElementById('chatInput').placeholder = 'You are drawing!';
                    document.getElementById('pickingOverlay').classList.add('hidden');
                } else {
                    document.getElementById('wordHint').textContent = `${data.drawerName} is choosing...`;
                    document.getElementById('toolbar').classList.add('hidden');
                    canvas.style.cursor = 'default';
                    document.getElementById('chatInput').disabled = false;
                    document.getElementById('chatInput').placeholder = 'Type your guess here...';
                    document.getElementById('chatInput').focus();

                    // Show picking overlay with drawer info
                    const drawer = data.players.find(p => p.id === data.drawerId);
                    if (drawer) {
                        const avatarInner = drawer.avatar.customImage
                            ? `<img class="custom-av" src="${drawer.avatar.customImage}" alt="avatar">`
                            : drawer.avatar.emoji;
                        document.getElementById('pickingAvatar').innerHTML = avatarInner;
                        document.getElementById('pickingAvatar').style.background = `linear-gradient(135deg, ${drawer.avatar.color}, ${adjustColor(drawer.avatar.color, -30)})`;
                        document.getElementById('pickingName').textContent = drawer.name;
                    }
                    document.getElementById('pickingTimer').textContent = '15';
                    document.getElementById('pickingOverlay').classList.remove('hidden');
                }

                // Clear canvas for new turn
                clearCanvas();
                strokeHistory = [];
                currentStroke = [];

                // Reset timer
                document.getElementById('timerText').textContent = '';
                document.getElementById('timerProgress').style.strokeDashoffset = '0';
                document.getElementById('timerProgress').style.stroke = 'var(--accent-green)';
            }

            if (data.state === 'drawing') {
                document.getElementById('waitingOverlay').classList.add('hidden');
                document.getElementById('gameContainer').classList.remove('hidden');
                document.getElementById('wordPickerOverlay').classList.add('hidden');
                document.getElementById('turnEndOverlay').classList.add('hidden');
                document.getElementById('pickingOverlay').classList.add('hidden');

                isDrawing = data.drawerId === myId;
                maxTime = data.timeLeft;

                document.getElementById('roundInfo').textContent = `Round ${data.round} / ${data.totalRounds}`;
                updatePlayersList(data.players);

                if (isDrawing) {
                    document.getElementById('toolbar').classList.remove('hidden');
                    canvas.style.cursor = '';
                } else {
                    document.getElementById('toolbar').classList.add('hidden');
                    canvas.style.cursor = 'default';
                    document.getElementById('wordHint').textContent = data.hint;
                    document.getElementById('chatInput').focus();
                }

                document.getElementById('timerText').textContent = data.timeLeft;
            }
        });

        // Pick timer countdown (visible during word picking)
        socket.on('pickTimer', (data) => {
            const el = document.getElementById('pickingTimer');
            if (el) el.textContent = data.timeLeft;
            const drawerEl = document.getElementById('pickCountdownDrawer');
            if (drawerEl) drawerEl.textContent = data.timeLeft + 's';
        });

        socket.on('wordChoices', (words) => {
            const overlay = document.getElementById('wordPickerOverlay');
            const container = document.getElementById('wordChoices');
            overlay.classList.remove('hidden');

            container.innerHTML = words.map(w => `
        <button class="word-choice-btn" data-word="${escapeHtml(w)}">${escapeHtml(w)}</button>
      `).join('');

            container.querySelectorAll('.word-choice-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    socket.emit('selectWord', btn.dataset.word);
                    overlay.classList.add('hidden');
                });
            });
        });

        socket.on('currentWord', (word) => {
            document.getElementById('wordHint').textContent = word;
        });

        socket.on('hint', (data) => {
            if (!isDrawing) {
                document.getElementById('wordHint').textContent = data.hint;
            }
        });

        socket.on('timer', (data) => {
            const timeLeft = data.timeLeft;
            document.getElementById('timerText').textContent = timeLeft;

            // Update circular progress
            const circumference = 125.66;
            const progress = (1 - timeLeft / maxTime) * circumference;
            document.getElementById('timerProgress').style.strokeDashoffset = progress;

            // Color based on time
            const timerProgress = document.getElementById('timerProgress');
            if (timeLeft <= 10) {
                timerProgress.style.stroke = 'var(--accent-red)';
                document.getElementById('timerCircle').style.animation = 'none';
                void document.getElementById('timerCircle').offsetHeight;
                document.getElementById('timerCircle').style.animation = timeLeft <= 5 ? 'timerPulse 0.5s ease' : '';
            } else if (timeLeft <= 30) {
                timerProgress.style.stroke = 'var(--accent-yellow)';
            } else {
                timerProgress.style.stroke = 'var(--accent-green)';
            }
        });

        socket.on('correctGuess', (data) => {
            updatePlayersList(data.players);
            addChatMessage({
                type: 'correct',
                message: `${data.playerName} guessed the word! (+${data.points})`
            });

            // Score popup
            if (data.playerId === myId) {
                showScorePopup(`+${data.points}`);
                document.getElementById('chatInput').disabled = true;
                document.getElementById('chatInput').placeholder = 'You guessed it! ✅';
            }
        });

        socket.on('turnEnd', (data) => {
            document.getElementById('revealedWord').textContent = data.word;
            document.getElementById('turnEndOverlay').classList.remove('hidden');
            document.getElementById('toolbar').classList.add('hidden');
            isDrawing = false;
            updatePlayersList(data.players);

            addChatMessage({
                type: 'system',
                message: `The word was: ${data.word}`
            });
        });

        socket.on('gameOver', (data) => {
            document.getElementById('gameContainer').classList.add('hidden');
            const overlay = document.getElementById('gameOverOverlay');
            overlay.classList.remove('hidden');

            // Build podium
            const podium = document.getElementById('podium');
            const top3 = data.rankings.slice(0, 3);

            // Reorder for podium visual: 2nd, 1st, 3rd
            const podiumOrder = [];
            if (top3[1]) podiumOrder.push({ ...top3[1], position: 2 });
            if (top3[0]) podiumOrder.push({ ...top3[0], position: 1 });
            if (top3[2]) podiumOrder.push({ ...top3[2], position: 3 });

            podium.innerHTML = podiumOrder.map(p => {
                const inner = p.avatar.customImage
                    ? `<img class="custom-av" src="${p.avatar.customImage}" alt="avatar">`
                    : p.avatar.emoji;
                const winnerClass = p.position === 1 ? ' podium-winner' : '';
                return `
        <div class="podium-place${winnerClass}">
          <span class="podium-rank">${p.position === 1 ? '🥇' : p.position === 2 ? '🥈' : '🥉'}</span>
          <div class="podium-avatar" style="background:linear-gradient(135deg, ${p.avatar.color}, ${adjustColor(p.avatar.color, -30)})">
            ${inner}
          </div>
          <span class="podium-name">${escapeHtml(p.name)}</span>
          <span class="podium-score">${p.score} pts</span>
        </div>
      `;
            }).join('');

            // Rankings list (4th+)
            const rankingsList = document.getElementById('rankingsList');
            rankingsList.innerHTML = data.rankings.slice(3).map(p => `
        <div class="ranking-item">
          <span class="ranking-pos">#${p.rank}</span>
          <span class="ranking-name">${escapeHtml(p.name)}</span>
          <span class="ranking-score">${p.score} pts</span>
        </div>
      `).join('');

            gameActive = false;
            isDrawing = false;
        });

        // ---- DRAWING SYNC ----
        let remoteStroke = []; // track current incoming stroke for undo support

        socket.on('draw', (data) => {
            if (isDrawing) return;
            handleRemoteDraw(data);

            if (data.type === 'start') {
                // Save previous completed remote stroke
                if (remoteStroke.length > 0) {
                    strokeHistory.push([...remoteStroke]);
                }
                remoteStroke = [data];
            } else {
                remoteStroke.push(data);
            }
        });

        // Flush remote stroke when turn ends or undo happens
        function flushRemoteStroke() {
            if (remoteStroke.length > 0) {
                strokeHistory.push([...remoteStroke]);
                remoteStroke = [];
            }
        }

        socket.on('clearCanvas', () => {
            flushRemoteStroke();
            clearCanvas();
            strokeHistory = [];
            remoteStroke = [];
        });

        socket.on('undoStroke', () => {
            flushRemoteStroke();
            undoLastStroke(false);
        });

        socket.on('fill', (data) => {
            if (isDrawing) return;
            flushRemoteStroke();
            // Store fill as its own "stroke" so undo works
            strokeHistory.push([{ type: 'fill', x: data.x, y: data.y, color: data.color }]);
            floodFillAt(data.x, data.y, data.color);
        });

        // ---- CHAT ----
        socket.on('chatMessage', (data) => {
            addChatMessage(data);
        });
    }

    function updatePlayersList(players) {
        const container = document.getElementById('playersList');
        if (!container) return;

        container.innerHTML = players.map(p => {
            let statusIcon = '';
            if (p.isDrawing) statusIcon = '🖊️';
            else if (p.guessedCorrectly) statusIcon = '✅';

            let classes = 'player-item';
            if (p.isDrawing) classes += ' is-drawing';
            if (p.guessedCorrectly) classes += ' guessed-correct';

            const inner = p.avatar.customImage
                ? `<img class="custom-av" src="${p.avatar.customImage}" alt="avatar">`
                : p.avatar.emoji;

            return `
        <div class="${classes}">
          <div class="player-avatar" style="background:linear-gradient(135deg, ${p.avatar.color}, ${adjustColor(p.avatar.color, -30)})">
            ${inner}
          </div>
          <div class="player-info">
            <div class="player-name">${escapeHtml(p.name)}</div>
            <div class="player-score">${p.score} pts</div>
          </div>
          <span class="player-status">${statusIcon}</span>
        </div>
      `;
        }).join('');
    }

    // ============ CANVAS / DRAWING ============
    function getCanvasCoords(e) {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        let clientX, clientY;
        if (e.touches) {
            clientX = e.touches[0].clientX;
            clientY = e.touches[0].clientY;
        } else {
            clientX = e.clientX;
            clientY = e.clientY;
        }

        return {
            x: (clientX - rect.left) * scaleX,
            y: (clientY - rect.top) * scaleY
        };
    }

    function setupCanvasListeners() {
        // Mouse events
        canvas.addEventListener('mousedown', startDraw);
        canvas.addEventListener('mousemove', doDraw);
        canvas.addEventListener('mouseup', endDraw);
        canvas.addEventListener('mouseleave', endDraw);

        // Touch events
        canvas.addEventListener('touchstart', (e) => { e.preventDefault(); startDraw(e); });
        canvas.addEventListener('touchmove', (e) => { e.preventDefault(); doDraw(e); });
        canvas.addEventListener('touchend', (e) => { e.preventDefault(); endDraw(e); });
    }

    function startDraw(e) {
        if (!isDrawing) return;

        // Fill tool
        if (currentTool === 'fill') {
            const coords = getCanvasCoords(e);
            const fillColor = currentColor;
            floodFillAt(Math.floor(coords.x), Math.floor(coords.y), fillColor);
            socket.emit('fill', { x: Math.floor(coords.x), y: Math.floor(coords.y), color: fillColor });
            strokeHistory.push([{ type: 'fill', x: Math.floor(coords.x), y: Math.floor(coords.y), color: fillColor }]);
            return;
        }

        drawing = true;
        const coords = getCanvasCoords(e);
        lastX = coords.x;
        lastY = coords.y;
        currentStroke = [];

        const drawData = {
            type: 'start',
            x: coords.x,
            y: coords.y,
            color: currentTool === 'eraser' ? '#FFFFFF' : currentColor,
            size: currentTool === 'eraser' ? currentSize * 3 : currentSize,
            tool: currentTool
        };

        currentStroke.push(drawData);
        socket.emit('draw', drawData);

        // Draw dot at start point
        ctx.beginPath();
        ctx.arc(coords.x, coords.y, (currentTool === 'eraser' ? currentSize * 3 : currentSize) / 2, 0, Math.PI * 2);
        ctx.fillStyle = currentTool === 'eraser' ? '#FFFFFF' : currentColor;
        ctx.fill();
    }

    function doDraw(e) {
        if (!isDrawing || !drawing) return;

        const coords = getCanvasCoords(e);
        const drawColor = currentTool === 'eraser' ? '#FFFFFF' : currentColor;
        const drawSize = currentTool === 'eraser' ? currentSize * 3 : currentSize;

        ctx.beginPath();
        ctx.moveTo(lastX, lastY);
        ctx.lineTo(coords.x, coords.y);
        ctx.strokeStyle = drawColor;
        ctx.lineWidth = drawSize;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        const drawData = {
            type: 'move',
            x: coords.x,
            y: coords.y,
            prevX: lastX,
            prevY: lastY,
            color: drawColor,
            size: drawSize
        };

        currentStroke.push(drawData);
        socket.emit('draw', drawData);

        lastX = coords.x;
        lastY = coords.y;
    }

    function endDraw(e) {
        if (!drawing) return;
        drawing = false;

        if (currentStroke.length > 0) {
            strokeHistory.push([...currentStroke]);
            currentStroke = [];
        }
    }

    function handleRemoteDraw(data) {
        if (data.type === 'start') {
            ctx.beginPath();
            ctx.arc(data.x, data.y, data.size / 2, 0, Math.PI * 2);
            ctx.fillStyle = data.color;
            ctx.fill();
        } else if (data.type === 'move') {
            ctx.beginPath();
            ctx.moveTo(data.prevX, data.prevY);
            ctx.lineTo(data.x, data.y);
            ctx.strokeStyle = data.color;
            ctx.lineWidth = data.size;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.stroke();
        } else if (data.type === 'fill') {
            floodFillAt(data.x, data.y, data.color);
        }
    }

    function clearCanvas() {
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    function undoLastStroke(emit = true) {
        if (strokeHistory.length === 0) return;
        strokeHistory.pop();

        // Redraw everything
        clearCanvas();
        strokeHistory.forEach(stroke => {
            stroke.forEach(data => handleRemoteDraw(data));
        });

        if (emit) {
            socket.emit('undoStroke');
        }
    }

    // Flood fill algorithm
    function floodFillAt(startX, startY, fillColor) {
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;

        const targetIdx = (startY * width + startX) * 4;
        const targetR = data[targetIdx];
        const targetG = data[targetIdx + 1];
        const targetB = data[targetIdx + 2];

        // Parse fill color
        const fillR = parseInt(fillColor.slice(1, 3), 16);
        const fillG = parseInt(fillColor.slice(3, 5), 16);
        const fillB = parseInt(fillColor.slice(5, 7), 16);

        if (targetR === fillR && targetG === fillG && targetB === fillB) return;

        const stack = [[startX, startY]];
        const visited = new Set();
        const tolerance = 30;

        function matches(idx) {
            return Math.abs(data[idx] - targetR) <= tolerance &&
                Math.abs(data[idx + 1] - targetG) <= tolerance &&
                Math.abs(data[idx + 2] - targetB) <= tolerance;
        }

        while (stack.length > 0) {
            const [x, y] = stack.pop();
            const key = y * width + x;
            if (visited.has(key)) continue;
            if (x < 0 || x >= width || y < 0 || y >= height) continue;

            const idx = key * 4;
            if (!matches(idx)) continue;

            visited.add(key);
            data[idx] = fillR;
            data[idx + 1] = fillG;
            data[idx + 2] = fillB;
            data[idx + 3] = 255;

            stack.push([x + 1, y]);
            stack.push([x - 1, y]);
            stack.push([x, y + 1]);
            stack.push([x, y - 1]);
        }

        ctx.putImageData(imageData, 0, 0);
    }

    // ============ TOOLBAR ============
    function setupToolbarListeners() {
        // Color palette
        document.querySelectorAll('.palette-color').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.palette-color').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentColor = btn.dataset.color;
                // Auto-switch to brush when picking color
                if (currentTool === 'eraser') setTool('brush');
            });
        });

        // Size buttons
        document.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentSize = parseInt(btn.dataset.size);
            });
        });

        // Tool buttons
        document.getElementById('toolBrush').addEventListener('click', () => setTool('brush'));
        document.getElementById('toolEraser').addEventListener('click', () => setTool('eraser'));
        document.getElementById('toolFill').addEventListener('click', () => setTool('fill'));

        // Undo
        document.getElementById('toolUndo').addEventListener('click', () => {
            undoLastStroke(true);
        });

        // Clear
        document.getElementById('toolClear').addEventListener('click', () => {
            clearCanvas();
            strokeHistory = [];
            currentStroke = [];
            socket.emit('clearCanvas');
        });
    }

    function setTool(tool) {
        currentTool = tool;
        document.querySelectorAll('#toolBrush, #toolEraser, #toolFill').forEach(b => b.classList.remove('active'));

        if (tool === 'brush') {
            document.getElementById('toolBrush').classList.add('active');
            canvas.style.cursor = '';
        } else if (tool === 'eraser') {
            document.getElementById('toolEraser').classList.add('active');
            canvas.style.cursor = '';
        } else if (tool === 'fill') {
            document.getElementById('toolFill').classList.add('active');
            canvas.style.cursor = 'pointer';
        }
    }

    // ============ CHAT ============
    function setupChatListeners() {
        const chatInput = document.getElementById('chatInput');
        const sendBtn = document.getElementById('chatSendBtn');

        function sendMessage() {
            const msg = chatInput.value.trim();
            if (!msg) return;
            socket.emit('chat', msg);
            chatInput.value = '';
        }

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') sendMessage();
        });

        sendBtn.addEventListener('click', sendMessage);
    }

    function addChatMessage(data) {
        const container = document.getElementById('chatMessages');
        const div = document.createElement('div');
        div.className = `chat-msg type-${data.type}`;

        if (data.type === 'message') {
            div.innerHTML = `<span class="msg-name">${escapeHtml(data.playerName)}:</span><span class="msg-text">${escapeHtml(data.message)}</span>`;
        } else if (data.type === 'correct') {
            div.textContent = data.message;
        } else if (data.type === 'close') {
            div.textContent = data.message;
        } else {
            div.textContent = data.message;
        }

        container.appendChild(div);
        container.scrollTop = container.scrollHeight;

        // Limit messages
        while (container.children.length > 100) {
            container.removeChild(container.firstChild);
        }
    }

    // ============ HELPERS ============
    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function adjustColor(hex, amount) {
        let r = parseInt(hex.slice(1, 3), 16);
        let g = parseInt(hex.slice(3, 5), 16);
        let b = parseInt(hex.slice(5, 7), 16);
        r = Math.max(0, Math.min(255, r + amount));
        g = Math.max(0, Math.min(255, g + amount));
        b = Math.max(0, Math.min(255, b + amount));
        return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
    }

    function showScorePopup(text) {
        const popup = document.createElement('div');
        popup.className = 'score-popup';
        popup.textContent = text;
        popup.style.left = '50%';
        popup.style.top = '40%';
        popup.style.transform = 'translateX(-50%)';
        document.body.appendChild(popup);
        setTimeout(() => popup.remove(), 1500);
    }

    // ============ INIT ============
    // Initialize canvas with white
    clearCanvas();
    init();
})();

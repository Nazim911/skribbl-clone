const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { getRandomWords } = require('./words');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));

// Serve game page
app.get('/game', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'game.html'));
});

// ==================== GAME STATE ====================
const rooms = {};

function generateRoomCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars[Math.floor(Math.random() * chars.length)];
    }
    return code;
}

function levenshteinDistance(a, b) {
    const matrix = Array.from({ length: a.length + 1 }, (_, i) =>
        Array.from({ length: b.length + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
    );
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            matrix[i][j] = a[i - 1] === b[j - 1]
                ? matrix[i - 1][j - 1]
                : 1 + Math.min(matrix[i - 1][j], matrix[i][j - 1], matrix[i - 1][j - 1]);
        }
    }
    return matrix[a.length][b.length];
}

// ==================== SOCKET HANDLERS ====================
io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    let currentRoom = null;

    // Create Room
    socket.on('createRoom', (data) => {
        const code = generateRoomCode();
        const player = {
            id: socket.id,
            name: data.name || 'Player',
            avatar: data.avatar || { emoji: '😀', color: '#6C5CE7' },
            score: 0,
            isHost: true,
            guessedCorrectly: false,
            isDrawing: false
        };

        rooms[code] = {
            code,
            players: [player],
            hostId: socket.id,
            state: 'waiting', // waiting, picking, drawing, roundEnd, gameOver
            settings: { rounds: 3, drawTime: 80 },
            currentRound: 0,
            currentTurnIndex: 0,
            currentWord: null,
            currentDrawer: null,
            turnOrder: [],
            hintInterval: null,
            turnTimer: null,
            revealedPositions: new Set(),
            guessedPlayers: new Set(),
            usedWords: new Set(),
            timeLeft: 0
        };

        socket.join(code);
        currentRoom = code;
        console.log(`Room ${code} created by ${data.name}`);

        socket.emit('roomCreated', {
            code,
            isHost: true,
            players: rooms[code].players,
            settings: rooms[code].settings
        });
    });

    // Join Room
    socket.on('joinRoom', (data) => {
        const code = data.code?.toUpperCase();
        if (!code || !rooms[code]) {
            socket.emit('error', { message: 'Room not found!' });
            return;
        }

        const room = rooms[code];
        if (room.players.length >= 8) {
            socket.emit('error', { message: 'Room is full!' });
            return;
        }

        // Check if player already in room (reconnect)
        const existing = room.players.find(p => p.id === socket.id);
        if (existing) {
            socket.emit('roomJoined', {
                code,
                isHost: room.hostId === socket.id,
                players: room.players,
                settings: room.settings
            });
            return;
        }

        const player = {
            id: socket.id,
            name: data.name || 'Player',
            avatar: data.avatar || { emoji: '😀', color: '#6C5CE7' },
            score: 0,
            isHost: false,
            guessedCorrectly: false,
            isDrawing: false
        };

        room.players.push(player);
        socket.join(code);
        currentRoom = code;

        socket.emit('roomJoined', {
            code,
            isHost: false,
            players: room.players,
            settings: room.settings
        });

        socket.to(code).emit('playerJoined', {
            player,
            players: room.players
        });
    });

    // Update Settings
    socket.on('updateSettings', (data) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        if (room.hostId !== socket.id) return;

        room.settings.rounds = Math.max(2, Math.min(10, data.rounds || 3));
        room.settings.drawTime = Math.max(30, Math.min(180, data.drawTime || 80));

        io.to(currentRoom).emit('settingsUpdated', room.settings);
    });

    // Start Game
    socket.on('startGame', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        if (room.hostId !== socket.id) return;
        if (room.players.length < 2) {
            socket.emit('error', { message: 'Need at least 2 players to start!' });
            return;
        }

        room.currentRound = 1;
        room.currentTurnIndex = 0;
        room.state = 'picking';
        room.usedWords = new Set();

        // Reset scores
        room.players.forEach(p => { p.score = 0; p.guessedCorrectly = false; });

        // Create turn order
        room.turnOrder = room.players.map(p => p.id);

        startTurn(room);
    });

    // Select Word
    socket.on('selectWord', (word) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        if (room.currentDrawer !== socket.id) return;

        room.currentWord = word.toLowerCase();
        room.usedWords.add(word.toLowerCase());
        room.state = 'drawing';
        room.guessedPlayers = new Set();
        room.revealedPositions = new Set();

        // Tell drawer their word
        socket.emit('currentWord', word);

        // Send game state to all
        const hint = generateHint(room.currentWord, room.revealedPositions);
        io.to(currentRoom).emit('gameState', {
            state: 'drawing',
            drawerId: room.currentDrawer,
            drawerName: room.players.find(p => p.id === room.currentDrawer)?.name,
            round: room.currentRound,
            totalRounds: room.settings.rounds,
            players: room.players,
            hint,
            timeLeft: room.settings.drawTime
        });

        // Start timer
        room.timeLeft = room.settings.drawTime;
        room.turnTimer = setInterval(() => {
            room.timeLeft--;
            io.to(currentRoom).emit('timer', { timeLeft: room.timeLeft });

            if (room.timeLeft <= 0) {
                endTurn(room);
            }
        }, 1000);

        // Start hints
        const hintInterval = Math.max(10, Math.floor(room.settings.drawTime / (Math.ceil(room.currentWord.length * 0.6))));
        room.hintInterval = setInterval(() => {
            revealLetter(room);
        }, hintInterval * 1000);
    });

    // Drawing
    socket.on('draw', (data) => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit('draw', data);
    });

    socket.on('clearCanvas', () => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit('clearCanvas');
    });

    socket.on('undoStroke', () => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit('undoStroke');
    });

    socket.on('fill', (data) => {
        if (!currentRoom) return;
        socket.to(currentRoom).emit('fill', data);
    });

    // Chat / Guess
    socket.on('chat', (message) => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        const player = room.players.find(p => p.id === socket.id);
        if (!player) return;

        // If game is active, check for guesses
        if (room.state === 'drawing' && room.currentWord) {
            // Drawer can't guess
            if (socket.id === room.currentDrawer) return;

            // Already guessed
            if (room.guessedPlayers.has(socket.id)) return;

            const guess = message.trim().toLowerCase();
            const word = room.currentWord.toLowerCase();

            if (guess === word) {
                // Correct guess!
                room.guessedPlayers.add(socket.id);
                player.guessedCorrectly = true;

                // Skribbl.io-style scoring
                // Guesser: based on time remaining + order penalty
                const totalTime = room.settings.drawTime;
                const timeRemaining = room.timeLeft;
                const timeRatio = timeRemaining / totalTime;
                const guessOrder = room.guessedPlayers.size; // 1 = first, 2 = second...
                const nonDrawerCount = room.players.filter(p => p.id !== room.currentDrawer).length;

                // First guesser gets ~400-500, later guessers get less
                // Base: 50 + time_ratio * 450 (range 50-500)
                // Order penalty: each subsequent guesser loses a fraction
                const basePoints = Math.round(50 + timeRatio * 450);
                const orderPenalty = Math.max(0, (guessOrder - 1) * Math.round(450 / (nonDrawerCount + 1)));
                const points = Math.max(50, basePoints - orderPenalty);

                player.score += points;

                // Drawer gets points for each correct guesser
                // Skribbl.io: drawer gets roughly totalPlayersWhoGuessed * some amount
                const drawer = room.players.find(p => p.id === room.currentDrawer);
                if (drawer) {
                    // Drawer gets a share per guesser (more if guessed quickly)
                    const drawerBonus = Math.round(50 + timeRatio * 50);
                    drawer.score += drawerBonus;
                }

                io.to(currentRoom).emit('correctGuess', {
                    playerId: socket.id,
                    playerName: player.name,
                    points,
                    players: room.players
                });

                // Check if everyone has guessed
                if (room.guessedPlayers.size >= nonDrawerCount) {
                    setTimeout(() => endTurn(room), 1500);
                }

                return;
            }

            // Close guess check
            const distance = levenshteinDistance(guess, word);
            if (distance <= 2 && distance > 0 && guess.length >= word.length - 2) {
                socket.emit('chatMessage', {
                    type: 'close',
                    message: `"${message}" is close!`
                });
                return;
            }
        }

        // Regular chat message
        io.to(currentRoom).emit('chatMessage', {
            type: 'message',
            playerName: player.name,
            message
        });
    });

    // Disconnect
    socket.on('disconnect', () => {
        if (!currentRoom || !rooms[currentRoom]) return;
        const room = rooms[currentRoom];
        const playerIndex = room.players.findIndex(p => p.id === socket.id);
        if (playerIndex === -1) return;

        const playerName = room.players[playerIndex].name;
        room.players.splice(playerIndex, 1);

        console.log(`${playerName} disconnected from room ${currentRoom}`);

        if (room.players.length === 0) {
            // Clean up empty room
            clearInterval(room.turnTimer);
            clearInterval(room.hintInterval);
            delete rooms[currentRoom];
            console.log(`Room ${currentRoom} deleted (empty)`);
            return;
        }

        // Transfer host if needed
        if (room.hostId === socket.id) {
            room.hostId = room.players[0].id;
            room.players[0].isHost = true;
            io.to(room.players[0].id).emit('becameHost');
        }

        // If drawer left, end turn
        if (room.currentDrawer === socket.id && room.state === 'drawing') {
            endTurn(room);
        }

        io.to(currentRoom).emit('playerLeft', {
            playerName,
            players: room.players
        });
    });
});

// ==================== GAME LOGIC ====================
function startTurn(room) {
    // Reset player states
    room.players.forEach(p => {
        p.guessedCorrectly = false;
        p.isDrawing = false;
    });
    room.guessedPlayers = new Set();

    // Get current drawer
    const drawerId = room.turnOrder[room.currentTurnIndex];
    const drawer = room.players.find(p => p.id === drawerId);

    if (!drawer) {
        // Drawer left, skip to next
        advanceTurn(room);
        return;
    }

    room.currentDrawer = drawerId;
    drawer.isDrawing = true;
    room.state = 'picking';

    // Send word choices to drawer (exclude already used words)
    const wordChoices = getRandomWords(3, room.usedWords);
    io.to(drawerId).emit('wordChoices', wordChoices);

    // Notify everyone about the picking phase
    io.to(room.code).emit('gameState', {
        state: 'picking',
        drawerId,
        drawerName: drawer.name,
        round: room.currentRound,
        totalRounds: room.settings.rounds,
        players: room.players
    });

    // Auto-pick word after 15 seconds if drawer doesn't choose
    room.pickTimeout = setTimeout(() => {
        if (room.state === 'picking' && room.currentWord === null) {
            const autoWord = wordChoices[Math.floor(Math.random() * wordChoices.length)];
            // Simulate word selection
            const drawerSocket = io.sockets.sockets.get(drawerId);
            if (drawerSocket) {
                drawerSocket.emit('wordChoices', []); // close picker
            }
            room.currentWord = autoWord.toLowerCase();
            room.usedWords.add(autoWord.toLowerCase());
            room.state = 'drawing';
            room.guessedPlayers = new Set();
            room.revealedPositions = new Set();

            io.to(drawerId).emit('currentWord', autoWord);

            const hint = generateHint(room.currentWord, room.revealedPositions);
            io.to(room.code).emit('gameState', {
                state: 'drawing',
                drawerId: room.currentDrawer,
                drawerName: drawer.name,
                round: room.currentRound,
                totalRounds: room.settings.rounds,
                players: room.players,
                hint,
                timeLeft: room.settings.drawTime
            });

            room.timeLeft = room.settings.drawTime;
            room.turnTimer = setInterval(() => {
                room.timeLeft--;
                io.to(room.code).emit('timer', { timeLeft: room.timeLeft });
                if (room.timeLeft <= 0) endTurn(room);
            }, 1000);

            const hintInterval = Math.max(10, Math.floor(room.settings.drawTime / (Math.ceil(room.currentWord.length * 0.6))));
            room.hintInterval = setInterval(() => revealLetter(room), hintInterval * 1000);
        }
    }, 15000);
}

function endTurn(room) {
    clearInterval(room.turnTimer);
    clearInterval(room.hintInterval);
    clearTimeout(room.pickTimeout);

    const word = room.currentWord || '???';

    io.to(room.code).emit('turnEnd', {
        word,
        players: room.players
    });

    room.currentWord = null;
    room.state = 'roundEnd';

    // Wait 4 seconds then advance
    setTimeout(() => {
        advanceTurn(room);
    }, 4000);
}

function advanceTurn(room) {
    room.currentTurnIndex++;

    // Check if round is over
    if (room.currentTurnIndex >= room.turnOrder.length) {
        room.currentTurnIndex = 0;
        room.currentRound++;

        // Check if game is over
        if (room.currentRound > room.settings.rounds) {
            endGame(room);
            return;
        }

        // Rebuild turn order (players might have left)
        room.turnOrder = room.players.map(p => p.id);
    }

    // Check if remaining drawer exists
    if (room.turnOrder[room.currentTurnIndex]) {
        startTurn(room);
    } else {
        advanceTurn(room);
    }
}

function endGame(room) {
    room.state = 'gameOver';
    clearInterval(room.turnTimer);
    clearInterval(room.hintInterval);

    // Sort players by score
    const rankings = [...room.players]
        .sort((a, b) => b.score - a.score)
        .map((p, i) => ({
            ...p,
            rank: i + 1
        }));

    io.to(room.code).emit('gameOver', { rankings });

    // Reset game state
    room.currentRound = 0;
    room.currentTurnIndex = 0;
    room.currentWord = null;
    room.currentDrawer = null;
    room.state = 'waiting';
    room.usedWords = new Set();
}

function generateHint(word, revealedPositions) {
    return word
        .split('')
        .map((char, i) => {
            if (char === ' ') return '  ';
            if (revealedPositions.has(i)) return char;
            return '_';
        })
        .join(' ');
}

function revealLetter(room) {
    if (!room.currentWord) return;

    const word = room.currentWord;
    const unrevealed = [];
    for (let i = 0; i < word.length; i++) {
        if (word[i] !== ' ' && !room.revealedPositions.has(i)) {
            unrevealed.push(i);
        }
    }

    if (unrevealed.length <= 1) return; // Keep at least one hidden

    const randomIndex = unrevealed[Math.floor(Math.random() * unrevealed.length)];
    room.revealedPositions.add(randomIndex);

    const hint = generateHint(word, room.revealedPositions);
    io.to(room.code).emit('hint', { hint });
}

function getTimeLeft(room) {
    return room.timeLeft || 0;
}

// ==================== START SERVER ====================
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🎨 Skribble Clone running on http://localhost:${PORT}`);
});

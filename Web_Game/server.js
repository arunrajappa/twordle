const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const wordList = require('./wordlist');
const path = require('path');

const app = express();
app.use(cors());

// Serve static files from the React client app
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
} else {
  app.use(express.static(path.join(__dirname, 'client/build')));

  // Handle any requests that don't match the above
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "http://localhost:3001",
    methods: ["GET", "POST"]
  }
});

const games = new Map();

class Game {
  constructor() {
    this.players = new Map();
    this.secrets = new Map();
    this.guesses = new Map();
    this.feedbacks = new Map();
    this.status = "waiting";
    this.currentTurn = null;
    this.winner = null;
  }

  addPlayer(socketId) {
    if (this.players.size >= 2) return null;
    
    const playerNumber = this.players.size === 0 ? "p1" : "p2";
    this.players.set(socketId, playerNumber);
    
    if (this.players.size === 2) {
      this.status = "input_secrets";
    }
    
    return playerNumber;
  }

  setSecret(socketId, word) {
    const playerNumber = this.players.get(socketId);
    if (!playerNumber) return { error: "Player not found" };

    // Validate word
    if (!word || typeof word !== 'string' || !wordList.has(word.toLowerCase())) {
      return { error: "Not a valid English word" };
    }

    this.secrets.set(playerNumber, word.toLowerCase());
    
    if (this.secrets.size === 2) {
      this.status = "guessing";
      this.currentTurn = "p1";
    }

    return this.getPlayerState(socketId);
  }

  makeGuess(socketId, guess) {
    const playerNumber = this.players.get(socketId);
    if (!playerNumber) return { error: "Player not found" };
    if (this.currentTurn !== playerNumber) return { error: "Not your turn" };

    // Validate word
    if (!guess || typeof guess !== 'string' || !wordList.has(guess.toLowerCase())) {
      return { error: "Not a valid English word" };
    }

    const opponent = playerNumber === "p1" ? "p2" : "p1";
    const targetWord = this.secrets.get(opponent);
    
    if (!targetWord) return { error: "Opponent's word not set" };

    guess = guess.toLowerCase();
    const feedback = this.calculateFeedback(guess, targetWord);
    
    if (!this.guesses.has(playerNumber)) {
      this.guesses.set(playerNumber, []);
    }
    if (!this.feedbacks.has(playerNumber)) {
      this.feedbacks.set(playerNumber, []);
    }

    this.guesses.get(playerNumber).push(guess);
    this.feedbacks.get(playerNumber).push(feedback);

    if (guess === targetWord) {
      this.status = "game_over";
      this.winner = playerNumber;
    } else {
      this.currentTurn = opponent;
    }

    return this.getPlayerState(socketId);
  }

  getPlayerState(socketId) {
    const playerNumber = this.players.get(socketId);
    if (!playerNumber) return null;

    const opponent = playerNumber === "p1" ? "p2" : "p1";
    const opponentGuesses = this.guesses.get(opponent) || [];
    
    return {
      status: this.status,
      currentTurn: this.currentTurn,
      yourSecret: this.secrets.has(playerNumber),
      secretWord: this.secrets.get(playerNumber) || '',
      guesses: this.guesses.get(playerNumber) || [],
      feedbacks: this.feedbacks.get(playerNumber) || [],
      opponentGuesses: opponentGuesses,
      player: playerNumber,
      bothSecretsSet: this.secrets.size === 2,
      winner: this.winner
    };
  }

  calculateFeedback(guess, secret) {
    const feedback = Array(5).fill('gray');
    const secretChars = [...secret];
    const guessChars = [...guess];

    // First pass: mark green for correct positions
    for (let i = 0; i < 5; i++) {
      if (guessChars[i] === secretChars[i]) {
        feedback[i] = 'green';
        secretChars[i] = '#';
        guessChars[i] = '*';
      }
    }

    // Second pass: mark yellow for correct letters in wrong positions
    for (let i = 0; i < 5; i++) {
      if (guessChars[i] === '*') continue;
      for (let j = 0; j < 5; j++) {
        if (secretChars[j] === guessChars[i]) {
          feedback[i] = 'yellow';
          secretChars[j] = '#';
          break;
        }
      }
    }

    return feedback;
  }

  notifyPlayers() {
    for (const [socketId] of this.players) {
      const state = this.getPlayerState(socketId);
      io.to(socketId).emit('gameState', state);
    }
  }

  removePlayer(socketId) {
    this.players.delete(socketId);
    this.status = "game_over";
    this.notifyPlayers();
  }
}

io.on('connection', (socket) => {
  console.log('New client connected');

  socket.on('createGame', () => {
    const gameId = uuidv4();
    const game = new Game();
    games.set(gameId, game);
    
    socket.gameId = gameId;
    game.addPlayer(socket.id);
    game.notifyPlayers();
    
    socket.emit('gameCreated', { gameId });
  });

  socket.on('joinGame', ({ gameId }) => {
    const game = games.get(gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    socket.gameId = gameId;
    const playerNumber = game.addPlayer(socket.id);
    
    if (!playerNumber) {
      socket.emit('error', { message: 'Game is full' });
      return;
    }

    game.notifyPlayers();
    socket.emit('playerAssigned', { player: playerNumber });
  });

  socket.on('submitSecret', ({ secret }) => {
    if (!secret || typeof secret !== 'string') {
      socket.emit('error', { message: 'Invalid secret word' });
      return;
    }

    const game = games.get(socket.gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Validate word against wordlist
    if (!wordList.has(secret.toLowerCase())) {
      socket.emit('error', { message: 'Not a valid English word' });
      return;
    }

    const result = game.setSecret(socket.id, secret);
    if (result && result.error) {
      socket.emit('error', { message: result.error });
    } else {
      game.notifyPlayers();
    }
  });

  socket.on('submitGuess', ({ guess }) => {
    if (!guess || typeof guess !== 'string') {
      socket.emit('error', { message: 'Invalid guess' });
      return;
    }

    const game = games.get(socket.gameId);
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }

    // Validate word against wordlist
    if (!wordList.has(guess.toLowerCase())) {
      socket.emit('error', { message: 'Not a valid English word' });
      return;
    }

    const result = game.makeGuess(socket.id, guess);
    if (result && result.error) {
      socket.emit('error', { message: result.error });
    } else {
      game.notifyPlayers();
    }
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected');
    const game = games.get(socket.gameId);
    if (game) {
      game.removePlayer(socket.id);
      if (game.players.size === 0) {
        games.delete(socket.gameId);
      }
    }
  });
});

// Start the server
const PORT = 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

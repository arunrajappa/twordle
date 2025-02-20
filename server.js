const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();

// CORS configuration
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' 
    ? true  // Allow all origins in production
    : "http://localhost:3000", // Development client URL
  methods: ["GET", "POST"],
  credentials: true
};

app.use(cors(corsOptions));

// Serve static files from the React client app
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'client/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'client/build', 'index.html'));
  });
}

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: corsOptions
});

// Game state storage
const games = new Map();
let lobbyGames = new Map(); // Stores available games in the lobby

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send available lobby games to the client
  socket.on('getLobbyGames', () => {
    const availableGames = Array.from(lobbyGames.values())
      .filter(game => game.status === 'waiting')
      .map(game => ({
        id: game.id,
        createdAt: game.createdAt
      }));
    socket.emit('lobbyGames', availableGames);
  });

  // Create a new game
  socket.on('createGame', () => {
    const gameId = uuidv4();
    const game = {
      id: gameId,
      createdAt: Date.now(),
      status: 'waiting',
      players: new Map([[socket.id, 'A']]),
      currentTurn: null,
      guesses: [],
      feedbacks: [],
      secretWords: new Map(),
      opponentGuesses: new Map()
    };
    
    games.set(gameId, game);
    lobbyGames.set(gameId, game);
    
    socket.join(gameId);
    socket.gameId = gameId;
    
    socket.emit('gameCreated', { gameId });
    socket.emit('playerAssigned', { player: 'A' });
    
    // Broadcast updated lobby list to all clients
    io.emit('lobbyGames', Array.from(lobbyGames.values())
      .filter(g => g.status === 'waiting')
      .map(g => ({
        id: g.id,
        createdAt: g.createdAt
      })));
  });

  // Join a game from lobby
  socket.on('joinGame', ({ gameId }) => {
    const game = games.get(gameId);
    
    if (!game) {
      socket.emit('error', { message: 'Game not found' });
      return;
    }
    
    if (game.status !== 'waiting') {
      socket.emit('error', { message: 'Game is already full' });
      return;
    }
    
    game.players.set(socket.id, 'B');
    game.status = 'input_secrets';
    socket.join(gameId);
    socket.gameId = gameId;
    
    // Remove game from lobby since it's now full
    lobbyGames.delete(gameId);
    
    socket.emit('playerAssigned', { player: 'B' });
    
    // Notify both players that the game is starting
    io.to(gameId).emit('gameState', {
      status: 'input_secrets',
      player: 'A',
      currentTurn: null,
      guesses: [],
      feedbacks: [],
      secretWord: '',
      opponentGuesses: []
    });
    
    // Broadcast updated lobby list
    io.emit('lobbyGames', Array.from(lobbyGames.values())
      .filter(g => g.status === 'waiting')
      .map(g => ({
        id: g.id,
        createdAt: g.createdAt
      })));
  });

  // Handle secret word submission
  socket.on('submitSecret', ({ secret }) => {
    const gameId = socket.gameId;
    const game = games.get(gameId);
    
    if (!game) return;
    
    const player = game.players.get(socket.id);
    game.secretWords.set(player, secret.toLowerCase());
    
    // If both players have submitted their secrets, start the game
    if (game.secretWords.size === 2) {
      game.status = 'guessing';
      game.currentTurn = 'A';
      
      // Send game state to each player with appropriate secret word
      game.players.forEach((playerLetter, playerId) => {
        const opponentLetter = playerLetter === 'A' ? 'B' : 'A';
        io.to(playerId).emit('gameState', {
          status: 'guessing',
          player: playerLetter,
          currentTurn: game.currentTurn,
          guesses: [],
          feedbacks: [],
          secretWord: game.secretWords.get(opponentLetter),
          opponentGuesses: []
        });
      });
    }
  });

  // Handle guess submission
  socket.on('submitGuess', ({ guess }) => {
    const gameId = socket.gameId;
    const game = games.get(gameId);
    
    if (!game) return;
    
    const player = game.players.get(socket.id);
    const opponent = player === 'A' ? 'B' : 'A';
    const secretWord = game.secretWords.get(opponent);
    
    // Calculate feedback
    const feedback = calculateFeedback(guess.toLowerCase(), secretWord);
    
    // Store guess and feedback
    if (!game.guesses[player]) game.guesses[player] = [];
    if (!game.feedbacks[player]) game.feedbacks[player] = [];
    game.guesses[player].push(guess.toLowerCase());
    game.feedbacks[player].push(feedback);
    
    // Store opponent's guess
    if (!game.opponentGuesses.get(opponent)) game.opponentGuesses.set(opponent, []);
    game.opponentGuesses.get(opponent).push(guess.toLowerCase());
    
    // Check if the game is over
    if (guess.toLowerCase() === secretWord) {
      game.status = 'game_over';
      game.winner = player;
      
      // Clean up
      games.delete(gameId);
      
      // Notify both players
      io.to(gameId).emit('gameState', {
        status: 'game_over',
        winner: player,
        secretWord: secretWord,
        guesses: game.guesses[player],
        feedbacks: game.feedbacks[player],
        opponentGuesses: Array.from(game.opponentGuesses.get(opponent))
      });
      
      return;
    }
    
    // Switch turns
    game.currentTurn = opponent;
    
    // Send updated game state to both players
    game.players.forEach((playerLetter, playerId) => {
      const opponentLetter = playerLetter === 'A' ? 'B' : 'A';
      io.to(playerId).emit('gameState', {
        status: 'guessing',
        player: playerLetter,
        currentTurn: game.currentTurn,
        guesses: game.guesses[playerLetter] || [],
        feedbacks: game.feedbacks[playerLetter] || [],
        secretWord: game.secretWords.get(opponentLetter),
        opponentGuesses: Array.from(game.opponentGuesses.get(opponentLetter) || [])
      });
    });
  });

  // Handle disconnection
  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
    
    // Remove any games this player created in the lobby
    for (const [gameId, game] of lobbyGames.entries()) {
      if (game.players.has(socket.id)) {
        lobbyGames.delete(gameId);
        games.delete(gameId);
        // Broadcast updated lobby list
        io.emit('lobbyGames', Array.from(lobbyGames.values())
          .filter(g => g.status === 'waiting')
          .map(g => ({
            id: g.id,
            createdAt: g.createdAt
          })));
        break;
      }
    }
    
    // Handle disconnection from active game
    if (socket.gameId) {
      const game = games.get(socket.gameId);
      if (game) {
        const opponent = Array.from(game.players.entries())
          .find(([id]) => id !== socket.id)?.[0];
        
        if (opponent) {
          io.to(opponent).emit('gameState', {
            status: 'game_over',
            winner: game.players.get(opponent),
            message: 'Opponent disconnected'
          });
        }
        
        games.delete(socket.gameId);
        lobbyGames.delete(socket.gameId);
      }
    }
  });
});

// Helper function to calculate feedback for a guess
function calculateFeedback(guess, secret) {
  const feedback = Array(5).fill('gray');
  const secretChars = secret.split('');
  const guessChars = guess.split('');
  
  // First pass: mark correct positions
  for (let i = 0; i < 5; i++) {
    if (guessChars[i] === secretChars[i]) {
      feedback[i] = 'green';
      secretChars[i] = null;
      guessChars[i] = null;
    }
  }
  
  // Second pass: mark correct letters in wrong positions
  for (let i = 0; i < 5; i++) {
    if (guessChars[i] === null) continue;
    
    const secretIndex = secretChars.indexOf(guessChars[i]);
    if (secretIndex !== -1) {
      feedback[i] = 'yellow';
      secretChars[secretIndex] = null;
    }
  }
  
  return feedback;
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import styled from 'styled-components';
import GameBoard from './components/GameBoard';
import Keyboard from './components/Keyboard';
import { ThemeProvider, useTheme } from './context/ThemeContext';

// Initialize socket with proper configuration
const SOCKET_SERVER = process.env.NODE_ENV === 'production' 
  ? window.location.origin
  : 'http://localhost:3001';

const socket = io(SOCKET_SERVER, {
  withCredentials: true,
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

const Container = styled.div`
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
  background-color: var(--background-color);
  color: var(--text-color);
  min-height: 100vh;
`;

const Header = styled.header`
  text-align: center;
  margin-bottom: 2rem;
  border-bottom: 1px solid var(--border-color);
  padding-bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  width: 100%;

  h1 {
    margin: 0;
    color: var(--text-color);
  }
`;

const ThemeToggle = styled.button`
  background: none;
  border: none;
  font-size: 1.5rem;
  cursor: pointer;
  color: var(--text-color);
  padding: 5px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  
  &:hover {
    background-color: var(--game-info-bg);
  }
`;

const Button = styled.button`
  background-color: var(--button-bg);
  color: var(--text-color);
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  font-size: 1rem;
  cursor: pointer;
  margin: 5px;

  &:hover {
    background-color: var(--button-hover);
  }

  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;

const Input = styled.input`
  padding: 10px;
  font-size: 1rem;
  border: 2px solid var(--border-color);
  border-radius: 5px;
  margin: 5px;
  width: 200px;
  background-color: var(--cell-empty-bg);
  color: var(--text-color);
`;

const Message = styled.div`
  margin: 1rem 0;
  padding: 10px;
  border-radius: 5px;
  text-align: center;
  background-color: ${props => props.error ? '#ff4444' : '#6aaa64'};
  color: white;
`;

const GameInfo = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 1rem 0;
  padding: 10px;
  border-radius: 5px;
  background-color: var(--game-info-bg);
  color: var(--text-color);
`;

const GameContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
`;

const PlayerBoard = styled.div`
  opacity: ${props => props.active ? 1 : 0.7};
  transition: opacity 0.3s ease;
`;

const SecretWord = styled.p`
  font-family: monospace;
  font-size: 1.2rem;
  margin: 0.5rem 0;
`;

const OpponentInfo = styled.div`
  text-align: right;
`;

const OpponentGuesses = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0.5rem 0;
  font-family: monospace;
`;

const LobbyGames = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin: 1rem 0;
`;

const LobbyGame = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem;
  background-color: var(--game-info-bg);
  border-radius: 5px;
  border: 1px solid var(--border-color);
`;

function AppContent() {
  const { isDarkMode, toggleTheme } = useTheme();
  const [gameId, setGameId] = useState('');
  const [gameState, setGameState] = useState({
    status: 'menu',
    player: null,
    currentTurn: null,
    guesses: [],
    feedbacks: [],
    secretWord: '',
    winner: null,
    opponentGuesses: [],
    yourSecret: null
  });
  const [currentGuess, setCurrentGuess] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [lobbyGames, setLobbyGames] = useState([]);

  // Define handlers using useCallback to prevent unnecessary re-renders
  const handleKeyPress = useCallback((key) => {
    if (gameState.currentTurn !== gameState.player) return;
    
    // Only allow letters
    if (!/^[a-zA-Z]$/.test(key)) {
      return;
    }
    
    if (currentGuess.length < 5) {
      setCurrentGuess(prev => prev + key.toLowerCase());
    }
  }, [gameState, currentGuess]);

  const handleBackspace = useCallback(() => {
    if (gameState.currentTurn !== gameState.player) return;
    setCurrentGuess(prev => prev.slice(0, -1));
  }, [gameState]);

  const handleEnter = useCallback(() => {
    if (gameState.currentTurn !== gameState.player) return;
    
    if (!currentGuess) {
      setMessage('Please enter a word');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    if (currentGuess.length !== 5) {
      setMessage('Word must be 5 letters long');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    if (!/^[a-zA-Z]+$/.test(currentGuess)) {
      setMessage('Word must contain only letters');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    socket.emit('submitGuess', { guess: currentGuess });
    setCurrentGuess('');
  }, [gameState, currentGuess]);

  const handleSetSecret = useCallback(() => {
    if (!currentGuess) {
      setMessage('Please enter a word');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    if (currentGuess.length !== 5) {
      setMessage('Word must be 5 letters long');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    socket.emit('submitSecret', { secret: currentGuess });
    setCurrentGuess('');
  }, [currentGuess]);

  useEffect(() => {
    socket.on('connect', () => {
      console.log('Connected to server');
      // Request lobby games when connected
      socket.emit('getLobbyGames');
    });

    socket.on('gameCreated', ({ gameId }) => {
      setGameId(gameId);
      setMessage(`Game created! Waiting for opponent to join...`);
    });

    socket.on('playerAssigned', ({ player }) => {
      console.log('Assigned as player:', player);
    });

    socket.on('gameState', (state) => {
      setGameState(state);
      if (state.error) {
        setMessage(state.error);
        setTimeout(() => setMessage(''), 3000);
      }
    });

    socket.on('error', ({ message }) => {
      setMessage(message);
      setTimeout(() => setMessage(''), 3000);
    });

    socket.on('lobbyGames', (games) => {
      setLobbyGames(games);
    });

    return () => {
      socket.off('connect');
      socket.off('gameCreated');
      socket.off('playerAssigned');
      socket.off('gameState');
      socket.off('error');
      socket.off('lobbyGames');
    };
  }, []);

  const createGame = () => {
    socket.emit('createGame');
  };

  const joinGame = (gameId) => {
    socket.emit('joinGame', { gameId });
  };

  // Render different views based on game state
  const renderGameState = () => {
    switch (gameState.status) {
      case 'menu':
        return (
          <div>
            <LobbyGames>
              <h2>Available Games</h2>
              {lobbyGames.length === 0 ? (
                <Message>No games available. Create a new game!</Message>
              ) : (
                lobbyGames.map(game => (
                  <LobbyGame key={game.id}>
                    <div>Game #{game.id.slice(0, 8)}</div>
                    <Button onClick={() => joinGame(game.id)}>Join Game</Button>
                  </LobbyGame>
                ))
              )}
            </LobbyGames>
            <Button onClick={createGame}>Create New Game</Button>
          </div>
        );

      case 'waiting':
        return (
          <div>
            <Message>Waiting for opponent to join...</Message>
          </div>
        );

      case 'input_secrets':
        return (
          <div>
            {gameState.yourSecret ? (
              <Message>Waiting for opponent's secret word...</Message>
            ) : (
              <>
                <Message>Enter your secret 5-letter word</Message>
                <Input
                  type="text"
                  value={currentGuess}
                  onChange={(e) => setCurrentGuess(e.target.value.toLowerCase())}
                  placeholder="Enter your 5-letter secret word"
                  maxLength={5}
                />
                <Button onClick={handleSetSecret}>Submit Secret</Button>
              </>
            )}
          </div>
        );

      case 'guessing':
        return (
          <GameContainer>
            <Message>
              {gameState.currentTurn === gameState.player
                ? "Your turn to guess!"
                : "Opponent's turn..."}
            </Message>
            
            <GameInfo>
              <div>
                <p>You are Player {gameState.player}</p>
                <SecretWord>Your secret: {gameState.secretWord}</SecretWord>
              </div>
              <OpponentInfo>
                <p>Opponent's guesses:</p>
                <OpponentGuesses>
                  {gameState.opponentGuesses.map((guess, index) => (
                    <li key={index}>{guess}</li>
                  ))}
                </OpponentGuesses>
              </OpponentInfo>
            </GameInfo>

            <PlayerBoard active={gameState.currentTurn === gameState.player}>
              <h3>Your Guesses</h3>
              <GameBoard 
                guesses={gameState.guesses} 
                feedbacks={gameState.feedbacks}
                currentGuess={gameState.currentTurn === gameState.player ? currentGuess : ''}
                showCurrentGuess={gameState.currentTurn === gameState.player}
              />
            </PlayerBoard>

            <Keyboard
              onKeyPress={handleKeyPress}
              onEnter={handleEnter}
              onBackspace={handleBackspace}
              disabled={gameState.currentTurn !== gameState.player}
            />
          </GameContainer>
        );

      case 'game_over':
        return (
          <GameContainer>
            <Message>
              {gameState.winner === gameState.player
                ? "Congratulations! You won!"
                : "Game Over! Your opponent won!"}
            </Message>

            <GameInfo>
              <div>
                <p>You were Player {gameState.player}</p>
                <SecretWord>Your secret: {gameState.secretWord}</SecretWord>
              </div>
              <OpponentInfo>
                <p>Opponent's guesses:</p>
                <OpponentGuesses>
                  {gameState.opponentGuesses.map((guess, index) => (
                    <li key={index}>{guess}</li>
                  ))}
                </OpponentGuesses>
              </OpponentInfo>
            </GameInfo>

            <Button onClick={() => {
              setGameState({
                status: 'menu',
                player: null,
                currentTurn: null,
                guesses: [],
                feedbacks: [],
                secretWord: '',
                winner: null,
                opponentGuesses: [],
                yourSecret: null
              });
              socket.emit('getLobbyGames');
            }}>Back to Menu</Button>
          </GameContainer>
        );

      default:
        return <div>Unknown game state</div>;
    }
  };

  return (
    <Container>
      <Header>
        <h1>Twordle</h1>
        <ThemeToggle onClick={toggleTheme}>
          {isDarkMode ? '🌞' : '🌙'}
        </ThemeToggle>
      </Header>
      {message && <Message error={message.includes('error')}>{message}</Message>}
      {renderGameState()}
    </Container>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;

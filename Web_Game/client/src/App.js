import React, { useState, useEffect, useCallback } from 'react';
import io from 'socket.io-client';
import styled from 'styled-components';
import GameBoard from './components/GameBoard';
import Keyboard from './components/Keyboard';

// Initialize socket with proper configuration
const socket = io('http://localhost:5000', {
  withCredentials: true,
  transports: ['websocket', 'polling'],
  reconnectionAttempts: 5,
  reconnectionDelay: 1000
});

const Container = styled.div`
  max-width: 500px;
  margin: 0 auto;
  padding: 20px;
`;

const Header = styled.header`
  text-align: center;
  margin-bottom: 2rem;
  border-bottom: 1px solid #d3d6da;
  padding-bottom: 1rem;
`;

const Button = styled.button`
  background-color: #6aaa64;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 5px;
  font-size: 1rem;
  cursor: pointer;
  margin: 5px;

  &:hover {
    background-color: #5c9658;
  }
`;

const Input = styled.input`
  padding: 10px;
  font-size: 1rem;
  border: 2px solid #d3d6da;
  border-radius: 5px;
  margin: 5px;
  width: 200px;
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
  background-color: #f0f0f0;
`;

const SecretWord = styled.div`
  font-size: 1.2rem;
  font-weight: bold;
  color: #6aaa64;
  padding: 10px;
  border: 2px solid #6aaa64;
  border-radius: 5px;
  text-transform: uppercase;
`;

const OpponentInfo = styled.div`
  text-align: right;
  color: #666;
`;

const OpponentGuesses = styled.ol`
  margin: 0;
  padding-left: 20px;
  color: #666;
  li {
    text-transform: uppercase;
    margin: 2px 0;
  }
`;

const GameContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 600px;
  margin: 0 auto;
`;

const PlayerBoard = styled.div`
  flex: 1;
  padding: 1rem;
  border-radius: 5px;
  background-color: ${props => props.active ? '#f8f9fa' : '#fff'};
`;

function App() {
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
    });

    socket.on('gameCreated', ({ gameId }) => {
      setGameId(gameId);
      setMessage(`Game created! Share this ID with your opponent: ${gameId}`);
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

    socket.on('error', (error) => {
      setMessage(error.message);
      setTimeout(() => setMessage(''), 3000);
    });

    return () => {
      socket.off('connect');
      socket.off('gameCreated');
      socket.off('playerAssigned');
      socket.off('gameState');
      socket.off('error');
    };
  }, []);

  const createGame = () => {
    socket.emit('createGame');
  };

  const joinGame = (gameId) => {
    socket.emit('joinGame', { gameId });
  };

  const submitSecret = (secret) => {
    if (!secret) {
      setMessage('Please enter a word');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    if (secret.length !== 5) {
      setMessage('Word must be 5 letters long');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    if (!/^[a-zA-Z]+$/.test(secret)) {
      setMessage('Word must contain only letters');
      setTimeout(() => setMessage(''), 3000);
      return;
    }

    socket.emit('submitSecret', { secret });
    setCurrentGuess('');
  };

  const renderGameState = () => {
    switch (gameState.status) {
      case 'menu':
        return (
          <div>
            <Button onClick={createGame}>Create New Game</Button>
            <div>
              <Input
                type="text"
                value={gameId}
                onChange={(e) => setGameId(e.target.value)}
                placeholder="Enter Game ID"
              />
              <Button onClick={() => joinGame(gameId)}>Join Game</Button>
            </div>
          </div>
        );

      case 'waiting':
        return <Message>Waiting for opponent to join...</Message>;

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
                <p>You are Player {gameState.player.toUpperCase()}</p>
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
                <p>You are Player {gameState.player.toUpperCase()}</p>
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

            <PlayerBoard>
              <h3>Your Guesses</h3>
              <GameBoard 
                guesses={gameState.guesses} 
                feedbacks={gameState.feedbacks}
              />
            </PlayerBoard>

            <Button onClick={() => window.location.reload()}>Play Again</Button>
          </GameContainer>
        );

      default:
        return null;
    }
  };

  return (
    <Container>
      <Header>
        <h1>Twordle</h1>
        {gameState.player && <p>You are Player {gameState.player.toUpperCase()}</p>}
      </Header>
      {message && <Message>{message}</Message>}
      {error && <Message error>{error}</Message>}
      {renderGameState()}
    </Container>
  );
}

export default App;

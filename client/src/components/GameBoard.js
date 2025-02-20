import React from 'react';
import styled from 'styled-components';
import { useTheme } from '../context/ThemeContext';

const Board = styled.div`
  display: flex;
  flex-direction: column;
  gap: 5px;
  margin: 20px 0;
`;

const Row = styled.div`
  display: flex;
  gap: 5px;
  justify-content: center;
`;

const Cell = styled.div`
  width: 50px;
  height: 50px;
  border: 2px solid var(--border-color);
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 2rem;
  font-weight: bold;
  text-transform: uppercase;
  background-color: ${props => {
    if (props.feedback === 'green') return 'var(--correct-color)';
    if (props.feedback === 'yellow') return 'var(--present-color)';
    if (props.feedback === 'gray') return 'var(--absent-color)';
    return 'var(--cell-empty-bg)';
  }};
  color: ${props => props.feedback ? 'white' : 'var(--text-color)'};
  transition: background-color 0.3s ease, color 0.3s ease;
`;

function GameBoard({ guesses = [], feedbacks = [], currentGuess = '', showCurrentGuess = true }) {
  const { isDarkMode } = useTheme();
  
  const rows = Array(6).fill().map((_, i) => {
    if (i < guesses.length) {
      // Show completed guess with feedback
      return [...guesses[i]].map((letter, j) => (
        <Cell key={j} feedback={feedbacks[i][j]}>{letter}</Cell>
      ));
    } else if (i === guesses.length && showCurrentGuess) {
      // Show current guess being typed
      const word = currentGuess.padEnd(5);
      return [...word].map((letter, j) => (
        <Cell key={j}>{letter !== ' ' ? letter : ''}</Cell>
      ));
    } else {
      // Show empty cells
      return Array(5).fill().map((_, j) => (
        <Cell key={j}>{''}</Cell>
      ));
    }
  });

  return (
    <Board>
      {rows.map((row, i) => (
        <Row key={i}>{row}</Row>
      ))}
    </Board>
  );
}

export default GameBoard;

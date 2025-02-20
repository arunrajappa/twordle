import React, { useEffect, useCallback } from 'react';
import styled from 'styled-components';

const KeyboardContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  margin: 1rem 0;
  user-select: none;
`;

const KeyboardRow = styled.div`
  display: flex;
  gap: 6px;
  margin: 3px 0;
`;

const Key = styled.button`
  min-width: 43px;
  height: 58px;
  border-radius: 4px;
  border: none;
  background-color: #d3d6da;
  font-size: 1.125rem;
  font-weight: bold;
  cursor: ${props => props.disabled ? 'not-allowed' : 'pointer'};
  text-transform: uppercase;
  color: black;
  touch-action: manipulation;
  padding: 0;
  margin: 0;
  transition: background-color 0.1s ease;

  &:hover {
    background-color: ${props => props.disabled ? '#d3d6da' : '#bbb'};
  }

  &:active {
    background-color: ${props => props.disabled ? '#d3d6da' : '#999'};
  }

  &.wide {
    min-width: 65px;
  }

  &:disabled {
    opacity: 0.5;
  }
`;

const Keyboard = ({ onKeyPress, onEnter, onBackspace, disabled }) => {
  const rows = [
    ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p'],
    ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
    ['Enter', 'z', 'x', 'c', 'v', 'b', 'n', 'm', '⌫']
  ];

  const handleClick = useCallback((key) => {
    if (disabled) return;
    
    console.log('Key clicked:', key);
    if (key === 'Enter') {
      onEnter();
    } else if (key === '⌫') {
      onBackspace();
    } else {
      onKeyPress(key);
    }
  }, [disabled, onKeyPress, onEnter, onBackspace]);

  // Handle physical keyboard input
  useEffect(() => {
    const handleKeyDown = (event) => {
      if (disabled) return;

      console.log('Physical key pressed:', event.key);
      
      if (event.key === 'Enter') {
        event.preventDefault();
        onEnter();
      } else if (event.key === 'Backspace') {
        event.preventDefault();
        onBackspace();
      } else {
        const key = event.key.toLowerCase();
        if (/^[a-z]$/.test(key)) {
          onKeyPress(key);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [disabled, onKeyPress, onEnter, onBackspace]);

  return (
    <KeyboardContainer>
      {rows.map((row, i) => (
        <KeyboardRow key={i}>
          {row.map((key) => (
            <Key
              key={key}
              className={key.length > 1 ? 'wide' : ''}
              onClick={() => handleClick(key)}
              disabled={disabled}
              type="button"
            >
              {key}
            </Key>
          ))}
        </KeyboardRow>
      ))}
    </KeyboardContainer>
  );
};

export default Keyboard;

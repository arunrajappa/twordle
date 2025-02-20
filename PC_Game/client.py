import pygame
import socketio
import sys

# Initialize Socket.IO client
sio = socketio.Client(logger=True, engineio_logger=True)

# Pygame setup
pygame.init()
WIDTH, HEIGHT = 800, 600
screen = pygame.display.set_mode((WIDTH, HEIGHT))
pygame.display.set_caption("Online Wordle PvP")

# Colors
WHITE = (255, 255, 255)
BLACK = (0, 0, 0)
GREEN = (0, 255, 0)
YELLOW = (255, 255, 0)
GRAY = (128, 128, 128)
RED = (255, 0, 0)

# Font
font = pygame.font.Font(None, 36)

# Game state
game_state = {
    'status': 'menu',  # menu, connecting, waiting, input_secrets, guessing, game_over
    'current_turn': None,
    'your_secret': False,
    'guesses': [],
    'feedbacks': [],
    'opponent_guesses': 0,
    'error': None
}

# Input variables
input_text = ''
current_player = None
game_id = None

# Socket.IO event handlers
@sio.event
def connect():
    print("Connected to server!")
    if game_id:
        sio.emit('join_game', {'game_id': game_id})
    else:
        game_state['status'] = 'menu'

@sio.event
def connect_error(data):
    print("Connection error:", data)
    game_state['status'] = 'menu'
    game_state['error'] = "Failed to connect to server"

@sio.event
def disconnect():
    print("Disconnected from server")
    game_state['status'] = 'menu'

@sio.event
def error(data):
    print("Error:", data)
    game_state['error'] = data.get('message', 'Unknown error')
    game_state['status'] = 'menu'  # Return to menu on error

@sio.event
def game_update(data):
    global game_state, current_player
    print("Game state updated:", data)
    game_state.update(data)  # Update instead of replace to preserve error state
    if 'player' in data:
        current_player = data['player']

@sio.event
def game_created(data):
    global game_id
    game_id = data['game_id']
    print(f"Game created with ID: {game_id}")
    game_state['status'] = 'waiting'
    game_state['error'] = None

@sio.event
def player_assigned(data):
    global current_player
    current_player = data['player']
    print(f"Assigned as player: {current_player}")
    game_state['error'] = None

# Function to draw text on screen
def draw_text(text, x, y, color=BLACK):
    text_surface = font.render(str(text), True, color)
    screen.blit(text_surface, (x, y))

# Function to draw a guess row with feedback
def draw_guess_row(guess, feedback, x, y):
    for i in range(5):
        color = GREEN if feedback[i] == 'green' else YELLOW if feedback[i] == 'yellow' else GRAY
        pygame.draw.rect(screen, color, (x + i * 60, y, 50, 50))
        text = font.render(guess[i].upper(), True, BLACK)
        screen.blit(text, (x + i * 60 + 10, y + 10))

# Main game loop
def main():
    global input_text, current_player, game_id, game_state

    # Get game ID from command line if provided
    if len(sys.argv) > 1:
        game_id = sys.argv[1]

    # Connect to the server
    try:
        sio.connect('http://localhost:5000', wait_timeout=10)
    except Exception as e:
        print(f"Failed to connect: {e}")
        game_state['error'] = str(e)
        game_state['status'] = 'menu'

    running = True
    while running:
        screen.fill(WHITE)

        # Event handling
        for event in pygame.event.get():
            if event.type == pygame.QUIT:
                running = False
            elif event.type == pygame.KEYDOWN:
                if event.key == pygame.K_BACKSPACE:
                    input_text = input_text[:-1]
                elif event.key == pygame.K_RETURN:
                    if game_state['status'] == 'menu':
                        if input_text.strip():
                            game_id = input_text.strip()
                            sio.emit('join_game', {'game_id': game_id})
                            input_text = ''
                        else:
                            sio.emit('create_game')
                    elif game_state['status'] == 'input_secrets' and len(input_text) == 5:
                        sio.emit('submit_secret', {'secret': input_text.lower()})
                        input_text = ''
                    elif game_state['status'] == 'guessing' and len(input_text) == 5:
                        sio.emit('submit_guess', {'guess': input_text.lower()})
                        input_text = ''
                # Allow both letters and numbers for game ID input, but only letters for words
                elif game_state['status'] == 'menu':
                    if event.unicode.isalnum() and len(input_text) < 8:  # Game IDs are 8 characters
                        input_text += event.unicode
                elif event.unicode.isalpha() and len(input_text) < 5:  # Only letters for secret words and guesses
                    input_text += event.unicode.lower()
                elif event.key == pygame.K_ESCAPE and game_state['status'] == 'game_over':
                    running = False

        # Draw based on game state
        if game_state['error']:
            draw_text(f"Error: {game_state['error']}", 50, 20, RED)

        if game_state['status'] == 'menu':
            draw_text("Enter game ID to join, or press Enter to create new game:", 50, 50)
            draw_text(input_text, 50, 100)
        elif game_state['status'] == 'connecting':
            draw_text("Connecting to server...", 50, 50)
        elif game_state['status'] == 'waiting':
            draw_text("Waiting for another player...", 50, 50)
            if game_id:
                draw_text(f"Share this game ID: {game_id}", 50, 100)
        elif game_state['status'] == 'input_secrets':
            draw_text("Enter your 5-letter secret word:", 50, 50)
            draw_text(input_text, 50, 100)  # Show the actual word while typing
            if current_player:
                draw_text(f"You are Player {current_player.upper()}", 50, 150, GREEN)
            if game_state.get('your_secret'):
                draw_text("Waiting for opponent's secret word...", 50, 200, YELLOW)
                draw_text(f"Your secret word: {game_state.get('secret_word')}", 50, 250, GREEN)
            elif game_state.get('both_secrets_set'):
                draw_text("Both secrets set! Game starting...", 50, 200, GREEN)
        elif game_state['status'] == 'guessing':
            if game_state['current_turn'] == current_player:
                draw_text("Your turn to guess!", 50, 20, GREEN)
            else:
                draw_text("Waiting for opponent's guess...", 50, 20, YELLOW)
            
            draw_text(f"Your secret word: {game_state.get('secret_word')}", 50, 50, GREEN)
            draw_text(f"Your guesses:", 50, 100)
            for i, (guess, feedback) in enumerate(zip(game_state['guesses'], game_state['feedbacks'])):
                draw_guess_row(guess, feedback, 50, 150 + i * 60)
            draw_text(f"Opponent guesses: {game_state['opponent_guesses']}", 400, 50)
            
            if game_state['current_turn'] == current_player:
                draw_text("Enter your guess:", 50, 500)
                draw_text(input_text, 50, 550)
        elif game_state['status'] == 'game_over':
            draw_text("Game Over!", 50, 50)
            winner = game_state.get('winner')
            if winner == current_player:
                draw_text("You won!", 50, 100, GREEN)
            else:
                draw_text("Opponent won!", 50, 100, RED)
            
            draw_text(f"Your secret word was: {game_state.get('secret_word')}", 50, 150)
            draw_text(f"Your guesses: {len(game_state['guesses'])}", 50, 200)
            draw_text(f"Opponent guesses: {game_state['opponent_guesses']}", 50, 250)
            draw_text("Press ESC to quit", 50, 300)

        pygame.display.flip()

    pygame.quit()
    try:
        sio.disconnect()
    except:
        pass

if __name__ == '__main__':
    main()
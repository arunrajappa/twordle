from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import uuid
from collections import defaultdict
from flask_cors import CORS

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True)

# Game storage
games = {}  
players = {}

@app.route('/')
def index():
    return "Twordle Server Running"

class Game:
    def __init__(self, game_id):
        self.game_id = game_id
        self.players = {}  
        self.secrets = {}  
        self.guesses = defaultdict(list)  
        self.feedbacks = defaultdict(list)  
        self.status = "waiting"  
        self.current_turn = None

    def add_player(self, sid, player_number):
        self.players[sid] = player_number
        if len(self.players) == 2:
            self.status = "input_secrets"
        self.notify_players()

    def get_player_state(self, sid):
        player = self.players.get(sid)
        if not player:
            return None
        
        return {
            'status': self.status,
            'current_turn': self.current_turn,
            'your_secret': bool(self.secrets.get(player)),
            'secret_word': self.secrets.get(player, ''),  
            'guesses': self.guesses[player],
            'feedbacks': self.feedbacks[player],
            'opponent_guesses': len(self.guesses["p2" if player == "p1" else "p1"]),
            'player': player,
            'both_secrets_set': len(self.secrets) == 2,
            'winner': getattr(self, 'winner', None)  
        }

    def notify_players(self):
        for sid in self.players:
            state = self.get_player_state(sid)
            if state:
                socketio.emit('game_update', state, room=sid)

@socketio.on('create_game')
def handle_create_game():
    game_id = str(uuid.uuid4())[:8]
    games[game_id] = Game(game_id)
    emit('game_created', {'game_id': game_id})

@socketio.on('join_game')
def handle_join_game(data):
    game_id = data['game_id']
    if game_id not in games:
        emit('error', {'message': 'Game not found'})
        return
    
    game = games[game_id]
    if len(game.players) >= 2:
        emit('error', {'message': 'Game is full'})
        return

    player = "p1" if len(game.players) == 0 else "p2"
    players[request.sid] = (game_id, player)
    game.add_player(request.sid, player)
    emit('player_assigned', {'player': player})

@socketio.on('submit_secret')
def handle_submit_secret(data):
    if request.sid not in players:
        emit('error', {'message': 'Not in a game'})
        return

    game_id, player = players[request.sid]
    game = games[game_id]
    
    if player not in ('p1', 'p2'):
        emit('error', {'message': 'Invalid player'})
        return

    secret = data['secret'].lower()
    if len(secret) != 5 or not secret.isalpha():
        emit('error', {'message': 'Invalid secret word'})
        return

    game.secrets[player] = secret
    
    if len(game.secrets) == 2:
        game.status = "guessing"
        game.current_turn = "p1"  
    
    game.notify_players()

@socketio.on('submit_guess')
def handle_submit_guess(data):
    if request.sid not in players:
        emit('error', {'message': 'Not in a game'})
        return

    game_id, player = players[request.sid]
    game = games[game_id]
    
    if game.current_turn != player:
        emit('error', {'message': 'Not your turn'})
        return

    opponent = "p2" if player == "p1" else "p1"
    guess = data['guess'].lower()
    
    if len(guess) != 5 or not guess.isalpha():
        emit('error', {'message': 'Invalid guess'})
        return

    feedback = get_feedback(guess, game.secrets[opponent])
    game.guesses[player].append(guess)
    game.feedbacks[player].append(feedback)
    
    if guess == game.secrets[opponent]:
        game.status = "game_over"
        game.winner = player  
    else:
        game.current_turn = opponent
    
    game.notify_players()

def get_feedback(guess, secret):
    feedback = ['gray'] * 5
    secret_chars = list(secret)
    guess_chars = list(guess)
    
    # First pass: mark green for correct positions
    for i in range(5):
        if guess_chars[i] == secret_chars[i]:
            feedback[i] = 'green'
            secret_chars[i] = '#'
            guess_chars[i] = '*'
    
    # Second pass: mark yellow for correct letters in wrong positions
    for i in range(5):
        if guess_chars[i] == '*':
            continue
        for j in range(5):
            if secret_chars[j] == guess_chars[i]:
                feedback[i] = 'yellow'
                secret_chars[j] = '#'
                break
    
    return feedback

@socketio.on('disconnect')
def handle_disconnect():
    if request.sid in players:
        game_id, player = players[request.sid]
        if game_id in games:
            game = games[game_id]
            if request.sid in game.players:
                del game.players[request.sid]
            if len(game.players) == 0:
                del games[game_id]
        del players[request.sid]

if __name__ == '__main__':
    socketio.run(app, debug=True)
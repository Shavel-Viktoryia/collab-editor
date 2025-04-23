import os
import time
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
from document import Document
from session_manager import SessionManager

app = Flask(__name__, 
            template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), '../client/templates'),
            static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), '../client/static'))
app.config['SECRET_KEY'] = 'secret!'
socketio = SocketIO(app, cors_allowed_origins="*")

# Manage active documents and sessions
session_manager = SessionManager()

# Simulate network delay (in seconds)
NETWORK_DELAY = 0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/<session_id>')
def join_session(session_id):
    return render_template('editor.html', session_id=session_id)

@socketio.on('connect')
def handle_connect():
    print('Client connected:', request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    session_manager.remove_client(request.sid)
    print('Client disconnected:', request.sid)

@socketio.on('join')
def handle_join(data):
    session_id = data['sessionId']
    username = data.get('username', 'Anonymous')
    
    # Create or get document session
    document = session_manager.get_or_create_document(session_id)
    
    # Add client to session
    session_manager.add_client(request.sid, session_id, username)
    
    # Send current document state to new client
    emit('init', {
        'text': document.text,
        'revision': document.revision,
        'clients': session_manager.get_session_clients(session_id)
    }, room=request.sid)

@socketio.on('edit')
def handle_edit(data):
    # Simulate network delay if enabled
    if NETWORK_DELAY > 0:
        time.sleep(NETWORK_DELAY)
    
    session_id = data['sessionId']
    client_id = request.sid
    revision = data['revision']
    operations = data['operations']
    
    document = session_manager.get_document(session_id)
    if not document:
        return
    
    # Apply operations with Operational Transform
    transformed_ops = document.apply_operations(client_id, revision, operations)
    
    if transformed_ops:
        # Broadcast transformed operations to all other clients
        emit('update', {
            'clientId': client_id,
            'revision': document.revision,
            'operations': transformed_ops
        }, room=session_id, include_self=False)

@socketio.on('request_history')
def handle_history_request(data):
    session_id = data['sessionId']
    document = session_manager.get_document(session_id)
    if document:
        emit('history', document.get_edit_history(), room=request.sid)

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
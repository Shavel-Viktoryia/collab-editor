import os
import time
from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, join_room, leave_room
from document import Document
from session_manager import SessionManager

# Initialize Flask app, pointing to the client folder for templates and static files
app = Flask(__name__, 
            template_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), '../client/templates'),
            static_folder=os.path.join(os.path.dirname(os.path.abspath(__file__)), '../client/static'))
app.config['SECRET_KEY'] = 'secret!' # Secret key for session management

# Initialize Socket.IO for real-time communication
socketio = SocketIO(app, cors_allowed_origins="*")

# Session manager keeps track of documents and connected clients
session_manager = SessionManager()

# Global network delay (in seconds) to simulate lag in edits
NETWORK_DELAY = 0

# ---- HTTP ROUTES ----

@app.route('/')
def index():
    # Serve the landing page where user can create/join a session
    return render_template('index.html')

@app.route('/<session_id>')
def join_session(session_id):
    # Serve the collaborative editor UI
    username = request.args.get('username', 'Anonymous')
    return render_template('editor.html', session_id=session_id, username=username)

# ---- SOCKET.IO EVENTS ----
@socketio.on('connect')
def handle_connect():
    # Called when a new WebSocket client connects.
    print('Client connected:', request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    """
    Called when a client disconnects.
    - Removes the client from its session
    - Broadcasts a 'user_left' event to remaining clients
    """
    client_id = request.sid
    session_id = session_manager.clients.get(client_id)

    if session_id:
        session_manager.remove_client(client_id)
        emit('user_left', {
            'clientId': client_id,
            'clients': session_manager.get_session_clients(session_id)
        }, room=session_id)
        leave_room(session_id)
    print('Client disconnected:', client_id)

@socketio.on('join')
def handle_join(data):
    """
    Called when a client joins a session.
    - Assigns the client to the session room
    - Sends the current document state ('init') only to the new client
    - Broadcasts 'user_joined' to other clients in the room
    """

    session_id = data['sessionId']
    username = data.get('username', 'Anonymous')

    # Create or fetch the existing document for this session
    document = session_manager.get_or_create_document(session_id)
    session_manager.add_client(request.sid, session_id, username)

    # Join the Socket.IO room
    join_room(session_id)

    # Send initial document text, revision number, and active clients list
    emit('init', {
        'text': document.text,
        'revision': document.revision,
        'clients': session_manager.get_session_clients(session_id)
    }, room=request.sid)

    # Notify other users that a new participant has joined
    emit('user_joined', {
        'clientId': request.sid,
        'clients': session_manager.get_session_clients(session_id)
    }, room=session_id, include_self=False)

@socketio.on('edit')
def handle_edit(data):
    # Handle incoming edit operations from clients.
    if NETWORK_DELAY > 0:
        time.sleep(NETWORK_DELAY)
    session_id = data['sessionId']
    client_id = request.sid
    username = session_manager.client_info.get(client_id, {}).get('username', 'Anonymous')
    revision = data['revision']
    operations = data['operations']
    document = session_manager.get_document(session_id)
    if not document:
        return
    for op in operations:
        op['username'] = username
    transformed_ops = document.apply_operations(client_id, revision, operations)
    if transformed_ops:
        emit('update', {
            'clientId': client_id,
            'revision': document.revision,
            'operations': transformed_ops
        }, room=session_id, include_self=False)

@socketio.on('cursor')
def handle_cursor(data):
    session_id = data['sessionId']
    client_id = request.sid
    emit('cursor_update', {
        'clientId': client_id,
        'position': data['position'],
        'username': data['username'],
        'selectionEnd': data.get('selectionEnd', data['position'])
    }, room=session_id, include_self=False)

@socketio.on('request_history')
def handle_history_request(data):
    # Send the full edit history of the document to the requesting client.
    session_id = data['sessionId']
    document = session_manager.get_document(session_id)
    if document:
        emit('history', document.get_edit_history(), room=request.sid)

@socketio.on('set_delay')
def handle_set_delay(data):
    """
    Update the global NETWORK_DELAY value.
    Broadcast the new delay setting to all clients in the session.
    """
    global NETWORK_DELAY
    NETWORK_DELAY = data['delay']
    emit('delay_updated', {'delay': NETWORK_DELAY}, room=data['sessionId'])

@socketio.on('undo')
def handle_undo(data):
    """
    Undo the last operation performed on the document.
    Broadcast the undo as an 'update', and notify clients with 'history_update'.
    """
    session_id = data['sessionId']
    client_id = request.sid
    document = session_manager.get_document(session_id)
    if document:
        undo_ops = document.undo_last_operation()
        if undo_ops:
            emit('update', {
                'clientId': client_id,
                'revision': document.revision,
                'operations': undo_ops
            }, room=session_id)
            emit('history_update', {
                'operation': undo_ops[0],
                'action': 'undo'
            }, room=session_id)

# ---- MAIN EXECUTION ----
if __name__ == '__main__':
    # Start the Socket.IO server
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
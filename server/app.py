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

session_manager = SessionManager()
NETWORK_DELAY = 0

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/<session_id>')
def join_session(session_id):
    username = request.args.get('username', 'Anonymous')
    return render_template('editor.html', session_id=session_id, username=username)

@socketio.on('connect')
def handle_connect():
    print('Client connected:', request.sid)

@socketio.on('disconnect')
def handle_disconnect():
    client_id = request.sid
    session_id = session_manager.clients.get(client_id)
    if session_id:
        session_manager.remove_client(client_id)
        emit('user_left', {
            'clientId': client_id,
            'clients': session_manager.get_session_clients(session_id)
        }, room=session_id)
    print('Client disconnected:', client_id)

@socketio.on('join')
def handle_join(data):
    session_id = data['sessionId']
    username = data.get('username', 'Anonymous')
    
    document = session_manager.get_or_create_document(session_id)
    session_manager.add_client(request.sid, session_id, username)
    
    emit('init', {
        'text': document.text,
        'revision': document.revision,
        'clients': session_manager.get_session_clients(session_id)
    }, room=request.sid)
    
    emit('user_joined', {
        'clientId': request.sid,
        'clients': session_manager.get_session_clients(session_id)
    }, room=session_id)

@socketio.on('edit')
def handle_edit(data):
    if NETWORK_DELAY > 0:
        time.sleep(NETWORK_DELAY)
    
    session_id = data['sessionId']
    client_id = request.sid
    revision = data['revision']
    operations = data['operations']
    
    document = session_manager.get_document(session_id)
    if not document:
        return
    
    transformed_ops = document.apply_operations(client_id, revision, operations)
    
    if transformed_ops:
        emit('update', {
            'clientId': client_id,
            'revision': document.revision,
            'operations': transformed_ops
        }, room=session_id)

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
    session_id = data['sessionId']
    document = session_manager.get_document(session_id)
    if document:
        emit('history', document.get_edit_history(), room=request.sid)

@socketio.on('set_delay')
def handle_set_delay(data):
    global NETWORK_DELAY
    NETWORK_DELAY = data['delay']
    emit('delay_updated', {'delay': NETWORK_DELAY}, room=data['sessionId'])

if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000)
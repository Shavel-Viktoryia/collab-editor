from typing import Dict, List
from document import Document

class SessionManager:
    def __init__(self):
        self.sessions: Dict[str, Document] = {}  # session_id -> Document
        self.clients: Dict[str, str] = {}       # client_id -> session_id
        self.client_info: Dict[str, dict] = {}  # client_id -> {username, etc.}
    
    def get_or_create_document(self, session_id: str) -> Document:
        if session_id not in self.sessions:
            self.sessions[session_id] = Document(session_id)
        return self.sessions[session_id]
    
    def get_document(self, session_id: str) -> Document:
        return self.sessions.get(session_id)
    
    def add_client(self, client_id: str, session_id: str, username: str):
        self.clients[client_id] = session_id
        self.client_info[client_id] = {'username': username}
        
        # Initialize client's revision in document
        doc = self.get_or_create_document(session_id)
        doc.clients[client_id] = doc.revision
    
    def remove_client(self, client_id: str):
        if client_id in self.clients:
            session_id = self.clients[client_id]
            if session_id in self.sessions:
                if client_id in self.sessions[session_id].clients:
                    del self.sessions[session_id].clients[client_id]
            del self.clients[client_id]
        if client_id in self.client_info:
            del self.client_info[client_id]
    
    def get_session_clients(self, session_id: str) -> List[dict]:
        clients = []
        for client_id, sid in self.clients.items():
            if sid == session_id and client_id in self.client_info:
                clients.append({
                    'id': client_id,
                    'username': self.client_info[client_id]['username']
                })
        return clients
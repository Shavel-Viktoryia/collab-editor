from typing import Dict, List
from document import Document

class SessionManager:
    def __init__(self):
        """
        Initialize the session manager:
        - sessions: map session_id → Document instance
        - clients: map client_id → session_id
        - client_info: map client_id → metadata (e.g., username)
        """
        self.sessions: Dict[str, Document] = {}
        self.clients: Dict[str, str] = {}
        self.client_info: Dict[str, dict] = {}
    
    def get_or_create_document(self, session_id: str) -> Document:
        # Retrieve the Document by session_id, creating a new one if needed
        if session_id not in self.sessions:
            self.sessions[session_id] = Document(session_id)
        return self.sessions[session_id]
    
    def get_document(self, session_id: str) -> Document:
        # Return the Document for session_id
        return self.sessions.get(session_id)
    
    def add_client(self, client_id: str, session_id: str, username: str):
        # Register a new client in a session
        self.clients[client_id] = session_id
        self.client_info[client_id] = {'username': username}
        doc = self.get_or_create_document(session_id)
        doc.clients[client_id] = doc.revision
    
    def remove_client(self, client_id: str):
        # Delete a client
        if client_id in self.clients:
            session_id = self.clients[client_id]
            # If the session still exists, remove the client from its document
            if session_id in self.sessions:
                if client_id in self.sessions[session_id].clients:
                    del self.sessions[session_id].clients[client_id]
            # Remove from global client→session mapping
            del self.clients[client_id]
        # Remove any stored client metadata
        if client_id in self.client_info:
            del self.client_info[client_id]
    
    def get_session_clients(self, session_id: str) -> List[dict]:
        # Return a list of all active clients in a session
        clients = []
        # Iterate over all registered clients
        for client_id, sid in self.clients.items():
            # Filter by requested session_id and ensure we have metadata
            if sid == session_id and client_id in self.client_info:
                clients.append({
                    'id': client_id,
                    'username': self.client_info[client_id]['username']
                })
        return clients
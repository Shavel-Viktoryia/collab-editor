import time
import uuid
from typing import List, Dict, Any

class TextOperation:
    def __init__(self, type: str, position: int, text: str = '', length: int = 0):
        self.id = str(uuid.uuid4())
        self.type = type
        self.position = position
        self.text = text
        self.length = length
        self.timestamp = time.time()
    
    def to_dict(self) -> Dict[str, Any]:
        return {
            'id': self.id,
            'type': self.type,
            'position': self.position,
            'text': self.text,
            'length': self.length,
            'timestamp': self.timestamp
        }

class Document:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.text = ''
        self.revision = 0
        self.clients = {}
        self.history = []
    
    def apply_operations(self, client_id: str, client_revision: int, operations: List[Dict]) -> List[Dict]:
        incoming_ops = [TextOperation(**op) for op in operations]
        
        if client_revision < self.revision:
            missed_ops = self.history[client_revision:]
            transformed_ops = self._transform_operations(incoming_ops, missed_ops)
        else:
            transformed_ops = incoming_ops
        
        result_ops = []
        for op in transformed_ops:
            if op.type == 'insert':
                self.text = self.text[:op.position] + op.text + self.text[op.position:]
            elif op.type == 'delete':
                self.text = self.text[:op.position] + self.text[op.position + op.length:]
            
            self.history.append(op)
            result_ops.append(op.to_dict())
        
        self.revision += len(result_ops)
        self.clients[client_id] = self.revision
        
        return result_ops
    
    def _transform_operations(self, incoming_ops: List[TextOperation], missed_ops: List[TextOperation]) -> List[TextOperation]:
        transformed_ops = incoming_ops.copy()
        
        for missed_op in missed_ops:
            for i, op in enumerate(transformed_ops):
                if op.position < missed_op.position:
                    continue
                elif op.position > missed_op.position:
                    if missed_op.type == 'insert':
                        op.position += len(missed_op.text)
                    elif missed_op.type == 'delete':
                        op.position = max(missed_op.position, op.position - missed_op.length)
                else:
                    if op.type == 'insert' and missed_op.type == 'insert':
                        if op.id > missed_op.id:
                            op.position += len(missed_op.text)
                    elif op.type == 'delete' and missed_op.type == 'insert':
                        op.position += len(missed_op.text)
                    elif op.type == 'insert' and missed_op.type == 'delete':
                        op.position = max(missed_op.position, op.position)
        
        return transformed_ops
    
    def get_edit_history(self) -> List[Dict]:
        return [op.to_dict() for op in self.history]
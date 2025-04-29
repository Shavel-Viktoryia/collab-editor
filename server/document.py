import time
import uuid
from typing import List, Dict, Any

class TextOperation:
    def __init__(self, type: str, position: int, text: str = '', length: int = 0, deleted_text: str = ''):
        # Unique identifier for this operation
        self.id = str(uuid.uuid4())
        # Operation type: 'insert' or 'delete'
        self.type = type
        # The position in the document where this operation applies
        self.position = position
        # Text to insert (for insert operations)
        self.text = text
        # Number of characters to delete (for delete operations)
        self.length = length
        # Stores deleted text after applying a delete (for undo/history)
        self.deleted_text = deleted_text
        # Timestamp in milliseconds
        self.timestamp = time.time() * 1000
    
    def to_dict(self) -> Dict[str, Any]:
        #  Serialize this operation for JSON transport.
        return {
            'id': self.id,
            'type': self.type,
            'position': self.position,
            'text': self.text,
            'length': self.length,
            'deleted_text': self.deleted_text,
            'timestamp': self.timestamp
        }

class Document:
    def __init__(self, session_id: str):
        # Identifier for this collaborative session
        self.session_id = session_id
        # The current document text
        self.text = ''
        # Number of operations applied so far (revision counter)
        self.revision = 0
        # Map of client_id → their last known revision
        self.clients = {}
        # History of all TextOperation instances applied
        self.history = []

    def undo_last_operation(self):
        # Revert the last operation in history
        if not self.history:
            return None
        
        last_op = self.history.pop()
        inverse_ops = []
        
        if last_op.type == 'insert':
            inverse_ops.append(TextOperation(
                type='delete',
                position=last_op.position,
                length=len(last_op.text),
                deleted_text=last_op.text  
            ))
        elif last_op.type == 'delete':
            inverse_ops.append(TextOperation(
                type='insert',
                position=last_op.position,
                text=last_op.deleted_text 
            ))

        # Apply the inverse operation to the document text
        for op in inverse_ops:
            if op.type == 'insert':
                # Insert text at the position
                self.text = self.text[:op.position] + op.text + self.text[op.position:]
            elif op.type == 'delete':
                # Remove a slice of text
                self.text = self.text[:op.position] + self.text[op.position + op.length:]

        # Reduce revision by one
        self.revision -= 1
        # Return inverse operation(s) as list of dicts
        return [op.to_dict() for op in inverse_ops]
    
    def apply_operations(self, client_id: str, client_revision: int, operations: List[Dict]) -> List[Dict]:
        # Apply a batch of operations from a client
        incoming_ops = [TextOperation(**op) for op in operations]
        if client_revision < self.revision:
            missed_ops = self.history[client_revision:]
            transformed_ops = self._transform_operations(incoming_ops, missed_ops)
        else:
            transformed_ops = incoming_ops
        result_ops = []
        for op in transformed_ops:
            if op.type == 'insert':
                # Insert the new text
                self.text = self.text[:op.position] + op.text + self.text[op.position:]
            elif op.type == 'delete':
                # Capture deleted text for undo/history
                op.deleted_text = self.text[op.position:op.position + op.length]
                # Delete the slice
                self.text = self.text[:op.position] + self.text[op.position + op.length:]

            # Record in history and collect for response
            self.history.append(op)
            result_ops.append(op.to_dict())

        # Increase revision by number of applied ops
        self.revision += len(result_ops)
        # Update this client's known revision
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
        #  Return the full history as a list of dicts,
        return [op.to_dict() for op in self.history]
class CollaborativeEditor {
    constructor(sessionId) {
        this.sessionId = sessionId;
        this.socket = io();
        this.editor = document.getElementById('editor');
        this.userList = document.getElementById('user-list');
        this.userCount = document.getElementById('user-count');
        this.historyModal = document.getElementById('history-modal');
        this.historyList = document.getElementById('history-list');
        this.networkDelayBtn = document.getElementById('network-delay');
        this.networkDelay = false;
        
        this.revision = 0;
        this.pendingOperations = [];
        this.ignoreNextChange = false;
        this.username = `User${Math.floor(Math.random() * 1000)}`;
        this.cursorPosition = 0;
        this.lastKnownText = '';
        
        this.initializeSocket();
        this.initializeEditor();
        this.initializeUI();
        this.setupCursorTracking();
    }
    
    initializeSocket() {
        this.socket.on('connect', () => {
            this.socket.emit('join', {
                sessionId: this.sessionId,
                username: this.username
            });
        });
        
        this.socket.on('connect_error', (error) => {
            console.error('Connection Error:', error);
        });

        this.socket.on('disconnect', (reason) => {
            console.log('Disconnected:', reason);
        });
        
        this.socket.on('init', (data) => {
            this.revision = data.revision;
            this.editor.value = data.text;
            this.lastKnownText = data.text;
            this.updateUserList(data.clients);
        });
        
        this.socket.on('update', (data) => {
            if (data.clientId !== this.socket.id) {
                this.revision = data.revision;
                this.applyRemoteOperations(data.operations);
            }
        });
        
        this.socket.on('history', (history) => {
            this.displayHistory(history);
        });
    }
    
    initializeEditor() {
        this.editor.addEventListener('input', (e) => {
            if (this.ignoreNextChange) {
                this.ignoreNextChange = false;
                return;
            }
            
            const operations = this.calculateOperations(e);
            if (operations.length === 0) return;
            
            this.pendingOperations.push(...operations);
            
            this.socket.emit('edit', {
                sessionId: this.sessionId,
                revision: this.revision,
                operations: operations.map(op => ({
                    type: op.type,
                    position: op.position,
                    text: op.text,
                    length: op.length
                }))
            });
            
            this.revision += operations.length;
            this.lastKnownText = this.editor.value;
        });
    }
    
    setupCursorTracking() {
        this.editor.addEventListener('click', () => {
            this.cursorPosition = this.editor.selectionStart;
        });
        
        this.editor.addEventListener('keyup', () => {
            this.cursorPosition = this.editor.selectionStart;
        });
    }
    
    calculateOperations(e) {
        const newText = this.editor.value;
        const oldText = this.lastKnownText;
        const operations = [];
        
        // Find the first difference
        let diffStart = 0;
        while (diffStart < oldText.length && diffStart < newText.length && 
               oldText[diffStart] === newText[diffStart]) {
            diffStart++;
        }
        
        // Find the last difference from the end
        let diffEndOld = oldText.length - 1;
        let diffEndNew = newText.length - 1;
        while (diffEndOld >= diffStart && diffEndNew >= diffStart && 
               oldText[diffEndOld] === newText[diffEndNew]) {
            diffEndOld--;
            diffEndNew--;
        }
        
        // Calculate delete operation if needed
        if (diffEndOld >= diffStart) {
            operations.push({
                type: 'delete',
                position: diffStart,
                length: diffEndOld - diffStart + 1
            });
        }
        
        // Calculate insert operation if needed
        if (diffEndNew >= diffStart) {
            operations.push({
                type: 'insert',
                position: diffStart,
                text: newText.substring(diffStart, diffEndNew + 1)
            });
        }
        
        return operations;
    }
    
    applyRemoteOperations(operations) {
        this.ignoreNextChange = true;
        
        // Save current cursor position
        const cursorPos = this.editor.selectionStart;
        let newText = this.editor.value;
        let cursorAdjustment = 0;
        
        operations.forEach(op => {
            const pos = op.position;
            
            if (op.type === 'insert') {
                newText = newText.substring(0, pos) + op.text + newText.substring(pos);
                
                // Adjust cursor position if it's after the insertion point
                if (pos < cursorPos) {
                    cursorAdjustment += op.text.length;
                }
            } else if (op.type === 'delete') {
                newText = newText.substring(0, pos) + newText.substring(pos + op.length);
                
                // Adjust cursor position if it's after the deletion point
                if (pos < cursorPos) {
                    cursorAdjustment -= Math.min(op.length, cursorPos - pos);
                }
            }
        });
        
        // Apply changes
        this.editor.value = newText;
        this.lastKnownText = newText;
        
        // Restore and adjust cursor position
        if (cursorAdjustment !== 0) {
            const newCursorPos = cursorPos + cursorAdjustment;
            this.editor.selectionStart = newCursorPos;
            this.editor.selectionEnd = newCursorPos;
            this.cursorPosition = newCursorPos;
        }
        
        this.ignoreNextChange = false;
    }
    
    updateUserList(clients) {
        this.userList.innerHTML = '';
        clients.forEach(client => {
            const li = document.createElement('li');
            li.textContent = client.id === this.socket.id ? 
                `You (${client.username})` : client.username;
            this.userList.appendChild(li);
        });
        this.userCount.textContent = clients.length;
    }
    
    displayHistory(history) {
        this.historyList.innerHTML = '';
        history.forEach(op => {
            const item = document.createElement('div');
            item.className = 'history-item';
            item.innerHTML = `
                <span class="time">${new Date(op.timestamp).toLocaleTimeString()}</span>
                <span class="type ${op.type}">${op.type.toUpperCase()}</span>
                <span class="details">
                    ${op.type === 'insert' ? 
                        `"${op.text}" at ${op.position}` : 
                        `${op.length} chars at ${op.position}`}
                </span>
            `;
            this.historyList.appendChild(item);
        });
        this.historyModal.classList.remove('hidden');
    }
    
    initializeUI() {
        this.networkDelayBtn.addEventListener('click', () => {
            this.networkDelay = !this.networkDelay;
            this.networkDelayBtn.textContent = 
                `Simulate Network Delay: ${this.networkDelay ? 'On' : 'Off'}`;
            
            fetch('/simulate_delay', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ delay: this.networkDelay ? 2 : 0 })
            });
        });
        
        document.getElementById('show-history').addEventListener('click', () => {
            this.socket.emit('request_history', { sessionId: this.sessionId });
        });
        
        document.getElementById('close-history').addEventListener('click', () => {
            this.historyModal.classList.add('hidden');
        });
        
        document.getElementById('replay-history').addEventListener('click', () => {
            this.replayHistory();
        });
    }
    
    replayHistory() {
        this.socket.emit('request_history', { sessionId: this.sessionId });
        alert('History replay would animate changes in a full implementation');
    }
}

function initializeEditor(sessionId) {
    new CollaborativeEditor(sessionId);
}
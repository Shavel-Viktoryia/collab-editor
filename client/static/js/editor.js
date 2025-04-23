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
        
        this.initializeSocket();
        this.initializeEditor();
        this.initializeUI();
    }
    
    initializeSocket() {
        this.socket.on('connect', () => {
            this.socket.emit('join', {
                sessionId: this.sessionId,
                username: this.username
            });
        });
        
        this.socket.on('init', (data) => {
            this.revision = data.revision;
            this.editor.value = data.text;
            this.updateUserList(data.clients);
        });
        
        this.socket.on('update', (data) => {
            this.revision = data.revision;
            this.applyRemoteOperations(data.operations);
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
            
            // Send operations to server
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
        });
    }
    
    calculateOperations(e) {
    const operations = [];
    const newText = this.editor.value;
    const oldText = e.target._prevValue || '';
    
    // Find the first position where texts differ
    let diffStart = 0;
    while (diffStart < oldText.length && diffStart < newText.length && 
           oldText[diffStart] === newText[diffStart]) {
        diffStart++;
    }
    
    // Find the last position where texts differ from the end
    let diffEndOld = oldText.length - 1;
    let diffEndNew = newText.length - 1;
    while (diffEndOld >= diffStart && diffEndNew >= diffStart && 
           oldText[diffEndOld] === newText[diffEndNew]) {
        diffEndOld--;
        diffEndNew--;
    }
    
    // Calculate operations
    if (diffStart <= diffEndOld) {
        // There are deletions
        operations.push({
            type: 'delete',
            position: diffStart,
            length: diffEndOld - diffStart + 1
        });
    }
    
    if (diffStart <= diffEndNew) {
        // There are insertions
        operations.push({
            type: 'insert',
            position: diffStart,
            text: newText.substring(diffStart, diffEndNew + 1)
        });
    }
    
    e.target._prevValue = newText;
    return operations;
}
    
    applyRemoteOperations(operations) {
        this.ignoreNextChange = true;
        
        let newText = this.editor.value;
        let offset = 0;
        
        operations.forEach(op => {
            if (op.type === 'insert') {
                const pos = op.position + offset;
                newText = newText.substring(0, pos) + op.text + newText.substring(pos);
                offset += op.text.length;
            } else if (op.type === 'delete') {
                const pos = op.position + offset;
                newText = newText.substring(0, pos) + newText.substring(pos + op.length);
                offset -= op.length;
            }
        });
        
        this.editor.value = newText;
        this.editor._prevValue = newText;
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
        // Network delay simulation
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
        
        // History controls
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
        
        // In a real implementation, we would replay the operations visually
        alert('History replay would show here. In a full implementation, this would animate the changes.');
    }
}

function initializeEditor(sessionId) {
    new CollaborativeEditor(sessionId);
}
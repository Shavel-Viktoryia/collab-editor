class CollaborativeEditor {
    constructor(sessionId, username) {
        this.sessionId = sessionId;
        this.username = username || `User${Math.floor(Math.random() * 1000)}`;
        this.socket = io();
        this.editor = document.getElementById('editor');
        this.userList = document.getElementById('user-list');
        this.userCount = document.getElementById('user-count');
        this.historyModal = document.getElementById('history-modal');
        this.historyList = document.getElementById('history-list');
        
        this.revision = 0;
        this.pendingOperations = [];
        this.ignoreNextChange = false;
        this.lastKnownText = '';
        this.remoteCursors = new Map();
        this.typingTimeout = null;

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

        this.socket.on('init', (data) => {
            this.revision = data.revision;
            this.editor.value = data.text;
            this.lastKnownText = data.text;
            this.updateUserList(data.clients);
        });

        this.socket.on('history', (history) => {
            this.displayHistory(history);
        });

        this.socket.on('update', (data) => {
            this.revision = data.revision;
            this.applyRemoteOperations(data.operations);
        });

        // В методе initializeSocket() добавьте:
        this.socket.on('delay_updated', (data) => {
            this.networkDelay = data.delay > 0;
            this.networkDelayBtn.textContent = 
                `Simulate Network Delay: ${this.networkDelay ? 'On' : 'Off'}`;
        });

        this.socket.on('cursor_update', (data) => {
            this.displayRemoteCursor(data);
        });

        this.socket.on('user_joined', (data) => {
            this.updateUserList(data.clients);
        });

        this.socket.on('user_left', (data) => {
            this.updateUserList(data.clients);
            this.removeRemoteCursor(data.clientId);
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

    displayHistory(history) {
        this.historyList.innerHTML = history.map(op => `
            <div class="history-item">
                <div>
                    <span class="time">${new Date(op.timestamp).toLocaleString()}</span>
                    <span class="type ${op.type}">${op.type}</span>
                    ${op.type === 'insert' ? 
                        `Inserted "${op.text}" at position ${op.position}` : 
                        `Deleted ${op.length} chars at position ${op.position}`}
                </div>
            </div>
        `).join('');
    }

    calculateOperations(e) {
        const newText = this.editor.value;
        const oldText = this.lastKnownText;
        const operations = [];
        
        let i = 0;
        while (i < oldText.length && i < newText.length && oldText[i] === newText[i]) {
            i++;
        }
        
        let oldEnd = oldText.length;
        let newEnd = newText.length;
        while (oldEnd > i && newEnd > i && oldText[oldEnd - 1] === newText[newEnd - 1]) {
            oldEnd--;
            newEnd--;
        }
        
        if (oldEnd > i) {
            operations.push({
                type: 'delete',
                position: i,
                length: oldEnd - i
            });
        }
        
        if (newEnd > i) {
            operations.push({
                type: 'insert',
                position: i,
                text: newText.substring(i, newEnd)
            });
        }
        
        return operations;
    }

    applyRemoteOperations(operations) {
        this.ignoreNextChange = true;
        const cursorPos = this.editor.selectionStart;
        let newText = this.editor.value;
        let cursorAdjustment = 0;
        
        operations.forEach(op => {
            if (op.type === 'insert') {
                newText = newText.slice(0, op.position) + op.text + newText.slice(op.position);
                if (op.position <= cursorPos) {
                    cursorAdjustment += op.text.length;
                }
            } else if (op.type === 'delete') {
                newText = newText.slice(0, op.position) + newText.slice(op.position + op.length);
                if (op.position <= cursorPos) {
                    cursorAdjustment -= Math.min(op.length, cursorPos - op.position);
                }
            }
        });

        this.editor.value = newText;
        this.lastKnownText = newText;
        
        if (cursorAdjustment !== 0) {
            const newCursorPos = cursorPos + cursorAdjustment;
            this.editor.selectionStart = newCursorPos;
            this.editor.selectionEnd = newCursorPos;
        }
        
        this.ignoreNextChange = false;
    }

    setupCursorTracking() {
        const throttle = (func, limit) => {
            let lastFunc;
            let lastRan;
            return function(...args) {
                if (!lastRan) {
                    func.apply(this, args);
                    lastRan = Date.now();
                } else {
                    clearTimeout(lastFunc);
                    lastFunc = setTimeout(() => {
                        if ((Date.now() - lastRan) >= limit) {
                            func.apply(this, args);
                            lastRan = Date.now();
                        }
                    }, limit - (Date.now() - lastRan));
                }
            };
        };

        const updateCursor = throttle(() => {
            const cursorPos = this.editor.selectionStart;
            const selectionEnd = this.editor.selectionEnd;
            this.socket.emit('cursor', {
                sessionId: this.sessionId,
                position: cursorPos,
                selectionEnd: selectionEnd,
                username: this.username
            });
        }, 100);

        ['click', 'keyup', 'mousemove', 'scroll'].forEach(event => {
            this.editor.addEventListener(event, updateCursor);
        });
    }

    displayRemoteCursor(data) {
        if (data.clientId === this.socket.id) return;

        const cursorId = `cursor-${data.clientId}`;
        let cursor = this.remoteCursors.get(cursorId);

        if (!cursor) {
            cursor = document.createElement('div');
            cursor.id = cursorId;
            cursor.className = 'remote-cursor';
            cursor.innerHTML = `
                <div class="cursor-tooltip">${data.username}</div>
                <div class="cursor-selection"></div>
            `;
            this.editor.parentNode.appendChild(cursor);
            this.remoteCursors.set(cursorId, cursor);
        }

        const pos = this.calculateTextPosition(data.position);
        const endPos = this.calculateTextPosition(data.selectionEnd);

        cursor.style.display = 'block';
        cursor.style.left = `${pos.x}px`;
        cursor.style.top = `${pos.y}px`;
        cursor.style.height = `${pos.height}px`;

        const selection = cursor.querySelector('.cursor-selection');
        if (data.position !== data.selectionEnd) {
            const start = Math.min(data.position, data.selectionEnd);
            const end = Math.max(data.position, data.selectionEnd);
            const startPos = this.calculateTextPosition(start);
            const endPos = this.calculateTextPosition(end);

            selection.style.display = 'block';
            selection.style.width = `${endPos.x - startPos.x}px`;
            selection.style.left = `${startPos.x}px`;
            selection.style.top = `${startPos.y}px`;
            selection.style.height = `${startPos.height}px`;
        } else {
            selection.style.display = 'none';
        }
    }

    calculateTextPosition(pos) {
        const mirror = document.createElement('div');
        mirror.style.whiteSpace = 'pre-wrap';
        mirror.style.visibility = 'hidden';
        mirror.style.position = 'absolute';
        mirror.style.font = getComputedStyle(this.editor).font;
        mirror.textContent = this.editor.value.substring(0, pos);
        
        document.body.appendChild(mirror);
        const span = document.createElement('span');
        span.textContent = '.';
        mirror.appendChild(span);
        
        const rect = span.getBoundingClientRect();
        const editorRect = this.editor.getBoundingClientRect();
        
        document.body.removeChild(mirror);
        
        return {
            x: rect.left - editorRect.left + this.editor.scrollLeft,
            y: rect.top - editorRect.top + this.editor.scrollTop,
            height: rect.height
        };
    }

    removeRemoteCursor(clientId) {
        const cursorId = `cursor-${clientId}`;
        const cursor = this.remoteCursors.get(cursorId);
        if (cursor) {
            cursor.remove();
            this.remoteCursors.delete(cursorId);
        }
    }

    updateUserList(clients) {
        this.userList.innerHTML = clients.map(client => `
            <li class="${client.id === this.socket.id ? 'current-user' : ''}">
                <span class="user-status"></span>
                ${client.username}${client.id === this.socket.id ? ' (You)' : ''}
            </li>
        `).join('');
        this.userCount.textContent = clients.length;
    }

    initializeUI() {
        // Theme toggle
        const themeToggle = document.createElement('button');
        themeToggle.id = 'theme-toggle';
        themeToggle.textContent = '🌓';
        document.querySelector('.controls').prepend(themeToggle);
        
        themeToggle.addEventListener('click', () => {
            document.body.classList.toggle('dark-theme');
        });
    
        // Network delay button
        this.networkDelayBtn = document.getElementById('network-delay');
        this.networkDelay = false;
        
        this.networkDelayBtn.addEventListener('click', () => {
            this.networkDelay = !this.networkDelay;
            this.networkDelayBtn.textContent = 
                `Simulate Network Delay: ${this.networkDelay ? 'On' : 'Off'}`;
            
            // Send delay setting to server
            this.socket.emit('set_delay', {
                delay: this.networkDelay ? 2 : 0,
                sessionId: this.sessionId
            });
        });
    
        // Show history button
        document.getElementById('show-history').addEventListener('click', () => {
            this.socket.emit('request_history', { sessionId: this.sessionId });
            this.historyModal.classList.remove('hidden');
        });
    
        // Close history button
        document.getElementById('close-history').addEventListener('click', () => {
            this.historyModal.classList.add('hidden');
        });
    
        // Replay history button
        document.getElementById('replay-history').addEventListener('click', () => {
            this.replayHistory();
        });
    
        // Typing indicator
        this.editor.addEventListener('input', () => {
            this.editor.parentNode.classList.add('typing');
            clearTimeout(this.typingTimeout);
            this.typingTimeout = setTimeout(() => {
                this.editor.parentNode.classList.remove('typing');
            }, 500);
        });
    }
    
    replayHistory() {
        // Simple replay implementation - in a real app this would animate changes
        alert('History replay would show changes animation in a full implementation');
        this.historyModal.classList.add('hidden');
    }
}

function initializeEditor(sessionId, username) {
    new CollaborativeEditor(sessionId, username);
}
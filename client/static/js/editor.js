class CollaborativeEditor {
  constructor(sessionId, username) {
    this.sessionId = sessionId;
    this.username = username || `User${Math.floor(Math.random() * 1000)}`;
    this.socket = io();
    this.editor = document.getElementById("editor");
    this.userList = document.getElementById("user-list");
    this.userCount = document.getElementById("user-count");
    this.historyModal = document.getElementById("history-modal");
    this.historyList = document.getElementById("history-list");

    this.revision = 0;
    this.pendingOperations = [];
    this.ignoreNextChange = false;
    this.lastKnownText = "";
    this.remoteCursors = new Map();
    this.typingTimeout = null;
    this.historyData = [];
    this.isReplaying = false;

    const savedTheme = localStorage.getItem("editor-theme");
    const savedNetworkDelay = localStorage.getItem("network-delay");

    this.initialTheme = savedTheme || "light";
    this.initialNetworkDelay = savedNetworkDelay === "true";

    this.initializeSocket();
    this.initializeEditor();
    this.initializeUI();
    this.setupCursorTracking();
    this.initializeUndo();
  }

  initializeUndo() {
    const undoButton = document.createElement("button");
    undoButton.id = "undo-btn";
    undoButton.textContent = "Undo";
    document.querySelector(".controls").append(undoButton);

    undoButton.addEventListener("click", () => {
      this.socket.emit("undo", { sessionId: this.sessionId });
    });
  }

  initializeSocket() {
    this.socket.on("connect", () => {
      this.socket.emit("join", {
        sessionId: this.sessionId,
        username: this.username,
      });
    });

    this.socket.on("init", (data) => {
      this.revision = data.revision;
      this.editor.value = data.text;
      this.lastKnownText = data.text;
      this.updateUserList(data.clients);
    });

    this.socket.on("update", (data) => {
      if (this.isReplaying) return;
      this.revision = data.revision;
      this.applyRemoteOperations(data.operations);
    });

    this.socket.on("cursor_update", (data) => {
      if (this.isReplaying) return;
      this.displayRemoteCursor(data);
    });

    this.socket.on("user_joined", (data) => {
      this.updateUserList(data.clients);
    });

    this.socket.on("user_left", (data) => {
      this.updateUserList(data.clients);
      this.removeRemoteCursor(data.clientId);
    });

    this.socket.on("history", (history) => {
      this.displayHistory(history);
    });

    this.socket.on("delay_updated", (data) => {
      this.networkDelay = data.delay > 0;
      this.networkDelayBtn.textContent = `Simulate Network Delay: ${
        this.networkDelay ? "On" : "Off"
      }`;
    });
    this.socket.on("history_update", (data) => {
      const newItem = document.createElement("div");
      newItem.className = "history-item";

      const timestamp = new Date().toLocaleString();
      const action = data.action === "undo" ? "UNDO" : "REDO";

      newItem.innerHTML = `
          <div class="op-info">
            <span class="time">${timestamp}</span>
            <span class="type undo">${action}</span>
          </div>
          <div class="op-details">
            Undid: ${
              data.operation.type === "insert"
                ? `Inserted: "${data.operation.text}" at position ${data.operation.position}`
                : `Deleted: "${data.operation.length} chars" from position ${data.operation.position}`
            }
          </div>
        `;

      this.historyList.prepend(newItem);
    });
  }

  initializeEditor() {
    let typingTimeout = null;

    this.editor.addEventListener("input", (e) => {
      if (this.ignoreNextChange || this.isReplaying) {
        this.ignoreNextChange = false;
        return;
      }

      clearTimeout(typingTimeout);

      const newText = this.editor.value;

      typingTimeout = setTimeout(() => {
        const operations = this.calculateOperations(newText);
        if (operations.length === 0) return;

        this.socket.emit("edit", {
          sessionId: this.sessionId,
          revision: this.revision,
          operations: operations.map((op) => ({
            type: op.type,
            position: op.position,
            text: op.text,
            length: op.length,
          })),
        });

        this.revision += operations.length;
        this.lastKnownText = newText;
      }, 400);
    });
  }

  calculateOperations(newText) {
    const oldText = this.lastKnownText;
    const operations = [];
    let i = 0;

    while (
      i < oldText.length &&
      i < newText.length &&
      oldText[i] === newText[i]
    ) {
      i++;
    }

    let oldEnd = oldText.length;
    let newEnd = newText.length;
    while (
      oldEnd > i &&
      newEnd > i &&
      oldText[oldEnd - 1] === newText[newEnd - 1]
    ) {
      oldEnd--;
      newEnd--;
    }

    if (oldEnd > i) {
      operations.push({
        type: "delete",
        position: i,
        length: oldEnd - i,
      });
    }

    if (newEnd > i) {
      operations.push({
        type: "insert",
        position: i,
        text: newText.substring(i, newEnd),
      });
    }

    return operations;
  }

  applyRemoteOperations(operations) {
    this.ignoreNextChange = true;
    const cursorPos = this.editor.selectionStart;
    let newText = this.editor.value;
    let cursorAdjustment = 0;

    operations.forEach((op) => {
      if (op.type === "insert") {
        newText =
          newText.slice(0, op.position) + op.text + newText.slice(op.position);
        if (op.position <= cursorPos) {
          cursorAdjustment += op.text.length;
        }
      } else if (op.type === "delete") {
        newText =
          newText.slice(0, op.position) +
          newText.slice(op.position + op.length);
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
      return function (...args) {
        if (!lastRan) {
          func.apply(this, args);
          lastRan = Date.now();
        } else {
          clearTimeout(lastFunc);
          lastFunc = setTimeout(() => {
            if (Date.now() - lastRan >= limit) {
              func.apply(this, args);
              lastRan = Date.now();
            }
          }, limit - (Date.now() - lastRan));
        }
      };
    };

    const updateCursor = throttle(() => {
      if (this.isReplaying) return;
      const cursorPos = this.editor.selectionStart;
      const selectionEnd = this.editor.selectionEnd;
      this.socket.emit("cursor", {
        sessionId: this.sessionId,
        position: cursorPos,
        selectionEnd: selectionEnd,
        username: this.username,
      });
    }, 100);

    ["click", "keyup", "mousemove", "scroll"].forEach((event) => {
      this.editor.addEventListener(event, updateCursor);
    });
  }

  displayRemoteCursor(data) {
    if (data.clientId === this.socket.id || this.isReplaying) return;

    const cursorId = `cursor-${data.clientId}`;
    let cursor = this.remoteCursors.get(cursorId);

    if (!cursor) {
      cursor = document.createElement("div");
      cursor.id = cursorId;
      cursor.className = "remote-cursor";
      cursor.innerHTML = `
                <div class="cursor-tooltip">${data.username}</div>
                <div class="cursor-selection"></div>
            `;
      this.editor.parentNode.appendChild(cursor);
      this.remoteCursors.set(cursorId, cursor);
    }

    const pos = this.calculateTextPosition(data.position);
    const endPos = this.calculateTextPosition(data.selectionEnd);

    cursor.style.display = "block";
    cursor.style.left = `${pos.x}px`;
    cursor.style.top = `${pos.y}px`;
    cursor.style.height = `${pos.height}px`;

    const selection = cursor.querySelector(".cursor-selection");
    if (data.position !== data.selectionEnd) {
      const start = Math.min(data.position, data.selectionEnd);
      const end = Math.max(data.position, data.selectionEnd);
      const startPos = this.calculateTextPosition(start);
      const endPos = this.calculateTextPosition(end);

      selection.style.display = "block";
      selection.style.width = `${endPos.x - startPos.x}px`;
      selection.style.left = `${startPos.x}px`;
      selection.style.top = `${startPos.y}px`;
      selection.style.height = `${startPos.height}px`;
    } else {
      selection.style.display = "none";
    }
  }

  calculateTextPosition(pos) {
    const mirror = document.createElement("div");
    mirror.style.whiteSpace = "pre-wrap";
    mirror.style.visibility = "hidden";
    mirror.style.position = "absolute";
    mirror.style.font = getComputedStyle(this.editor).font;
    mirror.textContent = this.editor.value.substring(0, pos);

    document.body.appendChild(mirror);
    const span = document.createElement("span");
    span.textContent = ".";
    mirror.appendChild(span);

    const rect = span.getBoundingClientRect();
    const editorRect = this.editor.getBoundingClientRect();

    document.body.removeChild(mirror);

    return {
      x: rect.left - editorRect.left + this.editor.scrollLeft,
      y: rect.top - editorRect.top + this.editor.scrollTop,
      height: rect.height,
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
    this.userList.innerHTML = clients
      .map(
        (client) => `
            <li class="${client.id === this.socket.id ? "current-user" : ""}">
                <span class="user-status"></span>
                ${client.username}${
          client.id === this.socket.id ? " (You)" : ""
        }
            </li>
        `
      )
      .join("");
    this.userCount.textContent = clients.length;
  }

  initializeUI() {
    const themeToggle = document.createElement("button");
    themeToggle.id = "theme-toggle";
    document.querySelector(".controls").prepend(themeToggle);

    if (this.initialTheme === "dark") {
      document.body.classList.add("dark-theme");
      themeToggle.textContent = "☀️";
    } else {
      themeToggle.textContent = "🌑";
    }

    themeToggle.addEventListener("click", () => {
      const isDark = document.body.classList.toggle("dark-theme");
      localStorage.setItem("editor-theme", isDark ? "dark" : "light");
      themeToggle.textContent = isDark ? "☀️" : "🌑";
    });

    this.networkDelayBtn = document.getElementById("network-delay");
    this.networkDelay = this.initialNetworkDelay;
    this.networkDelayBtn.textContent = `Simulate Network Delay: ${
      this.networkDelay ? "On" : "Off"
    }`;

    this.networkDelayBtn.addEventListener("click", () => {
      this.networkDelay = !this.networkDelay;
      localStorage.setItem("network-delay", this.networkDelay);
      this.networkDelayBtn.textContent = `Simulate Network Delay: ${
        this.networkDelay ? "On" : "Off"
      }`;
      this.socket.emit("set_delay", {
        delay: this.networkDelay ? 2 : 0,
        sessionId: this.sessionId,
      });
    });

    document.getElementById("show-history").addEventListener("click", () => {
      this.socket.emit("request_history", { sessionId: this.sessionId });
      this.historyModal.classList.remove("hidden");
    });

    document.getElementById("close-history").addEventListener("click", () => {
      this.historyModal.classList.add("hidden");
    });

    document.getElementById("replay-history").addEventListener("click", () => {
      this.replayHistory();
    });

    this.editor.addEventListener("input", () => {
      if (this.isReplaying) return;
      this.editor.parentNode.classList.add("typing");
      clearTimeout(this.typingTimeout);
      this.typingTimeout = setTimeout(() => {
        this.editor.parentNode.classList.remove("typing");
      }, 500);
    });
  }

  displayHistory(history) {
    this.historyData = history;
    this.historyList.innerHTML = history
      .map(
        (op, index) => `
            <div class="history-item" data-index="${index}">
                <div class="op-info">
                    <span class="time">${new Date(
                      op.timestamp
                    ).toLocaleString()}</span>
                    <span class="type ${
                      op.type
                    }">${op.type.toUpperCase()}</span>
                </div>
                <div class="op-details">
                    ${
                      op.type === "insert"
                        ? `User <strong>${op.username}</strong> Inserted: <strong>"${op.text}"</strong> at position ${op.position}`
                        : `User <strong>${op.username}</strong> Deleted: <strong>"${op.deleted_text}"</strong> from position ${op.position}`
                    }
                </div>
            </div>
        `
      )
      .join("");
  }

  replayHistory() {
    if (this.historyData.length === 0) return;

    this.isReplaying = true;
    const originalText = this.editor.value;
    const replayBtn = document.getElementById("replay-history");
    const closeBtn = document.getElementById("close-history");

    replayBtn.disabled = true;
    closeBtn.disabled = true;
    replayBtn.textContent = "Replaying...";
    this.editor.disabled = true;

    this.editor.value = "";
    this.lastKnownText = "";

    let delay = 0;
    this.historyData.forEach((op, index) => {
      setTimeout(() => {
        this.highlightHistoryItem(index);
        this.applyReplayOperation(op);

        if (index === this.historyData.length - 1) {
          setTimeout(() => {
            replayBtn.disabled = false;
            closeBtn.disabled = false;
            replayBtn.textContent = "Replay";
            this.editor.disabled = false;
            this.isReplaying = false;
          }, 500);
        }
      }, delay);

      delay += 1000;
    });
  }

  highlightHistoryItem(index) {
    document.querySelectorAll(".history-item").forEach((item) => {
      item.style.backgroundColor = "";
    });

    const item = document.querySelector(`.history-item[data-index="${index}"]`);
    if (item) {
      item.style.backgroundColor = "rgba(74, 144, 226, 0.1)";
      item.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }

  applyReplayOperation(op) {
    const editor = this.editor;
    let newText = editor.value;

    if (op.type === "insert") {
      newText =
        newText.slice(0, op.position) + op.text + newText.slice(op.position);
      editor.value = newText;

      setTimeout(() => {
        editor.focus();
        editor.setSelectionRange(op.position, op.position + op.text.length);

        const selection = window.getSelection();
        const range = document.createRange();
        range.setStart(editor.firstChild, op.position);
        range.setEnd(editor.firstChild, op.position + op.text.length);
        selection.removeAllRanges();
        selection.addRange(range);
      }, 10);
    } else if (op.type === "delete") {
      const deletedText = newText.slice(op.position, op.position + op.length);

      editor.focus();
      editor.setSelectionRange(op.position, op.position + op.length);

      setTimeout(() => {
        newText =
          newText.slice(0, op.position) +
          newText.slice(op.position + op.length);
        editor.value = newText;
      }, 800);
    }

    this.lastKnownText = newText;
  }
}

function initializeEditor(sessionId, username) {
  new CollaborativeEditor(sessionId, username);
}

# 📚 Collaborative Text Editor

Real-time collaborative text editor with multiple clients and live sync using WebSockets. 



### ✨ Features

- **Real-Time Collaboration** — instantly sync edits between users.

- **Session Management** — unique collaboration sessions via URL.

- **Operational Transformation (OT)** — safe concurrent editing without conflicts.

- **Undo Support** — each client can undo their last operation.

- **Network Delay Simulation** — introduce artificial lag to test synchronization.

- **Edit History** — request and replay full edit history.


### 🛠 Tech Stack

**Backend**: Flask, Flask-SocketIO, Python

**Realtime Communication**: WebSockets via Socket.IO

**Frontend**: Vanilla JS + Socket.IO client


### 📥 Installation

#### 1. Clone repository
```
git clone https://github.com/Shavel-Viktoryia/collab-editor.git
cd collab-editor
```

#### 2. Install dependencies
```
pip install -r requirements.txt
```

#### 3. Run the server
```
python server/app.py
```

By default the app is listen on ```http://127.0.0.1:5000```

### 🚀 Usage

#### 1. Start or join a session
Stаrt or join a sеssion using UI.

#### 2. Editing
Tеxt еdits auto-sync across all connected cliеnts.

#### 3. Undo last operation
Click the **Undo** button (or press Ctrl+Z) to revert the most recent change.

#### 4. Network delay simulation
Use the built-in delay slider in the UI to introduce artificial latency and test conflict resolution.

#### 5. Show history
Click the **Show History** button to view all operations.

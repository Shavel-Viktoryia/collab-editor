📚 **Collaborative Text Editor**

Real-time collaborative text editor with multiple clients and live sync using WebSockets. 



✨ **Features**

Real-Time Collaboration — instantly sync edits between users.
Session Management — unique collaboration sessions via URL.
Operational Transformation (OT) — safe concurrent editing without conflicts.
Undo Support — each client can undo their last operation.
Network Delay Simulation — introduce artificial lag to test synchronization.
Edit History — request and replay full edit history.


🛠 **Tech Stack**

Backend: Flask, Flask-SocketIO, Python
Realtime Communication: WebSockets via Socket.IO
Frontend: Vanilla JS + Socket.IO client


🚀 **Dependencies installation **

pip install flask flask-socketio

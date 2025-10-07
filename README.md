# Kanban Board

A real-time collaborative Kanban board built with Flask, SQLite, and WebSockets. Made to be used on a Dakboard but can be used anywhere.

## Features

- **Three Columns**: To-Do, In Progress, Done with drag & drop
- **Inline Editing**: Double-click cards to edit title, description, due date, assignee, tags, and time
- **Subtasks**: Add, toggle, and remove with checkboxes
- **Tags**: Multi-tag support with autocomplete and filtering
- **Time Tracking**: Optional estimated time in minutes (30m, 1h 30m, etc.)
- **Dark/Light Mode**: Theme toggle with preference saving
- **Real-time Sync**: Live updates across multiple browser sessions
- **Persistent Storage**: SQLite database

## Quick Start

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run the application
python app.py
```

Open `http://127.0.0.1:5001` in your browser.

## Usage

- **Add Cards**: Click the ghost card in To-Do column
- **Edit Cards**: Double-click to edit inline
- **Move Cards**: Drag and drop between columns
- **Tags**: Type with autocomplete, filter with top bar
- **Tag Manager**: Press Ctrl+T to add/edit/delete tags
- **Theme**: Click moon/sun button in top right

## Database

- **SQLite**: Data persists in `kanban.db` (stored under `instance/`)
- **Auto-initialization**: Database and tables are created on first run

## Tech Stack

- **Backend**: Flask, SQLAlchemy, Flask-SocketIO
- **Database**: SQLite
- **Frontend**: Vanilla JavaScript, HTML5 Drag & Drop
- **Real-time**: WebSocket connections for live updates (Flask-SocketIO)


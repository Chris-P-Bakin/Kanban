# Kanban Board

A real-time collaborative Kanban board built with Flask, SQLite, and WebSockets. Made to be used on a Dakboard but can be used anywhere.

## Features

- **Three Columns**: To-Do, In Progress, Done with color-coded accents
- **Drag & Drop**: Move cards between columns with visual feedback
- **Inline Editing**: Double-click cards to edit title, description, due date, and assignee
- **Subtasks**: Add, toggle, and remove subtasks with checkboxes
- **Due Dates**: Optional due dates with automatic sorting (earliest first)
- **Assignees**: Dropdown selection from user database
- **Real-time Sync**: Live updates across multiple browser sessions via WebSockets
- **Persistent Storage**: SQLite database
- **Responsive Design**: Works on desktop and mobile

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

- **Add Cards**: Click the "+ Add new card" ghost card in To-Do column
- **Edit Cards**: Double-click any card to edit inline
- **Move Cards**: Drag and drop between columns
- **Add Subtasks**: In edit mode, type in the subtask field and press Enter
- **Assign Users**: Use the dropdown to assign to defined users
- **Set Due Dates**: Use the date picker for deadline tracking

## Database

- **SQLite**: Data persists in `kanban.db` file
- **Auto-initialization**: Database and tables created on first run

## Tech Stack

- **Backend**: Flask, SQLAlchemy, Flask-SocketIO
- **Database**: SQLite
- **Frontend**: Vanilla JavaScript, HTML5 Drag & Drop
- **Real-time**: WebSocket connections for live updates


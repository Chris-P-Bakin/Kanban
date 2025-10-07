from __future__ import annotations

from typing import Dict, List, Optional, Tuple
from uuid import uuid4

from flask import Flask, jsonify, render_template, request, abort
from datetime import datetime
from flask_socketio import SocketIO
from flask_sqlalchemy import SQLAlchemy
from sqlalchemy import Column, String, Text, Boolean, ForeignKey, Integer, Table
from sqlalchemy.orm import relationship


app = Flask(__name__)
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///kanban.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
db = SQLAlchemy(app)
socketio = SocketIO(app, cors_allowed_origins="*", logger=True, engineio_logger=True)

# Association table for many-to-many relationship between cards and tags
card_tags = Table('card_tags', db.Model.metadata,
    Column('card_id', String, ForeignKey('cards.id'), primary_key=True),
    Column('tag_id', String, ForeignKey('tags.id'), primary_key=True)
)


class User(db.Model):
    __tablename__ = 'users'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(100), nullable=False, unique=True)
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name
        }


class Tag(db.Model):
    __tablename__ = 'tags'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    name = Column(String(50), nullable=False, unique=True)
    color = Column(String(7), default='#93c5fd')  # Hex color
    
    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'color': self.color
        }


class Card(db.Model):
    __tablename__ = 'cards'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    title = Column(String(255), nullable=False)
    description = Column(Text)
    due_date = Column(String(10))  # YYYY-MM-DD format
    assignee = Column(String(100))
    estimated_time = Column(Integer)  # Time in minutes
    archived = Column(Boolean, default=False)
    column = Column(String(20), nullable=False, default='todo')
    position = Column(Integer, default=0)
    
    subtasks = relationship("Subtask", back_populates="card", cascade="all, delete-orphan")
    tags = relationship("Tag", secondary=card_tags, backref="cards")
    
    def to_dict(self):
        return {
            'id': self.id,
            'title': self.title,
            'description': self.description or '',
            'due_date': self.due_date,
            'assignee': self.assignee,
            'estimated_time': self.estimated_time,
            'archived': self.archived,
            'subtasks': [st.to_dict() for st in self.subtasks],
            'tags': [tag.to_dict() for tag in self.tags]
        }


class Subtask(db.Model):
    __tablename__ = 'subtasks'
    
    id = Column(String, primary_key=True, default=lambda: str(uuid4()))
    text = Column(String(255), nullable=False)
    done = Column(Boolean, default=False)
    card_id = Column(String, ForeignKey('cards.id'), nullable=False)
    
    card = relationship("Card", back_populates="subtasks")
    
    def to_dict(self):
        return {
            'id': self.id,
            'text': self.text,
            'done': self.done
        }


def find_card(card_id: str) -> Optional[Card]:
    return Card.query.get(card_id)


def serialize_board() -> Dict[str, List[dict]]:
    # Get all cards grouped by column
    cards_by_column = {
        'todo': [],
        'in_progress': [],
        'done': []
    }
    
    for card in Card.query.filter_by(archived=False).all():
        cards_by_column[card.column].append(card)
    
    # Sort each column by due_date ASC, None last; tie-break by title
    def sort_key(c: Card):
        if c.due_date:
            try:
                return (0, datetime.strptime(c.due_date, "%Y-%m-%d"), c.title.lower())
            except ValueError:
                # invalid stored date falls back to end
                return (1, datetime.max, c.title.lower())
        return (1, datetime.max, c.title.lower())
    
    for column in cards_by_column:
        cards_by_column[column] = [card.to_dict() for card in sorted(cards_by_column[column], key=sort_key)]
    
    return cards_by_column


def init_db():
    """Initialize database with sample data if empty"""
    with app.app_context():
        db.create_all()
        
        # Add archived column if it doesn't exist (migration)
        try:
            db.engine.execute("ALTER TABLE cards ADD COLUMN archived BOOLEAN DEFAULT 0")
        except Exception:
            # Column already exists, ignore
            pass
        
        # Add sample users if none exist
        if User.query.count() == 0:
            sample_users = [
                User(name="Alice"),
                User(name="Bob"),
            ]
            
            for user in sample_users:
                db.session.add(user)
            
            db.session.commit()
        
        # Add sample tags if none exist
        if Tag.query.count() == 0:
            sample_tags = [
                Tag(name="Bug", color="#fca5a5"),
                Tag(name="Feature", color="#86efac"),
                Tag(name="Urgent", color="#fde68a"),
                Tag(name="Review", color="#c4b5fd"),
            ]
            
            for tag in sample_tags:
                db.session.add(tag)
            
            db.session.commit()
        
        # Only add sample cards if none exist
        if Card.query.count() == 0:
            sample_cards = [
                Card(title="Set up project", description="Initialize repo and basic structure", column="todo"),
                Card(title="Design board", description="Decide on columns and card data", column="todo"),
                Card(title="Implement backend", description="Create Flask app and APIs", column="in_progress"),
                Card(title="Gather requirements", description="Confirm basic features", column="done"),
            ]
            
            for card in sample_cards:
                db.session.add(card)
            
            db.session.commit()


@app.route("/")
def index():
    return render_template("index.html")




@app.route("/api/board", methods=["GET"])
def get_board():
    return jsonify(serialize_board())


@app.route("/api/users", methods=["GET"])
def get_users():
    users = User.query.all()
    return jsonify([user.to_dict() for user in users])


@app.route("/api/tags", methods=["GET"])
def get_tags():
    tags = Tag.query.all()
    return jsonify([tag.to_dict() for tag in tags])


@app.route("/api/tags", methods=["POST"])
def create_tag():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    color = data.get("color", "#3b82f6")
    
    if not name:
        abort(400, description="name is required")
    
    # Check if tag already exists
    existing_tag = Tag.query.filter_by(name=name).first()
    if existing_tag:
        abort(400, description="tag with this name already exists")
    
    new_tag = Tag(name=name, color=color)
    db.session.add(new_tag)
    db.session.commit()
    
    socketio.emit("tags_changed")
    return jsonify(new_tag.to_dict()), 201


@app.route("/api/tags/<tag_id>", methods=["PATCH"])
def update_tag(tag_id: str):
    data = request.get_json(silent=True) or {}
    tag = Tag.query.get(tag_id)
    if not tag:
        abort(404, description="tag not found")
    
    if "name" in data:
        name = (data.get("name") or "").strip()
        if not name:
            abort(400, description="name cannot be empty")
        # Check if another tag with this name exists
        existing_tag = Tag.query.filter(Tag.name == name, Tag.id != tag_id).first()
        if existing_tag:
            abort(400, description="tag with this name already exists")
        tag.name = name
    
    if "color" in data:
        tag.color = data.get("color", "#3b82f6")
    
    db.session.commit()
    socketio.emit("tags_changed")
    return jsonify(tag.to_dict())


@app.route("/api/tags/<tag_id>", methods=["DELETE"])
def delete_tag(tag_id: str):
    tag = Tag.query.get(tag_id)
    if not tag:
        abort(404, description="tag not found")
    
    # Remove tag from all cards
    for card in tag.cards:
        card.tags.remove(tag)
    
    db.session.delete(tag)
    db.session.commit()
    socketio.emit("tags_changed")
    socketio.emit("board_changed", serialize_board())
    return ("", 204)


@app.route("/api/cards", methods=["POST"])
def create_card():
    data = request.get_json(silent=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    column = (data.get("column") or "todo").strip()
    due_date = (data.get("dueDate") or None)
    assignee = (data.get("assignee") or None)
    estimated_time = data.get("estimatedTime")
    subtasks_payload = data.get("subtasks") or []
    tag_ids = data.get("tagIds") or []

    if not title:
        abort(400, description="title is required")
    if column not in ['todo', 'in_progress', 'done']:
        abort(400, description="invalid column")

    # validate date format if provided
    if due_date:
        try:
            datetime.strptime(due_date, "%Y-%m-%d")
        except ValueError:
            abort(400, description="invalid dueDate format, expected YYYY-MM-DD")

    # Create new card
    new_card = Card(
        title=title,
        description=description,
        column=column,
        due_date=due_date,
        assignee=assignee,
        estimated_time=estimated_time
    )
    
    db.session.add(new_card)
    db.session.flush()  # Get the ID
    
    # Add subtasks
    for st in subtasks_payload:
        text = (st.get("text") or "").strip()
        if text:
            subtask = Subtask(
                text=text,
                done=bool(st.get("done", False)),
                card_id=new_card.id
            )
            db.session.add(subtask)
    
    # Add tags
    for tag_id in tag_ids:
        tag = Tag.query.get(tag_id)
        if tag:
            new_card.tags.append(tag)
    
    db.session.commit()
    socketio.emit("board_changed", serialize_board())
    return jsonify(new_card.to_dict()), 201


@app.route("/api/cards/<card_id>/move", methods=["POST"])
def move_card(card_id: str):
    data = request.get_json(silent=True) or {}
    to_column = data.get("toColumn")
    position = data.get("position")  # optional index to insert at; default append to end

    if to_column not in ['todo', 'in_progress', 'done']:
        abort(400, description="invalid toColumn")

    card = find_card(card_id)
    if not card:
        abort(404, description="card not found")

    from_column = card.column
    card.column = to_column
    
    # Update position if specified
    if isinstance(position, int):
        card.position = position
    
    db.session.commit()
    socketio.emit("board_changed", serialize_board())
    return jsonify({"card": card.to_dict(), "fromColumn": from_column, "toColumn": to_column, "position": position})


@app.route("/api/cards/<card_id>", methods=["PATCH", "PUT"])
def update_card(card_id: str):
    data = request.get_json(silent=True) or {}
    card = find_card(card_id)
    if not card:
        abort(404, description="card not found")

    if "title" in data:
        title = (data.get("title") or "").strip()
        if not title:
            abort(400, description="title cannot be empty")
        card.title = title

    if "description" in data:
        card.description = (data.get("description") or "").strip()

    if "dueDate" in data:
        due_date = data.get("dueDate") or None
        if due_date:
            try:
                datetime.strptime(due_date, "%Y-%m-%d")
            except ValueError:
                abort(400, description="invalid dueDate format, expected YYYY-MM-DD")
        card.due_date = due_date

    if "assignee" in data:
        assignee = data.get("assignee") or None
        card.assignee = (assignee or None)

    if "estimatedTime" in data:
        estimated_time = data.get("estimatedTime")
        card.estimated_time = estimated_time

    if "tagIds" in data:
        tag_ids = data.get("tagIds") or []
        # Clear existing tags
        card.tags.clear()
        # Add new tags
        for tag_id in tag_ids:
            tag = Tag.query.get(tag_id)
            if tag:
                card.tags.append(tag)

    db.session.commit()
    socketio.emit("board_changed", serialize_board())
    return jsonify(card.to_dict())


@app.route("/api/cards/<card_id>/subtasks", methods=["POST"])
def add_subtask(card_id: str):
    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        abort(400, description="text is required")
    card = find_card(card_id)
    if not card:
        abort(404, description="card not found")
    
    subtask = Subtask(
        text=text,
        done=bool(data.get("done", False)),
        card_id=card_id
    )
    db.session.add(subtask)
    db.session.commit()
    socketio.emit("board_changed", serialize_board())
    return jsonify(subtask.to_dict()), 201


@app.route("/api/cards/<card_id>/subtasks/<sub_id>", methods=["PATCH"])
def update_subtask(card_id: str, sub_id: str):
    data = request.get_json(silent=True) or {}
    card = find_card(card_id)
    if not card:
        abort(404, description="card not found")
    
    subtask = Subtask.query.filter_by(id=sub_id, card_id=card_id).first()
    if not subtask:
        abort(404, description="subtask not found")
    
    if "text" in data:
        text = (data.get("text") or "").strip()
        if not text:
            abort(400, description="text cannot be empty")
        subtask.text = text
    
    if "done" in data:
        subtask.done = bool(data.get("done"))
    
    db.session.commit()
    socketio.emit("board_changed", serialize_board())
    return jsonify(subtask.to_dict())


@app.route("/api/cards/<card_id>/subtasks/<sub_id>", methods=["DELETE"])
def delete_subtask(card_id: str, sub_id: str):
    card = find_card(card_id)
    if not card:
        abort(404, description="card not found")
    
    subtask = Subtask.query.filter_by(id=sub_id, card_id=card_id).first()
    if not subtask:
        abort(404, description="subtask not found")
    
    db.session.delete(subtask)
    db.session.commit()
    socketio.emit("board_changed", serialize_board())
    return ("", 204)

@app.route("/api/cards/<card_id>/archive", methods=["POST"])
def archive_card(card_id: str):
    card = Card.query.get(card_id)
    if not card:
        abort(404, description="card not found")
    
    card.archived = True
    db.session.commit()
    socketio.emit("board_changed", serialize_board())
    return jsonify(card.to_dict())

@app.route("/api/cards/<card_id>/unarchive", methods=["POST"])
def unarchive_card(card_id: str):
    card = Card.query.get(card_id)
    if not card:
        abort(404, description="card not found")
    
    card.archived = False
    db.session.commit()
    socketio.emit("board_changed", serialize_board())
    return jsonify(card.to_dict())

@app.route("/api/archived", methods=["GET"])
def get_archived_cards():
    archived_cards = Card.query.filter_by(archived=True).all()
    return jsonify([card.to_dict() for card in archived_cards])

if __name__ == "__main__":
    # Initialize database with sample data
    init_db()
    # Use a non-debug default host/port to be easy to run locally
    socketio.run(app, host="127.0.0.1", port=5001, debug=True)



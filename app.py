from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
from datetime import datetime
from functools import wraps
import os
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-key-change-in-production')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///minime.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

db = SQLAlchemy(app)

# ============================================================================
# Models
# ============================================================================

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    
    projects = db.relationship('Project', backref='owner', lazy=True, cascade='all, delete-orphan')


class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, default='')
    created_at = db.Column(db.DateTime, default=datetime.utcnow)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)


# ============================================================================
# Auth Helpers
# ============================================================================

def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return redirect(url_for('landing'))
        return f(*args, **kwargs)
    return decorated_function


def get_current_user():
    if 'user_id' in session:
        return User.query.get(session['user_id'])
    return None


# ============================================================================
# Routes: Public
# ============================================================================

@app.route('/')
def landing():
    if 'user_id' in session:
        return redirect(url_for('dashboard'))
    return render_template('landing.html')


@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        name = request.form.get('name', '').strip()
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '').strip()
        
        if not name or not email or not password:
            return render_template('register.html', error='All fields are required'), 400
        
        if User.query.filter_by(email=email).first():
            return render_template('register.html', error='Email already registered'), 400
        
        user = User(
            name=name,
            email=email,
            password_hash=generate_password_hash(password)
        )
        db.session.add(user)
        db.session.commit()
        
        session['user_id'] = user.id
        return redirect(url_for('dashboard'))
    
    return render_template('register.html')


@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        email = request.form.get('email', '').strip()
        password = request.form.get('password', '').strip()
        
        user = User.query.filter_by(email=email).first()
        
        if not user or not check_password_hash(user.password_hash, password):
            return render_template('login.html', error='Invalid email or password'), 401
        
        session['user_id'] = user.id
        return redirect(url_for('dashboard'))
    
    return render_template('login.html')


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('landing'))


# ============================================================================
# Routes: Dashboard & Projects
# ============================================================================

@app.route('/dashboard')
@login_required
def dashboard():
    user = get_current_user()
    projects = Project.query.filter_by(owner_id=user.id).all()
    return render_template('dashboard.html', user=user, projects=projects)


@app.route('/projects/create', methods=['POST'])
@login_required
def create_project():
    user = get_current_user()
    title = request.form.get('title', '').strip()
    
    if not title:
        return redirect(url_for('dashboard'))
    
    project = Project(owner_id=user.id, title=title, content='')
    db.session.add(project)
    db.session.commit()
    
    return redirect(url_for('write_project', project_id=project.id))


@app.route('/projects/<int:project_id>/write')
@login_required
def write_project(project_id):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    
    # Verify ownership
    if project.owner_id != user.id:
        return redirect(url_for('dashboard'))
    
    return render_template('index.html', project=project, user=user)


# ============================================================================
# Routes: API (Autosave & Session Control)
# ============================================================================

@app.route('/api/projects/<int:project_id>/autosave', methods=['POST'])
@login_required
def autosave_project(project_id):
    user = get_current_user()
    project = Project.query.get_or_404(project_id)
    
    # Verify ownership
    if project.owner_id != user.id:
        return jsonify({'error': 'Unauthorized'}), 403
    
    data = request.get_json()
    project.content = data.get('content', '')
    project.title = data.get('title', project.title)
    project.updated_at = datetime.utcnow()
    
    db.session.commit()
    
    return jsonify({
        'success': True,
        'updated_at': project.updated_at.isoformat()
    })


@app.route('/api/session/end', methods=['POST'])
@login_required
def end_session():
    """End a writing session and redirect to dashboard."""
    return jsonify({'success': True, 'redirect': url_for('dashboard')})


# ============================================================================
# Error Handlers
# ============================================================================

@app.errorhandler(404)
def not_found(e):
    return render_template('error.html', error='Page not found'), 404


@app.errorhandler(500)
def server_error(e):
    db.session.rollback()
    return render_template('error.html', error='Server error'), 500


# ============================================================================
# Context Processors
# ============================================================================

@app.context_processor
def inject_user():
    return {'current_user': get_current_user()}


# ============================================================================
# Initialization
# ============================================================================

with app.app_context():
    db.create_all()


if __name__ == '__main__':
    app.run(debug=True)
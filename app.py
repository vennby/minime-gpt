from flask import Flask, render_template, request, redirect, url_for, session, jsonify
from flask_sqlalchemy import SQLAlchemy
from authlib.integrations.flask_client import OAuth
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
oauth = OAuth(app)

# Google OAuth Configuration
google = oauth.register(
    name='google',
    client_id=os.getenv('GOOGLE_CLIENT_ID'),
    client_secret=os.getenv('GOOGLE_CLIENT_SECRET'),
    server_metadata_url='https://accounts.google.com/.well-known/openid-configuration',
    client_kwargs={'scope': 'openid profile email'},
    authorize_url='https://accounts.google.com/o/oauth2/v2/auth',
    authorize_params=None,
    access_token_url='https://www.googleapis.com/oauth2/v4/token',
    access_token_params=None,
    refresh_token_url='https://www.googleapis.com/oauth2/v4/token',
    redirect_to='auth_callback'
)

# ============================================================================
# Models
# ============================================================================

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    google_id = db.Column(db.String(255), unique=True, nullable=True)
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
    return render_template('register.html')


@app.route('/login', methods=['GET'])
def login():
    return render_template('login.html')


@app.route('/auth/google')
def auth_google():
    try:
        # Use localhost consistently for local development
        redirect_uri = os.getenv('REDIRECT_URI', url_for('auth_callback', _external=True, _scheme='http'))
        return google.authorize_redirect(redirect_uri)
    except Exception as e:
        error_msg = 'We couldn\'t start the Google sign-in process. Please try again or contact support if the problem persists.'
        return render_template('error.html', error=error_msg, error_code=500), 500


@app.route('/auth/callback')
def auth_callback():
    try:
        token = google.authorize_access_token()
        if not token:
            error_msg = 'Google authentication didn\'t complete. Please try signing in again.'
            return render_template('error.html', error=error_msg, error_code=401), 401
        
        user_info = token.get('userinfo')
        
        if not user_info:
            error_msg = 'We couldn\'t retrieve your Google profile. Please try signing in again.'
            return render_template('error.html', error=error_msg, error_code=401), 401
        
        email = user_info.get('email')
        name = user_info.get('name')
        google_id = user_info.get('sub')
        
        if not email or not google_id:
            error_msg = 'Your Google account is missing required information. Please try a different Google account.'
            return render_template('error.html', error=error_msg, error_code=400), 400
        
        # Find or create user
        user = User.query.filter_by(email=email).first()
        
        if not user:
            user = User(
                name=name or 'User',
                email=email,
                google_id=google_id
            )
            db.session.add(user)
        else:
            # Update google_id if not set
            if not user.google_id:
                user.google_id = google_id
            user.name = name or user.name  # Update name from Google if provided
        
        db.session.commit()
        session['user_id'] = user.id
        return redirect(url_for('dashboard'))
    
    except Exception as e:
        error_msg = 'An unexpected error occurred during sign-in. Please try again.'
        return render_template('error.html', error=error_msg, error_code=500), 500


@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('landing'))


@app.route('/delete-account', methods=['POST'])
def delete_account():
    """Delete user account and all associated projects"""
    if 'user_id' not in session:
        return redirect(url_for('login'))
    
    try:
        user_id = session['user_id']
        user = User.query.get(user_id)
        
        if not user:
            return render_template('error.html', error='User not found.', error_code=404), 404
        
        # Delete all user projects (cascade delete happens automatically)
        Project.query.filter_by(owner_id=user_id).delete()
        
        # Delete user
        db.session.delete(user)
        db.session.commit()
        
        # Clear session
        session.clear()
        
        return redirect(url_for('landing'))
    
    except Exception as e:
        error_msg = 'An error occurred while deleting your account. Please try again.'
        return render_template('error.html', error=error_msg, error_code=500), 500


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
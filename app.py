from flask import Flask, render_template, request, redirect, url_for, session, jsonify, send_file
from flask_sqlalchemy import SQLAlchemy
from authlib.integrations.flask_client import OAuth
from authlib.integrations.base_client.errors import OAuthError, MismatchingStateError
from datetime import datetime
from functools import wraps
import os
from dotenv import load_dotenv
from io import BytesIO
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch

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
)


def get_oauth_redirect_uri():
    return os.getenv('REDIRECT_URI', url_for('auth_callback', _external=True, _scheme='http'))

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
    share_token = db.Column(db.String(255), unique=True, nullable=True)
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
        user = User.query.get(session.get('user_id'))
        if not user:
            session.clear()
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
        if not os.getenv('GOOGLE_CLIENT_ID') or not os.getenv('GOOGLE_CLIENT_SECRET'):
            error_msg = 'Google sign-in is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to your .env file.'
            return render_template('error.html', error=error_msg, error_code=500), 500
        return google.authorize_redirect(get_oauth_redirect_uri())
    except Exception:
        app.logger.exception('Failed to start Google sign-in')
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
            resp = google.get('https://www.googleapis.com/oauth2/v3/userinfo')
            user_info = resp.json()
        
        if not user_info:
            error_msg = 'We couldn\'t retrieve your Google profile. Please try signing in again.'
            return render_template('error.html', error=error_msg, error_code=401), 401
        
        email = user_info.get('email')
        name = user_info.get('name')
        google_id = user_info.get('sub')
        
        # Validate all required fields
        if not email or not isinstance(email, str) or '@' not in email:
            error_msg = 'Invalid email address from Google. Please try with a different Google account.'
            return render_template('error.html', error=error_msg, error_code=400), 400
        
        if not google_id or not isinstance(google_id, str):
            error_msg = 'Invalid Google ID. Please try signing in again.'
            return render_template('error.html', error=error_msg, error_code=400), 400
        
        # Sanitize name
        if not name:
            name = email.split('@')[0]
        name = str(name)[:100]  # Limit to 100 chars
        
        try:
            # Find or create user
            user = User.query.filter_by(email=email).first()
            
            if not user:
                user = User(
                    name=name,
                    email=email,
                    google_id=google_id
                )
                db.session.add(user)
            else:
                # Update google_id if not set
                if not user.google_id:
                    user.google_id = google_id
                user.name = name  # Update name from Google
            
            db.session.commit()
            
            # Verify user was created and has ID
            if not user or not user.id:
                raise ValueError('Failed to create or retrieve user')
            
            session['user_id'] = user.id
            return redirect(url_for('dashboard'))
        
        except Exception:
            db.session.rollback()
            app.logger.exception('Database error during sign-in')
            error_msg = 'Database error during sign-in. Please try again.'
            return render_template('error.html', error=error_msg, error_code=500), 500
    
    except MismatchingStateError:
        app.logger.exception('OAuth state mismatch during sign-in')
        error_msg = (
            'Your sign-in session expired or was interrupted. '
            'Please try again without opening the login page in multiple tabs.'
        )
        return render_template('error.html', error=error_msg, error_code=400), 400
    except OAuthError as e:
        app.logger.exception('OAuth error during sign-in')
        if e.error == 'invalid_client':
            error_msg = (
                'Google sign-in credentials are invalid. '
                'Update GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env with values from Google Cloud Console.'
            )
        elif e.error == 'redirect_uri_mismatch':
            error_msg = (
                f'Redirect URI mismatch. Add this exact URL to your Google OAuth app: {get_oauth_redirect_uri()}'
            )
        else:
            error_msg = f'Google sign-in failed ({e.error}). Please try again.'
        return render_template('error.html', error=error_msg, error_code=500), 500
    except Exception:
        app.logger.exception('Unexpected error during sign-in')
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
        user_id = session.get('user_id')
        if not user_id:
            session.clear()
            return redirect(url_for('landing'))
        
        user = User.query.get(user_id)
        
        if not user:
            session.clear()
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


@app.route('/update-profile', methods=['POST'])
@login_required
def update_profile():
    """Update user profile information"""
    try:
        data = request.get_json()
        user_id = session['user_id']
        user = User.query.get(user_id)
        
        if not user:
            return {'error': 'User not found.'}, 404
        
        # Update name if provided
        if 'name' in data and data['name'].strip():
            user.name = data['name'].strip()
        
        db.session.commit()
        return {'success': True}, 200
    
    except Exception as e:
        db.session.rollback()
        return {'error': 'An error occurred while updating your profile.'}, 500


# ============================================================================
# Routes: Dashboard & Projects
# ============================================================================

@app.route('/dashboard')
@login_required
def dashboard():
    user = get_current_user()
    projects = Project.query.filter_by(owner_id=user.id).all()
    return render_template('dashboard.html', user=user, projects=projects)


@app.route('/settings')
@login_required
def settings():
    user = get_current_user()
    return render_template('settings.html', user=user)


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


@app.route('/projects/<int:project_id>/view/<share_token>', methods=['GET'])
def view_shared_project(project_id, share_token):
    """View a shared project (read-only)."""
    project = Project.query.get(project_id)
    
    if not project or project.share_token != share_token:
        return render_template('error.html', error='Project not found or invalid token'), 404
    
    return render_template('view-project.html', project=project, can_edit=False)


@app.route('/api/projects/<int:project_id>/share', methods=['POST'])
@login_required
def get_share_link(project_id):
    """Generate or get share link for a project."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    
    project = Project.query.get(project_id)
    
    if not project or project.owner_id != user.id:
        return jsonify({'error': 'Project not found'}), 404
    
    if not project.share_token:
        import secrets
        project.share_token = secrets.token_urlsafe(32)
        db.session.commit()
    
    share_url = f"{request.host_url.rstrip('/')}/projects/{project.id}/view/{project.share_token}"
    return jsonify({'share_url': share_url})


@app.route('/api/projects/<int:project_id>/complete', methods=['POST'])
@login_required
def complete_project(project_id):
    """Complete a project, generate PDF, and delete the project."""
    user = get_current_user()
    if not user:
        return jsonify({'error': 'Unauthorized'}), 401
    
    project = Project.query.get(project_id)
    
    if not project or project.owner_id != user.id:
        return jsonify({'error': 'Project not found'}), 404
    
    try:
        # Create PDF
        pdf_buffer = BytesIO()
        doc = SimpleDocTemplate(pdf_buffer, pagesize=letter)
        story = []
        
        # Get styles
        styles = getSampleStyleSheet()
        title_style = ParagraphStyle(
            'CustomTitle',
            parent=styles['Heading1'],
            fontSize=24,
            textColor='#6366f1',
            spaceAfter=12
        )
        
        # Add title
        story.append(Paragraph(project.title, title_style))
        story.append(Spacer(1, 0.3 * inch))
        
        # Add metadata
        metadata_text = f"<b>Created:</b> {project.created_at.strftime('%B %d, %Y')}"
        story.append(Paragraph(metadata_text, styles['Normal']))
        story.append(Spacer(1, 0.3 * inch))
        
        # Add content - handle line breaks
        content_lines = project.content.split('\n')
        for line in content_lines:
            if line.strip():
                story.append(Paragraph(line, styles['Normal']))
            else:
                story.append(Spacer(1, 0.1 * inch))
        
        # Build PDF
        doc.build(story)
        pdf_buffer.seek(0)
        
        # Delete project from database
        db.session.delete(project)
        db.session.commit()
        
        # Return PDF for download
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"{project.title}.pdf"
        )
    
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Failed to complete project: {str(e)}'}), 500


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
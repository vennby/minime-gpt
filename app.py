from flask import (
    Flask,
    after_this_request,
    flash,
    render_template,
    request,
    redirect,
    url_for,
    session,
    jsonify,
    send_file,
)
from flask_sqlalchemy import SQLAlchemy
from authlib.integrations.flask_client import OAuth
from authlib.integrations.base_client.errors import OAuthError, MismatchingStateError
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path
import json
import os
import secrets
from dotenv import load_dotenv
from io import BytesIO
from reportlab.lib.pagesizes import A4, legal, letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer
from reportlab.lib.units import inch
from reportlab.lib.colors import HexColor
from sqlalchemy import event, text
import truststore

from security import (
    escape_pdf_text,
    get_ai_blocklist_for_client,
    get_csrf_token,
    html_to_plain_text,
    plain_word_count,
    sanitize_html,
    sanitize_title,
    sanitized_markup,
    validate_csrf_token,
)

# Use the OS certificate store so HTTPS works behind antivirus SSL scanning (e.g. Norton).
truststore.inject_into_ssl()

load_dotenv()

PAGE_SIZES = {
    'letter': letter,
    'a4': A4,
    'legal': legal,
}


def utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _resolve_secret_key():
    env_secret = os.getenv('SECRET_KEY')
    if env_secret and env_secret != 'dev-key-change-in-production':
        return env_secret
    if os.getenv('FLASK_ENV') == 'production':
        raise RuntimeError('Set a strong SECRET_KEY in .env before running in production.')
    instance_dir = Path(__file__).resolve().parent / 'instance'
    instance_dir.mkdir(exist_ok=True)
    secret_path = instance_dir / 'secret_key'
    if secret_path.exists():
        stored = secret_path.read_text(encoding='utf-8').strip()
        if stored:
            return stored
    generated = secrets.token_urlsafe(48)
    secret_path.write_text(generated, encoding='utf-8')
    return generated


app = Flask(__name__)
app.config['SECRET_KEY'] = _resolve_secret_key()
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///minime.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['SESSION_COOKIE_SECURE'] = os.getenv('SESSION_COOKIE_SECURE', '0') == '1'
app.config['PREFERRED_URL_SCHEME'] = os.getenv('PREFERRED_URL_SCHEME', 'http')

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
    explicit = os.getenv('REDIRECT_URI')
    if explicit:
        return explicit
    scheme = os.getenv('PREFERRED_URL_SCHEME') or request.scheme or 'http'
    return url_for('auth_callback', _external=True, _scheme=scheme)


# ============================================================================
# Models
# ============================================================================

class User(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False)
    email = db.Column(db.String(100), unique=True, nullable=False)
    google_id = db.Column(db.String(255), unique=True, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)

    projects = db.relationship('Project', backref='owner', lazy=True, cascade='all, delete-orphan')
    devices = db.relationship('UserDevice', backref='owner', lazy=True, cascade='all, delete-orphan')
    pairing_codes = db.relationship(
        'DevicePairingCode', backref='owner', lazy=True, cascade='all, delete-orphan'
    )
    session_locks = db.relationship(
        'WritingSessionLock', backref='owner', lazy=True, cascade='all, delete-orphan'
    )


class UserDevice(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    device_uid = db.Column(db.String(64), nullable=False)
    label = db.Column(db.String(100), nullable=False)
    platform = db.Column(db.String(120), default='')
    consent_lock = db.Column(db.Boolean, default=False, nullable=False)
    registered_at = db.Column(db.DateTime, default=utc_now)
    last_seen = db.Column(db.DateTime, default=utc_now)
    __table_args__ = (db.UniqueConstraint('user_id', 'device_uid', name='uq_user_device'),)


class DevicePairingCode(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    code = db.Column(db.String(8), unique=True, nullable=False, index=True)
    host_device_uid = db.Column(db.String(64), nullable=False)
    expires_at = db.Column(db.DateTime, nullable=False)
    created_at = db.Column(db.DateTime, default=utc_now)


class WritingSessionLock(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    project_id = db.Column(db.Integer, db.ForeignKey('project.id', ondelete='CASCADE'), nullable=False)
    host_device_uid = db.Column(db.String(64), nullable=False)
    locked_device_uids = db.Column(db.Text, nullable=False, default='[]')
    active = db.Column(db.Boolean, default=True, nullable=False)
    started_at = db.Column(db.DateTime, default=utc_now)
    ended_at = db.Column(db.DateTime, nullable=True)


class Project(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    owner_id = db.Column(db.Integer, db.ForeignKey('user.id', ondelete='CASCADE'), nullable=False)
    title = db.Column(db.String(255), nullable=False)
    content = db.Column(db.Text, default='')
    share_token = db.Column(db.String(255), unique=True, nullable=True)
    created_at = db.Column(db.DateTime, default=utc_now)
    updated_at = db.Column(db.DateTime, default=utc_now, onupdate=utc_now)
    session_locks = db.relationship(
        'WritingSessionLock', backref='project', lazy=True, cascade='all, delete-orphan'
    )


# ============================================================================
# Auth Helpers
# ============================================================================

def _wants_json_response():
    if request.path.startswith('/api/'):
        return True
    if request.is_json:
        return True
    best = request.accept_mimetypes.best_match(['application/json', 'text/html'])
    return best == 'application/json' and (
        request.accept_mimetypes[best] > request.accept_mimetypes['text/html']
    )


def login_required(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            if _wants_json_response():
                return jsonify({'error': 'Unauthorized'}), 401
            return redirect(url_for('landing'))
        user = db.session.get(User, session.get('user_id'))
        if not user:
            session.clear()
            if _wants_json_response():
                return jsonify({'error': 'Unauthorized'}), 401
            return redirect(url_for('landing'))
        return f(*args, **kwargs)
    return decorated_function


def get_current_user():
    if 'user_id' in session:
        return db.session.get(User, session['user_id'])
    return None


def _device_uid_from_request():
    return (
        request.headers.get('X-Minime-Device-Id')
        or (request.get_json(silent=True) or {}).get('device_uid')
        or request.args.get('device_uid')
    )


def _parse_device_uids(raw):
    try:
        uids = json.loads(raw or '[]')
        return [u for u in uids if isinstance(u, str) and u.strip()]
    except (TypeError, json.JSONDecodeError):
        return []


def _end_active_writing_sessions(user_id):
    active = WritingSessionLock.query.filter_by(user_id=user_id, active=True).all()
    now = utc_now()
    for lock in active:
        lock.active = False
        lock.ended_at = now


def _get_active_lock_for_user(user_id):
    return WritingSessionLock.query.filter_by(user_id=user_id, active=True).first()


def _device_belongs_to_user(user_id, device_uid):
    if not device_uid:
        return False
    return UserDevice.query.filter_by(user_id=user_id, device_uid=device_uid).first() is not None


def _pairing_is_valid(pairing):
    return pairing is not None and pairing.expires_at >= utc_now()


def csrf_protect(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        token = request.form.get('csrf_token') or request.headers.get('X-CSRF-Token')
        if not validate_csrf_token(token):
            if request.is_json or request.path.startswith('/api/'):
                return jsonify({'error': 'Invalid or missing CSRF token'}), 403
            return render_template('error.html', error='Invalid or expired form submission. Please try again.', error_code=403), 403
        return f(*args, **kwargs)
    return decorated_function


@app.after_request
def set_security_headers(response):
    csp = (
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
        "font-src 'self' https://fonts.gstatic.com; "
        "img-src 'self' data:; "
        "connect-src 'self'; "
        "frame-src 'none'; "
        "frame-ancestors 'none'; "
        "object-src 'none'; "
        "base-uri 'self'; "
        "form-action 'self'"
    )
    response.headers['Content-Security-Policy'] = csp
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    permissions = [
        'camera=()',
        'microphone=()',
        'geolocation=()',
        'payment=()',
        'usb=()',
    ]
    # Writer page: fully disable clipboard APIs (no Allow prompt can enable them here).
    if request.endpoint == 'write_project':
        permissions.extend([
            'clipboard-read=()',
            'clipboard-write=()',
        ])
    response.headers['Permissions-Policy'] = ', '.join(permissions)
    return response


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
    # Google OAuth is the only signup path; POST redirects the same as GET.
    return redirect(url_for('auth_google'))


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

        if user_info.get('email_verified') is False:
            error_msg = 'Your Google email is not verified. Verify it with Google, then try again.'
            return render_template('error.html', error=error_msg, error_code=400), 400

        email = user_info.get('email')
        name = user_info.get('name')
        google_id = user_info.get('sub')

        if not email or not isinstance(email, str) or '@' not in email:
            error_msg = 'Invalid email address from Google. Please try with a different Google account.'
            return render_template('error.html', error=error_msg, error_code=400), 400

        if not google_id or not isinstance(google_id, str):
            error_msg = 'Invalid Google ID. Please try signing in again.'
            return render_template('error.html', error=error_msg, error_code=400), 400

        if not name:
            name = email.split('@')[0]
        name = str(name)[:100]

        try:
            user = User.query.filter_by(google_id=google_id).first()
            if not user:
                by_email = User.query.filter_by(email=email).first()
                if by_email:
                    if by_email.google_id and by_email.google_id != google_id:
                        error_msg = (
                            'This email is already linked to a different Google account. '
                            'Sign in with the original account.'
                        )
                        return render_template('error.html', error=error_msg, error_code=403), 403
                    user = by_email
                    user.google_id = google_id
                else:
                    user = User(name=name, email=email, google_id=google_id)
                    db.session.add(user)
            else:
                if user.email != email:
                    # Keep email in sync when Google reports a change for the same sub.
                    conflict = User.query.filter(User.email == email, User.id != user.id).first()
                    if conflict:
                        error_msg = 'Email conflict while updating your account. Contact support.'
                        return render_template('error.html', error=error_msg, error_code=409), 409
                    user.email = email
                user.name = name

            db.session.commit()

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


@app.route('/logout', methods=['POST'])
@csrf_protect
def logout():
    session.clear()
    flash('Signed out.', 'success')
    return redirect(url_for('landing'))


@app.route('/delete-account', methods=['POST'])
@login_required
@csrf_protect
def delete_account():
    """Delete user account and all associated data."""
    try:
        user_id = session.get('user_id')
        if not user_id:
            session.clear()
            return redirect(url_for('landing'))

        user = db.session.get(User, user_id)
        if not user:
            session.clear()
            return render_template('error.html', error='User not found.', error_code=404), 404

        WritingSessionLock.query.filter_by(user_id=user_id).delete(synchronize_session=False)
        DevicePairingCode.query.filter_by(user_id=user_id).delete(synchronize_session=False)
        UserDevice.query.filter_by(user_id=user_id).delete(synchronize_session=False)
        Project.query.filter_by(owner_id=user_id).delete(synchronize_session=False)
        db.session.delete(user)
        db.session.commit()
        session.clear()
        flash('Your account has been deleted.', 'success')
        return redirect(url_for('landing'))

    except Exception:
        db.session.rollback()
        error_msg = 'An error occurred while deleting your account. Please try again.'
        return render_template('error.html', error=error_msg, error_code=500), 500


@app.route('/update-profile', methods=['POST'])
@login_required
@csrf_protect
def update_profile():
    """Update user profile information"""
    try:
        data = request.get_json(silent=True) or {}
        user_id = session['user_id']
        user = db.session.get(User, user_id)

        if not user:
            return jsonify({'error': 'User not found.'}), 404

        if 'name' in data and data['name'].strip():
            user.name = sanitize_title(data['name'], max_length=100)

        db.session.commit()
        return jsonify({'success': True}), 200

    except Exception:
        db.session.rollback()
        return jsonify({'error': 'An error occurred while updating your profile.'}), 500


# ============================================================================
# Routes: Dashboard & Projects
# ============================================================================

@app.route('/dashboard')
@login_required
def dashboard():
    user = get_current_user()
    if request.args.get('clipboard_blocked') == '1':
        flash(
            'Writing was blocked because clipboard access is allowed in this browser. '
            'Deny clipboard permission for this site (or reset site permissions), then open the project again.',
            'error',
        )
    projects = Project.query.filter_by(owner_id=user.id).order_by(Project.updated_at.desc()).all()
    project_cards = [
        {
            'project': project,
            'word_count': plain_word_count(project.content),
        }
        for project in projects
    ]
    return render_template('dashboard.html', user=user, project_cards=project_cards)


@app.route('/settings')
@login_required
def settings():
    user = get_current_user()
    sessions = (
        WritingSessionLock.query.filter_by(user_id=user.id)
        .order_by(WritingSessionLock.started_at.desc())
        .limit(50)
        .all()
    )
    session_rows = []
    for lock in sessions:
        project = db.session.get(Project, lock.project_id)
        session_rows.append({
            'id': lock.id,
            'project_title': project.title if project else '(deleted project)',
            'started_at': lock.started_at,
            'ended_at': lock.ended_at,
            'active': lock.active,
            'device_count': len(_parse_device_uids(lock.locked_device_uids)),
        })
    return render_template('settings.html', user=user, session_rows=session_rows)


@app.route('/projects/create', methods=['POST'])
@login_required
@csrf_protect
def create_project():
    user = get_current_user()
    title = sanitize_title(request.form.get('title', ''), max_length=255)

    if not title:
        flash('Enter a project title.', 'error')
        return redirect(url_for('dashboard'))

    project = Project(owner_id=user.id, title=title, content='')
    db.session.add(project)
    db.session.commit()
    flash('Project created.', 'success')
    return redirect(url_for('write_project', project_id=project.id))


@app.route('/projects/<int:project_id>/delete', methods=['POST'])
@login_required
@csrf_protect
def delete_project(project_id):
    user = get_current_user()
    project = db.session.get(Project, project_id)
    if not project or project.owner_id != user.id:
        flash('Project not found.', 'error')
        return redirect(url_for('dashboard'))

    WritingSessionLock.query.filter_by(project_id=project.id).delete(synchronize_session=False)
    db.session.delete(project)
    db.session.commit()
    flash('Project deleted.', 'success')
    return redirect(url_for('dashboard'))


@app.route('/projects/<int:project_id>/write')
@login_required
def write_project(project_id):
    user = get_current_user()
    project = db.session.get(Project, project_id)
    if not project:
        return render_template('error.html', error='Project not found'), 404

    if project.owner_id != user.id:
        return redirect(url_for('dashboard'))

    safe_content = sanitized_markup(project.content)
    return render_template(
        'index.html',
        project=project,
        user=user,
        safe_content=safe_content,
        sanitized_content=sanitize_html(project.content),
        ai_blocklist=get_ai_blocklist_for_client(),
    )


# ============================================================================
# Routes: API (Autosave & Session Control)
# ============================================================================

@app.route('/api/projects/<int:project_id>/autosave', methods=['POST'])
@login_required
@csrf_protect
def autosave_project(project_id):
    user = get_current_user()
    project = db.session.get(Project, project_id)
    if not project:
        return jsonify({'error': 'Not found'}), 404

    if project.owner_id != user.id:
        return jsonify({'error': 'Unauthorized'}), 403

    data = request.get_json(silent=True) or {}
    project.content = sanitize_html(data.get('content', ''))
    project.title = sanitize_title(data.get('title', project.title), max_length=255) or project.title
    project.updated_at = utc_now()

    db.session.commit()

    return jsonify({
        'success': True,
        'updated_at': project.updated_at.isoformat()
    })


# ============================================================================
# Routes: Multi-device lock coordination
# ============================================================================

@app.route('/api/devices/register', methods=['POST'])
@login_required
@csrf_protect
def register_device():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    device_uid = (data.get('device_uid') or '').strip()
    if not device_uid or len(device_uid) > 64:
        return jsonify({'error': 'Invalid device id'}), 400

    label = sanitize_title(data.get('label') or 'Unknown device', max_length=100) or 'Unknown device'
    platform = sanitize_title(data.get('platform') or '', max_length=120)

    device = UserDevice.query.filter_by(user_id=user.id, device_uid=device_uid).first()
    if not device:
        device = UserDevice(user_id=user.id, device_uid=device_uid, label=label, platform=platform)
        db.session.add(device)
    else:
        device.label = label
        device.platform = platform
    device.last_seen = utc_now()
    if 'consent_lock' in data:
        device.consent_lock = bool(data.get('consent_lock'))
    db.session.commit()
    return jsonify({'success': True, 'device': {'device_uid': device.device_uid, 'label': device.label, 'consent_lock': device.consent_lock}})


@app.route('/api/devices', methods=['GET'])
@login_required
def list_devices():
    user = get_current_user()
    current_uid = _device_uid_from_request()
    devices = UserDevice.query.filter_by(user_id=user.id).order_by(UserDevice.last_seen.desc()).all()
    return jsonify({
        'devices': [{
            'device_uid': d.device_uid,
            'label': d.label,
            'platform': d.platform,
            'consent_lock': d.consent_lock,
            'last_seen': d.last_seen.isoformat() if d.last_seen else None,
            'is_current': d.device_uid == current_uid,
        } for d in devices],
    })


@app.route('/api/devices/pairing-code', methods=['POST'])
@login_required
@csrf_protect
def create_pairing_code():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    host_device_uid = (data.get('device_uid') or '').strip()
    if not host_device_uid:
        return jsonify({'error': 'Missing device id'}), 400

    DevicePairingCode.query.filter(
        DevicePairingCode.user_id == user.id,
        DevicePairingCode.expires_at < utc_now(),
    ).delete(synchronize_session=False)

    code = secrets.token_hex(3).upper()
    while DevicePairingCode.query.filter_by(code=code).first():
        code = secrets.token_hex(3).upper()

    pairing = DevicePairingCode(
        user_id=user.id,
        code=code,
        host_device_uid=host_device_uid,
        expires_at=utc_now() + timedelta(minutes=10),
    )
    db.session.add(pairing)
    db.session.commit()

    scheme = os.getenv('PREFERRED_URL_SCHEME') or request.scheme or 'http'
    link = url_for('link_device_page', code=code, _external=True, _scheme=scheme)
    return jsonify({
        'code': code,
        'link': link,
        'expires_in': 600,
    })


@app.route('/api/devices/pairing-code/<code>', methods=['GET'])
@login_required
def pairing_code_status(code):
    user = get_current_user()
    pairing = DevicePairingCode.query.filter_by(code=code.upper(), user_id=user.id).first()
    if not _pairing_is_valid(pairing):
        return jsonify({'valid': False, 'devices': []})

    devices = UserDevice.query.filter_by(user_id=user.id, consent_lock=True).order_by(
        UserDevice.last_seen.desc()
    ).all()
    return jsonify({
        'valid': True,
        'expires_at': pairing.expires_at.isoformat(),
        'devices': [{
            'device_uid': d.device_uid,
            'label': d.label,
            'platform': d.platform,
            'consent_lock': d.consent_lock,
            'is_current': d.device_uid == pairing.host_device_uid,
        } for d in devices],
    })


@app.route('/devices/link/<code>', methods=['GET'])
def link_device_page(code):
    """Public pairing page — valid code is enough; login optional."""
    pairing = DevicePairingCode.query.filter_by(code=code.upper()).first()
    if not _pairing_is_valid(pairing):
        return render_template('error.html', error='This link code is invalid or has expired.', error_code=400), 400

    current = get_current_user()
    if current and current.id != pairing.user_id:
        return render_template(
            'error.html',
            error='You are signed in as a different account. Sign out, then open this link again.',
            error_code=403,
        ), 403

    return render_template('link-device.html', code=code.upper(), requires_login=current is None)


@app.route('/api/devices/link', methods=['POST'])
@csrf_protect
def link_device():
    """Link a device using a pairing code (works without prior login)."""
    data = request.get_json(silent=True) or {}
    code = (data.get('code') or '').strip().upper()
    device_uid = (data.get('device_uid') or '').strip()
    consent = bool(data.get('consent_lock'))

    if not code or not device_uid:
        return jsonify({'error': 'Missing code or device id'}), 400
    if not consent:
        return jsonify({'error': 'Consent is required to link this device for session locks'}), 400

    pairing = DevicePairingCode.query.filter_by(code=code).first()
    if not _pairing_is_valid(pairing):
        return jsonify({'error': 'Invalid or expired link code'}), 400

    current = get_current_user()
    if current and current.id != pairing.user_id:
        return jsonify({'error': 'Signed in as a different account'}), 403

    label = sanitize_title(data.get('label') or 'Linked device', max_length=100) or 'Linked device'
    platform = sanitize_title(data.get('platform') or '', max_length=120)

    device = UserDevice.query.filter_by(user_id=pairing.user_id, device_uid=device_uid).first()
    if not device:
        device = UserDevice(
            user_id=pairing.user_id,
            device_uid=device_uid,
            label=label,
            platform=platform,
        )
        db.session.add(device)
    device.label = label
    device.platform = platform
    device.consent_lock = True
    device.last_seen = utc_now()
    db.session.commit()

    return jsonify({'success': True, 'device': {'device_uid': device.device_uid, 'label': device.label}})


@app.route('/api/devices/<device_uid>', methods=['DELETE'])
@login_required
@csrf_protect
def unlink_device(device_uid):
    user = get_current_user()
    device = UserDevice.query.filter_by(user_id=user.id, device_uid=device_uid).first()
    if not device:
        return jsonify({'error': 'Device not found'}), 404
    db.session.delete(device)
    db.session.commit()
    return jsonify({'success': True})


@app.route('/api/session/start', methods=['POST'])
@login_required
@csrf_protect
def start_writing_session_lock():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    project_id = data.get('project_id')
    host_device_uid = (data.get('host_device_uid') or '').strip()
    device_uids = data.get('device_uids') or []

    if not isinstance(device_uids, list) or not host_device_uid:
        return jsonify({'error': 'Invalid session payload'}), 400

    project = db.session.get(Project, project_id)
    if not project or project.owner_id != user.id:
        return jsonify({'error': 'Project not found'}), 404

    selected = []
    for uid in device_uids:
        if not isinstance(uid, str):
            continue
        uid = uid.strip()
        if not uid:
            continue
        device = UserDevice.query.filter_by(user_id=user.id, device_uid=uid, consent_lock=True).first()
        if device:
            selected.append(uid)

    if host_device_uid not in selected:
        host = UserDevice.query.filter_by(
            user_id=user.id, device_uid=host_device_uid, consent_lock=True
        ).first()
        if host:
            selected.insert(0, host_device_uid)

    if not selected:
        return jsonify({'error': 'Select at least one device with lock consent'}), 400

    _end_active_writing_sessions(user.id)
    lock = WritingSessionLock(
        user_id=user.id,
        project_id=project.id,
        host_device_uid=host_device_uid,
        locked_device_uids=json.dumps(selected),
        active=True,
    )
    db.session.add(lock)
    db.session.commit()

    return jsonify({
        'success': True,
        'session_id': lock.id,
        'locked_devices': selected,
        'project_title': project.title,
    })


@app.route('/api/session/lock-status', methods=['GET'])
@login_required
def session_lock_status():
    user = get_current_user()
    device_uid = _device_uid_from_request()
    if not device_uid:
        return jsonify({'active': False})

    lock = _get_active_lock_for_user(user.id)
    if not lock:
        return jsonify({'active': False})

    locked_uids = _parse_device_uids(lock.locked_device_uids)
    if device_uid not in locked_uids:
        return jsonify({'active': False})

    project = db.session.get(Project, lock.project_id)
    return jsonify({
        'active': True,
        'role': 'host' if device_uid == lock.host_device_uid else 'companion',
        'project_id': lock.project_id,
        'project_title': project.title if project else 'Writing session',
        'host_device_uid': lock.host_device_uid,
        'started_at': lock.started_at.isoformat() if lock.started_at else None,
        'best_effort': True,
        'notice': (
            'Companion lock is browser best-effort only. Other apps and browsers are not controlled.'
        ),
    })


@app.route('/api/session/stop', methods=['POST'])
@login_required
@csrf_protect
def stop_writing_session_lock():
    user = get_current_user()
    data = request.get_json(silent=True) or {}
    device_uid = (data.get('device_uid') or '').strip()
    lock = _get_active_lock_for_user(user.id)
    if not lock:
        return jsonify({'success': True})

    if not device_uid or device_uid != lock.host_device_uid:
        return jsonify({'error': 'Only the host device can end the session lock'}), 403

    lock.active = False
    lock.ended_at = utc_now()
    db.session.commit()
    return jsonify({'success': True})


@app.route('/projects/<int:project_id>/view/<share_token>', methods=['GET'])
def view_shared_project(project_id, share_token):
    """View a shared project (read-only)."""
    project = db.session.get(Project, project_id)

    if not project or project.share_token != share_token:
        return render_template('error.html', error='Project not found or invalid token'), 404

    plain_content = html_to_plain_text(project.content)
    return render_template('view-project.html', project=project, plain_content=plain_content, can_edit=False)


@app.route('/api/projects/<int:project_id>/share', methods=['POST'])
@login_required
@csrf_protect
def get_share_link(project_id):
    """Generate or rotate share link for a project."""
    user = get_current_user()
    project = db.session.get(Project, project_id)

    if not project or project.owner_id != user.id:
        return jsonify({'error': 'Project not found'}), 404

    data = request.get_json(silent=True) or {}
    rotate = bool(data.get('rotate'))
    if rotate or not project.share_token:
        project.share_token = secrets.token_urlsafe(32)
        db.session.commit()

    share_url = url_for(
        'view_shared_project',
        project_id=project.id,
        share_token=project.share_token,
        _external=True,
        _scheme=os.getenv('PREFERRED_URL_SCHEME') or request.scheme or 'http',
    )
    return jsonify({'share_url': share_url, 'share_token': project.share_token})


@app.route('/api/projects/<int:project_id>/share', methods=['DELETE'])
@login_required
@csrf_protect
def revoke_share_link(project_id):
    user = get_current_user()
    project = db.session.get(Project, project_id)
    if not project or project.owner_id != user.id:
        return jsonify({'error': 'Project not found'}), 404
    project.share_token = None
    db.session.commit()
    return jsonify({'success': True})


def _build_project_pdf(project, page_size_name='letter'):
    page_size = PAGE_SIZES.get((page_size_name or 'letter').lower(), letter)
    pdf_buffer = BytesIO()
    doc = SimpleDocTemplate(pdf_buffer, pagesize=page_size)
    story = []

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=22,
        textColor=HexColor('#1a1a1a'),
        spaceAfter=12,
    )
    body_style = ParagraphStyle(
        'BodyTextCustom',
        parent=styles['Normal'],
        fontSize=11,
        leading=16,
        textColor=HexColor('#222222'),
        spaceAfter=6,
    )

    story.append(Paragraph(escape_pdf_text(project.title), title_style))
    story.append(Spacer(1, 0.2 * inch))

    metadata_text = (
        f"<b>Created:</b> {escape_pdf_text(project.created_at.strftime('%B %d, %Y'))} "
        f"&nbsp;|&nbsp; <b>Format:</b> {escape_pdf_text(page_size_name.upper())}"
    )
    story.append(Paragraph(metadata_text, styles['Normal']))
    story.append(Spacer(1, 0.25 * inch))

    plain_content = html_to_plain_text(project.content)
    for line in plain_content.split('\n'):
        if line.strip():
            story.append(Paragraph(escape_pdf_text(line), body_style))
        else:
            story.append(Spacer(1, 0.12 * inch))

    doc.build(story)
    pdf_buffer.seek(0)
    return pdf_buffer


@app.route('/api/projects/<int:project_id>/complete', methods=['POST'])
@login_required
@csrf_protect
def complete_project(project_id):
    """Complete a project: build PDF first, then delete only after a successful response is queued."""
    user = get_current_user()
    project = db.session.get(Project, project_id)

    if not project or project.owner_id != user.id:
        return jsonify({'error': 'Project not found'}), 404

    data = request.get_json(silent=True) or {}
    page_size_name = (data.get('page_size') or 'letter').lower()
    if page_size_name not in PAGE_SIZES:
        return jsonify({'error': 'Invalid page size. Use letter, a4, or legal.'}), 400

    _end_active_writing_sessions(user.id)

    try:
        title = project.title
        pdf_buffer = _build_project_pdf(project, page_size_name)
        project_id_to_delete = project.id

        @after_this_request
        def _delete_after_send(response):
            if 200 <= response.status_code < 300:
                try:
                    WritingSessionLock.query.filter_by(project_id=project_id_to_delete).delete(
                        synchronize_session=False
                    )
                    proj = db.session.get(Project, project_id_to_delete)
                    if proj:
                        db.session.delete(proj)
                        db.session.commit()
                except Exception:
                    db.session.rollback()
                    app.logger.exception('Failed to delete project after PDF send')
            return response

        db.session.commit()  # persist ended sessions before streaming PDF
        return send_file(
            pdf_buffer,
            mimetype='application/pdf',
            as_attachment=True,
            download_name=f"{sanitize_title(title, max_length=100) or 'project'}.pdf",
        )

    except Exception:
        db.session.rollback()
        app.logger.exception('Failed to complete project')
        return jsonify({'error': 'Failed to complete project'}), 500


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
    return {
        'current_user': get_current_user(),
        'csrf_token': get_csrf_token(),
    }


# ============================================================================
# Initialization
# ============================================================================

def _enable_sqlite_foreign_keys():
    if db.engine.dialect.name != 'sqlite':
        return

    @event.listens_for(db.engine, 'connect')
    def _set_sqlite_pragma(dbapi_connection, connection_record):
        cursor = dbapi_connection.cursor()
        cursor.execute('PRAGMA foreign_keys=ON')
        cursor.close()


with app.app_context():
    _enable_sqlite_foreign_keys()
    db.create_all()
    # Lightweight migration: ensure expected columns exist on older SQLite files.
    try:
        cols = {row[1] for row in db.session.execute(text('PRAGMA table_info(project)')).fetchall()}
        if 'share_token' not in cols:
            db.session.execute(text('ALTER TABLE project ADD COLUMN share_token VARCHAR(255)'))
            db.session.commit()
    except Exception:
        db.session.rollback()
        app.logger.exception('Schema ensure step failed')


if __name__ == '__main__':
    debug = os.getenv('FLASK_DEBUG', '0') == '1'
    app.run(debug=debug)
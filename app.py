import os
from datetime import datetime
from functools import wraps

from flask import (
    Flask, render_template, request, redirect, url_for,
    flash, jsonify, Response, session, abort
)
from flask_sqlalchemy import SQLAlchemy
from dotenv import load_dotenv

load_dotenv()
db = SQLAlchemy()


# ----------------------------
# Models
# ----------------------------
class Lead(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(120), nullable=False)
    email = db.Column(db.String(200), nullable=False)
    phone = db.Column(db.String(50))
    message = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)


# ----------------------------
# App Factory
# ----------------------------
def create_app():
    app = Flask(__name__, static_folder="static", template_folder="templates")

    # === Instance path configurável (genérico p/ servidor) ===
    configured_instance = (os.getenv("INSTANCE_PATH") or "").strip()
    if configured_instance:
        os.makedirs(configured_instance, exist_ok=True)
        app.instance_path = configured_instance  # substitui o default

    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "dev-secret")

    # === Monta DATABASE_URL robusto ===
    # Prioridade: DATABASE_URL -> sqlite instance default
    os.makedirs(app.instance_path, exist_ok=True)
    env_db = (os.getenv("DATABASE_URL") or "").strip()

    if env_db:
        if env_db.startswith("sqlite:///"):
            # Trata relativo: sqlite:///relative/path.db
            raw = env_db.replace("sqlite:///", "", 1)
            if not os.path.isabs(raw):
                raw = os.path.join(app.root_path, raw)
            os.makedirs(os.path.dirname(raw), exist_ok=True)
            db_url = f"sqlite:///{raw}"
        else:
            # Postgres, SQL Server, etc.
            db_url = env_db
    else:
        # Default: SQLite seguro em instance/
        raw = os.path.join(app.instance_path, "leads.db")
        os.makedirs(os.path.dirname(raw), exist_ok=True)
        db_url = f"sqlite:///{raw}"

    app.config["SQLALCHEMY_DATABASE_URI"] = db_url
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # PIN admin (easter-egg) + Basic Auth fallback
    app.config["ADMIN_PIN"] = os.getenv("ADMIN_PIN", "2468")
    app.config["BASIC_AUTH_USER"] = os.getenv("BASIC_AUTH_USER", "admin")
    app.config["BASIC_AUTH_PASS"] = os.getenv("BASIC_AUTH_PASS", "changeme")

    db.init_app(app)
    with app.app_context():
        db.create_all()

    # ----------------- helpers -----------------
    def _basic_auth_ok():
        auth = request.authorization
        return bool(
            auth
            and auth.username == app.config["BASIC_AUTH_USER"]
            and auth.password == app.config["BASIC_AUTH_PASS"]
        )

    def _is_admin():
        # válido se sessão liberada pelo PIN OU Basic Auth OK
        return session.get("admin_ok") is True or _basic_auth_ok()

    def admin_required(f):
        @wraps(f)
        def _w(*a, **k):
            if not _is_admin():
                return Response("Authentication required", 401, {
                    "WWW-Authenticate": 'Basic realm="Leads"'
                })
            return f(*a, **k)
        return _w

    def _home_context():
        """Contexto base para renderizar a home (reutilizado por / e /contato)."""
        services = [
            {"icon": "code",       "title": "Aplicações Web",          "desc": "Back-end sólido (Flask) com front limpo e acessível."},
            {"icon": "smartphone", "title": "Apps Mobile (Flutter)",    "desc": "Android/iOS com foco em performance e UX."},
            {"icon": "plug",       "title": "Integrações de APIs",      "desc": "REST, autenticação, ETL, automações e WebSockets."},
            {"icon": "database",   "title": "Dados & SQL",             "desc": "Modelagem, views complexas e pipelines confiáveis."},
        ]
        projects = [
            {"title": "Agiliza (Logística)", "stack": "Flask • SQL Server • Flutter Web",
             "desc": "Gestão de volumes, CMO, dashboards e integrações LN.",
             "tags": ["Flask", "SQL", "WebSockets"], "link": "#"},
            {"title": "SAF (Avaliação RH)", "stack": "Flask • SQL Server • APScheduler",
             "desc": "Módulo de avaliação 45/90 dias, lembretes e PDFs.",
             "tags": ["HR", "PDF", "Email"], "link": "#"},
            {"title": "Portal de Avisos", "stack": "Flask • Bootstrap • YouTube API",
             "desc": "TV corporativa com sobreposições dinâmicas e agendamento.",
             "tags": ["Frontend", "Automação"], "link": "#"},
        ]
        return {"services": services, "projects": projects}

    # ----------------- headers básicos -----------------
    @app.after_request
    def _security_headers(resp):
        resp.headers.setdefault("X-Content-Type-Options", "nosniff")
        resp.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
        resp.headers.setdefault("X-XSS-Protection", "1; mode=block")
        return resp

    # ----------------- rotas públicas -----------------
    @app.get("/")
    def index():
        ctx = _home_context()
        return render_template("index.html", **ctx)

    @app.get('/politica-privacidade')
    def privacy():
        return render_template('privacy.html')

    @app.route("/contato", methods=["GET", "POST"])
    def contato():
        ctx = _home_context()

        if request.method == "GET":
            # Renderiza a mesma home e pede para descer para a seção contatos
            return render_template("index.html", scroll_to="contatos", **ctx)

        # ====== POST (envio do formulário) ======
        name  = (request.form.get("name") or "").strip()
        email = (request.form.get("email") or "").strip()
        phone = (request.form.get("phone") or "").strip()
        msg   = (request.form.get("message") or "").strip()
        hp    = (request.form.get("website") or "").strip()  # honeypot

        if hp:
            return redirect(url_for("index"))

        if not name or not email or not msg:
            flash("Por favor, preencha nome, e-mail e mensagem.", "error")
            return redirect(url_for("contato"))

        lead = Lead(name=name, email=email, phone=phone, message=msg)
        db.session.add(lead)
        db.session.commit()

        flash("Recebi sua mensagem! Em breve entro em contato.", "success")
        return redirect(url_for("contato"))

    # ----------------- portal admin (protegido) -----------------
    @app.post("/admin/door")
    def admin_door():
        """Recebe PIN e libera sessão admin (usado por botão/atalho invisível)."""
        payload = request.get_json(silent=True) or {}
        pin = (payload.get("pin") or "").strip()
        if pin and pin == app.config["ADMIN_PIN"]:
            session["admin_ok"] = True
            return jsonify({"ok": True})
        return jsonify({"ok": False}), 401

    @app.get("/admin/logout")
    def admin_logout():
        session.pop("admin_ok", None)
        resp = redirect(url_for("index"))
        resp.headers["Cache-Control"] = "no-store"
        return resp

    @app.get("/admin/leads")
    @admin_required
    def admin_leads():
        leads = Lead.query.order_by(Lead.created_at.desc()).all()
        # marca para desabilitar analytics nessa página administrativa
        return render_template("admin_leads.html", leads=leads, disable_analytics=True)

    @app.post("/admin/leads/<int:lead_id>/delete")
    @admin_required
    def admin_leads_delete(lead_id):
        lead = db.session.get(Lead, lead_id)
        if not lead:
            abort(404)
        db.session.delete(lead)
        db.session.commit()
        flash("Lead excluído.", "success")
        return redirect(url_for("admin_leads"))

    @app.get("/admin/leads.csv")
    @admin_required
    def admin_leads_csv():
        def _stream():
            yield "id,criado_em,nome,email,telefone,mensagem\n"
            q = Lead.query.order_by(Lead.created_at.desc())
            for l in q.yield_per(500):
                row = [
                    l.id,
                    (l.created_at or datetime.utcnow()).isoformat(),
                    l.name or "",
                    l.email or "",
                    l.phone or "",
                    (l.message or "").replace("\n", " ").strip(),
                ]
                out = [f"\"{str(x).replace('\"','\"\"')}\"" for x in row]
                yield ",".join(out) + "\n"

        return Response(
            _stream(),
            mimetype="text/csv",
            headers={"Content-Disposition": "attachment; filename=leads.csv"},
        )

    @app.get("/health")
    def health():
        return jsonify({"status": "ok"}), 200

    return app


# ----------------------------
# Entrypoint (somente dev)
# ----------------------------
if __name__ == "__main__":
    app = create_app()
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "5000"))
    app.run(host=host, port=port, debug=True)

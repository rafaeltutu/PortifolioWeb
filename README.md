# Portfólio Flask (Dark, vídeo herói, SQLite leads)

## Como rodar
```bash
python -m venv .venv
. .venv/Scripts/activate  # Windows
pip install -r requirements.txt

# copiar .env.example -> .env e ajustar (SECRET_KEY e credenciais admin)
python app.py
```

Acesse: http://127.0.0.1:5000

Admin (leads): http://127.0.0.1:5000/admin/leads (Basic Auth via .env)

## Vídeo da cidade
Coloque um arquivo MP4 em: `static/videos/hero.mp4` (ideal 10–20s, 1920x1080).  
O vídeo é exibido com *parallax* simulando subida para o topo da cidade.

## Produção
```bash
set FLASK_ENV=production
set HOST=0.0.0.0
set PORT=8000
waitress-serve --port=%PORT% app:create_app
```
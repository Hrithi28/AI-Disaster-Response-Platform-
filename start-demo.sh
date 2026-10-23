
#!/usr/bin/env bash
# One-command demo: AI engine (:8000) + state-HQ cloud node (:4200) + control-room edge node (:4000)
set -e
cd "$(dirname "$0")"
# Installs only what is missing, so later runs work with NO internet.
if ! python3 -c "import fastapi, uvicorn, sklearn, pandas, joblib" 2>/dev/null; then
  echo "▶ Installing AI/ML engine dependencies (needs internet the first time)…"
  python3 -m pip install -q -r ml-service/requirements.txt
  python3 -m pip install -q -r ml-service/requirements-nlp.txt || echo "  (spaCy optional – skipped)"
fi
if [ ! -d backend/node_modules/@electric-sql/pglite ] || [ ! -d backend/node_modules/sts-whisper-base ]; then
  echo "▶ Installing API dependencies incl. offline database + voice model (needs internet once)…"
  (cd backend && npm install --no-audit --no-fund)
fi
if [ ! -f frontend/dist/index.html ]; then
  echo "▶ Building web app…"
  (cd frontend && npm install --no-audit --no-fund && npm run build)
fi
echo "▶ Starting AI/ML engine on :8000"
(cd ml-service && python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 > ../ml.log 2>&1 &)
echo "▶ Starting state-HQ cloud node on :4200 (receives sync)"
(cd backend && npm run cloud > ../cloud.log 2>&1 &)
sleep 6
echo "▶ Starting control-room node on :4000  (Ctrl+C to stop)"
echo "   Open http://localhost:4000   ·   admin@drp.in / admin123"
cd backend && CLOUD_SYNC_URL=http://localhost:4200 node src/server.js

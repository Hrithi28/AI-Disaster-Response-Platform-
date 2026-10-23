# AI-Powered Disaster Response & Resource Allocation Platform (v3)

**Full Stack Development Project** · Hrithika S · Guide: Sudha P · Dept. of IT, SSN College of Engineering

A local-first command-centre platform for disasters (demo region: Chennai floods). It takes in reports from the web, **SMS on 2G, LoRa mesh radios and IoT sensors**. It classifies them with AI (English and **Tamil**), predicts severity and **explains why**, and dispatches rescue units optimally. It also manages **relief camps, inventory and evacuation**.

It keeps working **without internet**. The whole stack runs on one control-room machine, field phones connect over local Wi-Fi, and updates are stored and forwarded when the connection drops. Everything syncs to the state-HQ cloud when a link returns.

---

## 1. Run it

**You need:** Node.js 18+ and Python 3.10+. No database install is required.

| OS | Command |
|---|---|
| Windows | double-click **`start-demo.bat`** |
| macOS / Linux | `./start-demo.sh` |

The **first run needs internet** to download packages. After that the start script skips installing, so the whole platform runs with **Wi-Fi switched off**.

This starts three services:

| Service | URL | What it is |
|---|---|---|
| AI/ML engine | http://localhost:8000/docs | FastAPI + scikit-learn |
| State-HQ cloud node | http://localhost:4200 | Receives sync from control rooms |
| **Control-room node** | **http://localhost:4000** | The main app (open this) |

API documentation (Swagger) for the control-room node is at http://localhost:4000/api/docs.

### Demo accounts (one click on the login page)

| Role | Email / password | Lands on |
|---|---|---|
| Control room | `admin@drp.in` / `admin123` | Command dashboard |
| Field responder | `responder@drp.in` / `field123` | Field app (Rescue Boat 01; phone +919000000001) |
| Camp volunteer (NGO) | `volunteer@drp.in` / `volunteer123` | Volunteer portal (Guindy camp) |
| Citizen | `citizen@drp.in` / `citizen123` | SOS page (`/sos` also works without login) |

Pending-volunteer example: `arjun.ngo@drp.in` (log in after approving it on **Users & Volunteers**).

### Manual start

```bash
cd ml-service && pip install -r requirements.txt -r requirements-nlp.txt && uvicorn app.main:app --port 8000
cd backend && npm install && npm run cloud                                       # optional, port 4200
cd backend && CLOUD_SYNC_URL=http://localhost:4200 npm start                     # port 4000
cd frontend && npm install && npm run dev                                        # dev UI on 5173 (optional)
```

### Tests (66 automated)

```bash
cd ml-service && python -m pytest -q         # 8: real-data NLP accuracy, Tamil, explainability, comparison, HumAID loader
cd backend   && npm test                      # 42: algorithms, OSM road routing + flood detour, street geocoding,
                                              #     USGS/GDACS parsers, SMS/LoRa flow, auth, camps, sync, audit,
                                              #     offline speech-to-text of a spoken 2G emergency call
cd frontend  && npm test                      # 11: offline outbox (store-and-forward), UI, voice-command parsing
cd frontend  && npx playwright install chromium && npm run test:e2e   # 5 end-to-end incl. a spoken SOS (app must be running)
```

### Saved data

Everything is saved on disk in `backend/data/` (embedded PostgreSQL via **PGlite** + a local report store), so registered users, incidents and reports survive restarts. To start over, close the windows and run `reset-demo-data.bat` (or `./reset-demo-data.sh`). Set `DATABASE_URL` / `MONGO_URL` to use external PostgreSQL / MongoDB servers instead.

---

## 2. Real data inside the project

The platform uses real data in five ways (full source and licence table in [`data/README.md`](data/README.md)):

- **Real street map, offline.** The whole of Greater Chennai from OpenStreetMap: 141k road segments and 8.7k named streets, with English street names. It is packed into one 10 MB vector-tile file that the control-room server stores and serves itself. MapLibre GL draws it inside the Leaflet map. It needs **no internet and no tile server**, and the field app's service worker keeps a copy for phones with no signal.
- **Real road routing, offline.** Rescue units are routed with A* over the **real road network** (246k intersections). Roads inside flooded or high-risk zones get an 8× time penalty, so routes detour around them. This works without OSRM or internet; OSRM is only used if the graph file is missing.
- **Street-level SMS locations.** *"6 people trapped near Taramani Link Road"* is placed on that road using an OSM street-name gazetteer, in English or Tamil.
- **Real disaster messages for the AI.** The report classifier is trained on **26,166 real messages** from the Figure Eight dataset (2010 Haiti and Chile earthquakes, 2010 Pakistan floods, Super-storm Sandy, disaster news), plus English and Tamil examples. It is evaluated on **5,234 real messages it never saw**:
  - **73.9% accuracy, 0.56 macro-F1** across 7 classes
  - the keyword-rules fallback scores 63.6% on the same messages
- **Live real-time feeds** when the server has internet:
  - **Open-Meteo** rainfall and wind, with IMD rainfall categories
  - **USGS** earthquakes within 2,500 km
  - **GDACS** cyclone, flood and earthquake alerts for India and neighbouring countries

  New orange or red events raise alerts. When there is no internet, the last cached data is shown.

---

## 3. "What if there is no internet?" — how it really works

| What is available | How DRP works |
|---|---|
| Internet ✅ | Everything below, plus **Open-Meteo** weather, **USGS/GDACS** live disaster feeds, Twilio SMS, web push and cloud sync |
| No internet, local Wi-Fi ✅ | Server, PostgreSQL, MongoDB and the AI all run on one laptop. Phones join the Wi-Fi (QR code on the **Offline & Resilience** page). Socket.IO keeps working. The **full OpenStreetMap street map**, **road-network routing** and street-name lookup all stay on the server. |
| Only 2G / SMS ✅ | **SMS gateway**: an Android phone with a SIM (or a GSM modem) on the LAN posts SMS to `/api/gateway/sms`. The same AI pipeline runs, and replies go back by SMS. Responders text **ARRIVED** / **DONE 4**. |
| No mobile network | **LoRa mesh** (e.g. Meshtastic) or radio operators → `/api/gateway/mesh`. Field app **queues updates on the phone** and syncs later (PWA + outbox + idempotency keys). |
| Everything down | A satellite link from the control room. Each node keeps a **sync outbox** that is pushed to the cloud automatically when any link returns. |

To demonstrate this live, use the **Offline & Resilience → Simulate internet outage** button, and the **"Simulate no signal"** switch in the field app. You can also turn off Wi-Fi.

---

## 3b. Voice — speak instead of type (works offline)

People in an emergency often can't type: their hands are busy, they are panicking, or they can't read or write. Every role can **speak**, and the system acts on it:

| Who | Where | Say… | What happens |
|---|---|---|---|
| Citizen | **SOS page → Speak your emergency** | "Six people are trapped on our roof in Velachery, water is rising" | Transcribed, people count and area picked up, **SOS sent automatically**, answer read aloud |
| Caller on a basic phone | **SMS & Mesh Gateway → Voice call** | (a 2G voice call / voice note to the helpline) | Transcribed → same AI pipeline as SMS → **reply by SMS** |
| Radio operator | **Gateway → Record radio message** | what they heard on police / ham radio | Logged as a radio-relay message and triaged |
| Responder | **Field app → Tap to talk** | "Arrived", "Mission complete, severity 4", or any situation report | **Status updated** or report sent; new assignments are **read aloud** |
| Volunteer / NGO | **Camp page → Speak update** | "Distributed 40 food packets", "Checked in 12 people", "We need resupply" | **Stock / occupancy updated**, resupply requested |

**How:** the browser records the voice and converts it to 16 kHz WAV. The control-room server transcribes it with **OpenAI Whisper (base, 8-bit ONNX, ~80 MB) running locally** through transformers.js + ONNX Runtime — **no cloud speech API, no internet**. About 1.5–2 s for a 5–8 s message on a laptop CPU. Misheard Chennai place names are corrected against the locality list ("Velocere" → Velachery). Replies are spoken with the device's built-in voices. English and Tamil (தமிழ் toggle); Tamil accuracy is lower with the base model — set `VOICE_MODEL_PKG=sts-whisper-small` (and `npm i sts-whisper-small`) for better Tamil at ~3× the time.

*Phones on the LAN (http://192.168.x.x) are not allowed to use the live microphone by browsers, so they get a "record" button that opens the phone's voice recorder instead; the laptop (localhost) uses the live mic.*

---

## 4. Feature map

| Area | Features |
|---|---|
| **Data ingestion** | Social posts, web SOS, **voice (offline speech-to-text, EN + Tamil)**, **SMS (English and Tamil, with street-level location)**, **LoRa/radio relay**, 12 IoT sensors, **live Open-Meteo weather**, **live USGS earthquakes and GDACS alerts**, scenario simulator |
| **AI/ML engine** | Severity prediction (Gradient Boosting) **with per-prediction explanations**. Bilingual NLP report classifier (TF-IDF + Logistic Regression, offline Tamil lexicon, spaCy NER). Isolation-Forest sensor anomalies. DBSCAN risk zones. **Model comparison page** (4 models each + confusion matrices). Feedback-loop retraining. Optional training on the real **HumAID** crisis-tweet dataset. |
| **Allocation** | Priority queue (ageing), **Hungarian optimiser** vs FCFS baseline (both measured as road-network ETA), nearest-unit dispatch, **A\* on the real OSM road network avoiding flood zones (offline)**, live unit movement along real streets, auto-dispatch of critical incidents |
| **Relief** | **8 relief camps**: occupancy, per-person-per-day consumption, low-stock alerts, resupply requests. **Evacuation planner** (risk zones → nearest camps with capacity, evacuation order sends SMS to camps). **Volunteer/NGO role** with self-registration, approval and a camp portal. |
| **Response layer** | Command dashboard, field app (installable **PWA**, offline), citizen SOS with tracking, **SMS & Mesh Gateway console** (feature-phone simulator), alerts (dashboard + SMS + **web push**), analytics, **PDF situation report**, CSV exports |
| **Security & ops** | JWT access tokens (15 min) + **rotating refresh tokens** with reuse detection, **password reset** (link by SMS), role-based access (admin/responder/volunteer/citizen), **user management**, **audit trail**, zod validation, rate limiting, helmet, idempotent replays |
| **DevOps** | Dockerfiles, docker-compose (edge + optional cloud profile), **Render blueprint**, GitHub Actions (ML + backend + frontend + e2e + docker) |

---

## 5. Architecture (MVC + services + microservice)

```
React PWA (Vite, Tailwind, Leaflet, Recharts)  ── service worker: offline shell, tile & API cache, push
   │ REST (JWT + refresh)            ▲ Socket.IO live events
   ▼                                 │
Node.js / Express 5  —  routes/index.js (URL + validation) → controllers/ (HTTP) → services/ (logic)
   middleware: helmet · cors · optionalAuth · idempotency (x-op-id) · auditTrail · zod
   services:  incidents · allocation (PQ, Hungarian) · routing (OSRM | A*) · sms (gateway) · camps
              evacuation · weather · connectivity · sync (outbox) · push · notifier · simulator
   events.js  domain event bus (Observer): incident/dispatch/alert/camp events → SMS replies,
              cloud-sync outbox, web push — publishers don't know their subscribers
   │ SQL (pg / PGlite)        │ mongoose / local file store   │ HTTP/JSON
PostgreSQL                 MongoDB                         FastAPI ML engine
users, refresh_tokens,     reports (raw text + NLP),       severity GBM + explain, NLP (EN/TA),
incidents, dispatches,     sensor readings                 anomaly IForest, zones DBSCAN,
resources, camps,                                          model comparison, feedback/retrain
inventory, sms_messages,
audit_logs, sync_outbox …
   │  store-and-forward (when any link is up)
   ▼
State-HQ cloud node (NODE_ROLE=cloud) — synced_records from every control room
```

**Design patterns used:**
- **Layered/MVC:** routes → controllers → services → data access
- **Microservice:** the ML engine is a separate service
- **Repository:** `db/postgres.js`, and the MongoStore/MemoryStore pair
- **Strategy:** pg vs embedded PGlite, Mongo vs local file store, OSRM vs A*, SMS provider
- **Adapter/Facade:** `services/ml.js` wraps the ML service, and `gatewayController` handles both Twilio and Android payloads
- **Observer / pub-sub:** `events.js` and Socket.IO
- **Fallback / graceful degradation:** rule-based AI, offline map, A* routing
- **Store-and-forward + idempotency key:** the outbox and `x-op-id`
- **Middleware chain**
- **Singleton:** DB pool, Socket.IO server
- **Provider/Context:** React contexts

---

## 6. Five-minute demo script

1. **Login** → *Control room*. Point out the connectivity badge.
2. **Command:**
   - Open the top incident. Show the **"Why this score?"** bars (explainable AI) and click **Send** on a unit.
   - Click **Run optimiser** to see the Hungarian plan vs FCFS, then dispatch.
   - **Trigger scenario → Cyclone landfall.**
   - Click **Evacuation plan** to see the green routes from risk zones to camps.
3. **SMS & Mesh Gateway:**
   - Send *"SOS Adyar 9 people trapped…"* from the feature-phone simulator, then send a **Tamil** SMS. Show the automatic SMS replies.
   - Switch to the **responder** number and send `ARRIVED`, then `DONE 4`.
   - Relay a LoRa message.
4. **Offline & Resilience:**
   - Click **Simulate internet outage**. The badge turns amber, the map switches to the offline schematic, and sync queues up.
   - Scan the LAN QR code.
   - Click **Restore** and watch the sync count drop.
5. **Field app** (log in as the responder on a phone):
   - Turn on **Simulate no signal**, then press **Arrived** or send a report. It queues on the phone.
   - Turn **Restore signal** on and it syncs.
6. **Camps & Evacuation:**
   - Open Chromepet, which has low stock, and distribute or restock.
   - Click **Plan evacuation**, then **Issue order**.
7. **AI Lab:**
   - Show the sliders and the explanation.
   - Classify a Tamil message.
   - Open the **Model comparison** with its confusion matrices.
8. **Analytics** → **Retrain**. Then **Audit & Reports** → **Situation report PDF**.

More detail: `docs/DEMO_SCRIPT.md` · deployment: `docs/DEPLOYMENT.md` · viva Q&A: `docs/VIVA_NOTES.md`

---

## 7. Honest limitations

- **The severity model is still trained on synthetic data.** No open dataset links rainfall or water level to incident severity. Its accuracy is about 80% exact and 100% within one level. The NLP model *is* trained and evaluated on real messages.
- **The real messages come from Haiti, Chile, Pakistan and the USA, not Chennai.** Indian data such as HumAID can be added in `ml-service/data/humaid/`.
- **Tamil support** is an offline lexicon gloss plus Tamil training examples, not full machine translation.
- **Water bodies on the offline map are approximate.** The OSM extract contains roads only. The coastline is derived from the road data, and rivers and lakes are hand-drawn.
- **Routing ignores traffic.** It uses OSM road classes and speeds, plus the hazard-zone penalty.
- **Voice:** Whisper *base* is good for clear English; noisy audio, strong accents and Tamil are less accurate (whisper-small helps). Untested on real phone-call audio quality.
- **SMS and LoRa** use a simulated provider in the demo. The Android gateway, Twilio and Meshtastic integrations are HTTP endpoints and configuration; they were not tested with real radios.
- **Live feeds and web push** need the server to have internet. Without it, cached data is used.

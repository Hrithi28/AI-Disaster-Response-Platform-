# Viva quick-reference (v2)

## Real-world use

**How is this useful in a real disaster?**
District emergency operations centres, NDRF, fire services and the 108 ambulance service today coordinate by phone and spreadsheets. DRP gives them one live picture, AI prioritisation, optimal dispatch, camp logistics and an audit trail.

**What happens with no internet?**
The system is local-first: server, both databases and the AI run on one laptop or server in the control room, and phones connect over local Wi-Fi. SMS works on 2G through an Android or GSM gateway with no internet. LoRa mesh covers areas with no network at all. The field app queues updates on the phone and replays them with idempotency keys. Each node syncs to the state-HQ cloud when any link returns, including satellite.

**How is "offline" different from "LAN-only"?**
- *LAN-only:* the server is reachable but has no internet. Everything core still works.
- *Offline:* the device itself can't reach the server. The PWA opens from its cache, and updates queue on the phone.

**Why SMS and not WhatsApp?**
WhatsApp needs mobile data. SMS needs only a 2G voice/signalling channel and works on feature phones, which elderly and poorer people use most.

**How do you stop duplicate updates when a queued request is replayed?**
Every queued operation carries a UUID in the `x-op-id` header. The server stores the response in `processed_ops`, and a replay returns the stored response instead of applying the update again.

**How do you handle someone texting without saying where they are?**
The reply asks for the area. The next message from the same number is combined with the earlier one. GPS coordinates in the text, or from LoRa devices, are used when present.

## AI

**How do you know the AI's severity is right? Is it a black box?**
Every prediction comes with occlusion attributions: each factor is reset to a "calm day" value and the drop in score is measured. The panel shows, for example, "+18 from water level". Field-confirmed severities are compared against predictions in Analytics, and they retrain the model through the feedback loop.

**Which models did you compare?**
- Severity: Gradient Boosting (deployed), Random Forest, Logistic Regression, Decision Tree.
- NLP: Logistic Regression (deployed), Linear SVM, Complement Naive Bayes, Random Forest.

All are trained on the same split. Results are shown in AI Lab with confusion matrices and latency.

**Tamil?**
An offline stem lexicon adds an English gloss (வெள்ள→flood, சிக்கி→trapped), Tamil training examples are included, and character n-grams learn Tamil text directly. Inflected place names (தாம்பரத்தில்) are matched by stem. No cloud translation API is used, so it works offline.

**Real data?**
A HumAID crisis-tweet loader with a label mapping is included. Drop the TSV files into `ml-service/data/humaid/`. The default corpus is synthetic, so its near-100% NLP accuracy is optimistic; I'm upfront about that.

## Allocation

**Why the Hungarian algorithm?**
It gives the optimal one-to-one assignment in O(n³). Each demand slot also gets a "leave unfilled" option whose cost grows with priority, so scarce units go to the most urgent incidents. The optimiser modal compares it with greedy first-come-first-served.

**Routing?**
OSRM gives real road routes when online. Offline, A* runs on a grid and avoids other high-risk zones. If the OSRM route crosses a hazard zone, the A* detour is used instead.

**Evacuation planner?**
Risk zones are sorted by risk. For each zone, people are assigned greedily to the nearest open camp outside any hazard zone, up to that camp's free capacity. Any people left unplaced are reported.

## Full stack

**Architecture?**
- **Layered MVC:** `routes/index.js` holds URLs and validation, `controllers/` handle HTTP, `services/` hold business logic, `db/` holds data access.
- **Separate FastAPI ML microservice.**
- **Domain event bus (Observer):** decouples SMS replies, cloud sync and push from the core logic.

**Why two databases?**
- **PostgreSQL** holds relational data with constraints: users, incidents, dispatches, camps, inventory and the audit log.
- **MongoDB** holds high-volume, schema-flexible data: free-text reports with variable NLP output, and sensor time series.

**Auth and security?**
- **Tokens:** 15-minute JWT access tokens plus 7-day refresh tokens that rotate on every use. A reused refresh token revokes all of that user's sessions.
- **Password reset:** one-time tokens valid for 30 minutes, sent by SMS. Only SHA-256 hashes of these tokens are stored.
- **Access control:** role-based guards for admin, responder, volunteer and citizen. Volunteers are limited to their own camp.
- **Request protection:** zod validation, rate limiting, helmet headers and parameterised SQL.
- **Audit trail:** every write is logged, with passwords redacted.

**Testing?**
66 automated tests:
- 8 pytest tests (ML service)
- 42 node:test unit and integration tests (backend), incl. a real spoken emergency call transcribed offline
- 11 Vitest tests (frontend), incl. voice-command parsing
- 5 Playwright end-to-end tests, incl. a spoken SOS through a fake microphone
- CI runs all of them on every push.

**Deployment?**
Docker Compose on one machine (works offline), a Render blueprint with Neon and Atlas for the cloud, or AWS EC2 with Docker. Each control room is an "edge node" that syncs to a cloud node.

## Limitations to state honestly

- The NLP training data is synthetic.
- Tamil support is a keyword gloss, not full translation.
- SMS and LoRa providers are simulated in the demo; the integration points are real HTTP endpoints.
- Web push needs internet.

## v3: real data and the full offline map

**Is any of the data real?**
Yes. Four real datasets and three live feeds:
- **The street map and routing** use the real OpenStreetMap road network of Greater Chennai: 246k intersections and 8.7k street names.
- **The NLP classifier** is trained on 26,166 real disaster messages (Figure Eight: Haiti and Chile earthquakes, Pakistan floods, Hurricane Sandy). It is tested on 5,234 real messages it never saw: **73.9% accuracy, 0.56 macro-F1**. Our keyword-rules fallback gets 63.6%, so the ML adds about 10 points.
- **Live feeds:** Open-Meteo weather, USGS earthquakes and GDACS cyclone/flood alerts.
- **The severity model** is still synthetic, because no open dataset maps hazard readings to response severity. The feedback loop is how real outcomes would improve it.

**Why is 74% lower than the 100% before?**
Before, the classifier was tested on our own templates, which is easy and optimistic. Now it is tested on real messages written by real people, with typos and mixed topics. The weakest classes are fire (only 282 examples) and rescue. More local data such as HumAID would improve it.

**How does the full street map work offline?**
- A Python build script (`tools/map/build_offline_map.py`) reads the OSM extract with pyosmium and creates vector tiles with tippecanoe. It packs them into one PMTiles file, about 10 MB.
- The server serves that file like any static file. The browser reads only the byte ranges it needs, and MapLibre GL draws it on the GPU inside our Leaflet map.
- There is no tile server, no API key and no internet. The service worker keeps a full copy for phones with no signal.

**How does offline routing work?**
- The same script contracts the OSM roads into a graph of intersections and road segments (246k nodes, 604k directed links), saved gzipped at about 4.6 MB.
- Node loads it in about 0.7 s. A* finds the fastest route using road-class speeds; one route takes about 25 ms.
- Roads inside high or critical risk zones cost 8× the time, so units detour around floods. For example, Central → Velachery goes from 16.4 km to 18.4 km to avoid a flooded zone.
- Boats go straight over water.

**How do you get a location from an SMS with no GPS?**
In order of precedence:
1. GPS coordinates in the text (or sent by a LoRa device).
2. An OSM street name: 8.7k unambiguous names in English and Tamil. Names shared by unrelated streets, like "Main Road", are excluded by clustering.
3. A locality name.
4. Otherwise, the reply asks for the area.

## v4: voice and saved data

**Can people just speak?**
Yes, every role. Citizens speak an SOS and it is sent automatically. Basic-phone users can make a 2G voice call to the helpline (voice calls work where data doesn't); the recording is transcribed and handled like an SMS. Responders say "arrived" / "mission complete, severity 4". Volunteers say "distributed 40 food packets". Replies and new assignments are read aloud.

**Is the speech recognition online, like Google?**
No. OpenAI's Whisper model (base size, 8-bit, ~80 MB) runs **inside our own server** with ONNX Runtime. Nothing leaves the laptop, so it works with no internet and keeps callers' voices private. About 2 seconds per message on a laptop CPU.

**How do you handle place names it gets wrong?**
Whisper hears "Velachery" as "Velocere". We compare words against the Chennai locality list using edit distance and a consonant "skeleton" (vowels and h removed), so "Velocere" → Velachery, "tambram" → Tambaram.

**Tamil voice?**
Supported with a தமிழ் toggle, but the base model's Tamil is weak; the small model is better but ~3× slower. Honest limitation.

**Where is data stored without a database server?**
PGlite: the real PostgreSQL engine compiled to WebAssembly, running inside Node and saving to `backend/data/local-db`. Same SQL as a Postgres server; survives restarts and even a hard kill (tested). Reports go to a local JSON document store. In deployment, `DATABASE_URL` / `MONGO_URL` switch to real servers.

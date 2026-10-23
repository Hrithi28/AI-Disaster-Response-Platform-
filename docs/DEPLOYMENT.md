# Deployment guide

There are three ways to run the platform, from simplest to most production-like.

## A. Laptop in the control room (works with no internet)

Run `start-demo.bat` (Windows) or `./start-demo.sh` (Linux/macOS).

- Connect the laptop to a Wi-Fi router or a phone hotspot. Field phones join the same Wi-Fi and scan the QR code on **Offline & Resilience**.
- By default the data is in memory. To keep data across restarts, install PostgreSQL and MongoDB locally (or use Docker, option B) and set these in `backend/.env`:
  ```
  DATABASE_URL=postgres://drp:drp@localhost:5432/drp
  MONGO_URL=mongodb://localhost:27017/drp
  ```

### Real SMS without internet

1. Put a SIM card in an Android phone and install an *SMS gateway* app that can:
   - forward incoming SMS to a URL (webhook), and
   - send SMS through an HTTP API.
2. Point its webhook at `http://<laptop-ip>:4000/api/gateway/sms`. Both JSON `{ "from": "...", "body": "..." }` and Twilio-style form fields work.
3. In `backend/.env`:
   ```
   SMS_PROVIDER=android
   SMS_GATEWAY_URL=http://<phone-ip>:8080/send
   ```

### LoRa mesh

A Meshtastic node connected to the laptop (serial, MQTT or HTTP bridge) posts each text message to `POST /api/gateway/mesh`:

```
{ "from": "<node>", "text": "...", "lat": 12.97, "lng": 80.22 }
```

## B. Docker Compose (one machine, production-like)

```bash
docker compose up --build                    # PostgreSQL + MongoDB + ML engine + control-room node (:4000)
docker compose --profile cloud up --build    # also a state-HQ cloud node (:4200) that receives sync
```

Once the images are built, everything runs offline.

## C. Cloud (public URL / state HQ)

### Free databases

1. **Neon** (neon.tech): create a project and copy the PostgreSQL connection string.
2. **MongoDB Atlas** (cloud.mongodb.com): create an M0 free cluster. Add a database user, allow access from `0.0.0.0/0` for the demo, then copy the connection string.

### Render (render.com), using the blueprint

1. Push this repository to GitHub.
2. In Render, go to **New → Blueprint** and select the repository. It reads `render.yaml` and creates `drp-ml` and `drp-api`.
3. In `drp-api`, set the environment variables `DATABASE_URL` (Neon) and `MONGO_URL` (Atlas).
4. Open `https://drp-api.onrender.com`. Free instances sleep when idle, so the first request takes about 30 seconds.

To make the hosted instance the state-HQ cloud, set `NODE_ROLE=cloud` on it. Then give each control-room laptop:

```
CLOUD_SYNC_URL=https://<your-render-url>
SYNC_KEY=<same value as the cloud>
```

### AWS EC2

1. Launch an Ubuntu instance with security groups opening ports 22 and 4000.
2. Install Docker and the compose plugin.
3. Clone the repository and run `docker compose --profile cloud up -d`.
4. Optionally put Nginx and Let's Encrypt in front. HTTPS lets phones install the PWA and receive push notifications.

The GitHub Actions workflow (`.github/workflows/ci.yml`) runs all tests and builds the images. Add an ECR push / SSH deploy step there for continuous deployment.

## Environment variables

All of them are listed in `backend/.env.example`.

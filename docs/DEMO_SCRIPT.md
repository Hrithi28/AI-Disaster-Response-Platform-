# Review demo script (about 10 minutes): what to say and what to click

## Before the panel arrives

1. Run `start-demo.bat`. Three windows open: AI engine, cloud (HQ) and control room.
2. Open these browser tabs:
   - `localhost:4000` (login)
   - `localhost:4000/sos`
   - `localhost:4000/api/docs`
3. If possible, have your phone on the same Wi-Fi as the laptop so it can open the field app.

---

## 1. Opening (30 seconds)

> "My platform helps a district control room respond to disasters like the Chennai floods. It takes in reports from every channel, uses AI to prioritise them, sends the right rescue units and manages relief camps. Most importantly, it keeps working when the internet goes down."

## 1b. Real data (30 seconds)

**Zoom** the map to street level:

> "This is the real OpenStreetMap street map of Chennai, stored on our own server. It works with no internet. Units drive along real roads, and the router avoids flooded zones."

**Open** *AI Lab → Model comparison → Report classification*:

> "The classifier is trained on 26,000 real disaster messages, and tested on 5,000 real ones it never saw: 74% accuracy, versus 64% for keyword rules."

## 2. Command dashboard (2 minutes)

**Click** *Control room*. Then:

- **Point** at the connectivity badge:
  > "This shows whether we're online, on the local network only, or offline."
- **Click** the top item in the Priority Queue, then **point** at **"Why this score?"**:
  > "The AI doesn't just give a number. It explains which factors pushed the severity up: water level, people affected, injuries. That's explainable AI, so officers can trust it."
- **Click** *Send* on a unit:
  > "The route uses real roads from OSRM when online, and our own hazard-aware A* route when offline."
- **Click** *Run optimiser*:
  > "The Hungarian algorithm assigns all units at once, X% faster than nearest-unit-first."

  Then click *Dispatch*.
- **Choose** *Trigger scenario → Cyclone landfall*:
  > "A critical alert is raised, reports flood in, and critical incidents are auto-dispatched."
- **Click** *Evacuation plan*:
  > "Green lines move people from risk zones to the nearest camps that still have space."

## 3. SMS and mesh: the answer to "what if there's no internet?" (2 minutes)

**Open** *SMS & Mesh Gateway*.

> "Mobile data fails first. SMS still works on 2G. An Android phone with a SIM, connected to our laptop over Wi-Fi, acts as the gateway, so no internet is needed."

1. **Click** the quick message *"SOS Velachery 6 people trapped…"* and press **Send**:
   > "The same AI classified it as Rescue, high urgency, linked it to an incident, and replied by SMS with safety advice."
2. **Send** the Tamil message:
   > "It understands Tamil offline, using a built-in lexicon and Tamil training data."
3. **Type** *"SOS 6 people trapped near Taramani Link Road"*:
   > "It found the exact street from the OpenStreetMap street names, with no GPS."
4. **Send** *"my mother is injured need help"*, then *"Saidapet"*:
   > "When the area is missing, it asks for it and then joins the two messages."
5. **Click** *responder*, then send `ARRIVED`, then `DONE 4`:
   > "Rescue teams with basic phones can update their status by SMS."
6. In the LoRa panel, click **Relay**:
   > "Where there's no mobile network at all, LoRa radios on boats carry messages 5–10 km."

## 3b. Voice (1 minute)

1. **Open** `/sos`, click **Speak your emergency**, say: *"Six people are trapped on the roof of our house in Velachery, the water is rising, please send a boat."* Click **Stop**.
   > "Many people can't type in a panic. The speech is converted to text on our own server, with no internet, and the SOS is sent automatically. It even reads the answer back."
2. **Gateway → Voice call**: speak a request.
   > "Voice calls work on 2G even when data doesn't. The helpline recording is transcribed and handled like an SMS, and the caller gets an SMS reply."
3. (Optional) **Field App → Tap to talk** → *"We have arrived"* — the status changes by itself.

## 4. Offline & resilience drill (1.5 minutes)

**Open** *Offline & Resilience* and **click** *Simulate internet outage*.

> "Internet is gone. Watch: the badge turns amber, the map switches to the offline map bundled with the app, routing switches to A*, and cloud sync starts queuing. Dispatch, AI, SMS and the field app all keep working on the local network."

- **Point** at the **QR code**:
  > "Field phones scan this to join over Wi-Fi."
- **Click** *Restore internet*:
  > "The queued changes sync to the state-HQ server automatically."

  (On your laptop, port 4200 is the HQ node.)

## 5. Field app with no signal (1 minute)

On your phone (or **Field App ↗**), toggle **Simulate no signal**. Press **Arrived on scene** or send a field report.

> "There's no signal, so the update is saved on the phone. Each update has a unique ID so it can't be applied twice."

Toggle **Restore signal**:

> "Synced. The app is installable and opens even with no network."

## 6. Camps and volunteers (1 minute)

**Open** *Camps & Evacuation* and click **Chromepet**:

> "Stock is used up per person per day. Low stock raises an alert, and volunteers record distributions."

Click **Plan evacuation**, then **Issue evacuation order**. Then on *Users & Volunteers*, approve the pending volunteer.

## 7. AI Lab and reports (1 minute)

**AI Lab:**
- Move a slider and point at the explanation.
- Classify a Tamil message.
- **Model comparison:**
  > "I compared four models for each task, with confusion matrices. Gradient Boosting and Logistic Regression were deployed."

**Audit & Reports:**
- **Situation report (PDF)**:
  > "One click gives officials a printable sitrep."
- **Point** at the audit trail:
  > "Every action is logged: who, what and when."

## Closing

> "So, it's useful in a real disaster because it runs locally, degrades step by step from internet to LAN to SMS to mesh, never loses data, and syncs to headquarters when a link returns."

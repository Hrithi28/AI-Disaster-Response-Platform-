# LoRa mesh bridge (no internet, no mobile network)

**Hardware (per node):** a Meshtastic-compatible LoRa board, e.g. Heltec LoRa32 V3 or LilyGO T-Beam, set to region **IN** (865–867 MHz, licence-free in India), plus a small antenna and a power bank.

**How messages flow:** boat / camp / rooftop phone → Bluetooth → its LoRa radio → radio-to-radio hops (5–10 km each, more with relays) → LoRa radio plugged into the control-room laptop by USB → `meshtastic_bridge.py` → `POST /api/gateway/mesh` → AI pipeline → reply sent back over the radio.

```bash
pip install meshtastic                                  # one time, needs internet
python tools/mesh/meshtastic_bridge.py --port COM5      # Windows; see Device Manager for the COM number
python tools/mesh/meshtastic_bridge.py --simulate       # no radio: type  node-id | message
```

Field users type messages in the free Meshtastic phone app, which is paired to their radio over Bluetooth. Neither the phone nor the radio needs a SIM or internet.

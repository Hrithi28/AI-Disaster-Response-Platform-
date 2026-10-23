#!/usr/bin/env python3
"""LoRa mesh -> DRP control room bridge (no internet, no mobile network).

A Meshtastic LoRa radio is plugged into the control-room laptop by USB (or joined over
Wi-Fi). Every text message the mesh delivers is forwarded to the local DRP server
(POST /api/gateway/mesh), which runs it through the same AI pipeline as an SMS:
classify -> locate -> merge into an incident -> prioritise -> dispatch. The server's
reply (reference number, safety advice, dispatch updates) is sent back over the radio
to the node that wrote in.

Usage
  pip install meshtastic                                   # one time, needs internet
  python tools/mesh/meshtastic_bridge.py --port COM5       # radio on USB (Windows)
  python tools/mesh/meshtastic_bridge.py --port /dev/ttyUSB0
  python tools/mesh/meshtastic_bridge.py --host 192.168.4.1  # radio reachable over Wi-Fi

  # No radio? Type messages yourself to test the whole path:
  python tools/mesh/meshtastic_bridge.py --simulate
      node> !boat07 | 12 people on a rooftop near Velachery lake, need boat

Only the Python standard library is used to talk to the server; the `meshtastic`
package is needed only for a real radio.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request

MAX_RADIO_TEXT = 200  # LoRa packets carry ~230 bytes; keep replies short


def post_to_server(server, payload):
    req = urllib.request.Request(
        f"{server.rstrip('/')}/api/gateway/mesh",
        data=json.dumps(payload).encode("utf-8"),
        headers={"content-type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as res:
            return json.loads(res.read().decode("utf-8") or "{}")
    except urllib.error.HTTPError as e:
        print(f"[bridge] server rejected message ({e.code}): {e.read().decode('utf-8', 'replace')[:200]}")
    except urllib.error.URLError as e:
        print(f"[bridge] control-room server not reachable ({e.reason}); is it running on {server}?")
    return None


def reply_text(result):
    reply = (result or {}).get("reply") or {}
    return (reply.get("body") or "").strip()


def forward(server, sender, text, lat=None, lng=None, snr=None, hops=None, channel="lora"):
    payload = {"from": sender, "text": text, "channel": channel, "node": sender}
    if lat is not None and lng is not None:
        payload.update(lat=float(lat), lng=float(lng))
    if snr is not None:
        payload["snr"] = float(snr)
    if hops is not None:
        payload["hops"] = int(hops)
    result = post_to_server(server, payload)
    if result is not None:
        inbound = result.get("inbound") or {}
        print(f"[bridge] {sender}: \"{text[:60]}\" -> {inbound.get('status', 'received')}"
              + (f" · incident #{inbound['incident_id']}" if inbound.get("incident_id") else ""))
    return reply_text(result)


def run_simulator(server):
    print("Simulated LoRa node. Type:  <node id> | <message>   (Ctrl+C to quit)")
    print("Optional GPS:              <node id> | <message> | <lat>,<lng>")
    while True:
        try:
            line = input("node> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            return
        if not line:
            continue
        parts = [p.strip() for p in line.split("|")]
        sender, text = (parts[0], parts[1]) if len(parts) >= 2 else ("!sim-node", parts[0])
        lat = lng = None
        if len(parts) >= 3 and "," in parts[2]:
            lat, lng = parts[2].split(",", 1)
        reply = forward(server, sender, text, lat, lng, snr=7.5, hops=1)
        if reply:
            print(f"   radio reply -> {sender}: {reply[:MAX_RADIO_TEXT]}")


def run_radio(server, port=None, host=None):
    try:
        from pubsub import pub
        import meshtastic.serial_interface
        import meshtastic.tcp_interface
    except ImportError:
        sys.exit("The 'meshtastic' package is not installed. Run:  pip install meshtastic   (or use --simulate)")

    iface = (meshtastic.tcp_interface.TCPInterface(hostname=host) if host
             else meshtastic.serial_interface.SerialInterface(devPath=port))
    print(f"[bridge] connected to LoRa radio ({host or port or 'auto-detected USB'}); forwarding to {server}")

    def on_receive(packet, interface):
        decoded = packet.get("decoded") or {}
        if decoded.get("portnum") != "TEXT_MESSAGE_APP":
            return
        sender = packet.get("fromId") or f"!{packet.get('from', 0):08x}"
        text = (decoded.get("text") or "").strip()
        if len(text) < 2:
            return
        pos = ((interface.nodes or {}).get(sender) or {}).get("position") or {}
        hops = None
        if packet.get("hopStart") is not None and packet.get("hopLimit") is not None:
            hops = packet["hopStart"] - packet["hopLimit"]
        reply = forward(server, sender, text, pos.get("latitude"), pos.get("longitude"), packet.get("rxSnr"), hops)
        if reply:
            interface.sendText(reply[:MAX_RADIO_TEXT], destinationId=sender)

    pub.subscribe(on_receive, "meshtastic.receive")
    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        iface.close()


def main():
    ap = argparse.ArgumentParser(description="Forward Meshtastic LoRa messages to the DRP control room (works with no internet).")
    ap.add_argument("--server", default="http://localhost:4000", help="DRP control-room server (default %(default)s)")
    ap.add_argument("--port", help="radio serial port, e.g. COM5 or /dev/ttyUSB0 (auto-detected if omitted)")
    ap.add_argument("--host", help="radio IP address when connected over Wi-Fi")
    ap.add_argument("--simulate", action="store_true", help="no radio: type messages in this window instead")
    a = ap.parse_args()
    if a.simulate:
        run_simulator(a.server)
    else:
        run_radio(a.server, a.port, a.host)


if __name__ == "__main__":
    main()

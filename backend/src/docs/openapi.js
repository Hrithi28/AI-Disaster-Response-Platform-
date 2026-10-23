// OpenAPI 3 specification for the Node API (served at /api/docs).
const E = (method, path, tag, summary, opts = {}) => ({ method, path, tag, summary, ...opts });
const LOGIN = { email: 'admin@drp.in', password: 'admin123' };

const endpoints = [
  E('post', '/auth/login', 'Auth', 'Log in → access token (15 min) + refresh token (7 days)', { body: LOGIN }),
  E('post', '/auth/refresh', 'Auth', 'Rotate refresh token and get a new access token', { body: { refresh_token: '…' } }),
  E('post', '/auth/logout', 'Auth', 'Revoke a refresh token', { body: { refresh_token: '…' } }),
  E('post', '/auth/register', 'Auth', 'Citizen sign-up', { body: { name: 'Priya', email: 'priya@example.com', password: 'secret123', phone: '+919876543210' } }),
  E('post', '/auth/register-volunteer', 'Auth', 'Volunteer / NGO sign-up (pending approval)', { body: { name: 'Arun', email: 'arun@ngo.org', password: 'secret123', phone: '+919811111111', organization: 'Chennai Relief NGO', skills: ['first aid', 'cooking'] } }),
  E('post', '/auth/forgot-password', 'Auth', 'Request a password-reset link (sent by SMS; returned in dev)', { body: { email: 'admin@drp.in' } }),
  E('post', '/auth/reset-password', 'Auth', 'Set a new password with a reset token', { body: { token: '…', password: 'newpass123' } }),
  E('get', '/auth/me', 'Auth', 'Current user', { auth: true }),
  E('get', '/users', 'Users', 'List users (admin)', { auth: true }),
  E('post', '/users', 'Users', 'Create user (admin)', { auth: true, body: { name: 'New Responder', email: 'r2@drp.in', password: 'field123', role: 'responder' } }),
  E('patch', '/users/{id}', 'Users', 'Update role / disable / approve volunteer / assign camp (admin)', { auth: true, body: { volunteer_status: 'approved', camp_id: 1 } }),

  E('get', '/incidents', 'Incidents', 'List incidents (?active=true)'),
  E('get', '/incidents/{id}', 'Incidents', 'Incident detail with dispatches, requirement and outstanding units'),
  E('get', '/incidents/{id}/explain', 'Incidents', 'Why the AI gave this severity (feature contributions)'),
  E('post', '/incidents', 'Incidents', 'Create incident (AI-scored)', { auth: true, body: { disaster_type: 'flood', lat: 12.98, lng: 80.22, affected_people: 300, injured: 4, needs: ['rescue'] } }),
  E('post', '/incidents/{id}/resolve', 'Incidents', 'Resolve with field-confirmed severity (feeds the AI)', { auth: true, body: { actual_severity: 4 } }),

  E('get', '/resources', 'Resources', 'List response units'),
  E('post', '/resources', 'Resources', 'Add a unit (admin)', { auth: true, body: { name: 'Ambulance 13', type: 'ambulance', base_name: 'Velachery', lat: 12.98, lng: 80.22, capacity: 2 } }),
  E('get', '/allocation/queue', 'Allocation', 'Priority queue (AI score + ageing + casualties)'),
  E('post', '/allocation/optimize', 'Allocation', 'Hungarian optimiser – preview or commit', { auth: true, body: { commit: false } }),
  E('get', '/allocation/nearest/{incidentId}', 'Allocation', 'Nearest available units with ETA'),
  E('get', '/allocation/route', 'Allocation', 'Route (OSRM online, hazard-aware A* offline)'),
  E('post', '/allocation/dispatch', 'Allocation', 'Manual dispatch', { auth: true, body: { incident_id: 1, resource_id: 18 } }),
  E('patch', '/allocation/dispatches/{id}', 'Allocation', 'Field status update (supports x-op-id idempotency for offline replay)', { auth: true, body: { status: 'on_scene' } }),
  E('get', '/field/assignment', 'Allocation', 'Field app: current assignment for the responder', { auth: true }),

  E('post', '/reports/sos', 'Reports', 'Citizen SOS (public, rate-limited)', { body: { text: 'URGENT 8 people trapped on rooftop, water rising', lat: 12.979, lng: 80.221, people: 8 } }),
  E('get', '/reports/track/{incidentId}', 'Reports', 'Public SOS tracking'),
  E('post', '/gateway/sms', 'Low-bandwidth gateway', 'Inbound SMS webhook (Twilio form or JSON from an Android SMS gateway)', { body: { from: '+919876500001', body: 'SOS Velachery 6 people trapped water rising' } }),
  E('post', '/gateway/mesh', 'Low-bandwidth gateway', 'LoRa / Meshtastic / radio relay message (GPS optional)', { body: { from: 'boat-relay-07', text: '12 people on rooftop near lake', channel: 'lora', lat: 12.976, lng: 80.223 } }),
  E('get', '/gateway/messages', 'Low-bandwidth gateway', 'SMS / mesh message log (admin)', { auth: true }),

  E('get', '/camps', 'Camps', 'Relief camps with inventory and low-stock flags'),
  E('post', '/camps/{id}/occupancy', 'Camps', 'Check people in (+) / out (−)', { auth: true, body: { delta: 25 } }),
  E('post', '/camps/{id}/stock', 'Camps', 'Restock (+) or distribute (−) an item', { auth: true, body: { item: 'Drinking water', delta: -200, reason: 'Morning distribution' } }),
  E('post', '/camps/{id}/resupply', 'Camps', 'Request resupply of low-stock items', { auth: true }),
  E('get', '/evacuation/plan', 'Camps', 'Evacuation plan: risk zones → nearest camps with capacity'),
  E('post', '/evacuation/execute', 'Camps', 'Issue the evacuation order (reserves capacity, notifies camps)', { auth: true }),

  E('get', '/analytics/summary', 'Analytics', 'Operational KPIs and aggregates'),
  E('get', '/audit', 'Audit & exports', 'Audit trail (admin)', { auth: true }),
  E('get', '/exports/{dataset}.csv', 'Audit & exports', 'CSV export: incidents | dispatches | audit | inventory | sms', { auth: true }),
  E('get', '/exports/sitrep.pdf', 'Audit & exports', 'PDF situation report', { auth: true }),

  E('get', '/resilience/connectivity', 'Resilience', 'Internet / LAN status, sync queue, weather source'),
  E('post', '/resilience/connectivity', 'Resilience', 'Simulate an internet outage (drills / demo)', { auth: true, body: { forcedOffline: true } }),
  E('get', '/resilience/lan', 'Resilience', 'LAN addresses + QR code for field devices'),
  E('get', '/sync/status', 'Resilience', 'Store-and-forward cloud sync status'),
  E('post', '/sync/ingest', 'Resilience', 'Cloud side: receive records from an edge node (x-sync-key)'),
  E('get', '/sync/nodes', 'Resilience', 'Cloud side: summary of edge nodes'),
  E('get', '/push/key', 'Resilience', 'VAPID public key for web push'),
  E('post', '/push/subscribe', 'Resilience', 'Save a browser push subscription', { auth: true }),

  E('get', '/weather', 'Data feeds', 'Live Open-Meteo weather for 5 Chennai stations'),
  E('get', '/ml/models', 'AI', 'Model metrics and feature importance'),
  E('get', '/ml/comparison', 'AI', 'Model comparison with confusion matrices'),
  E('post', '/ml/predict', 'AI', 'Severity prediction', { body: { disaster_type: 'flood', rainfall_mm: 220, water_level_m: 2.4, affected_people: 1500, injured: 10, infrastructure_damage: 0.5 } }),
  E('post', '/ml/explain', 'AI', 'Explain a severity prediction', { body: { disaster_type: 'flood', rainfall_mm: 220, water_level_m: 2.4, affected_people: 1500, injured: 10 } }),
  E('post', '/ml/classify', 'AI', 'NLP classification (English or Tamil)', { body: { text: 'வேளச்சேரியில் 10 பேர் வெள்ளத்தில் சிக்கியுள்ளோம், உதவி தேவை' } }),
  E('post', '/simulation/scenario', 'Simulation', 'Inject a scenario (or "live" for real weather)', { auth: true, body: { type: 'cyclone', intensity: 0.85 } }),
  E('get', '/health', 'System', 'Health, database modes, ML and connectivity status'),
];

export function buildOpenApi() {
  const paths = {};
  for (const e of endpoints) {
    const params = [...e.path.matchAll(/{(\w+)}/g)].map((m) => ({ name: m[1], in: 'path', required: true, schema: { type: m[1] === 'dataset' ? 'string' : 'integer' } }));
    (paths[e.path] ||= {})[e.method] = {
      tags: [e.tag],
      summary: e.summary,
      ...(params.length ? { parameters: params } : {}),
      ...(e.auth ? { security: [{ bearer: [] }] } : {}),
      ...(e.body ? { requestBody: { content: { 'application/json': { example: e.body } } } } : {}),
      responses: { 200: { description: 'OK' }, 201: { description: 'Created' }, 400: { description: 'Validation failed' }, 401: { description: 'Not authenticated' }, 403: { description: 'Wrong role' } },
    };
  }
  return {
    openapi: '3.0.3',
    info: {
      title: 'AI Disaster Response Platform – API',
      version: '2.0.0',
      description: 'REST API of the control-room server. Real-time updates are pushed over Socket.IO. Log in with POST /auth/login, then click "Authorize" and paste the token.',
    },
    servers: [{ url: '/api' }],
    components: { securitySchemes: { bearer: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } } },
    paths,
  };
}

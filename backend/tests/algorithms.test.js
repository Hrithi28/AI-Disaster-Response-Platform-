import assert from 'node:assert/strict';
import { test } from 'node:test';
import { haversineKm, planRoute, pointAlong } from '../src/services/geo.js';
import { assignWithSkip, hungarian } from '../src/services/hungarian.js';
import { PriorityQueue, incidentPriority } from '../src/services/priorityQueue.js';

test('hungarian finds the optimal assignment', () => {
  const cost = [
    [4, 1, 3],
    [2, 0, 5],
    [3, 2, 2],
  ];
  const a = hungarian(cost);
  const total = a.reduce((s, j, i) => s + cost[i][j], 0);
  assert.equal(total, 5); // 1 + 2 + 2
  assert.equal(new Set(a).size, 3);
});

test('assignWithSkip leaves the least urgent slot unfilled when units are scarce', () => {
  // 3 demand slots, 2 units; slot 2 is least urgent (lowest skip cost)
  const cost = [
    [10, 20],
    [15, 5],
    [1, 1],
  ];
  const a = assignWithSkip(cost, [5000, 4000, 600]);
  assert.equal(a[2], -1);
  assert.deepEqual([a[0], a[1]].sort(), [0, 1]);
});

test('priority queue pops highest priority first', () => {
  const pq = new PriorityQueue();
  [30, 90, 10, 70, 50].forEach((p) => pq.push({ priority: p }));
  assert.deepEqual(pq.drain().map((x) => x.priority), [90, 70, 50, 30, 10]);
});

test('incident priority grows with waiting time (ageing) and casualties', () => {
  const now = Date.now();
  const base = { severity_score: 50, injured: 0, report_count: 1, created_at: new Date(now).toISOString() };
  const old = { ...base, created_at: new Date(now - 20 * 60000).toISOString() };
  const hurt = { ...base, injured: 40 };
  assert.ok(incidentPriority(old, now) > incidentPriority(base, now));
  assert.ok(incidentPriority(hurt, now) > incidentPriority(base, now));
});

test('haversine distance Chennai Central → Guindy ≈ 9 km', () => {
  const d = haversineKm({ lat: 13.0827, lng: 80.2707 }, { lat: 13.0067, lng: 80.2206 });
  assert.ok(d > 8 && d < 11, `got ${d}`);
});

test('A* route detours around a critical hazard zone, boats go straight', () => {
  const from = { lat: 13.0, lng: 80.15 };
  const to = { lat: 13.0, lng: 80.3 };
  const zones = [{ center: { lat: 13.0, lng: 80.225 }, radius_km: 3, risk_level: 'critical' }];
  const road = planRoute(from, to, zones, 'ambulance');
  const boat = planRoute(from, to, zones, 'rescue_boat');
  assert.equal(road.detour, true);
  assert.equal(boat.detour, false);
  assert.ok(road.distanceKm > boat.distanceKm);
  for (const p of road.path.slice(1, -1)) assert.ok(haversineKm(p, zones[0].center) > 2.5, 'waypoint inside hazard');
});

test('pointAlong interpolates along a polyline', () => {
  const path = [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }];
  const mid = pointAlong(path, 0.5);
  assert.ok(Math.abs(mid.lng - 0.5) < 1e-6);
});

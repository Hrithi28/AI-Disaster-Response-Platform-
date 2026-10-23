// Small in-process runtime state (things that are recomputed, not stored).
import { config } from '../config.js';

export const state = {
  zones: [],
  scenario: { type: 'flood', name: 'Northeast Monsoon – Urban Flooding', intensity: 0.55, startedAt: new Date().toISOString() },
  sim: { enabled: config.simEnabled, speed: config.simSpeed, ticks: 0 },
  autoDispatch: config.autoDispatch,
  lastOptimisation: null,
};

// Domain event bus (Observer pattern). Services publish what happened; other
// services (SMS replies, cloud sync, web push, audit) subscribe without the
// publishers knowing about them.
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

export const EVENTS = {
  INCIDENT_CREATED: 'incident.created',
  INCIDENT_UPDATED: 'incident.updated',
  INCIDENT_RESOLVED: 'incident.resolved',
  DISPATCH_CREATED: 'dispatch.created',
  DISPATCH_UPDATED: 'dispatch.updated',
  ALERT_CREATED: 'alert.created',
  CAMP_UPDATED: 'camp.updated',
};

/** Fire-and-forget publish: subscriber errors never break the caller. */
export function publish(event, payload) {
  for (const fn of bus.listeners(event)) {
    Promise.resolve()
      .then(() => fn(payload))
      .catch((e) => console.error(`[events] ${event} handler failed:`, e.message));
  }
}

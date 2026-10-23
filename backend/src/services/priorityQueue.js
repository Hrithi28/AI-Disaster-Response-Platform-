// Binary max-heap priority queue used by the Priority Queue Scheduler.
export class PriorityQueue {
  constructor(compare = (a, b) => b.priority - a.priority) {
    this.heap = [];
    this.compare = compare; // < 0 means a should come before b
  }
  get size() {
    return this.heap.length;
  }
  push(item) {
    const h = this.heap;
    h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.compare(h[i], h[p]) >= 0) break;
      [h[i], h[p]] = [h[p], h[i]];
      i = p;
    }
    return this;
  }
  peek() {
    return this.heap[0];
  }
  pop() {
    const h = this.heap;
    if (!h.length) return undefined;
    const top = h[0];
    const last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let best = i;
        if (l < h.length && this.compare(h[l], h[best]) < 0) best = l;
        if (r < h.length && this.compare(h[r], h[best]) < 0) best = r;
        if (best === i) break;
        [h[i], h[best]] = [h[best], h[i]];
        i = best;
      }
    }
    return top;
  }
  drain() {
    const out = [];
    while (this.size) out.push(this.pop());
    return out;
  }
}

/**
 * Dynamic priority for an incident (0..~140).
 *  - AI severity score (0-100) is the base
 *  - ageing: +0.5 per waiting minute (max +20) so nothing starves
 *  - casualties: up to +15 for injured people
 *  - crowd signal: up to +5 for many independent reports
 */
export function incidentPriority(incident, now = Date.now(), simSpeed = 1) {
  const waitedMin = ((now - new Date(incident.created_at).getTime()) / 60000) * simSpeed;
  const ageing = Math.min(20, Math.max(0, waitedMin) * 0.5);
  const casualty = Math.min(15, Math.log1p(incident.injured || 0) * 3);
  const crowd = Math.min(5, Math.log1p(incident.report_count || 1));
  return +(Number(incident.severity_score) + ageing + casualty + crowd).toFixed(2);
}

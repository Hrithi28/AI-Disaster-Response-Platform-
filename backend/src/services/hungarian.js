// Hungarian (Kuhn–Munkres) algorithm, O(n^3).
// Solves the minimum-cost assignment for a square cost matrix.
// Returns `assign` where assign[row] = column.
export function hungarian(cost) {
  const n = cost.length;
  if (!n) return [];
  const INF = Number.POSITIVE_INFINITY;
  const u = new Array(n + 1).fill(0);
  const v = new Array(n + 1).fill(0);
  const p = new Array(n + 1).fill(0); // p[col] = row matched to col (1-indexed)
  const way = new Array(n + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(n + 1).fill(INF);
    const used = new Array(n + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF;
      let j1 = 0;
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue;
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
        if (cur < minv[j]) {
          minv[j] = cur;
          way[j] = j0;
        }
        if (minv[j] < delta) {
          delta = minv[j];
          j1 = j;
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta;
          v[j] -= delta;
        } else minv[j] -= delta;
      }
      j0 = j1;
    } while (p[j0] !== 0);
    do {
      const j1 = way[j0];
      p[j0] = p[j1];
      j0 = j1;
    } while (j0);
  }
  const assign = new Array(n).fill(-1);
  for (let j = 1; j <= n; j++) if (p[j]) assign[p[j] - 1] = j - 1;
  return assign;
}

/**
 * Rectangular assignment with an "unassigned" option.
 * rows = demand slots, cols = resources. skipCost[i] is the price of leaving
 * slot i unfilled (high for urgent incidents), so when resources are scarce
 * the least urgent slots are the ones left waiting.
 */
export function assignWithSkip(costRows, skipCost) {
  const n = costRows.length;
  const m = n ? costRows[0].length : 0;
  const size = n + m;
  const M = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => {
      if (i < n && j < m) return costRows[i][j];
      if (i < n && j >= m) return j - m === i ? skipCost[i] : 1e12; // own dummy column
      return 0; // dummy rows absorb unused resources
    }),
  );
  const a = hungarian(M);
  return a.slice(0, n).map((j) => (j < m ? j : -1));
}

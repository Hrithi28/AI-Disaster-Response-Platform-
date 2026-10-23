// Idempotency for store-and-forward clients. The offline field app tags every
// queued request with an "x-op-id" header; if the same operation is replayed
// after the connection returns (e.g. it was actually delivered before the
// signal dropped), the original response is returned instead of applying it twice.
import { json, one, query } from '../db/postgres.js';

export function idempotent(req, res, next) {
  const opId = req.headers['x-op-id'];
  if (!opId || req.method === 'GET') return next();
  one(`SELECT response FROM processed_ops WHERE op_id=$1`, [opId])
    .then((hit) => {
      if (hit) {
        res.setHeader('x-idempotent-replay', 'true');
        return res.status(200).json(hit.response);
      }
      const original = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode < 400) query(`INSERT INTO processed_ops (op_id, response) VALUES ($1,$2)`, [opId, json(body)]).catch(() => {});
        return original(body);
      };
      next();
    })
    .catch(next);
}

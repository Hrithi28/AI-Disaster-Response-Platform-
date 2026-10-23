import { publicKey, sendTo, subscribe as save } from '../services/push.js';

export const key = (_req, res) => res.json({ publicKey: publicKey() });

export async function subscribe(req, res) {
  const sub = req.body;
  if (!sub?.endpoint || !sub?.keys) return res.status(400).json({ error: 'Invalid subscription' });
  await save(req.user, sub);
  res.status(201).json({ ok: true });
}

export async function test(req, res) {
  res.json(await sendTo('user_id=$1', [req.user.id], { title: 'DRP test notification', body: 'Push notifications are working on this device.', url: '/' }));
}

// CSV exports and a PDF situation report ("sitrep") for officials.
import PDFDocument from 'pdfkit';
import { config } from '../config.js';
import { query } from '../db/postgres.js';
import { status as connectivity } from '../services/connectivity.js';
import { priorityQueue } from '../services/allocation.js';
import { listCamps } from '../services/camps.js';

// Helvetica only covers Latin-1: map a few symbols and drop the rest (e.g. Tamil) from the PDF
const pdfSafe = (t) => String(t ?? '').replace(/σ/g, ' SD').replace(/[–—]/g, '-').replace(/[^\x00-\xFF·]/g, '');

const DATASETS = {
  incidents: () => query(`SELECT id, title, disaster_type, locality, lat, lng, status, severity, severity_label, severity_score, affected_people, injured, report_count, source, actual_severity, created_at, resolved_at FROM incidents ORDER BY id`),
  dispatches: () => query(`SELECT d.id, d.incident_id, i.title AS incident, r.name AS unit, r.type, d.method, d.route_engine, d.distance_km, d.eta_min, d.status, d.created_at, d.arrived_at, d.completed_at FROM dispatches d JOIN incidents i ON i.id=d.incident_id JOIN resources r ON r.id=d.resource_id ORDER BY d.id`),
  audit: () => query(`SELECT id, created_at, user_email, role, action, entity, entity_id, status, ip FROM audit_logs ORDER BY id DESC LIMIT 5000`),
  inventory: () => query(`SELECT c.name AS camp, i.item, i.category, i.quantity, i.unit, i.min_level, CASE WHEN i.quantity < i.min_level THEN 'LOW' ELSE 'OK' END AS stock_status FROM inventory i JOIN camps c ON c.id=i.camp_id ORDER BY c.name, i.item`),
  sms: () => query(`SELECT id, created_at, direction, channel, phone, body, status, incident_id FROM sms_messages ORDER BY id`),
};

const cell = (v) => {
  if (v == null) return '';
  const s = v instanceof Date ? v.toISOString() : typeof v === 'object' ? JSON.stringify(v) : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function csv(req, res) {
  const fn = DATASETS[req.params.dataset];
  if (!fn) return res.status(404).json({ error: `Unknown dataset. Use one of: ${Object.keys(DATASETS).join(', ')}` });
  const rows = await fn();
  const cols = rows.length ? Object.keys(rows[0]) : [];
  const body = [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
  res.setHeader('content-type', 'text/csv; charset=utf-8');
  res.setHeader('content-disposition', `attachment; filename="drp-${req.params.dataset}-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send('﻿' + body); // BOM so Excel opens UTF-8 correctly
}

export async function sitrep(_req, res) {
  const queue = (await priorityQueue()).slice(0, 25);
  const [{ n: resolved }] = await query(`SELECT COUNT(*)::int AS n FROM incidents WHERE status='resolved'`);
  const resources = await query(`SELECT type, status FROM resources`);
  const camps = await listCamps();
  const alerts = await query(`SELECT * FROM alerts WHERE level <> 'info' ORDER BY id DESC LIMIT 8`);
  const conn = connectivity();

  const doc = new PDFDocument({ size: 'A4', margin: 40 });
  res.setHeader('content-type', 'application/pdf');
  res.setHeader('content-disposition', `attachment; filename="DRP-sitrep-${new Date().toISOString().slice(0, 16).replace(':', '')}.pdf"`);
  doc.pipe(res);

  doc.rect(0, 0, doc.page.width, 70).fill('#0b1120');
  doc.fillColor('#ffffff').fontSize(18).text('SITUATION REPORT', 40, 20);
  doc.fontSize(9).fillColor('#cbd5e1').text(`AI-Powered Disaster Response Platform · ${config.region.name} · Node ${config.nodeId}`, 40, 44);
  doc.fillColor('#111827').moveDown(3);
  doc.fontSize(9).fillColor('#475569').text(`Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST · Connectivity: ${conn.mode}`, 40, 82);

  const busy = resources.filter((r) => !['available', 'offline'].includes(r.status)).length;
  const kpis = [
    ['Active incidents', queue.length ? (await query(`SELECT COUNT(*)::int AS n FROM incidents WHERE status<>'resolved'`))[0].n : 0],
    ['Severe / critical', queue.filter((q) => q.severity >= 4).length],
    ['People affected', queue.reduce((s, q) => s + q.affected_people, 0).toLocaleString('en-IN')],
    ['Units deployed', `${busy}/${resources.length}`],
    ['Resolved', resolved],
    ['Camp occupancy', `${camps.reduce((s, c) => s + c.occupancy, 0)}/${camps.reduce((s, c) => s + c.capacity, 0)}`],
  ];
  let x = 40;
  const y = 104;
  for (const [label, val] of kpis) {
    doc.roundedRect(x, y, 82, 46, 4).fill('#f1f5f9');
    doc.fillColor('#0f172a').fontSize(14).text(String(val), x + 6, y + 8, { width: 72 });
    doc.fillColor('#64748b').fontSize(7).text(label.toUpperCase(), x + 6, y + 30, { width: 72 });
    x += 87;
  }

  doc.fillColor('#0f172a').fontSize(12).text('Priority queue (top 25)', 40, 166);
  const head = ['#', 'Incident', 'Locality', 'Sev', 'Prio', 'Status', 'Needs'];
  const widths = [22, 190, 80, 30, 34, 60, 99];
  let ty = 184;
  const row = (vals, bold) => {
    let cx = 40;
    doc.fontSize(7.5).fillColor(bold ? '#334155' : '#0f172a').font(bold ? 'Helvetica-Bold' : 'Helvetica');
    vals.forEach((v, i) => {
      doc.text(pdfSafe(v), cx, ty, { width: widths[i] - 4, height: 10, ellipsis: true });
      cx += widths[i];
    });
    ty += 13;
  };
  row(head, true);
  queue.forEach((q, i) => {
    if (ty > 740) {
      doc.addPage();
      ty = 50;
    }
    row([i + 1, q.title, q.locality, q.severity, Math.round(q.priority), q.status.replace('_', ' '), Object.entries(q.outstanding || {}).map(([t, n]) => `${n} ${t.replace('_', ' ')}`).join(', ') || 'covered']);
  });

  doc.font('Helvetica');
  if (ty > 620) {
    doc.addPage();
    ty = 50;
  }
  doc.fontSize(12).fillColor('#0f172a').text('Relief camps', 40, ty + 12);
  ty += 30;
  for (const c of camps) {
    doc.fontSize(8).fillColor('#0f172a').text(pdfSafe(`${c.name} (${c.locality || ''}) – ${c.occupancy}/${c.capacity} occupied, ${c.status}${c.low_stock.length ? ` · LOW: ${c.low_stock.join(', ')}` : ''}`), 40, ty, { width: 515 });
    ty += 12;
  }
  doc.fontSize(12).text('Recent warnings', 40, ty + 12);
  ty += 30;
  for (const a of alerts) {
    if (ty > 780) break;
    doc.fontSize(8).fillColor(a.level === 'critical' ? '#be123c' : '#b45309').text(pdfSafe(`[${a.level.toUpperCase()}] ${a.title}: ${a.message}`), 40, ty, { width: 515 });
    ty = doc.y + 4;
  }
  doc.end();
}

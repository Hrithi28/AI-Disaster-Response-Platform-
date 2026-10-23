// Socket.IO hub. Every state change in the platform is broadcast so the
// command dashboard, field app and citizen page stay in sync without polling.
import jwt from 'jsonwebtoken';
import { Server } from 'socket.io';
import { config } from '../config.js';

let io = null;

export function initRealtime(httpServer) {
  io = new Server(httpServer, { cors: { origin: config.corsOrigin } });
  io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token;
    try {
      if (token) {
        const user = jwt.verify(token, config.jwtSecret);
        socket.data.user = user;
        socket.join(`role:${user.role}`);
        if (user.resource_id) socket.join(`resource:${user.resource_id}`);
      }
    } catch {
      /* anonymous viewer (citizen) */
    }
    socket.on('track:incident', (id) => socket.join(`incident:${id}`));
  });
  return io;
}

export function emit(event, payload, room) {
  if (!io) return;
  (room ? io.to(room) : io).emit(event, payload);
}

export const connectedClients = () => (io ? io.engine.clientsCount : 0);

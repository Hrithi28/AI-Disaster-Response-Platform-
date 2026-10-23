import { io } from 'socket.io-client';
import { getToken } from './api';

let socket;
export function getSocket() {
  if (!socket) socket = io({ auth: { token: getToken() }, transports: ['websocket', 'polling'] });
  return socket;
}
export function resetSocket() {
  if (socket) socket.disconnect();
  socket = null;
}

// server.js
// Servidor HTTP + WebSocket para el chat colaborativo

const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const WebSocket = require('ws');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ---- Archivos de datos (base de datos interna sencilla) ----
const DATA_DIR = path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const DATA_FILE = path.join(DATA_DIR, 'messages.json');

let messages = [];           // Historial en memoria
let nextUserId = 1;          // Para generar Usuario_1, Usuario_2...
const clients = new Map();   // Map<ws, { id, username }>

// Carga mensajes guardados al iniciar
function loadMessages() {
  try {
    if (!fs.existsSync(DATA_FILE)) {
      fs.writeFileSync(DATA_FILE, '[]', 'utf8');
      messages = [];
      return;
    }
    const raw = fs.readFileSync(DATA_FILE, 'utf8');
    messages = JSON.parse(raw);
  } catch (err) {
    console.error('No se pudo leer messages.json, iniciando vacío:', err);
    messages = [];
  }
}

// Guarda mensajes en el archivo JSON
function persistMessages() {
  fs.writeFile(DATA_FILE, JSON.stringify(messages, null, 2), (err) => {
    if (err) console.error('Error guardando messages.json:', err);
  });
}

// ---- Configuración de Express ----
app.use(express.static(path.join(__dirname, 'public')));

// Puedes agregar endpoints REST más adelante si lo necesitas
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', onlineUsers: clients.size });
});

const server = http.createServer(app);

// ---- WebSocket Server ----
const wss = new WebSocket.Server({ server });

// Función helper para enviar a todos los clientes
function broadcast(payload, exceptWs = null) {
  const data = JSON.stringify(payload);
  for (const ws of wss.clients) {
    if (ws.readyState === WebSocket.OPEN && ws !== exceptWs) {
      ws.send(data);
    }
  }
}

// Manejo de nuevas conexiones WebSocket
wss.on('connection', (ws) => {
  const userId = nextUserId++;
  const username = `Usuario_${userId}`;
  const user = { id: userId, username };

  // Guardamos el usuario asociado a este socket
  clients.set(ws, user);

  console.log(`Nuevo usuario conectado: ${username}`);

  // Enviamos al nuevo usuario su estado inicial:
  // - Su propio usuario
  // - Lista de usuarios conectados
  // - Historial de mensajes
  const currentUsers = Array.from(clients.values());
  ws.send(JSON.stringify({
    type: 'init',
    payload: {
      self: user,
      users: currentUsers,
      messages,
    },
  }));

  // Notificamos a los demás que alguien se unió
  broadcast({
    type: 'user_joined',
    payload: {
      user,
      onlineCount: clients.size,
    },
  }, ws);

  // Cuando el cliente envía algo
  ws.on('message', (rawMessage) => {
    let data;
    try {
      data = JSON.parse(rawMessage);
    } catch (err) {
      console.error('Mensaje no es JSON válido:', rawMessage);
      return;
    }

    if (data.type === 'chat_message') {
      const text = String(data.payload?.text || '').trim();
      if (!text) return;

      const now = new Date().toISOString();
      const userInfo = clients.get(ws);

      const chatMessage = {
        id: uuidv4(),
        userId: userInfo.id,
        username: userInfo.username,
        text,
        timestamp: now,
      };

      messages.push(chatMessage);
      // Limitar historial a los últimos 100
      if (messages.length > 100) {
        messages.shift();
      }
      persistMessages();

      broadcast({
        type: 'chat_message',
        payload: chatMessage,
      });
    }

    if (data.type === 'change_username') {
      const newName = String(data.payload?.username || '').trim().slice(0, 20);
      if (!newName) return;

      const userInfo = clients.get(ws);
      const oldName = userInfo.username;
      userInfo.username = newName;
      clients.set(ws, userInfo);

      broadcast({
        type: 'username_changed',
        payload: {
          userId: userInfo.id,
          oldName,
          newName,
        },
      });
    }
  });

  // Cuando el cliente se desconecta
  ws.on('close', () => {
    const userInfo = clients.get(ws);
    clients.delete(ws);

    if (userInfo) {
      console.log(`Usuario desconectado: ${userInfo.username}`);
      broadcast({
        type: 'user_left',
        payload: {
          userId: userInfo.id,
          username: userInfo.username,
          onlineCount: clients.size,
        },
      });
    }
  });
});

// Cargar historial al iniciar y arrancar el servidor
loadMessages();

server.listen(PORT, () => {
  console.log(`Servidor HTTP + WebSocket escuchando en http://localhost:${PORT}`);
});

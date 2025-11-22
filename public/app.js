// app.js
// Cliente SPA: maneja WebSocket, estado y render de la interfaz

const state = {
  self: null,    // { id, username }
  users: [],     // [{ id, username }]
  messages: [],  // [{ id, userId, username, text, timestamp }]
};

const messagesContainer = document.getElementById('messages');
const usersList = document.getElementById('users-list');
const selfUsernameSpan = document.getElementById('self-username');
const onlineCountSpan = document.getElementById('online-count');
const usernameInput = document.getElementById('username-input');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');

// ---- Conexión WebSocket ----
const wsProtocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
const ws = new WebSocket(`${wsProtocol}://${window.location.host}`);

// Helpers de render
function formatTime(iso) {
  const date = new Date(iso);
  return date.toLocaleTimeString('es-BO', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function renderUsers() {
  usersList.innerHTML = '';
  state.users.forEach((user) => {
    const li = document.createElement('li');
    li.textContent =
      user.id === state.self?.id
        ? `${user.username} (tú)`
        : user.username;
    usersList.appendChild(li);
  });
  onlineCountSpan.textContent = `${state.users.length} conectados`;
}

function renderMessages() {
  messagesContainer.innerHTML = '';
  state.messages.forEach((msg) => {
    const div = document.createElement('div');
    div.classList.add('message');
    if (msg.system) {
      div.classList.add('system');
    }
    if (msg.userId === state.self?.id && !msg.system) {
      div.classList.add('self');
    }

    const meta = document.createElement('div');
    meta.classList.add('message-meta');

    if (msg.system) {
      meta.textContent = `[${formatTime(msg.timestamp)}] Sistema`;
    } else {
      meta.textContent = `[${formatTime(msg.timestamp)}] ${msg.username}`;
    }

    const text = document.createElement('div');
    text.classList.add('message-text');
    text.textContent = msg.text;

    div.appendChild(meta);
    div.appendChild(text);
    messagesContainer.appendChild(div);
  });

  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

function addSystemMessage(text) {
  const systemMessage = {
    id: `system-${Date.now()}`,
    userId: null,
    username: 'Sistema',
    text,
    timestamp: new Date().toISOString(),
    system: true,
  };
  state.messages.push(systemMessage);
  renderMessages();
}

// ---- Eventos WebSocket ----
ws.addEventListener('open', () => {
  console.log('Conectado al servidor WebSocket');
});

ws.addEventListener('message', (event) => {
  const data = JSON.parse(event.data);

  if (data.type === 'init') {
    const { self, users, messages } = data.payload;
    state.self = self;
    state.users = users;
    state.messages = messages;
    selfUsernameSpan.textContent = self.username;
    renderUsers();
    renderMessages();
    return;
  }

  if (data.type === 'chat_message') {
    state.messages.push(data.payload);
    renderMessages();
    return;
  }

  if (data.type === 'user_joined') {
    state.users.push(data.payload.user);
    renderUsers();
    addSystemMessage(`${data.payload.user.username} se unió al chat.`);
    return;
  }

  if (data.type === 'user_left') {
    state.users = state.users.filter(
      (u) => u.id !== data.payload.userId
    );
    renderUsers();
    addSystemMessage(`${data.payload.username} salió del chat.`);
    return;
  }

  if (data.type === 'username_changed') {
    state.users = state.users.map((u) =>
      u.id === data.payload.userId
        ? { ...u, username: data.payload.newName }
        : u
    );
    if (state.self && state.self.id === data.payload.userId) {
      state.self.username = data.payload.newName;
      selfUsernameSpan.textContent = state.self.username;
    }
    renderUsers();
    addSystemMessage(
      `${data.payload.oldName} ahora es ${data.payload.newName}.`
    );
  }
});

ws.addEventListener('close', () => {
  addSystemMessage('Conexión con el servidor cerrada.');
});

// ---- Eventos de la UI ----
messageForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = messageInput.value.trim();
  if (!text || ws.readyState !== WebSocket.OPEN) return;

  ws.send(
    JSON.stringify({
      type: 'chat_message',
      payload: { text },
    })
  );

  messageInput.value = '';
  messageInput.focus();
});

usernameInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const newName = usernameInput.value.trim();
    if (!newName || ws.readyState !== WebSocket.OPEN) return;

    ws.send(
      JSON.stringify({
        type: 'change_username',
        payload: { username: newName },
      })
    );

    usernameInput.value = '';
  }
});

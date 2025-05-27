// server/server.js

require('dotenv').config();             // Carga MONGODB_URI y OPENAI_API_KEY desde .env
const express = require('express');
const http = require('http');
const cors = require('cors');
const mongoose = require('mongoose');
const { Server } = require('socket.io');
const { OpenAI } = require('openai');

// —–– Configuración OpenAI —––––––––––––––––––––––––––––––––––––––––––––
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// —–– Conexión a MongoDB —––––––––––––––––––––––––––––––––––––––––––––––––
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('🗄️  MongoDB conectado'))
  .catch(err => console.error('❌ Error MongoDB:', err));

// —–– Esquema y modelo de sesión de chat —––––––––––––––––––––––––––––––––––
const ChatSessionSchema = new mongoose.Schema({
  anonId1: String,
  anonId2: String,
  emotion: String,
  startedAt: { type: Date, default: Date.now },
  messages: [
    {
      fromAnonId: String,
      message: String,
      timestamp: Date,
      voice: String,
      doodle: String
    }
  ]
});
const ChatSession = mongoose.model('ChatSession', ChatSessionSchema);

// —–– Utilidades en memoria —––––––––––––––––––––––––––––––––––––––––––––––
function generateAnonId() {
  return 'User' + Math.floor(1000 + Math.random() * 9000);
}
const queues = {};            // emotion → [ sockets... ]
const blacklist = ['idiota','estúpido','imbécil','pendejo','puta'];
const roomSessionMap = {};    // room → chatSessionId

// —–– Temporizadores de inactividad —––––––––––––––––––––––––––––––––––––––
const inactivityTimers = new Map();
// Para pruebas: 5s; en producción vuelve a 30000
const INACTIVITY_MS = 5_000;

/**
 * Envía un mensaje del asistente tras INACTIVITY_MS de silencio.
 * Si la API devuelve un error de cuota, simplemente lo registramos.
 */
async function sendAssistantPrompt(room) {
  console.log(`[IA] Inactividad en ${room}, generando sugerencia…`);
  try {
    const sessionId = roomSessionMap[room];
    if (!sessionId) return;
    const session = await ChatSession.findById(sessionId).lean();
    if (!session) return;

    // Prepara últimos 10 mensajes
    const msgs = session.messages.slice(-10).map(m => ({
      role: m.fromAnonId === session.anonId1 ? 'user' : 'assistant',
      content: m.message || '[voz/dibujo]'
    }));
    const prompt = [
      { role: 'system', content: 'Eres un asistente empático que fomenta la conversación.' },
      ...msgs,
      { role: 'assistant', content: '¿Qué pregunta podrías hacer para ayudar a tu compañero a expresarse mejor?' }
    ];

    const completion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: prompt,
      max_tokens: 60
    });
    const text = completion.choices[0].message.content.trim();

    io.to(room).emit('assistant_message', {
      message: text,
      timestamp: new Date().toISOString()
    });
    console.log(`[IA] Enviado a ${room}: "${text}"`);
  } catch (err) {
    if (err.code === 'insufficient_quota' || err.status === 429) {
      console.warn('⚠️ Asistente AI saltado por falta de cuota.');
    } else {
      console.error('❌ Error asistente AI:', err);
    }
  }
}

/** Reinicia el temporizador de inactividad para la sala */
function resetInactivityTimer(room) {
  clearTimeout(inactivityTimers.get(room));
  console.log(`[IA] Reset temporizador para ${room}`);
  inactivityTimers.set(room, setTimeout(() => sendAssistantPrompt(room), INACTIVITY_MS));
}

const app = express();
app.use(cors());
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET','POST'] }
});

io.on('connection', socket => {
  // Asignar anonId
  socket.anonId = generateAnonId();
  socket.emit('init', { anonId: socket.anonId });
  console.log(`🔌 Conectado: ${socket.anonId}`);

  // ➊ Emparejar por emoción
  socket.on('join_emotion', async emotion => {
    socket.emotion = emotion;
    queues[emotion] = queues[emotion] || [];
    const q = queues[emotion];

    if (q.length) {
      const peer = q.shift();
      const room = `${emotion}-${socket.id}-${peer.id}`;
      socket.join(room); peer.join(room);

      // Crear sesión en BD
      const chat = new ChatSession({
        anonId1: socket.anonId,
        anonId2: peer.anonId,
        emotion
      });
      const saved = await chat.save();
      socket.chatSessionId = peer.chatSessionId = saved._id;
      socket.currentRoom = peer.currentRoom = room;
      roomSessionMap[room] = saved._id;

      socket.emit('matched', { peerAnonId: peer.anonId, room });
      peer.emit('matched', { peerAnonId: socket.anonId, room });
      console.log(`🎉 Emparejados ${socket.anonId} ↔ ${peer.anonId}`);

      resetInactivityTimer(room);
    } else {
      q.push(socket);
      socket.emit('waiting');
      console.log(`⏳ ${socket.anonId} en cola para “${emotion}”`);
    }
  });

  // ➋ Mensaje de texto
  socket.on('chat_message', async ({ room, message }) => {
    const bad = blacklist.find(w => message.toLowerCase().includes(w));
    if (bad) {
      socket.emit('message_blocked', { reason: `Ofensiva: "${bad}"` });
      return;
    }
    socket.to(room).emit('chat_message', {
      fromAnonId: socket.anonId,
      message,
      timestamp: new Date().toISOString()
    });
    if (socket.chatSessionId) {
      await ChatSession.updateOne(
        { _id: socket.chatSessionId },
        { $push: { messages: {
          fromAnonId: socket.anonId,
          message,
          timestamp: new Date(),
          voice: null,
          doodle: null
        } } }
      );
    }
    resetInactivityTimer(room);
  });

  // ➏ Nota de voz
  socket.on('voice_note', ({ room, audioBlob }) => {
    socket.to(room).emit('voice_note', { fromAnonId: socket.anonId, audioBlob });
    resetInactivityTimer(room);
  });

  // ➐ Doodle
  socket.on('doodle', ({ room, dataUrl }) => {
    socket.to(room).emit('doodle', { fromAnonId: socket.anonId, dataUrl });
    resetInactivityTimer(room);
  });

  // ➌ Reportar
  socket.on('report_user', ({ room }) => {
    const clients = Array.from(io.sockets.adapter.rooms.get(room) || []);
    const otherId = clients.find(id => id !== socket.id);
    if (otherId) {
      io.sockets.sockets.get(otherId).leave(room);
      socket.emit('user_reported');
      io.to(otherId).emit('got_reported');
      io.to(room).emit('peer_left', { anonId: socket.anonId });
      clearTimeout(inactivityTimers.get(room));
      console.log(`🚩 ${socket.anonId} reportó a otro en ${room}`);
    }
  });

  // ➍ Salir sala
  socket.on('leave_room', room => {
    if (socket.currentRoom === room) {
      socket.leave(room);
      socket.to(room).emit('peer_left', { anonId: socket.anonId });
      clearTimeout(inactivityTimers.get(room));
      delete socket.currentRoom;
    }
  });

  // ➎ Desconexión
  socket.on('disconnect', () => {
    const room = socket.currentRoom;
    if (room) {
      socket.to(room).emit('peer_left', { anonId: socket.anonId });
      clearTimeout(inactivityTimers.get(room));
    }
    const e = socket.emotion;
    if (queues[e]) queues[e] = queues[e].filter(s => s.id !== socket.id);
    console.log(`❌ Desconectado: ${socket.anonId}`);
  });
});

// Rutas de estadísticas (opcional)
app.get('/stats/sessions', async (_, res) => {
  const total = await ChatSession.countDocuments();
  res.json({ totalSessions: total });
});
app.get('/stats/messages', async (_, res) => {
  const [r] = await ChatSession.aggregate([
    { $unwind: '$messages' },
    { $count: 'totalMessages' }
  ]);
  res.json({ totalMessages: r?.totalMessages || 0 });
});
app.get('/stats/by-emotion', async (_, res) => {
  const b = await ChatSession.aggregate([
    { $group: { _id: '$emotion', count: { $sum: 1 } } }
  ]);
  const stats = b.reduce((o, e) => { o[e._id] = e.count; return o; }, {});
  res.json({ sessionsByEmotion: stats });
});

// Iniciar servidor
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

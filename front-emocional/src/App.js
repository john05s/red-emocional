// src/App.js
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { ToastContainer, toast } from 'react-toastify';
import { motion, AnimatePresence } from 'framer-motion';
import Dashboard from './Dashboard';
import AudioPlayer from './AudioPlayer';
import 'react-toastify/dist/ReactToastify.css';
import './App.css';

// Conexión al backend
const API_URL = process.env.REACT_APP_API_URL;
const socket = io(API_URL, { transports: ['websocket','polling'] });


// Emociones disponibles
const emotions = [
  { label: 'Ansiedad', emoji: '😰' },
  { label: 'Soledad',  emoji: '😔' },
  { label: 'Alegría',  emoji: '😊' },
  { label: 'Esperanza',emoji: '🌱' },
  { label: 'Estrés',   emoji: '😣' },
  { label: 'Tristeza', emoji: '😢' },
  { label: 'Motivación', emoji: '💪' },
  { label: 'Calma',    emoji: '🧘‍♂️' }
];

// Tono de notificación
function playTone(freq = 440, duration = 0.15) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq, ctx.currentTime);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + duration);
  osc.stop(ctx.currentTime + duration);
}

// Genera URL para AudioPlayer
function getAudioSrc(audioBlob) {
  if (audioBlob instanceof Blob) {
    return URL.createObjectURL(audioBlob);
  }
  if (audioBlob instanceof ArrayBuffer || ArrayBuffer.isView(audioBlob)) {
    return URL.createObjectURL(new Blob([audioBlob], { type: 'audio/webm' }));
  }
  if (typeof audioBlob === 'string') {
    return audioBlob;
  }
  return '';
}

export default function App() {
  const [view, setView] = useState('chat');
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'light');

  const [myAnonId, setMyAnonId]     = useState('');
  // eslint-disable-next-line no-unused-vars
  const [peerAnonId, setPeerAnonId] = useState('');
  const [chatCount, setChatCount]   = useState(0);
  const [selectedEmotion, setSelectedEmotion] = useState(null);
  const [status, setStatus]         = useState('idle'); // idle, waiting, matched, ended
  const [room, setRoom]             = useState(null);
  const [messages, setMessages]     = useState([]);
  const [input, setInput]           = useState('');
  const messagesEndRef = useRef(null);

  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef(null);
  const [doodleMode, setDoodleMode]   = useState(false);
  const canvasRef = useRef(null);

  // Aplica tema
  useEffect(() => {
    document.body.dataset.theme = theme;
    localStorage.setItem('theme', theme);
  }, [theme]);

  // Socket.io listeners
  useEffect(() => {
    socket.on('init', ({ anonId }) => setMyAnonId(anonId));
    socket.on('waiting', () => setStatus('waiting'));
    socket.on('matched', ({ peerAnonId, room }) => {
      setPeerAnonId(peerAnonId);
      setRoom(room);
      setStatus('matched');
      setMessages([]);
      playTone(523, 0.2);
    });
    socket.on('chat_message', ({ fromAnonId, message, timestamp }) => {
      setMessages(ms => [...ms, { fromAnonId, message, timestamp }]);
      if (fromAnonId !== myAnonId) playTone(330, 0.1);
    });
    socket.on('voice_note', ({ fromAnonId, audioBlob }) => {
      setMessages(ms => [...ms, { fromAnonId, audioBlob }]);
      playTone(660, 0.1);
    });
    socket.on('doodle', ({ fromAnonId, dataUrl }) => {
      setMessages(ms => [...ms, { fromAnonId, doodle: dataUrl }]);
      playTone(440, 0.1);
    });
    socket.on('assistant_message', ({ message, timestamp }) => {
      setMessages(ms => [...ms, { fromAnonId: 'assistant', message, timestamp }]);
    });
    socket.on('peer_left', ({ anonId }) => {
      toast.info(`Tu compañero ${anonId} se desconectó.`);
      playTone(196, 0.3);
      endChat();
    });
    socket.on('message_blocked', ({ reason }) => toast.error(`Bloqueado: ${reason}`));
    socket.on('user_reported',  () => { toast.success('Usuario reportado.'); endChat(); });
    socket.on('got_reported',   () => { toast.warn('Has sido reportado.'); endChat(); });
    return () => socket.off();
  }, );

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSearch = () => {
    socket.emit('join_emotion', selectedEmotion);
    setStatus('waiting');
  };
  const sendMessage = e => {
    e.preventDefault();
    if (!input.trim()) return;
    socket.emit('chat_message', { room, message: input });
    setMessages(ms => [...ms, { fromAnonId: myAnonId, message: input, timestamp: new Date().toISOString() }]);
    setInput('');
  };
  // eslint-disable-next-line no-unused-vars
  const reportUser = () => socket.emit('report_user', { room });
  const endChat = () => {
    socket.emit('leave_room', room);
    setChatCount(c => c + 1);
    setStatus('ended');
  };
  const resetChat = () => {
    setSelectedEmotion(null);
    setPeerAnonId('');
    setRoom(null);
    setMessages([]);
    setInput('');
  };
  const toggleTheme = () => setTheme(t => t === 'light' ? 'dark' : 'light');

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      const chunks = [];
      mr.ondataavailable = e => chunks.push(e.data);
      mr.onstop = () => {
        const blob = new Blob(chunks, { type: 'audio/webm' });
        socket.emit('voice_note', { room, audioBlob: blob });
        setMessages(ms => [...ms, { fromAnonId: myAnonId, audioBlob: blob }]);
      };
      mr.start();
      setIsRecording(true);
    } catch {
      toast.error('No se pudo acceder al micrófono');
    }
  };
  const stopRecording = () => {
    mediaRecorderRef.current?.stop();
    setIsRecording(false);
  };

  const clearCanvas = () => {
    const ctx = canvasRef.current.getContext('2d');
    ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
  };
  const sendDoodle = () => {
    const dataUrl = canvasRef.current.toDataURL();
    socket.emit('doodle', { room, dataUrl });
    setMessages(ms => [...ms, { fromAnonId: myAnonId, doodle: dataUrl }]);
    setDoodleMode(false);
  };

  return (
    <div className="App">
      <ToastContainer position="top-right" autoClose={3000} hideProgressBar />

      <header>
        <h1>¿Hoy te sientes…?</h1>
        <div className="header-controls">
          {view === 'chat'
            ? <button className="nav-btn" onClick={() => setView('stats')}>Ver estadísticas</button>
            : <button className="nav-btn" onClick={() => setView('chat')}>Volver al chat</button>}
          <button className="theme-btn" onClick={toggleTheme}>
            {theme === 'light' ? '🌙 Oscuro' : '☀️ Claro'}
          </button>
        </div>
      </header>

      {view === 'stats' ? (
        <Dashboard />
      ) : (
        <>
          {myAnonId && <p className="your-id">Tu ID: <strong>{myAnonId}</strong></p>}

          <AnimatePresence exitBeforeEnter>
            {(status === 'idle' || status === 'waiting') && (
              <motion.div
                key="grid"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3 }}
              >
                <div className="grid">
                  {emotions.map(e => (
                    <div
                      key={e.label}
                      className={`card ${selectedEmotion === e.label ? 'selected' : ''}`}
                      onClick={() => { setSelectedEmotion(e.label); setStatus('idle'); }}
                      tabIndex={0}
                      role="button"
                      aria-pressed={selectedEmotion === e.label}
                    >
                      <span className="emoji">{e.emoji}</span>
                      <span className="label">{e.label}</span>
                    </div>
                  ))}
                </div>
                {status === 'idle' && selectedEmotion && (
                  <div className="action">
                    <button onClick={handleSearch}>Buscar compañero de “{selectedEmotion}”</button>
                  </div>
                )}
                {status === 'waiting' && (
                  <div className="action">
                    <div className="spinner" role="status" aria-label="Buscando…"></div>
                    <p>Buscando compañero para “{selectedEmotion}”…</p>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {status === 'matched' && !doodleMode && (
            <>
              <div className="chat-messages" role="log" aria-live="polite">
                {messages.map((msg, i) => (
                  <motion.div
                    key={i}
                    className={
                      msg.fromAnonId === myAnonId
                        ? 'message me'
                        : msg.fromAnonId === 'assistant'
                          ? 'message assistant'
                          : 'message other'
                    }
                    initial={{ opacity: 0, x: msg.fromAnonId === myAnonId ? 50 : -50 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.3 }}
                  >
                    <span className="msg-text">{msg.message}</span>
                    {msg.audioBlob && <AudioPlayer src={getAudioSrc(msg.audioBlob)} />}
                    {msg.doodle && <img src={msg.doodle} alt="doodle" className="msg-doodle" />}
                    {msg.timestamp && <span className="msg-time">{new Date(msg.timestamp).toLocaleTimeString()}</span>}
                  </motion.div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <form className="chat-input" onSubmit={sendMessage}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder="Escribe tu mensaje…"
                  autoFocus
                />
                <button
                  type="button"
                  className={`record-btn ${isRecording ? 'recording' : ''}`}
                  onClick={isRecording ? stopRecording : startRecording}
                  aria-label={isRecording ? 'Detener' : 'Grabar'}
                >
                  🎤
                </button>
                <button
                  type="button"
                  className={`record-btn ${doodleMode ? 'recording' : ''}`}
                  onClick={() => setDoodleMode(true)}
                  aria-label="Dibujar"
                >
                  ✏️
                </button>
              </form>
            </>
          )}

          {status === 'matched' && doodleMode && (
            <div className="doodle-overlay">
              <canvas
                ref={canvasRef}
                className="doodle-canvas"
                width={300}
                height={200}
                onMouseDown={e => {
                  const rect = canvasRef.current.getBoundingClientRect();
                  const ctx = canvasRef.current.getContext('2d');
                  ctx.lineWidth = 2; ctx.lineCap = 'round';
                  ctx.beginPath(); ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
                  const draw = ev => {
                    ctx.lineTo(ev.clientX - rect.left, ev.clientY - rect.top);
                    ctx.stroke();
                  };
                  canvasRef.current.addEventListener('mousemove', draw);
                  window.addEventListener('mouseup', () => {
                    canvasRef.current.removeEventListener('mousemove', draw);
                  }, { once: true });
                }}
              />
              <div className="doodle-actions">
                <button onClick={sendDoodle}>✅ Enviar</button>
                <button onClick={() => { clearCanvas(); setDoodleMode(false); }}>✖️ Cancelar</button>
              </div>
            </div>
          )}

          {status === 'ended' && (
            <motion.div
              key="end"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="end-screen"
            >
              <h2>🙏 Gracias por compartir</h2>
              <p>Hoy has tenido <strong>{chatCount}</strong> {chatCount === 1 ? 'charla' : 'charlas'}.</p>
              <button onClick={() => { resetChat(); setStatus('idle'); }}>
                Volver a elegir emoción
              </button>
            </motion.div>
          )}
        </>
      )}
    </div>
  );
}

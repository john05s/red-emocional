import React, { useState, useEffect } from 'react';

function Dashboard() {
  const [stats, setStats] = useState({
    sessions: null,
    messages: null,
    byEmotion: {}
  });

  useEffect(() => {
    async function fetchStats() {
      try {
        const [res1, res2, res3] = await Promise.all([
          fetch('http://localhost:5000/stats/sessions'),
          fetch('http://localhost:5000/stats/messages'),
          fetch('http://localhost:5000/stats/by-emotion'),
        ]);
        const data1 = await res1.json();
        const data2 = await res2.json();
        const data3 = await res3.json();
        setStats({
          sessions: data1.totalSessions,
          messages: data2.totalMessages,
          byEmotion: data3.sessionsByEmotion
        });
      } catch (err) {
        console.error(err);
      }
    }
    fetchStats();
  }, []);

  return (
    <div className="dashboard">
      <h2>📊 Dashboard de Estadísticas</h2>
      <div className="stat">
        <h3>Total de sesiones</h3>
        <p>{stats.sessions != null ? stats.sessions : 'Cargando...'}</p>
      </div>
      <div className="stat">
        <h3>Total de mensajes</h3>
        <p>{stats.messages != null ? stats.messages : 'Cargando...'}</p>
      </div>
      <div className="stat">
        <h3>Sesiones por emoción</h3>
        {stats.byEmotion && Object.keys(stats.byEmotion).length > 0 ? (
          <ul>
            {Object.entries(stats.byEmotion).map(([emotion, count]) => (
              <li key={emotion}>
                {emotion}: {count}
              </li>
            ))}
          </ul>
        ) : (
          'Cargando...'
        )}
      </div>
    </div>
  );
}

export default Dashboard;

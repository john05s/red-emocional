// src/AudioPlayer.js
import React, { useRef, useState, useEffect } from 'react';

/**
 * Global pointer to the currently playing audio element.
 * We pause it when another AudioPlayer starts playing.
 */
let currentAudio = null;

export default function AudioPlayer({ src }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => {
      if (audio.duration) {
        setProgress((audio.currentTime / audio.duration) * 100);
      }
    };
    const onEnded = () => {
      setPlaying(false);
      if (currentAudio === audio) currentAudio = null;
    };
    const onPause = () => {
      setPlaying(false);
      if (currentAudio === audio) currentAudio = null;
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('pause', onPause);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('pause', onPause);
    };
  }, []);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;

    if (!playing) {
      // Pause any other audio currently playing
      if (currentAudio && currentAudio !== audio) {
        currentAudio.pause();
      }
      audio.play();
      currentAudio = audio;
      setPlaying(true);
    } else {
      audio.pause();
      // onPause handler will clear currentAudio
    }
  };

  return (
    <div className="audio-player">
      <button className="play-btn" onClick={togglePlay} aria-label={playing ? 'Pausar' : 'Reproducir'}>
        {playing ? '⏸️' : '▶️'}
      </button>
      <div className="progress-bar">
        <div className="progress" style={{ width: `${progress}%` }} />
      </div>
      <audio ref={audioRef} src={src} preload="auto" style={{ display: 'none' }} />
    </div>
  );
}

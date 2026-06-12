import React, { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';

export default function AudioPlayer() {
  const currentScene = useStore((s) => s.currentScene);
  const [isMuted, setIsMuted] = useState(() => {
    return localStorage.getItem('spisense_audio_muted') === 'true';
  });
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);

  // Initialize Audio
  useEffect(() => {
    const audio = new Audio('/sunflower.mp3');
    audio.loop = true;
    audio.volume = 0.5;
    audio.muted = isMuted;
    audioRef.current = audio;

    // Handle visibility changes (pause on background tab)
    const handleVisibilityChange = () => {
      if (document.hidden) {
        audio.pause();
      } else if (isPlaying && !isMuted) {
        audio.play().catch((err) => console.log('Autoplay blocked on visibility change:', err));
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      audio.pause();
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Sync mute state
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.muted = isMuted;
      localStorage.setItem('spisense_audio_muted', isMuted ? 'true' : 'false');
    }
  }, [isMuted]);

  // Handle play triggers (auto-play when game is ready / active)
  useEffect(() => {
    if (!audioRef.current) return;

    const shouldPlay = currentScene === 'entry' || currentScene === 'city';
    if (shouldPlay) {
      const playPromise = audioRef.current.play();
      if (playPromise !== undefined) {
        playPromise
          .then(() => {
            setIsPlaying(true);
          })
          .catch((error) => {
            console.log('Autoplay prevented by browser, waiting for user interaction. Details:', error);
            setIsPlaying(false);
          });
      }
    }
  }, [currentScene]);

  // Autoplay bypass: attempt play on any user interaction
  useEffect(() => {
    if (!audioRef.current) return;

    const handleUserInteraction = () => {
      const shouldPlay = currentScene === 'entry' || currentScene === 'city';
      if (shouldPlay && !isPlaying) {
        audioRef.current
          .play()
          .then(() => {
            setIsPlaying(true);
            // Remove listeners once successfully playing
            window.removeEventListener('click', handleUserInteraction);
            window.removeEventListener('keydown', handleUserInteraction);
            window.removeEventListener('touchstart', handleUserInteraction);
          })
          .catch((err) => {
            console.log('Failed to play on interaction:', err);
          });
      }
    };

    window.addEventListener('click', handleUserInteraction);
    window.addEventListener('keydown', handleUserInteraction);
    window.addEventListener('touchstart', handleUserInteraction);

    return () => {
      window.removeEventListener('click', handleUserInteraction);
      window.removeEventListener('keydown', handleUserInteraction);
      window.removeEventListener('touchstart', handleUserInteraction);
    };
  }, [isPlaying, currentScene]);

  const toggleMute = () => {
    setIsMuted((prev) => !prev);
    // If audio is paused (due to browser policy), try playing it on click
    if (audioRef.current && audioRef.current.paused) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  // Do not render on preloader
  if (currentScene === 'preloader') return null;

  return (
    <div className="audio-widget glass-panel">
      {/* Sound waves animation */}
      <div className={`sound-wave ${isPlaying && !isMuted ? 'playing' : ''}`}>
        <span className="sound-wave-bar" />
        <span className="sound-wave-bar" />
        <span className="sound-wave-bar" />
        <span className="sound-wave-bar" />
      </div>

      {/* Scrolling song title marquee */}
      <div className="audio-track-info">
        <div className="audio-track-text">
          Post Malone, Swae Lee - Sunflower
        </div>
      </div>

      {/* Mute button */}
      <button 
        className={`audio-mute-btn ${isMuted ? 'muted' : ''}`}
        onClick={toggleMute}
        title={isMuted ? 'Unmute' : 'Mute'}
      >
        {isMuted ? '🔇' : '🔊'}
      </button>
    </div>
  );
}

import React, { useEffect, useState } from 'react';
import { useProgress } from '@react-three/drei';
import { useStore } from '../../store/useStore';

export default function Preloader() {
  const { progress } = useProgress();
  const { setScene, currentScene } = useStore();
  const [shouldRender, setShouldRender] = useState(true);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // When progress holds 100 for a bit, switch to entry scene or last saved scene
    if (progress === 100) {
      const timer = setTimeout(() => {
        if (currentScene === 'preloader') {
          const savedScene = localStorage.getItem('spisense_saved_scene') || 'entry';
          setScene(savedScene);
        }
      }, 800); // short delay to show 100%
      return () => clearTimeout(timer);
    }
  }, [progress, currentScene, setScene]);

  useEffect(() => {
    if (currentScene !== 'preloader') {
      setFadeOut(true);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 1000); // Match opacity transition duration
      return () => clearTimeout(timer);
    }
  }, [currentScene]);

  if (!shouldRender) return null;

  return (
    <div
      className="preloader-container"
      style={{
        transition: 'opacity 1s ease-in-out',
        opacity: fadeOut ? 0 : 1,
        pointerEvents: fadeOut ? 'none' : 'auto'
      }}
    >
      <h1 
        className="preloader-text"
        style={{
          animation: 'preloader-glow 2s infinite'
        }}
      >
        Loading Systems...
      </h1>
      <div className="progress-bar-bg">
        <div 
          className="progress-bar-fill" 
          style={{ width: `${progress}%` }} 
        />
      </div>
      <div style={{ marginTop: '10px', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>
        {Math.round(progress)}%
      </div>
    </div>
  );
}

import React, { useState, useEffect } from 'react';
import { useStore } from '../../store/useStore';

export default function EntryUI() {
  const { currentScene, setScene } = useStore();
  const [shouldRender, setShouldRender] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

  useEffect(() => {
    if (currentScene === 'entry') {
      setShouldRender(true);
      const timer = setTimeout(() => {
        setFadeIn(true);
      }, 100);
      return () => clearTimeout(timer);
    } else if (shouldRender) {
      setFadeIn(false);
      const timer = setTimeout(() => {
        setShouldRender(false);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [currentScene]);

  if (!shouldRender) return null;

  return (
    <div
      style={{
        position: 'absolute',
        bottom: '50px',
        left: '50px',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        transition: 'opacity 1.5s ease-in-out',
        opacity: fadeIn ? 1 : 0,
        pointerEvents: fadeIn ? 'auto' : 'none'
      }}
    >
      <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', maxWidth: '400px' }}>
        <p style={{ fontFamily: 'Outfit', fontSize: '1.2rem', lineHeight: '1.5', color: 'var(--accent-cyan)' }}>
          <span style={{ marginRight: '10px' }}>🕷️</span>
          "You're inside his system now."
        </p>
      </div>
      
      <button
        onClick={() => setScene('city')}
        className="glass-panel"
        style={{
          padding: '15px 30px',
          border: '1px solid var(--accent-cyan)',
          borderRadius: '8px',
          cursor: 'pointer',
          fontSize: '1.1rem',
          fontFamily: 'Outfit',
          fontWeight: 'bold',
          color: '#fff',
          alignSelf: 'flex-start',
          background: 'rgba(0, 243, 255, 0.1)',
          transition: 'transform 0.2s, box-shadow 0.2s',
        }}
        onMouseEnter={(e) => {
          e.target.style.transform = 'scale(1.05)';
          e.target.style.boxShadow = '0 0 15px var(--accent-cyan)';
        }}
        onMouseLeave={(e) => {
          e.target.style.transform = 'scale(1)';
          e.target.style.boxShadow = 'none';
        }}
      >
        Enter The City
      </button>
    </div>
  );
}

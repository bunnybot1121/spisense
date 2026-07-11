import React from 'react';
import { Html, useProgress } from '@react-three/drei';

export default function LoadingOverlay() {
  const { progress } = useProgress();
  return (
    <Html center>
      <div 
        className="glass-panel" 
        style={{
          padding: '24px 40px',
          borderRadius: '16px',
          color: '#fff',
          fontFamily: 'Outfit, sans-serif',
          textAlign: 'center',
          background: 'rgba(10, 10, 20, 0.85)',
          border: '1px solid rgba(0, 243, 255, 0.3)',
          boxShadow: '0 0 25px rgba(0, 243, 255, 0.15)',
          minWidth: '220px',
          pointerEvents: 'none',
          userSelect: 'none'
        }}
      >
        <h2 style={{ margin: '0 0 16px 0', fontSize: '1.2rem', color: 'var(--accent-cyan)', letterSpacing: '1px', fontFamily: 'Outfit, sans-serif' }}>
          LOADING SYSTEM...
        </h2>
        <div className="progress-bar-bg" style={{ width: '100%', height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden', margin: '8px 0' }}>
          <div 
            className="progress-bar-fill" 
            style={{ width: `${progress}%`, height: '100%', background: 'var(--accent-cyan)', transition: 'width 0.2s ease-out' }} 
          />
        </div>
        <div style={{ marginTop: '12px', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>
          {Math.round(progress)}%
        </div>
      </div>
    </Html>
  );
}

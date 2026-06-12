import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';

// ─── Key Mappings ───
const KEY_FORWARD = new Set(['w', 'W', 'ArrowUp']);
const KEY_BACKWARD = new Set(['s', 'S', 'ArrowDown']);
const KEY_LEFT = new Set(['a', 'A', 'ArrowLeft']);
const KEY_RIGHT = new Set(['d', 'D', 'ArrowRight']);
const KEY_SWING = new Set([' ']); // Space
const KEY_SHOOT = new Set(['e', 'E']);
const KEY_MOONWALK = new Set(['m', 'M']);
const KEY_DANCE = new Set(['h', 'H']);

function getActionFromKeys(keys) {
  const hasShoot = [...keys].some((k) => KEY_SHOOT.has(k));
  const hasMoonwalk = [...keys].some((k) => KEY_MOONWALK.has(k));
  const hasDance = [...keys].some((k) => KEY_DANCE.has(k));
  const hasForward = [...keys].some((k) => KEY_FORWARD.has(k));
  const hasBackward = [...keys].some((k) => KEY_BACKWARD.has(k));
  const hasLeft = [...keys].some((k) => KEY_LEFT.has(k));
  const hasRight = [...keys].some((k) => KEY_RIGHT.has(k));

  if (hasShoot) return 'webShoot';
  if (hasMoonwalk) return 'moonwalk';
  if (hasDance) return 'hip_hop';
  if (hasForward) return 'runForward';
  if (hasBackward) return 'runBackward';
  if (hasLeft) return 'strafeLeft';
  if (hasRight) return 'strafeRight';
  return 'idle';
}

export default function GameControls() {
  // Subscribe to display values
  const playerAction = useStore((s) => s.playerAction);
  const isSwinging = useStore((s) => s.isSwinging);
  const [isTouchDevice, setIsTouchDevice] = useState(false);
  const keysRef = useRef(new Set());

  // Detect touch device
  useEffect(() => {
    const check = () => setIsTouchDevice('ontouchstart' in window || navigator.maxTouchPoints > 0);
    check();
    window.addEventListener('pointerdown', check, { once: true });
    return () => window.removeEventListener('pointerdown', check);
  }, []);

  // ─── Keyboard Handlers (use getState() to avoid stale closures) ───
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Don't capture when typing in inputs or Leva
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      // Skip if inside Leva panel
      if (e.target.closest('[class*="leva"]')) return;

      if (keysRef.current.has(e.key)) return; // prevent repeat
      keysRef.current.add(e.key);

      const store = useStore.getState();

      // Swing toggle
      if (KEY_SWING.has(e.key)) {
        e.preventDefault();
        if (!store.isSwinging) {
          store.startSwing();
        }
        return;
      }

      // Movement
      const action = getActionFromKeys(keysRef.current);
      if (!store.isSwinging && action !== store.playerAction) {
        store.setPlayerAction(action);
      }
    };

    const handleKeyUp = (e) => {
      keysRef.current.delete(e.key);

      const store = useStore.getState();

      // Swing end
      if (KEY_SWING.has(e.key) && store.isSwinging) {
        store.endSwing();
        return;
      }

      // Recalculate action from remaining keys
      if (!store.isSwinging) {
        const action = getActionFromKeys(keysRef.current);
        store.setPlayerAction(action);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []); // No dependencies — uses getState() for fresh values

  // Clear keys on blur (window loses focus)
  useEffect(() => {
    const onBlur = () => {
      keysRef.current.clear();
      const store = useStore.getState();
      if (!store.isSwinging) store.setPlayerAction('idle');
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  // ─── Touch Button Handlers ───
  const handleTouchAction = useCallback((action) => {
    const store = useStore.getState();
    if (!store.isSwinging) store.setPlayerAction(action);
  }, []);

  const handleTouchEnd = useCallback(() => {
    const store = useStore.getState();
    if (!store.isSwinging) store.setPlayerAction('idle');
  }, []);

  const handleSwingTouch = useCallback(() => {
    const store = useStore.getState();
    if (!store.isSwinging) {
      store.startSwing();
    } else {
      store.endSwing();
    }
  }, []);

  return (
    <>
      {/* ─── Action Indicator (always visible) ─── */}
      <div className="game-action-indicator">
        <span className={`action-dot ${playerAction !== 'idle' || isSwinging ? 'active' : ''}`} />
        <span className="action-text">
          {isSwinging ? '🕸️ SWINGING' : playerAction === 'idle' ? 'IDLE' : playerAction.replace(/([A-Z])/g, ' $1').toUpperCase()}
        </span>
      </div>

      {/* ─── Touch Controls (mobile / touch devices) ─── */}
      {isTouchDevice && (
        <div className="game-controls-container">
          {/* D-Pad */}
          <div className="game-dpad">
            <button
              className="dpad-btn dpad-up"
              onTouchStart={(e) => { e.preventDefault(); handleTouchAction('runForward'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="18 15 12 9 6 15" />
              </svg>
            </button>
            <button
              className="dpad-btn dpad-left"
              onTouchStart={(e) => { e.preventDefault(); handleTouchAction('strafeLeft'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
            </button>
            <div className="dpad-center" />
            <button
              className="dpad-btn dpad-right"
              onTouchStart={(e) => { e.preventDefault(); handleTouchAction('strafeRight'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </button>
            <button
              className="dpad-btn dpad-down"
              onTouchStart={(e) => { e.preventDefault(); handleTouchAction('runBackward'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd(); }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
          </div>

          {/* Action Buttons Column */}
          <div style={{ display: 'flex', gap: '8px', flexDirection: 'column', alignItems: 'center' }}>
            {/* Swing Button */}
            <button
              className={`game-swing-btn ${isSwinging ? 'swinging' : ''}`}
              onTouchStart={(e) => { e.preventDefault(); handleSwingTouch(); }}
              style={{ width: '76px', height: '76px' }}
            >
              <span className="swing-icon" style={{ fontSize: '1.2rem' }}>🕸️</span>
              <span className="swing-label" style={{ fontSize: '0.55rem' }}>{isSwinging ? 'RELEASE' : 'SWING'}</span>
            </button>

            {/* Web Shoot Button */}
            <button
              className="game-swing-btn"
              onTouchStart={(e) => { e.preventDefault(); handleTouchAction('webShoot'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd(); }}
              style={{
                width: '60px',
                height: '60px',
                border: '2px solid rgba(0, 243, 255, 0.3)',
                background: 'rgba(0, 243, 255, 0.1)',
                color: 'var(--accent-cyan)'
              }}
            >
              <span className="swing-icon" style={{ fontSize: '1rem' }}>💥</span>
              <span className="swing-label" style={{ fontSize: '0.5rem' }}>WEB</span>
            </button>

            {/* Moonwalk Button */}
            <button
              className="game-swing-btn"
              onTouchStart={(e) => { e.preventDefault(); handleTouchAction('moonwalk'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd(); }}
              style={{
                width: '56px',
                height: '56px',
                border: '2px solid rgba(0, 255, 136, 0.3)',
                background: 'rgba(0, 255, 136, 0.1)',
                color: 'var(--accent-green)'
              }}
            >
              <span className="swing-icon" style={{ fontSize: '0.9rem' }}>🕺</span>
              <span className="swing-label" style={{ fontSize: '0.45rem' }}>MOON</span>
            </button>

            {/* Dance Button */}
            <button
              className="game-swing-btn"
              onTouchStart={(e) => { e.preventDefault(); handleTouchAction('hip_hop'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd(); }}
              style={{
                width: '56px',
                height: '56px',
                border: '2px solid rgba(157, 0, 255, 0.3)',
                background: 'rgba(157, 0, 255, 0.1)',
                color: 'var(--accent-purple)'
              }}
            >
              <span className="swing-icon" style={{ fontSize: '0.9rem' }}>🎶</span>
              <span className="swing-label" style={{ fontSize: '0.45rem' }}>DANCE</span>
            </button>
          </div>
        </div>
      )}

      {/* ─── Keyboard Hints (desktop, fades after 8s) ─── */}
      {!isTouchDevice && (
        <div className="game-kb-hints">
          <div className="kb-row">
            <span className="kb-key">W</span>
          </div>
          <div className="kb-row">
            <span className="kb-key">A</span>
            <span className="kb-key">S</span>
            <span className="kb-key">D</span>
          </div>
          <div className="kb-row" style={{ marginTop: '8px', display: 'flex', gap: '6px' }}>
            <span className="kb-key wide" style={{ color: 'var(--accent-red)', borderColor: 'rgba(255, 0, 85, 0.3)' }}>SPACE — Swing</span>
            <span className="kb-key" style={{ color: 'var(--accent-cyan)', borderColor: 'rgba(0, 243, 255, 0.3)' }}>E — Web</span>
            <span className="kb-key" style={{ color: 'var(--accent-green)', borderColor: 'rgba(0, 255, 136, 0.3)' }}>M — Moonwalk</span>
            <span className="kb-key" style={{ color: 'var(--accent-purple)', borderColor: 'rgba(157, 0, 255, 0.3)' }}>H — Dance</span>
          </div>
        </div>
      )}
    </>
  );
}

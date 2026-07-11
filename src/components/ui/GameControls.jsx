import React, { useEffect, useCallback, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import * as THREE from 'three';

// ─── Key Mappings ───
const KEY_FORWARD = new Set(['w', 'W', 'ArrowUp']);
const KEY_BACKWARD = new Set(['s', 'S', 'ArrowDown']);
const KEY_LEFT = new Set(['a', 'A', 'ArrowLeft']);
const KEY_RIGHT = new Set(['d', 'D', 'ArrowRight']);
const KEY_SWING = new Set([' ']); // Space
const KEY_SHOOT = new Set(['e', 'E']);
const KEY_JUMP = new Set(['j', 'J']);
const KEY_MOONWALK = new Set(['m', 'M']);
const KEY_DANCE = new Set(['h', 'H']);

function getActionFromKeys(keys) {
  // NOTE: E (KEY_SHOOT) is intentionally NOT mapped to an action here.
  // It is a hold-to-aim modifier handled separately in keydown/keyup,
  // so holding E + WASD must still resolve to movement actions.
  const hasMoonwalk = [...keys].some((k) => KEY_MOONWALK.has(k));
  const hasDance = [...keys].some((k) => KEY_DANCE.has(k));
  const hasForward = [...keys].some((k) => KEY_FORWARD.has(k));
  const hasBackward = [...keys].some((k) => KEY_BACKWARD.has(k));
  const hasLeft = [...keys].some((k) => KEY_LEFT.has(k));
  const hasRight = [...keys].some((k) => KEY_RIGHT.has(k));

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
  const webShootTimeoutRef = useRef(null);

  // Clean up timeout on unmount
  useEffect(() => {
    return () => {
      if (webShootTimeoutRef.current) clearTimeout(webShootTimeoutRef.current);
    };
  }, []);

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
      if (useStore.getState().activeShowcaseProject) return;
      // Don't capture when typing in inputs or Leva
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;
      // Skip if inside Leva panel
      if (e.target.closest('[class*="leva"]')) return;

      if (keysRef.current.has(e.key)) return; // prevent repeat
      keysRef.current.add(e.key);

      const store = useStore.getState();
      store.pressKey(e.key);

      // Release from hanging if any key is pressed
      if (store.playerAction === 'hanging') {
        if (KEY_SWING.has(e.key)) {
          e.preventDefault();
          store.startSwing();
          return;
        }
        if (KEY_FORWARD.has(e.key) || KEY_BACKWARD.has(e.key) || KEY_LEFT.has(e.key) || KEY_RIGHT.has(e.key)) {
          e.preventDefault();
          store.setPlayerAction('idle');
          // Update freePosition with the current characterPosition so physics begins here
          const charPos = store.characterPosition;
          if (charPos) {
            useStore.setState({ freePosition: new THREE.Vector3(charPos[0], charPos[1], charPos[2]) });
          }
          return;
        }
      }

      // Jump trigger (J key)
      if (KEY_JUMP.has(e.key)) {
        e.preventDefault();
        if (!store.isSwinging && store.playerAction !== 'jump') {
          store.setPlayerAction('jump');
        }
        return;
      }

      // Swing toggle (Space)
      if (KEY_SWING.has(e.key)) {
        e.preventDefault();
        if (store.isAiming) {
          if (store.hasTarget && store.targetPoint) {
            store.startDynamicSwing(store.targetPoint);
          }
          store.setAiming(false);
        } else if (!store.isSwinging) {
          store.startSwing();
        }
        return;
      }

      // Web shoot or Aim mode trigger (E key) - HOLD to aim
      if (KEY_SHOOT.has(e.key)) {
        e.preventDefault();
        if (!store.isSwinging) {
          store.setAiming(true);
        }
        return;
      }

      // Movement
      const action = getActionFromKeys(keysRef.current);
      if (!store.isSwinging && action !== store.playerAction) {
        if (webShootTimeoutRef.current && store.playerAction === 'webShoot') {
          return;
        }
        store.setPlayerAction(action);
      }
    };

    const handleKeyUp = (e) => {
      if (useStore.getState().activeShowcaseProject) return;
      keysRef.current.delete(e.key);

      const store = useStore.getState();
      store.releaseKey(e.key);

      // Swing end
      if (KEY_SWING.has(e.key) && store.isSwinging) {
        store.endSwing();
        return;
      }

      // Web zip on E key release
      if (KEY_SHOOT.has(e.key)) {
        if (store.isAiming) {
          if (store.hasTarget && store.targetPoint) {
            store.startDynamicSwing(store.targetPoint);
          }
          store.setAiming(false);
        }
        return;
      }

      // Recalculate action from remaining keys
      if (!store.isSwinging) {
        if (webShootTimeoutRef.current && store.playerAction === 'webShoot') {
          return;
        }
        const action = getActionFromKeys(keysRef.current);
        store.setPlayerAction(action);
      }
    };

    const handlePointerDown = (e) => {
      if (useStore.getState().activeShowcaseProject) return;
      // Don't capture when clicking on UI or buttons
      if (e.target.tagName === 'BUTTON' || e.target.closest('.editor-panel') || e.target.closest('.game-controls-container') || e.target.closest('[class*="leva"]')) return;
      const store = useStore.getState();
      if (store.isAiming && !store.isSwinging) {
        e.preventDefault();
        if (store.hasTarget && store.targetPoint) {
          store.startDynamicSwing(store.targetPoint);
        }
        store.setAiming(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('pointerdown', handlePointerDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('pointerdown', handlePointerDown);
    };
  }, []);

  // Clear keys on blur (window loses focus)
  useEffect(() => {
    const onBlur = () => {
      keysRef.current.clear();
      useStore.setState({ activeKeys: new Set() });
      const store = useStore.getState();
      if (store.isAiming) store.setAiming(false);
      if (!store.isSwinging) store.setPlayerAction('idle');
    };
    window.addEventListener('blur', onBlur);
    return () => window.removeEventListener('blur', onBlur);
  }, []);

  // ─── Touch Button Handlers ───
  const handleTouchAction = useCallback((action) => {
    if (useStore.getState().activeShowcaseProject) return;
    const store = useStore.getState();
    if (action === 'webShoot') {
      if (!store.isSwinging) {
        if (store.playerAction === 'hanging') {
          store.setPlayerAction('idle');
        }
        store.setAiming(true);
      }
    } else {
      if (store.playerAction === 'hanging') {
        store.setPlayerAction('idle');
        const charPos = store.characterPosition;
        if (charPos) {
          useStore.setState({ freePosition: new THREE.Vector3(charPos[0], charPos[1], charPos[2]) });
        }
      }
      if (!store.isSwinging) {
        if (webShootTimeoutRef.current && store.playerAction === 'webShoot') return;
        store.setPlayerAction(action);
      }
    }
  }, []);

  const handleTouchEnd = useCallback((action) => {
    if (useStore.getState().activeShowcaseProject) return;
    const store = useStore.getState();
    if (action === 'webShoot') {
      if (store.isAiming) {
        if (store.hasTarget && store.targetPoint) {
          store.startDynamicSwing(store.targetPoint);
        }
        store.setAiming(false);
      }
      return;
    } else {
      if (!store.isSwinging) {
        if (webShootTimeoutRef.current && store.playerAction === 'webShoot') return;
        store.setPlayerAction('idle');
      }
    }
  }, []);

  const handleSwingTouch = useCallback(() => {
    if (useStore.getState().activeShowcaseProject) return;
    const store = useStore.getState();
    if (store.playerAction === 'hanging') {
      store.startSwing();
      return;
    }
    if (store.isAiming) {
      if (store.hasTarget && store.targetPoint) {
        store.startDynamicSwing(store.targetPoint);
      }
      store.setAiming(false);
    } else if (!store.isSwinging) {
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

            {/* Jump Button */}
            <button
              className="game-swing-btn"
              onTouchStart={(e) => { e.preventDefault(); handleTouchAction('jump'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd(); }}
              style={{
                width: '60px',
                height: '60px',
                border: '2px solid rgba(255, 235, 59, 0.3)',
                background: 'rgba(255, 235, 59, 0.1)',
                color: '#fbc02d'
              }}
            >
              <span className="swing-icon" style={{ fontSize: '1rem' }}>🦘</span>
              <span className="swing-label" style={{ fontSize: '0.5rem' }}>JUMP</span>
            </button>

            {/* Web Shoot Button */}
            <button
              className="game-swing-btn"
              onTouchStart={(e) => { e.preventDefault(); handleTouchAction('webShoot'); }}
              onTouchEnd={(e) => { e.preventDefault(); handleTouchEnd('webShoot'); }}
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
            <span className="kb-key" style={{ color: '#fbc02d', borderColor: 'rgba(255, 235, 59, 0.3)' }}>J — Jump</span>
            <span className="kb-key" style={{ color: 'var(--accent-green)', borderColor: 'rgba(0, 255, 136, 0.3)' }}>M — Moonwalk</span>
            <span className="kb-key" style={{ color: 'var(--accent-purple)', borderColor: 'rgba(157, 0, 255, 0.3)' }}>H — Dance</span>
          </div>
        </div>
      )}
    </>
  );
}

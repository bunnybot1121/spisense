import React, { useRef, useEffect } from 'react';
import { useStore } from '../../store/useStore';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

// Horizontal compass tick interval configurations
const DEGREE_SPACING = 3; // pixels per degree
const TICK_COUNT = 720;   // total degrees from -180 to 540

export default function WebShooterHUD() {
  const isAiming = useStore((s) => s.isAiming);
  const hasTarget = useStore((s) => s.hasTarget);
  const currentScene = useStore((s) => s.currentScene);

  const compassTapeRef = useRef(null);
  const distanceRef = useRef(null);
  const reticleDotRef = useRef(null);

  // Generate ticks from -180 to 540 degrees
  const ticks = [];
  for (let d = -180; d <= 540; d += 5) {
    const norm = (d + 360) % 360;
    let label = '';
    let type = 'small';

    if (norm === 0) { label = 'N'; type = 'large'; }
    else if (norm === 45) { label = 'NE'; type = 'large'; }
    else if (norm === 90) { label = 'E'; type = 'large'; }
    else if (norm === 135) { label = 'SE'; type = 'large'; }
    else if (norm === 180) { label = 'S'; type = 'large'; }
    else if (norm === 225) { label = 'SW'; type = 'large'; }
    else if (norm === 270) { label = 'W'; type = 'large'; }
    else if (norm === 315) { label = 'NW'; type = 'large'; }
    else if (norm % 30 === 0) { label = norm.toString(); type = 'large'; }
    else if (norm % 15 === 0) { type = 'medium'; }

    ticks.push({ degree: d, label, type });
  }

  // Only render HUD inside city play mode or alley entry mode
  if (currentScene !== 'city' && currentScene !== 'entry') return null;

  return (
    <>
      {/* ─── Rolling Compass HUD (Always Visible in City) ─── */}
      {currentScene === 'city' && (
        <div className="hud-compass-container">
          <div className="hud-compass-pointer" />
          <div className="hud-compass-window">
            <div className="hud-compass-tape" ref={compassTapeRef}>
              {ticks.map((t, i) => (
                <div
                  key={i}
                  className={`hud-compass-tick-wrapper ${t.type}`}
                  style={{ left: `${(t.degree + 180) * DEGREE_SPACING}px` }}
                >
                  <div className="hud-compass-tick-line" />
                  {t.label && <span className="hud-compass-tick-label">{t.label}</span>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Sci-Fi Aiming Crosshair Reticle (Visible when holding E) ─── */}
      <div className={`hud-crosshair-container ${isAiming ? 'visible' : ''} ${hasTarget ? 'locked' : 'searching'}`}>
        <div className="hud-crosshair-ring outer" />
        <div className="hud-crosshair-ring inner" />
        
        {/* Aim ticks */}
        <div className="hud-crosshair-tick top" />
        <div className="hud-crosshair-tick bottom" />
        <div className="hud-crosshair-tick left" />
        <div className="hud-crosshair-tick right" />
        
        {/* Dynamic distance/state readout */}
        <div className="hud-crosshair-readout">
          <div className="readout-status">{hasTarget ? 'WEB ANCHOR LOCKED' : 'SEARCHING WALL...'}</div>
          <div className="readout-distance" ref={distanceRef}>NO TARGET</div>
        </div>
      </div>
    </>
  );
}

// ─── High Performance HUD Updater Component (Placed inside R3F Canvas) ───
export function HUDUpdater() {
  const isAiming = useStore((s) => s.isAiming);
  
  useFrame((state) => {
    // 1. Update Compass Tape position based on Camera angle
    const dir = new THREE.Vector3();
    state.camera.getWorldDirection(dir);
    // Heading in degrees: 0 is North (-Z), 90 is East (-X), etc.
    let angleDeg = Math.atan2(-dir.x, -dir.z) * (180 / Math.PI);
    if (angleDeg < 0) angleDeg += 360;

    const tapeEl = document.querySelector('.hud-compass-tape');
    if (tapeEl) {
      // Offset such that the active angle is aligned to the center pointer.
      // 0 degree is at (0 + 180) * DEGREE_SPACING px from the tape left edge.
      // Centered translation = containerHalfWidth - (angle + 180) * DEGREE_SPACING
      const containerWidth = 360; // matches .hud-compass-window width in CSS
      const targetX = (containerWidth / 2) - (angleDeg + 180) * DEGREE_SPACING;
      tapeEl.style.transform = `translateX(${targetX}px)`;
    }

    // 2. Update Web Distance and Raycast Readout in Crosshair
    const distEl = document.querySelector('.readout-distance');
    if (isAiming && distEl) {
      const storeState = useStore.getState();
      if (storeState.hasTarget && storeState.targetPoint) {
        // Calculate distance from Spider-Man's actual position (using player group coordinates)
        const playerPos = storeState.characterPosition; // array [x,y,z] or Vector3
        let distance = 0;
        if (playerPos) {
          const px = playerPos[0] ?? playerPos.x ?? 0;
          const py = playerPos[1] ?? playerPos.y ?? 0;
          const pz = playerPos[2] ?? playerPos.z ?? 0;
          const hit = storeState.targetPoint;
          distance = Math.sqrt((hit.x - px) ** 2 + (hit.y - py) ** 2 + (hit.z - pz) ** 2);
        }
        distEl.innerText = `RANGE: ${distance.toFixed(1)}m`;
      } else {
        distEl.innerText = `OUT OF RANGE`;
      }
    }
  });

  return null;
}

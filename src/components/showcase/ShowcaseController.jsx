import React, { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useStore } from '../../store/useStore';
import { projects } from './ProjectLoader';
import ProjectTrigger from './ProjectTrigger';
import PlatformEffects from './PlatformEffects';
import PresentationBoard from './PresentationBoard';
import gsap from 'gsap';
import * as THREE from 'three';

// ─── 3D Component (Rendered inside R3F Canvas) ───
export function ShowcaseController3D() {
  const activeShowcaseProject = useStore((s) => s.activeShowcaseProject);
  const showcasePhase = useStore((s) => s.showcasePhase);

  // Setup GSAP camera movements upon project activation
  useEffect(() => {
    if (!activeShowcaseProject) return;

    const padPos = activeShowcaseProject.triggerPos;
    const padRotY = activeShowcaseProject.rotationY;
    const angleY = THREE.MathUtils.degToRad(padRotY);

    // 1. Set initial camera behind Spiderman looking at his back
    const startCamPos = new THREE.Vector3(
      padPos.x + Math.sin(angleY) * 3.5,
      padPos.y + 1.7,
      padPos.z + Math.cos(angleY) * 3.5
    );
    const startLookAt = new THREE.Vector3(padPos.x, padPos.y + 1.1, padPos.z);

    useStore.setState({
      showcasePhase: 'character_move',
      showcaseCameraPosition: startCamPos,
      showcaseCameraLookAt: startLookAt,
      showcasePlatformPos: new THREE.Vector3(padPos.x, padPos.y, padPos.z)
    });

    // 2. Animate camera pulling back and rising (duration 1.8s)
    const animCamPos = startCamPos.clone();
    
    const tl = gsap.timeline({
      onUpdate: () => {
        useStore.setState({ showcaseCameraPosition: animCamPos.clone() });
      },
      onComplete: () => {
        // Trigger board materialization
        useStore.setState({ showcasePhase: 'board_assemble' });
      }
    });

    // Move to camera_move phase immediately
    tl.add(() => {
      useStore.setState({ showcasePhase: 'camera_move' });
    });

    tl.to(animCamPos, {
      x: padPos.x + Math.sin(angleY) * 6.8,
      y: padPos.y + 2.5,
      z: padPos.z + Math.cos(angleY) * 6.8,
      duration: 1.6,
      ease: 'power2.out'
    });

    return () => tl.kill();
  }, [activeShowcaseProject]);

  // Handle camera orbit in useFrame when showcase is complete
  useFrame((state, delta) => {
    if (!activeShowcaseProject || showcasePhase !== 'complete') return;

    const time = state.clock.getElapsedTime();
    const padPos = activeShowcaseProject.triggerPos;
    const radRotY = THREE.MathUtils.degToRad(activeShowcaseProject.rotationY);

    // Slow orbit: starting angle aligned behind character, orbiting 360 deg
    const radius = 7.5;
    const orbitSpeed = 0.12; // rad/sec
    const angle = radRotY + Math.PI + time * orbitSpeed;

    const targetCamX = padPos.x + Math.sin(angle) * radius;
    const targetCamZ = padPos.z + Math.cos(angle) * radius;
    const targetCamY = padPos.y + 2.5 + Math.sin(time * 0.45) * 0.3; // hovering

    const currentCamPos = useStore.getState().showcaseCameraPosition || new THREE.Vector3();
    const nextCamPos = new THREE.Vector3(targetCamX, targetCamY, targetCamZ);
    currentCamPos.lerp(nextCamPos, 3.5 * delta);

    const currentLookAt = useStore.getState().showcaseCameraLookAt || new THREE.Vector3();
    const targetLookAt = new THREE.Vector3(padPos.x, padPos.y + 1.15, padPos.z);
    currentLookAt.lerp(targetLookAt, 3.5 * delta);

    useStore.setState({
      showcaseCameraPosition: currentCamPos.clone(),
      showcaseCameraLookAt: currentLookAt.clone()
    });
  });

  return (
    <group>
      {projects.map((proj) => (
        <group key={proj.id}>
          <ProjectTrigger project={proj} />
          <PlatformEffects project={proj} />
          <PresentationBoard project={proj} />
        </group>
      ))}
    </group>
  );
}

// ─── DOM Overlay Component (Rendered outside Canvas) ───
export function ShowcaseHUD() {
  const activeShowcaseProject = useStore((s) => s.activeShowcaseProject);
  const showcasePhase = useStore((s) => s.showcasePhase);

  const handleExit = () => {
    if (showcasePhase === 'complete') {
      useStore.setState({ showcasePhase: 'exiting' });
    }
  };

  if (!activeShowcaseProject) return null;

  const isComplete = showcasePhase === 'complete';
  const themeColor = activeShowcaseProject.color || '#00f3ff';

  return (
    <div 
      className={`showcase-hud-container ${isComplete ? 'active' : ''}`}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '30px 40px',
        boxSizing: 'border-box',
        opacity: isComplete ? 1 : 0,
        transition: 'opacity 0.6s cubic-bezier(0.25, 0.8, 0.25, 1)',
        fontFamily: "'Outfit', 'Inter', sans-serif",
      }}
    >
      {/* Top Header Banner */}
      <div 
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          pointerEvents: 'auto',
          transform: isComplete ? 'translateY(0)' : 'translateY(-20px)',
          transition: 'transform 0.6s 0.1s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <div 
            style={{
              width: '8px',
              height: '35px',
              backgroundColor: themeColor,
              boxShadow: `0 0 10px ${themeColor}`,
              borderRadius: '2px'
            }} 
          />
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: 800, color: '#ffffff', letterSpacing: '2px', textTransform: 'uppercase' }}>
              Project Showcase
            </h1>
            <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)', letterSpacing: '1px', textTransform: 'uppercase' }}>
              Briefing Protocol Active
            </span>
          </div>
        </div>
      </div>

      {/* Middle Panels: Left (Details), Right (Actions/QR) */}
      <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', flex: 1, margin: '20px 0', alignItems: 'center' }}>
        
        {/* Left Specification Board */}
        <div 
          className="glass-panel"
          style={{
            width: '380px',
            pointerEvents: 'auto',
            padding: '24px',
            borderRadius: '12px',
            border: `1px solid rgba(255,255,255,0.1)`,
            borderLeft: `3px solid ${themeColor}`,
            boxShadow: `0 8px 32px rgba(0,0,0,0.5)`,
            transform: isComplete ? 'translateX(0)' : 'translateX(-40px)',
            transition: 'transform 0.7s 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            background: 'rgba(6, 8, 16, 0.75)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div>
            <span style={{ color: themeColor, fontSize: '11px', fontWeight: 700, letterSpacing: '2px', textTransform: 'uppercase' }}>
              {activeShowcaseProject.subtitle}
            </span>
            <h2 style={{ margin: '4px 0 0 0', fontSize: '32px', fontWeight: 900, color: '#ffffff', letterSpacing: '1px' }}>
              {activeShowcaseProject.title}
            </h2>
          </div>

          <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />

          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '13px', lineHeight: '1.6', margin: 0 }}>
            {activeShowcaseProject.description}
          </p>

          <div>
            <h4 style={{ margin: '0 0 8px 0', color: themeColor, fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Key Features
            </h4>
            <ul style={{ margin: 0, paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {activeShowcaseProject.features.map((feat, idx) => (
                <li key={idx} style={{ color: 'rgba(255,255,255,0.85)', fontSize: '12px', lineHeight: '1.4' }}>
                  {feat}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Right Technology Board */}
        <div 
          className="glass-panel"
          style={{
            width: '320px',
            pointerEvents: 'auto',
            padding: '24px',
            borderRadius: '12px',
            border: `1px solid rgba(255,255,255,0.1)`,
            borderRight: `3px solid ${themeColor}`,
            boxShadow: `0 8px 32px rgba(0,0,0,0.5)`,
            transform: isComplete ? 'translateX(0)' : 'translateX(40px)',
            transition: 'transform 0.7s 0.2s cubic-bezier(0.25, 0.8, 0.25, 1)',
            display: 'flex',
            flexDirection: 'column',
            gap: '16px',
            background: 'rgba(6, 8, 16, 0.75)',
            backdropFilter: 'blur(16px)',
          }}
        >
          <div>
            <h4 style={{ margin: '0 0 10px 0', color: themeColor, fontSize: '11px', fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase' }}>
              Built With
            </h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
              {activeShowcaseProject.tech.map((t, idx) => (
                <span 
                  key={idx} 
                  style={{
                    backgroundColor: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '4px',
                    padding: '4px 10px',
                    fontSize: '11px',
                    color: '#ffffff',
                    fontWeight: 500,
                  }}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>

          <div style={{ height: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />

          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <div style={{ flex: 1 }}>
              <h4 style={{ margin: '0 0 4px 0', color: themeColor, fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
                GitHub Repository
              </h4>
              <span style={{ fontSize: '11px', color: 'rgba(255,255,255,0.45)' }}>Scan to inspect source</span>
            </div>
            {/* Scifi Mock QR Code block */}
            <div 
              style={{
                width: '60px',
                height: '60px',
                border: `1px solid ${themeColor}`,
                boxShadow: `0 0 8px ${themeColor}44`,
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: 'rgba(255,255,255,0.05)',
                color: themeColor,
                fontSize: '20px',
                fontWeight: 'bold',
                fontFamily: 'monospace'
              }}
            >
              QR
            </div>
          </div>
        </div>

      </div>

      {/* Bottom Control Bar */}
      <div 
        style={{
          width: '100%',
          display: 'flex',
          justifyContent: 'center',
          pointerEvents: 'auto',
          transform: isComplete ? 'translateY(0)' : 'translateY(20px)',
          transition: 'transform 0.6s 0.1s cubic-bezier(0.25, 0.8, 0.25, 1)',
        }}
      >
        <button
          onClick={handleExit}
          style={{
            cursor: 'pointer',
            background: 'rgba(255, 0, 85, 0.12)',
            border: '1px solid rgba(255, 0, 85, 0.5)',
            boxShadow: '0 0 12px rgba(255, 0, 85, 0.25)',
            padding: '12px 32px',
            borderRadius: '6px',
            color: '#ff3366',
            fontSize: '13px',
            fontWeight: 800,
            letterSpacing: '2px',
            textTransform: 'uppercase',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'background 0.2s, box-shadow 0.2s'
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = 'rgba(255, 0, 85, 0.25)';
            e.currentTarget.style.boxShadow = '0 0 18px rgba(255, 0, 85, 0.4)';
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = 'rgba(255, 0, 85, 0.12)';
            e.currentTarget.style.boxShadow = '0 0 12px rgba(255, 0, 85, 0.25)';
          }}
        >
          <span>🛑 Exit Mission Briefing</span>
        </button>
      </div>
    </div>
  );
}

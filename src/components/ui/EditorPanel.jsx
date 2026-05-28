import React, { useState } from 'react';
import { motion } from 'framer-motion';

export default function EditorPanel({
  selectedType,
  selectedIndex,
  pointsData,
  segmentAnimations,
  animationNames,
  spiderManPos,
  spiderManRotY,
  spiderManScale,
  cameraCtrl,
  lightCtrl,
  alleyCtrl,
  onAddPoint,
  onRemovePoint,
  onSegmentAnimationChange,
  onDeselectAll,
  editorMode,
  onToggleEditorMode,
  activeAnimation,
  onActiveAnimationChange,
}) {
  const [showHelp, setShowHelp] = useState(true);
  const [copied, setCopied] = useState(false);

  const handleCopyValues = () => {
    const output = {
      spiderMan: {
        position: spiderManPos,
        rotation_y: spiderManRotY ?? 0,
        scale: spiderManScale ?? 1,
      },
      pathPoints: pointsData.map(p => ({ x: +p.x.toFixed(2), y: +p.y.toFixed(2), z: +p.z.toFixed(2) })),
      segmentAnimations: pointsData.slice(0, -1).map((_, i) => ({
        segment: i,
        from: i,
        to: i + 1,
        animation: segmentAnimations[i] || animationNames[0] || 'idle',
      })),
      camera: cameraCtrl || {},
      lighting: lightCtrl || {},
      alleyModel: alleyCtrl || {},
    };
    const json = JSON.stringify(output, null, 2);
    navigator.clipboard?.writeText(json).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
    console.log('╔══════════════════════════════════════╗');
    console.log('║     SCENE EDITOR — ALL VALUES        ║');
    console.log('╚══════════════════════════════════════╝');
    console.log(json);
  };

  return (
    <motion.div
      className="editor-panel glass-panel"
      initial={{ x: 320 }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 25 }}
    >
      {/* Header */}
      <div className="editor-header">
        <h2>🕷️ Scene Editor</h2>
        <button
          className={`editor-mode-btn ${editorMode ? 'active' : ''}`}
          onClick={onToggleEditorMode}
        >
          {editorMode ? '✏️ Edit' : '▶️ Preview'}
        </button>
      </div>

      {/* Scrollable content area */}
      <div className="editor-scroll-area">

        {/* Selected Info */}
        <div className="editor-section">
          <h3>Selected</h3>
          {selectedType === 'point' && selectedIndex !== null ? (
            <div className="editor-selected-info">
              <span className="editor-badge badge-point">Point {selectedIndex + 1}</span>
              <span className="editor-coords">
                x:{pointsData[selectedIndex]?.x?.toFixed(1)} 
                y:{pointsData[selectedIndex]?.y?.toFixed(1)} 
                z:{pointsData[selectedIndex]?.z?.toFixed(1)}
              </span>
            </div>
          ) : selectedType === 'spiderman' ? (
            <div className="editor-selected-info">
              <span className="editor-badge badge-spider">Spider-Man</span>
              <span className="editor-coords">
                x:{spiderManPos.x?.toFixed(1)} y:{spiderManPos.y?.toFixed(1)} z:{spiderManPos.z?.toFixed(1)}
              </span>
            </div>
          ) : (
            <p className="editor-hint">Click an object to select it</p>
          )}
        </div>

        {/* ─── Animation Preview ─── */}
        <div className="editor-section">
          <h3>🎬 Animation Preview</h3>
          {animationNames.length === 0 ? (
            <p className="editor-hint">Loading animations...</p>
          ) : (
            <div className="editor-anim-grid">
              {animationNames.map((name, i) => (
                <button
                  key={name}
                  className={`editor-anim-btn ${activeAnimation === name ? 'active' : ''}`}
                  onClick={() => onActiveAnimationChange?.(name)}
                  title={`Press ${i < 9 ? i + 1 : i === 9 ? 0 : ''} to play`}
                >
                  <span className="anim-key-hint">{i < 9 ? i + 1 : i === 9 ? '0' : ''}</span>
                  <span className="anim-name">{name}</span>
                </button>
              ))}
            </div>
          )}
          <div className="editor-anim-shortcuts">
            <span>N</span> Next &nbsp;·&nbsp; <span>P</span> Prev &nbsp;·&nbsp; <span>1-9</span> Quick Select
          </div>
        </div>

        {/* Path Points */}
        <div className="editor-section">
          <div className="editor-section-header">
            <h3>Path Points ({pointsData.length})</h3>
            <div className="editor-btn-group">
              <button className="editor-btn-sm" onClick={onAddPoint}>+ Add</button>
              <button className="editor-btn-sm editor-btn-danger" onClick={onRemovePoint}>− Remove</button>
            </div>
          </div>
          <div className="editor-points-list">
            {pointsData.map((p, i) => (
              <div key={i} className={`editor-point-row ${selectedType === 'point' && selectedIndex === i ? 'selected' : ''}`}>
                <span className="editor-point-num">{i + 1}</span>
                <span className="editor-point-coords">
                  ({p.x?.toFixed(1)}, {p.y?.toFixed(1)}, {p.z?.toFixed(1)})
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Segment Animations */}
        <div className="editor-section">
          <h3>Segment Animations</h3>
          {animationNames.length === 0 ? (
            <p className="editor-hint">Loading animations...</p>
          ) : (
            <div className="editor-segments-list">
              {pointsData.slice(0, -1).map((_, i) => (
                <div key={i} className="editor-segment-row">
                  <span className="editor-segment-label">
                    {i + 1} → {i + 2}
                  </span>
                  <select
                    className="editor-select"
                    value={segmentAnimations[i] || animationNames[0]}
                    onChange={(e) => onSegmentAnimationChange(i, e.target.value)}
                  >
                    {animationNames.map((name) => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Copy Values */}
        <div className="editor-section">
          <button className="editor-btn-copy" onClick={handleCopyValues}>
            {copied ? '✅ Copied!' : '📋 Copy All Values'}
          </button>
        </div>

        {/* Help */}
        <div className="editor-section">
          <button className="editor-btn-help" onClick={() => setShowHelp(!showHelp)}>
            {showHelp ? '▾ Hide Controls' : '▸ Show Controls'}
          </button>
          {showHelp && (
            <div className="editor-help">
              <p><span>Left Click</span> object → Select & Drag</p>
              <p><span>Drag Gizmo</span> → Move selected</p>
              <p><span>Left Drag</span> empty → Orbit camera</p>
              <p><span>Right Drag</span> → Pan camera</p>
              <p><span>Scroll</span> → Zoom</p>
              <p><span>Click empty</span> → Deselect</p>
              <p><span>1-9 / 0</span> → Play animation</p>
              <p><span>N / P</span> → Next / Prev animation</p>
            </div>
          )}
        </div>

      </div>
    </motion.div>
  );
}

import React, { useState, useEffect, useMemo } from 'react';
import { useStore } from '../../store/useStore';

export default function TutorialPanel() {
  const playerAction = useStore((s) => s.playerAction);
  const isSwinging = useStore((s) => s.isSwinging);

  // Completed status state
  const [completed, setCompleted] = useState({
    runForward: false,
    runBackward: false,
    strafeLeft: false,
    strafeRight: false,
    swing: false,
    shootWeb: false,
    moonwalk: false,
    dance: false,
  });

  // Track player activities to mark them completed
  useEffect(() => {
    if (playerAction === 'runForward') {
      setCompleted((prev) => prev.runForward ? prev : { ...prev, runForward: true });
    } else if (playerAction === 'runBackward') {
      setCompleted((prev) => prev.runBackward ? prev : { ...prev, runBackward: true });
    } else if (playerAction === 'strafeLeft') {
      setCompleted((prev) => prev.strafeLeft ? prev : { ...prev, strafeLeft: true });
    } else if (playerAction === 'strafeRight') {
      setCompleted((prev) => prev.strafeRight ? prev : { ...prev, strafeRight: true });
    } else if (playerAction === 'webShoot') {
      setCompleted((prev) => prev.shootWeb ? prev : { ...prev, shootWeb: true });
    } else if (playerAction === 'moonwalk') {
      setCompleted((prev) => prev.moonwalk ? prev : { ...prev, moonwalk: true });
    } else if (playerAction === 'hip_hop') {
      setCompleted((prev) => prev.dance ? prev : { ...prev, dance: true });
    }

    if (isSwinging) {
      setCompleted((prev) => prev.swing ? prev : { ...prev, swing: true });
    }
  }, [playerAction, isSwinging]);

  // Tasks definitions
  const tasks = useMemo(() => [
    {
      id: 'runForward',
      name: 'Run Forward',
      keys: ['W', '▲'],
      isDone: completed.runForward,
    },
    {
      id: 'runBackward',
      name: 'Run Backward',
      keys: ['S', '▼'],
      isDone: completed.runBackward,
    },
    {
      id: 'strafeLeft',
      name: 'Strafe Left',
      keys: ['A', '◀'],
      isDone: completed.strafeLeft,
    },
    {
      id: 'strafeRight',
      name: 'Strafe Right',
      keys: ['D', '▶'],
      isDone: completed.strafeRight,
    },
    {
      id: 'swing',
      name: 'Web Swing',
      keys: ['SPACE'],
      isDone: completed.swing,
    },
    {
      id: 'shootWeb',
      name: 'Shoot Web',
      keys: ['E'],
      isDone: completed.shootWeb,
    },
    {
      id: 'moonwalk',
      name: 'Moonwalk',
      keys: ['M'],
      isDone: completed.moonwalk,
    },
    {
      id: 'dance',
      name: 'Dance Routine',
      keys: ['H'],
      isDone: completed.dance,
    },
  ], [completed]);

  const completedCount = Object.values(completed).filter(Boolean).length;
  const totalCount = tasks.length;
  const isAllCompleted = completedCount === totalCount;
  const progressPercent = (completedCount / totalCount) * 100;

  return (
    <div className="tutorial-hud-container">
      <div className={`tutorial-hud-card glass-panel ${isAllCompleted ? 'all-completed' : ''}`}>
        {/* Card Header */}
        <h2 className={`tutorial-title ${isAllCompleted ? 'all-completed' : ''}`}>
          <span>🕷️</span> Training Protocol
        </h2>
        <p className="tutorial-desc">
          Perform each command to calibrate your nano-suit before entering the city.
        </p>

        {/* Progress Tracker */}
        <div className="tutorial-progress-section">
          <div className="tutorial-progress-text">
            <span>CALIBRATION</span>
            <span>{completedCount} / {totalCount} UNITS</span>
          </div>
          <div className="tutorial-progress-bar-bg">
            <div
              className={`tutorial-progress-bar-fill ${isAllCompleted ? 'all-completed' : ''}`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        {/* Task List */}
        <div className="tutorial-task-list">
          {tasks.map((task) => (
            <div key={task.id} className={`tutorial-task-item ${task.isDone ? 'completed' : ''}`}>
              <div className="tutorial-task-left">
                <div className="tutorial-keycaps-container">
                  {task.keys.map((k) => (
                    <span key={k} className="tutorial-keycap">{k}</span>
                  ))}
                </div>
                <span className="tutorial-task-name">{task.name}</span>
              </div>
              <div className="tutorial-task-check">
                <svg className="tutorial-check-icon" viewBox="0 0 12 12">
                  <path d="M2.5 6.5L5 9L9.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </div>
          ))}
        </div>

        {/* Success Alert Banner */}
        {isAllCompleted && (
          <div className="tutorial-success-banner">
            <div className="tutorial-success-title">
              🎉 CALIBRATION COMPLETE
            </div>
            <div className="tutorial-success-text">
              Suit calibration is locked in. Click <strong>Enter The City</strong> on the bottom left to begin your mission.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

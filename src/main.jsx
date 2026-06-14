// Global diagnostic console interceptor
const logs = [];
const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

function addLog(type, args) {
  const message = args.map(arg => {
    if (typeof arg === 'object') {
      try {
        return JSON.stringify(arg);
      } catch (e) {
        return String(arg);
      }
    }
    return String(arg);
  }).join(' ');
  
  logs.push({ type, message, time: new Date().toLocaleTimeString() });
  if (logs.length > 50) logs.shift();
  
  const el = document.getElementById('debug-log-content');
  if (el) {
    el.innerHTML = logs.map(l => {
      let color = '#ccc';
      if (l.type === 'error') color = '#ff3366';
      if (l.type === 'warn') color = '#ffcc00';
      return `<div style="color: ${color}; margin-bottom: 4px; border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 2px;">[${l.time}] [${l.type}] ${l.message}</div>`;
    }).join('');
    const container = document.getElementById('debug-log-container');
    if (container) container.scrollTop = container.scrollHeight;
  }

  // Send to background remote logger
  fetch('http://localhost:3001', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, message })
  }).catch(() => {});
}

console.log = (...args) => {
  originalLog.apply(console, args);
  addLog('log', args);
};
console.warn = (...args) => {
  originalWarn.apply(console, args);
  addLog('warn', args);
};
console.error = (...args) => {
  originalError.apply(console, args);
  addLog('error', args);
};

// Inject panel on load
function injectPanel() {
  if (document.getElementById('debug-log-container')) return;
  const debugDiv = document.createElement('div');
  debugDiv.id = 'debug-log-container';
  debugDiv.style.cssText = 'position: fixed; bottom: 10px; left: 10px; width: 420px; height: 220px; background: rgba(10,10,20,0.95); color: #fff; font-family: monospace; font-size: 10px; padding: 10px; border-radius: 6px; border: 1px solid rgba(0, 243, 255, 0.3); overflow-y: auto; z-index: 999999; pointer-events: auto; box-shadow: 0 0 15px rgba(0, 243, 255, 0.15);';
  debugDiv.innerHTML = `
    <div style="font-weight: bold; border-bottom: 1px solid rgba(0, 243, 255, 0.3); padding-bottom: 6px; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; color: #00f3ff;">
      <span>🛠️ Antigravity Diagnostic Console</span>
      <button onclick="document.getElementById('debug-log-content').innerHTML = '';" style="background: rgba(255,255,255,0.1); color: #fff; border: 1px solid rgba(255,255,255,0.2); padding: 2px 6px; border-radius: 4px; cursor: pointer; font-size: 9px;">Clear</button>
    </div>
    <div id="debug-log-content" style="height: calc(100% - 30px); overflow-y: auto;"></div>
  `;
  document.body.appendChild(debugDiv);
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', injectPanel);
} else {
  injectPanel();
}

import React, { Component } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '30px', background: '#1a0505', color: '#ff5555', fontFamily: 'monospace', zIndex: 999999, position: 'fixed', inset: 0, overflow: 'auto', border: '4px solid #ff0055' }}>
          <h2 style={{ marginBottom: '15px', color: '#ff0055', fontFamily: 'Outfit, sans-serif' }}>🚨 Render Crash Caught by ErrorBoundary</h2>
          <p style={{ marginBottom: '10px', fontWeight: 'bold' }}>Error Message: {this.state.error?.message || String(this.state.error)}</p>
          <pre style={{ background: 'rgba(0,0,0,0.5)', padding: '15px', borderRadius: '6px', whiteSpace: 'pre-wrap', fontSize: '0.85rem', lineHeight: '1.5' }}>
            {this.state.error?.stack || 'No stack trace available.'}
          </pre>
          <button onClick={() => { localStorage.clear(); location.reload(); }} style={{ marginTop: '20px', padding: '10px 20px', background: '#ff0055', color: 'white', border: 'none', borderRadius: '4px', fontWeight: 'bold', cursor: 'pointer' }}>
            Clear Cache & LocalStorage
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// Global diagnostic error display (unhandled window errors)
window.addEventListener('error', (event) => {
  if (document.getElementById('runtime-crash-overlay')) return;
  const overlay = document.createElement('div');
  overlay.id = 'runtime-crash-overlay';
  overlay.style.cssText = 'padding: 30px; background: #1a0505; color: #ff5555; font-family: monospace; z-index: 999999; position: fixed; inset: 0; overflow: auto; border: 4px solid #ff0055;';
  overlay.innerHTML = `
    <h2 style="margin-bottom: 15px; color: #ff0055; font-family: Outfit, sans-serif;">🚨 Runtime Crash Detected</h2>
    <p style="margin-bottom: 10px; font-weight: bold;">Error Message: ${event.message}</p>
    <pre style="background: rgba(0,0,0,0.5); padding: 15px; border-radius: 6px; white-space: pre-wrap; font-size: 0.85rem; line-height: 1.5;">${event.error?.stack || 'No stack trace available.'}</pre>
    <button onclick="localStorage.clear(); location.reload();" style="margin-top: 20px; padding: 10px 20px; background: #ff0055; color: white; border: none; border-radius: 4px; font-weight: bold; cursor: pointer;">
      Clear Cache & LocalStorage
    </button>
  `;
  document.body.appendChild(overlay);
});

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)




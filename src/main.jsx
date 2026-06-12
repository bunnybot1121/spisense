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



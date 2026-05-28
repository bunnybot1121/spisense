import { useStore } from '../../store/useStore';
import { motion, AnimatePresence } from 'framer-motion';

export default function EntryUI() {
  const { currentScene, setScene } = useStore();

  if (currentScene !== 'entry') return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 2, delay: 1 }}
        style={{
          position: 'absolute',
          bottom: '50px',
          left: '50px',
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: '20px'
        }}
      >
        <div className="glass-panel" style={{ padding: '20px', borderRadius: '12px', maxWidth: '400px' }}>
          <p style={{ fontFamily: 'Outfit', fontSize: '1.2rem', lineHeight: '1.5', color: 'var(--accent-cyan)' }}>
            <span style={{ marginRight: '10px' }}>🕷️</span>
            "You're inside his system now."
          </p>
        </div>
        
        <motion.button
          whileHover={{ scale: 1.05, boxShadow: '0 0 15px var(--accent-cyan)' }}
          whileTap={{ scale: 0.95 }}
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
            background: 'rgba(0, 243, 255, 0.1)'
          }}
        >
          Enter The City
        </motion.button>
      </motion.div>
    </AnimatePresence>
  );
}

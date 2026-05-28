import { useEffect } from 'react';
import { useProgress } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../../store/useStore';

export default function Preloader() {
  const { progress } = useProgress();
  const { setScene, currentScene } = useStore();

  useEffect(() => {
    // When progress holds 100 for a bit, switch to entry scene
    if (progress === 100) {
      const timer = setTimeout(() => {
        if (currentScene === 'preloader') {
          setScene('entry');
        }
      }, 800); // short delay to show 100%
      return () => clearTimeout(timer);
    }
  }, [progress, currentScene, setScene]);

  return (
    <AnimatePresence>
      {currentScene === 'preloader' && (
        <motion.div
          className="preloader-container"
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 1, ease: 'easeInOut' } }}
        >
          <motion.h1 
            className="preloader-text"
            animate={{ 
              textShadow: ['0 0 10px rgba(0, 243, 255, 0.5)', '0 0 20px rgba(0, 243, 255, 0.9)', '0 0 10px rgba(0, 243, 255, 0.5)'] 
            }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Loading Systems...
          </motion.h1>
          <div className="progress-bar-bg">
            <div 
              className="progress-bar-fill" 
              style={{ width: `${progress}%` }} 
            />
          </div>
          <div style={{ marginTop: '10px', fontSize: '0.9rem', color: 'rgba(255,255,255,0.6)' }}>
            {Math.round(progress)}%
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

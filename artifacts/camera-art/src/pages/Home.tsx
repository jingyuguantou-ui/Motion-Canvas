import { useState, useEffect } from 'react';
import { CameraLayer } from '@/components/CameraLayer';
import { ControlsPanel } from '@/components/ControlsPanel';
import { ArtSettings } from '@/lib/art-engine';
import { motion, AnimatePresence } from 'framer-motion';

const BOOT_SEQUENCE = [
  "INITIALIZING NEURAL INTERFACE...",
  "LOADING PARTICLE ENGINE...",
  "CALIBRATING MOTION VECTORS...",
  "SYSTEM READY. AWAITING OPERATOR INPUT."
];

export default function Home() {
  const [isActive, setIsActive] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [bootStep, setBootStep] = useState(0);
  
  const [settings, setSettings] = useState<ArtSettings>({
    mode: 'particles',
    palette: 'neon',
    particleCount: 60,
    sensitivity: 70,
    showCamera: false
  });

  useEffect(() => {
    if (bootStep < BOOT_SEQUENCE.length) {
      const timer = setTimeout(() => {
        setBootStep(prev => prev + 1);
      }, 800 + Math.random() * 500);
      return () => clearTimeout(timer);
    }
  }, [bootStep]);

  return (
    <main className="relative w-screen h-screen bg-background overflow-hidden text-foreground flicker-anim">
      {/* Background grid */}
      {!isActive && (
        <div className="absolute inset-0 grid-bg opacity-30" />
      )}

      {/* Corners */}
      <div className="absolute top-4 left-4 w-16 h-16 border-t-2 border-l-2 border-secondary/70 shadow-[-2px_-2px_8px_rgba(0,255,255,0.4)] z-50 pointer-events-none" />
      <div className="absolute top-4 right-4 w-16 h-16 border-t-2 border-r-2 border-secondary/70 shadow-[2px_-2px_8px_rgba(0,255,255,0.4)] z-50 pointer-events-none" />
      <div className="absolute bottom-4 left-4 w-16 h-16 border-b-2 border-l-2 border-secondary/70 shadow-[-2px_2px_8px_rgba(0,255,255,0.4)] z-50 pointer-events-none" />
      <div className="absolute bottom-4 right-4 w-16 h-16 border-b-2 border-r-2 border-secondary/70 shadow-[2px_2px_8px_rgba(0,255,255,0.4)] z-50 pointer-events-none" />

      {/* The Core Canvas Layer */}
      <CameraLayer 
        settings={settings} 
        isActive={isActive} 
        onCameraReady={() => setIsReady(true)} 
      />

      {/* Landing Sequence */}
      <AnimatePresence>
        {!isActive && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
            transition={{ duration: 0.5, ease: "easeInOut" }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center bg-background/80 backdrop-blur-sm"
          >
            <div className="absolute top-8 text-secondary font-mono text-xs tracking-widest opacity-70">
              // MOTION CAPTURE INTERFACE v2.077
            </div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="max-w-3xl w-full flex flex-col items-center"
            >
              <h1 className="text-6xl md:text-9xl font-display text-transparent glitch-text mb-2 tracking-[0.1em] font-black leading-none drop-shadow-[0_0_10px_rgba(0,255,255,0.5)]" style={{ WebkitTextStroke: '2px var(--color-secondary)' }}>
                KINETIC
              </h1>
              <h1 className="text-6xl md:text-9xl font-display text-primary glitch-text mb-12 tracking-[0.4em] font-black leading-none glow-text-primary">
                V O I D
              </h1>
              
              <div className="text-left w-full max-w-lg mx-auto mb-12 h-32 font-mono text-sm text-secondary/80 flex flex-col gap-2">
                {BOOT_SEQUENCE.slice(0, bootStep).map((text, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-primary">{'>'}</span> {text}
                  </div>
                ))}
                {bootStep < BOOT_SEQUENCE.length && (
                  <div className="flex gap-2">
                    <span className="text-primary">{'>'}</span> <span className="animate-pulse bg-secondary w-2 h-4 block" />
                  </div>
                )}
                {bootStep >= BOOT_SEQUENCE.length && (
                  <div className="flex gap-2 mt-4 text-accent animate-pulse glow-text">
                    <span className="text-primary">{'>'}</span> //&lt;ACCESS_GRANTED&gt;
                  </div>
                )}
              </div>

              {bootStep >= BOOT_SEQUENCE.length && (
                <button
                  onClick={() => setIsActive(true)}
                  className="group relative px-8 py-4 bg-accent text-background font-mono tracking-[0.2em] font-bold uppercase overflow-hidden hover:scale-105 transition-all duration-300 clip-corner glow-box-accent border-2 border-transparent hover:border-white"
                >
                  <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300" />
                  <span className="relative z-10 flex items-center gap-3">
                    [ JACK INTO THE GRID ]
                  </span>
                </button>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls Overlay - only show when camera is active and ready */}
      <AnimatePresence>
        {isActive && isReady && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1 }}
          >
            <ControlsPanel settings={settings} onChange={setSettings} />
            
            {/* HUD Status */}
            <div className="absolute top-8 left-8 z-40 pointer-events-none">
               <h2 className="font-mono text-sm tracking-[0.2em] text-secondary bg-background/50 px-2 py-1 border border-secondary/30">
                 KV_OS // ACTIVE // v2.077
               </h2>
               <div className="flex items-center gap-2 mt-2 bg-background/50 px-2 py-1 w-fit border border-secondary/30">
                 <div className="w-2 h-2 bg-primary rounded-none animate-pulse glow-box" />
                 <span className="text-xs font-mono text-primary">SCANNING MOTION VECTORS</span>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="absolute bottom-0 w-full p-2 text-center z-50 pointer-events-none bg-background/80 border-t border-secondary/30">
        <p className="text-[10px] font-mono text-secondary/60 tracking-widest">
          CORP TECH | NIGHT CITY NET | STATUS: ONLINE | v2.077
        </p>
      </div>
    </main>
  );
}

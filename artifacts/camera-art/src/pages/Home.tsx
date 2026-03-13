import { useState, useEffect } from 'react';
import { CameraLayer } from '@/components/CameraLayer';
import { ControlsPanel } from '@/components/ControlsPanel';
import { ArtSettings } from '@/lib/art-engine';
import { motion, AnimatePresence } from 'framer-motion';

const BOOT_SEQUENCE = [
  "INITIALIZING NEURAL INTERFACE...",
  "LOADING PARTICLE ENGINE...",
  "CALIBRATING MOTION VECTORS...",
  "SYSTEM READY. AWAITING OPERATOR INPUT.",
];

export default function Home() {
  const [isActive, setIsActive] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [bootStep, setBootStep] = useState(0);
  const [cameraFailed, setCameraFailed] = useState(false);

  const [settings, setSettings] = useState<ArtSettings>({
    mode: 'particles',
    palette: 'neon',
    particleCount: 60,
    sensitivity: 70,
    showCamera: false,
    demoMode: false,
  });

  useEffect(() => {
    if (bootStep < BOOT_SEQUENCE.length) {
      const t = setTimeout(() => setBootStep(p => p + 1), 700 + Math.random() * 400);
      return () => clearTimeout(t);
    }
  }, [bootStep]);

  const jackIn = (demo = false) => {
    setSettings(s => ({ ...s, demoMode: demo }));
    setIsActive(true);
    setCameraFailed(false);
  };

  const handleCameraError = () => {
    setCameraFailed(true);
  };

  return (
    <main className="relative w-screen h-screen bg-background overflow-hidden text-foreground flicker-anim">
      {/* Animated background grid */}
      {!isActive && <div className="absolute inset-0 grid-bg opacity-30" />}

      {/* HUD corner brackets */}
      <div className="absolute top-4 left-4 w-16 h-16 border-t-2 border-l-2 border-secondary/70 shadow-[-2px_-2px_8px_rgba(0,255,255,0.4)] z-50 pointer-events-none" />
      <div className="absolute top-4 right-4 w-16 h-16 border-t-2 border-r-2 border-secondary/70 shadow-[2px_-2px_8px_rgba(0,255,255,0.4)] z-50 pointer-events-none" />
      <div className="absolute bottom-4 left-4 w-16 h-16 border-b-2 border-l-2 border-secondary/70 shadow-[-2px_2px_8px_rgba(0,255,255,0.4)] z-50 pointer-events-none" />
      <div className="absolute bottom-4 right-4 w-16 h-16 border-b-2 border-r-2 border-secondary/70 shadow-[2px_2px_8px_rgba(0,255,255,0.4)] z-50 pointer-events-none" />

      {/* Canvas + camera layer */}
      <CameraLayer
        settings={settings}
        isActive={isActive}
        onCameraReady={() => setIsReady(true)}
        onCameraError={handleCameraError}
      />

      {/* Landing overlay */}
      <AnimatePresence>
        {!isActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 1.05, filter: 'blur(8px)' }}
            transition={{ duration: 0.5 }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center bg-background/85 backdrop-blur-sm"
          >
            <div className="absolute top-8 text-secondary font-mono text-xs tracking-widest opacity-70">
              // MOTION CAPTURE INTERFACE v2.077
            </div>

            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="max-w-2xl w-full flex flex-col items-center"
            >
              <h1
                className="text-6xl md:text-9xl font-display text-transparent glitch-text mb-2 tracking-[0.1em] font-black leading-none"
                style={{ WebkitTextStroke: '2px var(--color-secondary)' }}
              >
                KINETIC
              </h1>
              <h1 className="text-6xl md:text-9xl font-display text-primary glitch-text mb-10 tracking-[0.4em] font-black leading-none glow-text-primary">
                V O I D
              </h1>

              {/* Boot sequence */}
              <div className="text-left w-full max-w-md mx-auto mb-10 min-h-[7rem] font-mono text-sm text-secondary/80 flex flex-col gap-1.5">
                {BOOT_SEQUENCE.slice(0, bootStep).map((text, i) => (
                  <div key={i} className="flex gap-2">
                    <span className="text-primary shrink-0">{'>'}</span>
                    <span>{text}</span>
                  </div>
                ))}
                {bootStep < BOOT_SEQUENCE.length && (
                  <div className="flex gap-2">
                    <span className="text-primary shrink-0">{'>'}</span>
                    <span className="animate-pulse bg-secondary w-2 h-4 inline-block" />
                  </div>
                )}
                {bootStep >= BOOT_SEQUENCE.length && (
                  <div className="flex gap-2 mt-2 text-accent animate-pulse glow-text">
                    <span className="text-primary shrink-0">{'>'}</span>
                    <span>{'// <ACCESS_GRANTED>'}</span>
                  </div>
                )}
              </div>

              {/* Action buttons */}
              {bootStep >= BOOT_SEQUENCE.length && (
                <div className="flex flex-col gap-3 w-full max-w-sm">
                  {/* Primary: camera */}
                  <button
                    onClick={() => jackIn(false)}
                    className="group relative w-full px-8 py-4 bg-accent text-background font-mono tracking-[0.15em] font-bold uppercase overflow-hidden hover:scale-105 transition-all duration-200 clip-corner glow-box-accent"
                  >
                    <div className="absolute inset-0 bg-white/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300" />
                    <span className="relative z-10">[ JACK INTO THE GRID ]</span>
                  </button>

                  {/* Secondary: demo */}
                  <button
                    onClick={() => jackIn(true)}
                    className="group relative w-full px-8 py-3 bg-transparent text-secondary font-mono tracking-[0.15em] font-bold uppercase border border-secondary/60 hover:border-secondary hover:bg-secondary/10 transition-all duration-200 text-sm"
                  >
                    <span className="relative z-10 flex items-center justify-center gap-2">
                      <span className="text-secondary/50">{'>'}</span>
                      DEMO MODE (no camera)
                    </span>
                  </button>

                  <p className="text-[10px] font-mono text-secondary/30 text-center mt-1">
                    CAMERA NOT WORKING? OPEN THIS PAGE IN A NEW BROWSER TAB.
                  </p>
                </div>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera error fallback — offer demo mode */}
      <AnimatePresence>
        {isActive && cameraFailed && !settings.demoMode && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm"
          >
            <div className="glass-panel p-8 clip-corner border-2 border-primary max-w-sm w-full text-center glow-box">
              <p className="font-mono text-accent text-xs tracking-widest mb-2">// FALLBACK AVAILABLE</p>
              <h3 className="font-mono text-primary text-lg tracking-widest mb-4">CAMERA BLOCKED</h3>
              <p className="font-mono text-secondary/60 text-xs mb-6 leading-relaxed">
                Browser is sandboxing camera access. Switch to DEMO MODE to explore all effects without a camera.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => { setSettings(s => ({ ...s, demoMode: true })); setCameraFailed(false); setIsReady(true); }}
                  className="w-full px-6 py-3 bg-primary/20 text-primary border border-primary hover:bg-primary hover:text-background transition-all font-mono uppercase tracking-widest text-sm clip-corner"
                >
                  [ SWITCH TO DEMO MODE ]
                </button>
                <button
                  onClick={() => { setIsActive(false); setCameraFailed(false); }}
                  className="w-full px-4 py-2 bg-transparent text-secondary/50 border border-secondary/30 hover:border-secondary/60 transition-all font-mono text-xs uppercase tracking-widest"
                >
                  [ BACK ]
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls (shown when active and ready) */}
      <AnimatePresence>
        {isActive && isReady && !cameraFailed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 1 }}>
            <ControlsPanel settings={settings} onChange={setSettings} />

            <div className="absolute top-12 left-8 z-40 pointer-events-none">
              <h2 className="font-mono text-xs tracking-[0.2em] text-secondary bg-background/50 px-2 py-1 border border-secondary/30">
                KV_OS // ACTIVE // v2.077
              </h2>
              <div className="flex items-center gap-2 mt-1 bg-background/50 px-2 py-1 w-fit border border-secondary/30">
                <div className="w-2 h-2 bg-primary animate-pulse" />
                <span className="text-xs font-mono text-primary">
                  {settings.demoMode ? 'DEMO MODE // SIMULATED MOTION' : 'SCANNING MOTION VECTORS'}
                </span>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom status bar */}
      <div className="absolute bottom-0 w-full p-2 text-center z-50 pointer-events-none bg-background/80 border-t border-secondary/30">
        <p className="text-[10px] font-mono text-secondary/60 tracking-widest">
          CORP TECH | NIGHT CITY NET | STATUS: ONLINE | v2.077
        </p>
      </div>
    </main>
  );
}

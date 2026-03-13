import { useState } from 'react';
import { CameraLayer } from '@/components/CameraLayer';
import { ControlsPanel } from '@/components/ControlsPanel';
import { ArtSettings } from '@/lib/art-engine';
import { motion, AnimatePresence } from 'framer-motion';
import { ScanFace } from 'lucide-react';

export default function Home() {
  const [isActive, setIsActive] = useState(false);
  const [isReady, setIsReady] = useState(false);
  
  const [settings, setSettings] = useState<ArtSettings>({
    mode: 'particles',
    palette: 'neon',
    particleCount: 60,
    sensitivity: 70,
    showCamera: false
  });

  return (
    <main className="relative w-screen h-screen bg-background overflow-hidden">
      
      {/* Background visual for landing */}
      {!isActive && (
        <div 
          className="absolute inset-0 opacity-40 mix-blend-screen pointer-events-none transition-opacity duration-1000"
          style={{
            backgroundImage: `url(${import.meta.env.BASE_URL}images/space-bg.png)`,
            backgroundSize: 'cover',
            backgroundPosition: 'center'
          }}
        />
      )}

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
            transition={{ duration: 0.8, ease: "easeInOut" }}
            className="absolute inset-0 z-30 flex flex-col items-center justify-center p-6 text-center bg-background/60 backdrop-blur-sm"
          >
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2 }}
              className="max-w-2xl"
            >
              <div className="w-24 h-24 mx-auto mb-8 rounded-full border border-primary/30 flex items-center justify-center glow-box">
                <ScanFace className="w-12 h-12 text-primary" />
              </div>
              
              <h1 className="text-5xl md:text-7xl font-display text-white mb-6 glow-text tracking-[0.2em]">
                KINETIC<br/><span className="text-primary">VOID</span>
              </h1>
              
              <p className="text-lg md:text-xl text-muted-foreground font-light mb-12 max-w-lg mx-auto leading-relaxed">
                Step into the field. Your motion dictates the shape of the cosmos.
              </p>

              <button
                onClick={() => setIsActive(true)}
                className="group relative px-8 py-4 bg-primary/10 border border-primary/50 text-white font-display tracking-widest uppercase rounded-full overflow-hidden hover:scale-105 transition-all duration-300"
              >
                <div className="absolute inset-0 bg-primary/20 translate-y-[100%] group-hover:translate-y-0 transition-transform duration-300" />
                <span className="relative z-10 flex items-center gap-3">
                  Initialize Sensors
                  <div className="w-2 h-2 bg-secondary rounded-full animate-pulse glow-box-secondary" />
                </span>
              </button>
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
            
            {/* Subtle persistent HUD element */}
            <div className="absolute top-8 left-8 z-40 pointer-events-none mix-blend-screen">
               <h2 className="font-display text-sm tracking-[0.3em] text-white/50">KV_OS // ACTIVE</h2>
               <div className="flex items-center gap-2 mt-2">
                 <div className="w-1 h-1 bg-secondary rounded-full animate-pulse" />
                 <span className="text-[10px] font-mono text-secondary/70">TRACKING</span>
               </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

    </main>
  );
}

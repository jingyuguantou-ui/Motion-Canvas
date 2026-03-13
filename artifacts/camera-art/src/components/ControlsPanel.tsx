import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArtSettings, EffectMode, Palette } from '@/lib/art-engine';
import { Settings2, X, Sparkles, Activity, Layers, Droplet, Palette as PaletteIcon, Eye, EyeOff } from 'lucide-react';

interface ControlsPanelProps {
  settings: ArtSettings;
  onChange: (settings: ArtSettings) => void;
}

export function ControlsPanel({ settings, onChange }: ControlsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const update = (key: keyof ArtSettings, value: any) => {
    onChange({ ...settings, [key]: value });
  };

  const modeIcons: Record<EffectMode, React.ReactNode> = {
    particles: <Sparkles className="w-4 h-4" />,
    trails: <Activity className="w-4 h-4" />,
    ripple: <Droplet className="w-4 h-4" />,
    mirror: <Layers className="w-4 h-4" />
  };

  const palettes: { id: Palette; name: string; colors: string[] }[] = [
    { id: 'neon', name: 'Neon Synth', colors: ['#ff00ff', '#00ffff', '#00ff00'] },
    { id: 'fire', name: 'Solar Flare', colors: ['#ff4000', '#ffbf00', '#ff0000'] },
    { id: 'ocean', name: 'Deep Abyss', colors: ['#0080ff', '#00ffff', '#ffffff'] },
    { id: 'rainbow', name: 'Prism Core', colors: ['#ff0000', '#00ff00', '#0000ff'] }
  ];

  return (
    <>
      {/* Toggle Button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1 }}
        onClick={() => setIsOpen(true)}
        className={`absolute bottom-8 right-8 z-40 p-4 rounded-full glass-panel glow-box text-white hover:text-primary transition-colors ${isOpen ? 'hidden' : 'flex'}`}
      >
        <Settings2 className="w-6 h-6" />
      </motion.button>

      {/* Main Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="absolute top-4 right-4 bottom-4 w-80 glass-panel rounded-3xl p-6 z-50 flex flex-col gap-8 overflow-y-auto"
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg tracking-widest text-white glow-text">Parameters</h3>
              <button 
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-full hover:bg-white/10 text-muted-foreground hover:text-white transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Mode Selection */}
            <div className="space-y-4">
              <label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <Layers className="w-3 h-3" /> Core Algorithm
              </label>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(modeIcons) as EffectMode[]).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => update('mode', mode)}
                    className={`flex items-center gap-2 p-3 rounded-xl border transition-all ${
                      settings.mode === mode 
                        ? 'bg-primary/20 border-primary text-white glow-box' 
                        : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                    }`}
                  >
                    {modeIcons[mode]}
                    <span className="text-sm capitalize">{mode}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Palette Selection */}
            <div className="space-y-4">
              <label className="text-xs uppercase tracking-widest text-muted-foreground flex items-center gap-2">
                <PaletteIcon className="w-3 h-3" /> Emission Spectrum
              </label>
              <div className="grid grid-cols-1 gap-2">
                {palettes.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => update('palette', p.id)}
                    className={`flex items-center justify-between p-3 rounded-xl border transition-all ${
                      settings.palette === p.id 
                        ? 'bg-primary/10 border-primary text-white' 
                        : 'bg-white/5 border-white/10 text-muted-foreground hover:bg-white/10'
                    }`}
                  >
                    <span className="text-sm tracking-wide">{p.name}</span>
                    <div className="flex -space-x-2">
                      {p.colors.map((c, i) => (
                        <div 
                          key={i} 
                          className="w-4 h-4 rounded-full border border-black/50" 
                          style={{ backgroundColor: c, boxShadow: `0 0 8px ${c}` }}
                        />
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Entity Count</label>
                  <span className="text-xs font-mono text-primary">{settings.particleCount}%</span>
                </div>
                <input 
                  type="range" 
                  min="10" max="100" 
                  value={settings.particleCount}
                  onChange={(e) => update('particleCount', parseInt(e.target.value))}
                  className="w-full accent-primary h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs uppercase tracking-widest text-muted-foreground">Motion Sensitivity</label>
                  <span className="text-xs font-mono text-secondary">{settings.sensitivity}%</span>
                </div>
                <input 
                  type="range" 
                  min="10" max="100" 
                  value={settings.sensitivity}
                  onChange={(e) => update('sensitivity', parseInt(e.target.value))}
                  className="w-full accent-secondary h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* Toggles */}
            <div className="pt-4 border-t border-white/10">
              <button
                onClick={() => update('showCamera', !settings.showCamera)}
                className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all ${
                  settings.showCamera
                    ? 'bg-white/10 border-white/20 text-white'
                    : 'bg-black/40 border-white/5 text-muted-foreground'
                }`}
              >
                <div className="flex items-center gap-3">
                  {settings.showCamera ? <Eye className="w-5 h-5" /> : <EyeOff className="w-5 h-5" />}
                  <span className="text-sm font-medium">Optics Feedback Overlay</span>
                </div>
                <div className={`w-10 h-5 rounded-full p-1 transition-colors ${settings.showCamera ? 'bg-primary' : 'bg-white/20'}`}>
                  <div className={`w-3 h-3 bg-white rounded-full transition-transform ${settings.showCamera ? 'translate-x-5' : 'translate-x-0'}`} />
                </div>
              </button>
            </div>

          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

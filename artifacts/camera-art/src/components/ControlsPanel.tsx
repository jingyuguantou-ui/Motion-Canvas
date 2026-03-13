import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArtSettings, EffectMode, Palette } from '@/lib/art-engine';
import {
  Settings2, X, Sparkles, Activity, Layers, Droplet,
  Eye, EyeOff, Code2, GitBranch, Zap, Network
} from 'lucide-react';

interface ControlsPanelProps {
  settings: ArtSettings;
  onChange: (settings: ArtSettings) => void;
}

const MODE_META: Record<EffectMode, { icon: React.ReactNode; label: string; desc: string }> = {
  particles:      { icon: <Sparkles className="w-4 h-4" />,   label: 'PARTICLES',    desc: 'Burst' },
  trails:         { icon: <Activity className="w-4 h-4" />,   label: 'TRAILS',       desc: 'Stream' },
  ripple:         { icon: <Droplet className="w-4 h-4" />,    label: 'RIPPLE',       desc: 'Pulse' },
  mirror:         { icon: <Layers className="w-4 h-4" />,     label: 'MIRROR',       desc: 'Reflect' },
  ascii:          { icon: <Code2 className="w-4 h-4" />,      label: 'ASCII',        desc: 'Decode' },
  contour:        { icon: <GitBranch className="w-4 h-4" />,  label: 'CONTOUR',      desc: 'Topology' },
  'magnet-shatter': { icon: <Zap className="w-4 h-4" />,      label: 'MAG-SHATTER',  desc: 'Shatter' },
  'neural-ascii': { icon: <Network className="w-4 h-4" />,    label: 'NEURAL-ASCII', desc: 'Synapse' },
};

const MODES: EffectMode[] = ['particles', 'trails', 'ripple', 'mirror', 'ascii', 'contour', 'magnet-shatter', 'neural-ascii'];

export function ControlsPanel({ settings, onChange }: ControlsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);

  const update = (key: keyof ArtSettings, value: unknown) => {
    onChange({ ...settings, [key]: value });
  };

  const palettes: { id: Palette; name: string; colors: string[] }[] = [
    { id: 'neon',   name: 'NEON',   colors: ['#FFD700', '#FF2D78', '#00FFFF'] },
    { id: 'fire',   name: 'FIRE',   colors: ['#ff4000', '#ffbf00', '#ff0000'] },
    { id: 'ocean',  name: 'OCEAN',  colors: ['#00FFFF', '#0080ff', '#0040ff'] },
    { id: 'matrix', name: 'MATRIX', colors: ['#00FF41', '#008F11', '#00FF41'] },
  ];

  const meta = MODE_META[settings.mode];

  return (
    <>
      {/* Toggle button */}
      <motion.button
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ delay: 1 }}
        onClick={() => setIsOpen(true)}
        className={`absolute bottom-12 right-8 z-40 p-4 clip-corner bg-background border-2 border-secondary text-secondary hover:bg-secondary hover:text-background transition-colors glow-box-secondary ${isOpen ? 'hidden' : 'flex'} flex-col items-center gap-1`}
      >
        <Settings2 className="w-6 h-6" />
        <span className="text-[8px] font-mono tracking-widest">{meta.label}</span>
      </motion.button>

      {/* Side Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ x: 400, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 400, opacity: 0 }}
            transition={{ type: 'tween', duration: 0.2 }}
            className="absolute top-8 right-8 bottom-12 w-80 glass-panel clip-corner-reverse p-6 z-50 flex flex-col gap-5 overflow-y-auto border-l-4 border-l-primary"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-secondary/30 pb-4">
              <h3 className="font-mono text-sm tracking-widest text-accent glow-text">{'//<CONTROL_MATRIX>'}</h3>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 border border-secondary text-secondary hover:bg-secondary hover:text-background transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Effect Mode */}
            <div className="space-y-3">
              <label className="text-xs font-mono tracking-widest text-secondary flex items-center gap-2">
                {'>>'} EFFECT_MODE:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MODES.map((mode) => {
                  const m = MODE_META[mode];
                  const active = settings.mode === mode;
                  return (
                    <button
                      key={mode}
                      onClick={() => update('mode', mode)}
                      className={`flex items-center gap-2 p-2 text-[10px] font-mono transition-all uppercase ${
                        active
                          ? 'bg-accent border border-accent text-background glow-box-accent'
                          : 'bg-transparent border border-secondary/40 text-secondary hover:border-secondary'
                      }`}
                    >
                      {m.icon}
                      <div className="text-left leading-tight">
                        <div className="font-bold">{m.label}</div>
                        <div className="opacity-60">{m.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Color Palette — hide for modes that render their own colors */}
            <div className="space-y-3">
              <label className="text-xs font-mono tracking-widest text-secondary flex items-center gap-2">
                {'>>'} COLOR_SCHEMA:
              </label>
              <div className="grid grid-cols-2 gap-2">
                {palettes.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => update('palette', p.id)}
                    className={`flex flex-col items-center justify-center p-2 gap-2 transition-all border ${
                      settings.palette === p.id
                        ? 'bg-primary/20 border border-primary text-white glow-box'
                        : 'bg-transparent border border-secondary/40 text-secondary hover:border-secondary'
                    }`}
                  >
                    <div className="flex gap-1">
                      {p.colors.map((c, i) => (
                        <div
                          key={i}
                          className="w-3 h-3 border border-black"
                          style={{ backgroundColor: c, boxShadow: `0 0 5px ${c}` }}
                        />
                      ))}
                    </div>
                    <span className="text-[10px] font-mono tracking-widest">{p.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-5 pt-1">
              {/* Only show particle count for particle modes */}
              {(['particles','trails','ripple','mirror'] as EffectMode[]).includes(settings.mode) && (
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <label className="text-xs font-mono tracking-widest text-secondary">{'>>'} PARTICLE_COUNT:</label>
                    <span className="text-xs font-mono text-accent bg-background/80 px-1 border border-secondary/30">{settings.particleCount}%</span>
                  </div>
                  <input
                    type="range" min="10" max="100"
                    value={settings.particleCount}
                    onChange={(e) => update('particleCount', parseInt(e.target.value))}
                    className="w-full h-1 bg-secondary/20 appearance-none cursor-pointer outline-none slider-thumb slider-accent"
                  />
                </div>
              )}

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-mono tracking-widest text-secondary">{'>>'} SENSITIVITY:</label>
                  <span className="text-xs font-mono text-primary bg-background/80 px-1 border border-secondary/30">{settings.sensitivity}%</span>
                </div>
                <input
                  type="range" min="10" max="100"
                  value={settings.sensitivity}
                  onChange={(e) => update('sensitivity', parseInt(e.target.value))}
                  className="w-full h-1 bg-secondary/20 appearance-none cursor-pointer outline-none slider-thumb slider-primary"
                />
              </div>
            </div>

            {/* Mode hint */}
            <div className="border border-secondary/20 p-3 bg-secondary/5">
              <p className="text-[10px] font-mono text-secondary/60 leading-relaxed">
                {settings.mode === 'ascii' && '>> ASCII: Camera feed mapped to characters. Motion zones glow in neon palette.'}
                {settings.mode === 'contour' && '>> CONTOUR: Edge-detection topology map. Motion areas pulse with neon color.'}
                {settings.mode === 'magnet-shatter' && '>> MAG-SHATTER: Pixel shards repelled by motion, pulled back by magnetic field.'}
                {settings.mode === 'neural-ascii' && '>> NEURAL-ASCII: ASCII base + neural network hotspot connections with live data packets.'}
                {settings.mode === 'particles' && '>> PARTICLES: Motion spawns glowing particle bursts with gravity.'}
                {settings.mode === 'trails' && '>> TRAILS: Motion leaves persistent neon light trails.'}
                {settings.mode === 'ripple' && '>> RIPPLE: Motion emits expanding neon ring shockwaves.'}
                {settings.mode === 'mirror' && '>> MIRROR: Particles mirrored symmetrically across the axis.'}
              </p>
            </div>

            {/* Show feed toggle */}
            <div className="pt-2 border-t border-secondary/30 mt-auto">
              <button
                onClick={() => update('showCamera', !settings.showCamera)}
                className={`w-full flex items-center justify-between p-3 border transition-all ${
                  settings.showCamera
                    ? 'bg-secondary/10 border-secondary text-secondary glow-box-secondary'
                    : 'bg-background border-secondary/30 text-secondary/60'
                }`}
              >
                <div className="flex items-center gap-2 font-mono text-xs">
                  {settings.showCamera ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
                  <span>{settings.showCamera ? '[X]' : '[ ]'} SHOW_FEED</span>
                </div>
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

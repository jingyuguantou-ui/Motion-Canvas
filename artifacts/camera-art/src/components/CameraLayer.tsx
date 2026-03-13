import { useEffect, useRef, useState } from 'react';
import { ArtEngine, ArtSettings } from '@/lib/art-engine';
import { AlertCircle, Loader2, ExternalLink } from 'lucide-react';

interface CameraLayerProps {
  settings: ArtSettings;
  isActive: boolean;
  onCameraReady: () => void;
  onCameraError?: () => void;
}

export function CameraLayer({ settings, isActive, onCameraReady, onCameraError }: CameraLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const engineRef = useRef<ArtEngine | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [isRequesting, setIsRequesting] = useState(false);

  // Handle stream initialization
  useEffect(() => {
    if (!isActive) return;

    // Demo mode — no camera needed
    if (settings.demoMode) {
      onCameraReady();
      return;
    }

    if (!videoRef.current) return;

    let stream: MediaStream | null = null;

    const startCamera = async () => {
      setIsRequesting(true);
      setError(null);
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
          audio: false,
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          onCameraReady();
        }
      } catch {
        setError('CAMERA_ACCESS_DENIED');
        onCameraError?.();
      } finally {
        setIsRequesting(false);
      }
    };

    startCamera();
    return () => { if (stream) stream.getTracks().forEach(t => t.stop()); };
  }, [isActive, settings.demoMode]);

  // Handle Art Engine lifecycle
  useEffect(() => {
    if (!isActive || !canvasRef.current) return;
    if (!settings.demoMode && error) return;

    const timer = setTimeout(() => {
      if (!canvasRef.current) return;
      const video = settings.demoMode ? null : videoRef.current;
      engineRef.current = new ArtEngine(canvasRef.current!, video, settings);
      engineRef.current.start();
    }, 400);

    return () => {
      clearTimeout(timer);
      if (engineRef.current) { engineRef.current.stop(); engineRef.current = null; }
    };
  }, [isActive, error, settings.demoMode]);

  // Sync settings live
  useEffect(() => {
    if (engineRef.current) engineRef.current.updateSettings(settings);
  }, [settings]);

  const openInNewTab = () => {
    window.open(window.location.href, '_blank');
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-background overflow-hidden flex items-center justify-center">
      {/* Hidden video — only used in camera mode */}
      <video ref={videoRef} className="hidden" playsInline muted />

      {/* Main canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-cover z-10" />

      {/* Camera feed overlay */}
      {isActive && settings.showCamera && !settings.demoMode && (
        <video
          autoPlay muted playsInline
          className="absolute inset-0 w-full h-full object-cover opacity-20 sepia saturate-200 hue-rotate-[150deg] mix-blend-screen scale-x-[-1] z-0"
          ref={(el) => {
            if (el && videoRef.current && el.srcObject !== videoRef.current.srcObject) {
              el.srcObject = videoRef.current.srcObject;
            }
          }}
        />
      )}

      {/* Top HUD status bar */}
      {isActive && !error && !isRequesting && (
        <div className="absolute top-0 left-0 w-full z-20 pointer-events-none">
          <div className="flex items-center justify-between p-3 bg-background/60 border-b border-secondary/30 font-mono text-xs text-secondary w-full">
            <div className="flex gap-4">
              <span>SYS.OK</span>
              <span className="animate-pulse text-primary">REC_ACTIVE</span>
              {settings.demoMode && <span className="text-accent animate-pulse">DEMO_MODE</span>}
            </div>
            <div className="flex gap-4">
              <span>MODE: {settings.mode.toUpperCase()}</span>
              <span>BUFFER: STABLE</span>
            </div>
          </div>
        </div>
      )}

      {/* Loading */}
      {isRequesting && (
        <div className="relative z-20 flex flex-col items-center text-primary animate-pulse glass-panel p-8 clip-corner border border-primary glow-box">
          <Loader2 className="w-12 h-12 animate-spin mb-4" />
          <h2 className="text-xl font-mono text-primary tracking-widest uppercase">Initializing Neural Link...</h2>
        </div>
      )}

      {/* Error state */}
      {error === 'CAMERA_ACCESS_DENIED' && (
        <div className="relative z-20 glass-panel p-8 clip-corner border-2 border-destructive max-w-md text-center shadow-[0_0_30px_rgba(255,0,0,0.3)] bg-background/95">
          <AlertCircle className="w-14 h-14 text-destructive mx-auto mb-4 drop-shadow-[0_0_10px_rgba(255,0,0,0.8)]" />
          <h2 className="text-lg font-mono text-destructive mb-2 tracking-widest">NEURAL LINK SEVERED</h2>
          <p className="text-secondary/70 mb-1 font-mono text-xs leading-relaxed">
            CAMERA ACCESS DENIED BY BROWSER SANDBOX.
          </p>
          <p className="text-secondary/50 mb-6 font-mono text-xs leading-relaxed">
            IFRAME RESTRICTIONS ACTIVE. OPEN IN NEW TAB TO ENABLE CAMERA.
          </p>

          <div className="flex flex-col gap-3">
            {/* Open in new tab */}
            <button
              onClick={openInNewTab}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-secondary/10 text-secondary border border-secondary hover:bg-secondary hover:text-background transition-all font-mono uppercase tracking-widest text-sm clip-corner"
            >
              <ExternalLink className="w-4 h-4" />
              [ OPEN IN NEW TAB ]
            </button>

            {/* Reload */}
            <button
              onClick={() => window.location.reload()}
              className="w-full px-4 py-2 bg-destructive/10 text-destructive/70 border border-destructive/40 hover:bg-destructive/20 transition-all font-mono uppercase tracking-widest text-xs"
            >
              [ RETRY CAMERA ]
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

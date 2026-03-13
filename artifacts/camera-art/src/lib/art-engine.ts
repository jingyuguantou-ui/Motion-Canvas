// Core rendering and particle engine detached from React for maximum performance

export type EffectMode = 'particles' | 'trails' | 'ripple' | 'mirror';
export type Palette = 'neon' | 'fire' | 'ocean' | 'rainbow';

export interface ArtSettings {
  mode: EffectMode;
  palette: Palette;
  particleCount: number; // 0 to 100 scale
  sensitivity: number;   // 0 to 100 scale
  showCamera: boolean;
}

const PALETTES: Record<Palette, string[]> = {
  neon: ['#ff00ff', '#00ffff', '#00ff00', '#7000ff', '#ffffff'],
  fire: ['#ff4000', '#ff8000', '#ffbf00', '#ff0000', '#330000'],
  ocean: ['#0080ff', '#00bfff', '#00ffff', '#0040ff', '#ffffff'],
  rainbow: [] // Calculated dynamically
};

class Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  decay: number;
  color: string;
  size: number;
  mode: EffectMode;
  baseX: number;
  baseY: number;

  constructor(x: number, y: number, color: string, mode: EffectMode) {
    this.x = x;
    this.y = y;
    this.baseX = x;
    this.baseY = y;
    
    // Spread based on mode
    const speedMultiplier = mode === 'trails' ? 1.5 : 3;
    this.vx = (Math.random() - 0.5) * speedMultiplier;
    this.vy = (Math.random() - 0.5) * speedMultiplier;
    
    this.life = 1.0;
    this.decay = Math.random() * 0.02 + 0.01;
    this.color = color;
    this.size = Math.random() * 3 + 1;
    this.mode = mode;

    if (mode === 'ripple') {
      this.size = 1;
      this.vx = 0;
      this.vy = 0;
      this.decay = 0.015;
    }
  }

  update() {
    this.x += this.vx;
    this.y += this.vy;
    
    if (this.mode === 'particles' || this.mode === 'mirror') {
      this.vy += 0.05; // Gentle gravity
      this.vx *= 0.99; // Friction
    } else if (this.mode === 'ripple') {
      this.size += 2; // Expand ring
    }
    
    this.life -= this.decay;
  }

  draw(ctx: CanvasRenderingContext2D, canvasWidth: number) {
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    
    if (this.mode === 'ripple') {
      ctx.strokeStyle = this.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      
      // Mirror effect draws a reflection on the opposite side
      if (this.mode === 'mirror') {
        const mirroredX = canvasWidth - this.x;
        ctx.beginPath();
        ctx.arc(mirroredX, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        
        // Sometimes connect them for a cool constellation effect
        if (this.life > 0.8 && Math.random() > 0.9) {
           ctx.strokeStyle = this.color;
           ctx.lineWidth = 0.5;
           ctx.globalAlpha = 0.2;
           ctx.beginPath();
           ctx.moveTo(this.x, this.y);
           ctx.lineTo(mirroredX, this.y);
           ctx.stroke();
        }
      }
    }
    ctx.globalAlpha = 1.0;
  }
}

export class ArtEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private video: HTMLVideoElement;
  
  private particles: Particle[] = [];
  private prevData: Uint8ClampedArray | null = null;
  private animationId: number = 0;
  private settings: ArtSettings;
  
  private width: number = 0;
  private height: number = 0;
  private detectionWidth = 100;
  private detectionHeight = 75;
  private hueShift = 0;

  constructor(
    canvas: HTMLCanvasElement, 
    video: HTMLVideoElement, 
    initialSettings: ArtSettings
  ) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.video = video;
    this.settings = initialSettings;

    // Offscreen canvas for fast motion detection
    this.offCanvas = document.createElement('canvas');
    this.offCanvas.width = this.detectionWidth;
    this.offCanvas.height = this.detectionHeight;
    this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true })!;

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  public updateSettings(newSettings: ArtSettings) {
    this.settings = newSettings;
  }

  private resize = () => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
  }

  private getRandomColor(): string {
    if (this.settings.palette === 'rainbow') {
      return `hsl(${(this.hueShift + Math.random() * 60) % 360}, 100%, 50%)`;
    }
    const colors = PALETTES[this.settings.palette];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  private detectMotion() {
    if (this.video.readyState !== this.video.HAVE_ENOUGH_DATA) return;

    // Draw mirrored video to offscreen canvas
    this.offCtx.save();
    this.offCtx.translate(this.detectionWidth, 0);
    this.offCtx.scale(-1, 1);
    this.offCtx.drawImage(this.video, 0, 0, this.detectionWidth, this.detectionHeight);
    this.offCtx.restore();

    const imageData = this.offCtx.getImageData(0, 0, this.detectionWidth, this.detectionHeight);
    const data = imageData.data;

    if (!this.prevData) {
      this.prevData = new Uint8ClampedArray(data);
      return;
    }

    // Map 0-100 sensitivity to an actual color difference threshold (lower sensitivity = higher threshold)
    // At 100 sensitivity, threshold is low (catches everything). At 0, threshold is high.
    const threshold = 255 - (this.settings.sensitivity * 2.2); 
    
    // Max particles based on setting (0-100 mapped to max spawned per frame)
    const maxSpawns = Math.floor(this.settings.particleCount / 2);
    let spawned = 0;

    // Scale factors to map detection grid back to main canvas
    const scaleX = this.width / this.detectionWidth;
    const scaleY = this.height / this.detectionHeight;

    // Analyze every Nth pixel for performance
    const step = 2;

    for (let y = 0; y < this.detectionHeight; y += step) {
      for (let x = 0; x < this.detectionWidth; x += step) {
        if (spawned > maxSpawns) break;

        const i = (y * this.detectionWidth + x) * 4;
        
        // Simple RGB difference
        const rDiff = Math.abs(data[i] - this.prevData[i]);
        const gDiff = Math.abs(data[i+1] - this.prevData[i+1]);
        const bDiff = Math.abs(data[i+2] - this.prevData[i+2]);
        const totalDiff = rDiff + gDiff + bDiff;

        if (totalDiff > threshold) {
          // Probability to spawn to avoid perfectly grid-aligned clumps
          if (Math.random() > 0.5) {
            const actualX = x * scaleX + (Math.random() * scaleX);
            const actualY = y * scaleY + (Math.random() * scaleY);
            
            this.particles.push(new Particle(
              actualX, 
              actualY, 
              this.getRandomColor(),
              this.settings.mode
            ));
            spawned++;
          }
        }
      }
    }

    this.prevData.set(data);
  }

  public start() {
    const loop = () => {
      this.hueShift = (this.hueShift + 0.5) % 360;

      // Handle background rendering based on mode
      if (this.settings.showCamera && this.video.readyState === this.video.HAVE_ENOUGH_DATA) {
         // Draw faded video bg
         this.ctx.globalAlpha = 0.2;
         this.ctx.save();
         this.ctx.translate(this.width, 0);
         this.ctx.scale(-1, 1);
         this.ctx.drawImage(this.video, 0, 0, this.width, this.height);
         this.ctx.restore();
         
         // Apply a dark overlay to maintain contrast for particles
         this.ctx.globalAlpha = this.settings.mode === 'trails' ? 0.3 : 0.7;
         this.ctx.fillStyle = '#05050A';
         this.ctx.fillRect(0, 0, this.width, this.height);
         this.ctx.globalAlpha = 1.0;
      } else {
        if (this.settings.mode === 'trails') {
          // Fading effect for trails
          this.ctx.fillStyle = 'rgba(5, 5, 10, 0.15)';
          this.ctx.fillRect(0, 0, this.width, this.height);
        } else {
          // Full clear for solid background
          this.ctx.fillStyle = '#05050A';
          this.ctx.fillRect(0, 0, this.width, this.height);
        }
      }

      // Add a subtle vignette/glow to the edges of the canvas
      const gradient = this.ctx.createRadialGradient(
        this.width/2, this.height/2, this.height/4, 
        this.width/2, this.height/2, this.height
      );
      gradient.addColorStop(0, 'rgba(0,0,0,0)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.6)');
      this.ctx.fillStyle = gradient;
      this.ctx.fillRect(0, 0, this.width, this.height);

      this.detectMotion();

      // Update and Draw Particles
      // Cap max particles to prevent massive lag spikes
      if (this.particles.length > 3000) {
         this.particles.splice(0, this.particles.length - 3000);
      }

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.update();
        if (p.life <= 0) {
          this.particles.splice(i, 1);
        } else {
          p.draw(this.ctx, this.width);
        }
      }

      this.animationId = requestAnimationFrame(loop);
    };

    loop();
  }

  public stop() {
    cancelAnimationFrame(this.animationId);
    window.removeEventListener('resize', this.resize);
  }
}

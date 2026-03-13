// Core rendering and particle engine detached from React for maximum performance

export type EffectMode = 'particles' | 'trails' | 'ripple' | 'mirror' | 'ascii' | 'contour' | 'magnet-shatter' | 'neural-ascii';
export type Palette = 'neon' | 'fire' | 'ocean' | 'matrix';

export interface ArtSettings {
  mode: EffectMode;
  palette: Palette;
  particleCount: number;
  sensitivity: number;
  showCamera: boolean;
}

const PALETTES: Record<Palette, string[]> = {
  neon:   ['#FFD700', '#FF2D78', '#00FFFF', '#FF6B00', '#9B59B6'],
  fire:   ['#FF0000', '#FF4000', '#FF8000', '#FFBF00', '#FFFF00'],
  ocean:  ['#00FFFF', '#00BFFF', '#0080FF', '#0040FF', '#00E5FF'],
  matrix: ['#00FF41', '#008F11', '#00FF41', '#003B00', '#00FF41'],
};

const ASCII_CHARS = [' ', '.', ':', ';', '+', 'x', '%', '#', '@'];

// ---------------------------------------------------------------------------
// Standard Particle (used by particles / trails / ripple / mirror)
// ---------------------------------------------------------------------------
class Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; decay: number; color: string; size: number;
  mode: EffectMode; baseX: number; baseY: number;

  constructor(x: number, y: number, color: string, mode: EffectMode) {
    this.x = x; this.y = y; this.baseX = x; this.baseY = y;
    const speedMultiplier = mode === 'trails' ? 2.5 : 4;
    this.vx = (Math.random() - 0.5) * speedMultiplier;
    this.vy = (Math.random() - 0.5) * speedMultiplier;
    this.life = 1.0;
    this.decay = Math.random() * 0.02 + 0.01;
    this.color = color;
    this.size = Math.random() * 4 + 2;
    this.mode = mode;
    if (mode === 'ripple') { this.size = 1; this.vx = 0; this.vy = 0; this.decay = 0.02; }
  }

  update() {
    this.x += this.vx; this.y += this.vy;
    if (this.mode === 'particles' || this.mode === 'mirror') {
      this.vy += 0.08; this.vx *= 0.98;
    } else if (this.mode === 'ripple') {
      this.size += 3;
    }
    this.life -= this.decay;
  }

  draw(ctx: CanvasRenderingContext2D, canvasWidth: number) {
    ctx.globalAlpha = Math.max(0, this.life);
    if (this.mode === 'ripple') {
      ctx.strokeStyle = this.color; ctx.lineWidth = 2;
      ctx.shadowBlur = 15; ctx.shadowColor = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = this.color; ctx.shadowBlur = 10; ctx.shadowColor = this.color;
      if (this.mode === 'particles') {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.globalAlpha = Math.max(0, this.life * 0.3); ctx.fill();
        ctx.globalAlpha = Math.max(0, this.life);
      }
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
      if (this.mode === 'trails') { ctx.shadowBlur = 20; ctx.shadowColor = this.color; }
      if (this.mode === 'mirror') {
        const mx = canvasWidth - this.x;
        ctx.beginPath(); ctx.arc(mx, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        if (this.life > 0.8 && Math.random() > 0.8) {
          ctx.strokeStyle = this.color; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
          ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(mx, this.y); ctx.stroke();
        }
      }
      ctx.shadowBlur = 0;
    }
    ctx.globalAlpha = 1.0;
  }
}

// ---------------------------------------------------------------------------
// Magnet-Shatter: pixel shards that fly on motion and are attracted back
// ---------------------------------------------------------------------------
interface Shard {
  srcX: number; srcY: number;       // grid source position on screen
  x: number; y: number;             // current position
  vx: number; vy: number;
  life: number;                     // 0 = settled, >0 = flying
  r: number; g: number; b: number;  // pixel color
}

// ---------------------------------------------------------------------------
// Neural-ASCII data packet (flows along edges)
// ---------------------------------------------------------------------------
interface Packet {
  nodeA: number; nodeB: number;
  t: number; speed: number; color: string;
}

// ---------------------------------------------------------------------------
// ArtEngine
// ---------------------------------------------------------------------------
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
  private readonly DW = 120;   // detection / sampling width
  private readonly DH = 90;    // detection / sampling height

  // Magnet-Shatter state
  private shards: Shard[] = [];
  private shardCols = 0;
  private shardRows = 0;

  // Neural-ASCII state
  private hotspots: { x: number; y: number; strength: number }[] = [];
  private packets: Packet[] = [];
  private asciiAnimTime = 0;

  constructor(canvas: HTMLCanvasElement, video: HTMLVideoElement, initialSettings: ArtSettings) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true })!;
    this.video = video;
    this.settings = initialSettings;

    this.offCanvas = document.createElement('canvas');
    this.offCanvas.width = this.DW;
    this.offCanvas.height = this.DH;
    this.offCtx = this.offCanvas.getContext('2d', { willReadFrequently: true })!;

    this.resize();
    window.addEventListener('resize', this.resize);
  }

  public updateSettings(newSettings: ArtSettings) {
    const modeChanged = newSettings.mode !== this.settings.mode;
    this.settings = newSettings;
    if (modeChanged) {
      this.particles = [];
      this.shards = [];
      this.hotspots = [];
      this.packets = [];
    }
  }

  private resize = () => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.shards = [];
  };

  private getColor(index = 0): string {
    const colors = PALETTES[this.settings.palette];
    return colors[index % colors.length];
  }

  private getRandomColor(): string {
    const colors = PALETTES[this.settings.palette];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  // ------------------------------------------------------------------
  // Read camera into off-screen canvas, return pixel data (mirrored)
  // ------------------------------------------------------------------
  private captureCameraData(): Uint8ClampedArray | null {
    if (this.video.readyState !== this.video.HAVE_ENOUGH_DATA) return null;
    this.offCtx.save();
    this.offCtx.translate(this.DW, 0);
    this.offCtx.scale(-1, 1);
    this.offCtx.drawImage(this.video, 0, 0, this.DW, this.DH);
    this.offCtx.restore();
    return this.offCtx.getImageData(0, 0, this.DW, this.DH).data;
  }

  // ------------------------------------------------------------------
  // Detect motion: returns list of {x,y,diff} in screen-space coords
  // ------------------------------------------------------------------
  private detectMotion(data: Uint8ClampedArray): { x: number; y: number; diff: number }[] {
    const hits: { x: number; y: number; diff: number }[] = [];
    if (!this.prevData) { this.prevData = new Uint8ClampedArray(data); return hits; }

    const threshold = 255 - this.settings.sensitivity * 2.2;
    const scaleX = this.width / this.DW;
    const scaleY = this.height / this.DH;

    for (let y = 0; y < this.DH; y += 2) {
      for (let x = 0; x < this.DW; x += 2) {
        const i = (y * this.DW + x) * 4;
        const diff = Math.abs(data[i] - this.prevData[i])
                   + Math.abs(data[i+1] - this.prevData[i+1])
                   + Math.abs(data[i+2] - this.prevData[i+2]);
        if (diff > threshold) {
          hits.push({ x: x * scaleX, y: y * scaleY, diff });
        }
      }
    }
    this.prevData.set(data);
    return hits;
  }

  // ==================================================================
  // MODE: ASCII
  // ==================================================================
  private renderASCII(data: Uint8ClampedArray, motionHits: Set<number>) {
    const ctx = this.ctx;
    const charW = 10, charH = 16;
    const cols = Math.floor(this.width / charW);
    const rows = Math.floor(this.height / charH);

    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, this.width, this.height);

    ctx.font = `bold ${charH - 2}px "Share Tech Mono", monospace`;
    ctx.textBaseline = 'top';

    const colors = PALETTES[this.settings.palette];

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        // Map this cell to detection grid
        const dx = Math.floor((col / cols) * this.DW);
        const dy = Math.floor((row / rows) * this.DH);
        const di = (dy * this.DW + dx) * 4;

        const r = data[di], g = data[di+1], b = data[di+2];
        const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const charIdx = Math.min(ASCII_CHARS.length - 1, Math.floor(brightness * ASCII_CHARS.length));
        const char = ASCII_CHARS[charIdx];

        const motionKey = dy * this.DW + dx;
        const isMotion = motionHits.has(motionKey);

        const px = col * charW;
        const py = row * charH;

        if (isMotion) {
          // Hot motion zone: cycle through palette colors with glow
          const colorIdx = Math.floor(this.asciiAnimTime * 3 + col * 0.1 + row * 0.05) % colors.length;
          ctx.fillStyle = colors[colorIdx];
          ctx.shadowBlur = 12;
          ctx.shadowColor = colors[colorIdx];
        } else {
          // Dim greenish for static areas
          const dimmed = `rgba(0,${Math.floor(brightness * 120 + 40)},${Math.floor(brightness * 60)},${0.3 + brightness * 0.5})`;
          ctx.fillStyle = dimmed;
          ctx.shadowBlur = 0;
        }

        ctx.fillText(char, px, py);
      }
    }
    ctx.shadowBlur = 0;
    this.asciiAnimTime += 0.05;
  }

  // ==================================================================
  // MODE: CONTOUR (topology edge detection)
  // ==================================================================
  private renderContour(data: Uint8ClampedArray, motionHits: Set<number>) {
    const ctx = this.ctx;
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, this.width, this.height);

    const scaleX = this.width / this.DW;
    const scaleY = this.height / this.DH;
    const colors = PALETTES[this.settings.palette];

    // Sobel-like edge detection on the detection grid
    for (let y = 1; y < this.DH - 1; y++) {
      for (let x = 1; x < this.DW - 1; x++) {
        const idx = (y * this.DW + x) * 4;

        const brightness = (v: number) => {
          return (data[v] * 0.299 + data[v+1] * 0.587 + data[v+2] * 0.114);
        };

        const tl = brightness((( y-1)*this.DW+(x-1))*4);
        const t  = brightness((( y-1)*this.DW+ x   )*4);
        const tr = brightness((( y-1)*this.DW+(x+1))*4);
        const l  = brightness((  y   *this.DW+(x-1))*4);
        const r  = brightness((  y   *this.DW+(x+1))*4);
        const bl = brightness(((y+1) *this.DW+(x-1))*4);
        const b  = brightness(((y+1) *this.DW+ x   )*4);
        const br = brightness(((y+1) *this.DW+(x+1))*4);

        const gx = -tl - 2*l - bl + tr + 2*r + br;
        const gy = -tl - 2*t - tr + bl + 2*b + br;
        const mag = Math.sqrt(gx*gx + gy*gy);

        if (mag < 30) continue;

        const screenX = x * scaleX;
        const screenY = y * scaleY;

        const isMotion = motionHits.has(y * this.DW + x);
        const intensity = Math.min(1, mag / 300);

        let color: string;
        let glowSize: number;
        if (isMotion) {
          const colorIdx = Math.floor(this.asciiAnimTime * 4 + x * 0.05) % colors.length;
          color = colors[colorIdx];
          glowSize = 20;
        } else {
          // Dim cyan for static edges
          const alpha = 0.2 + intensity * 0.5;
          color = `rgba(0,${Math.floor(200 * intensity)},${Math.floor(255 * intensity)},${alpha})`;
          glowSize = 5;
        }

        ctx.beginPath();
        ctx.arc(screenX, screenY, Math.max(1, intensity * 2.5), 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.shadowBlur = glowSize;
        ctx.shadowColor = color;
        ctx.fill();
      }
    }

    // Draw scan-line animation across topology
    const scanY = ((Date.now() * 0.0003) % 1) * this.height;
    const grad = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
    grad.addColorStop(0, 'rgba(0,255,255,0)');
    grad.addColorStop(0.5, 'rgba(0,255,255,0.08)');
    grad.addColorStop(1, 'rgba(0,255,255,0)');
    ctx.fillStyle = grad;
    ctx.shadowBlur = 0;
    ctx.fillRect(0, scanY - 40, this.width, 80);

    this.asciiAnimTime += 0.04;
  }

  // ==================================================================
  // MODE: MAGNET-SHATTER
  // ==================================================================
  private initShards(data: Uint8ClampedArray) {
    const blockW = 8, blockH = 8;
    this.shardCols = Math.floor(this.width / blockW);
    this.shardRows = Math.floor(this.height / blockH);
    this.shards = [];

    for (let row = 0; row < this.shardRows; row++) {
      for (let col = 0; col < this.shardCols; col++) {
        // Sample corresponding detection pixel
        const dx = Math.floor((col / this.shardCols) * this.DW);
        const dy = Math.floor((row / this.shardRows) * this.DH);
        const di = (dy * this.DW + dx) * 4;
        this.shards.push({
          srcX: col * blockW,
          srcY: row * blockH,
          x: col * blockW,
          y: row * blockH,
          vx: 0, vy: 0, life: 0,
          r: data[di], g: data[di+1], b: data[di+2],
        });
      }
    }
  }

  private renderMagnetShatter(data: Uint8ClampedArray, motionMap: Map<string, number>) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5,5,16,0.4)';
    ctx.fillRect(0, 0, this.width, this.height);

    const blockW = 8, blockH = 8;
    if (this.shards.length === 0) this.initShards(data);

    // Update shard colors from camera each frame (partial update for perf)
    const updateEvery = 3;
    for (let i = 0; i < this.shards.length; i += updateEvery) {
      const s = this.shards[i];
      const col = Math.floor(s.srcX / blockW);
      const row = Math.floor(s.srcY / blockH);
      const dx = Math.floor((col / this.shardCols) * this.DW);
      const dy = Math.floor((row / this.shardRows) * this.DH);
      const di = (dy * this.DW + dx) * 4;
      s.r = data[di]; s.g = data[di+1]; s.b = data[di+2];
    }

    const colors = PALETTES[this.settings.palette];
    const scaleX = this.width / this.DW;
    const scaleY = this.height / this.DH;

    // Collect motion attractors
    const attractors: { x: number; y: number; force: number }[] = [];
    for (const [key, diff] of motionMap) {
      const [gx, gy] = key.split(',').map(Number);
      attractors.push({ x: gx * scaleX, y: gy * scaleY, force: diff / 255 });
    }

    for (const s of this.shards) {
      // Apply attractor forces
      let fx = 0, fy = 0;
      for (const att of attractors) {
        const dx2 = att.x - s.x, dy2 = att.y - s.y;
        const dist = Math.sqrt(dx2*dx2 + dy2*dy2) + 1;
        if (dist < 200) {
          // Repulse close, attract far
          const repel = dist < 40 ? -1 : 1;
          const strength = (att.force * 800) / (dist * dist) * repel;
          fx += (dx2 / dist) * strength;
          fy += (dy2 / dist) * strength;
          s.life = Math.min(1, s.life + 0.05);
        }
      }

      // Spring back to source
      const homeX = s.srcX, homeY = s.srcY;
      const returnStrength = 0.05;
      fx += (homeX - s.x) * returnStrength;
      fy += (homeY - s.y) * returnStrength;

      s.vx = (s.vx + fx) * 0.85;
      s.vy = (s.vy + fy) * 0.85;
      s.x += s.vx;
      s.y += s.vy;
      s.life = Math.max(0, s.life - 0.01);

      // Shattered state
      const displaced = Math.abs(s.x - s.srcX) + Math.abs(s.y - s.srcY);

      if (displaced > 4 && s.life > 0) {
        const colorIdx = Math.floor(s.life * colors.length) % colors.length;
        const neonColor = colors[colorIdx];
        ctx.fillStyle = neonColor;
        ctx.shadowBlur = 8;
        ctx.shadowColor = neonColor;
        ctx.fillRect(s.x, s.y, blockW + 2, blockH + 2);
      } else {
        // Draw camera pixel block (cyan tinted)
        const brightness = (s.r * 0.299 + s.g * 0.587 + s.b * 0.114) / 255;
        ctx.fillStyle = `rgba(${Math.floor(s.r * 0.3)},${Math.floor(brightness * 180 + 40)},${Math.floor(s.b * 0.5 + brightness * 120)},0.7)`;
        ctx.shadowBlur = 0;
        ctx.fillRect(s.x, s.y, blockW, blockH);
      }
    }

    ctx.shadowBlur = 0;
  }

  // ==================================================================
  // MODE: NEURAL-ASCII
  // ==================================================================
  private renderNeuralAscii(data: Uint8ClampedArray, motionHits: Set<number>, motionList: {x:number;y:number;diff:number}[]) {
    const ctx = this.ctx;
    const charW = 12, charH = 18;
    const cols = Math.floor(this.width / charW);
    const rows = Math.floor(this.height / charH);
    const colors = PALETTES[this.settings.palette];

    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, this.width, this.height);

    // 1. Draw ASCII base layer
    ctx.font = `${charH - 3}px "Share Tech Mono", monospace`;
    ctx.textBaseline = 'top';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dx = Math.floor((col / cols) * this.DW);
        const dy = Math.floor((row / rows) * this.DH);
        const di = (dy * this.DW + dx) * 4;

        const brightness = (data[di] * 0.299 + data[di+1] * 0.587 + data[di+2] * 0.114) / 255;
        const charIdx = Math.min(ASCII_CHARS.length - 1, Math.floor(brightness * ASCII_CHARS.length));
        const char = ASCII_CHARS[charIdx];

        const isMotion = motionHits.has(dy * this.DW + dx);
        const px = col * charW, py = row * charH;

        if (isMotion) {
          const ci = Math.floor(this.asciiAnimTime * 2 + col * 0.07 + row * 0.03) % colors.length;
          ctx.fillStyle = colors[ci];
          ctx.shadowBlur = 14;
          ctx.shadowColor = colors[ci];
        } else {
          const dimA = 0.15 + brightness * 0.4;
          ctx.fillStyle = `rgba(0,${Math.floor(brightness * 100 + 30)},${Math.floor(brightness * 50)},${dimA})`;
          ctx.shadowBlur = 0;
        }
        ctx.fillText(char, px, py);
      }
    }
    ctx.shadowBlur = 0;

    // 2. Cluster motion into hotspot nodes
    if (motionList.length > 0) {
      // Simple grid cluster: divide screen into 6x4 zones, pick the hottest
      const zoneW = this.width / 6, zoneH = this.height / 4;
      const zones = new Map<string, {sumX:number;sumY:number;count:number;maxDiff:number}>();
      for (const hit of motionList) {
        const zx = Math.floor(hit.x / zoneW);
        const zy = Math.floor(hit.y / zoneH);
        const key = `${zx},${zy}`;
        const z = zones.get(key) ?? {sumX:0,sumY:0,count:0,maxDiff:0};
        z.sumX += hit.x; z.sumY += hit.y; z.count++; z.maxDiff = Math.max(z.maxDiff, hit.diff);
        zones.set(key, z);
      }

      const newHotspots: typeof this.hotspots = [];
      for (const z of zones.values()) {
        if (z.count > 3) {
          newHotspots.push({ x: z.sumX / z.count, y: z.sumY / z.count, strength: Math.min(1, z.count / 20) });
        }
      }

      // Smooth hotspot positions
      if (newHotspots.length > 0) {
        if (this.hotspots.length === 0) {
          this.hotspots = newHotspots;
        } else {
          // Lerp existing toward new, discard old, add new
          this.hotspots = newHotspots.map(nh => {
            const existing = this.hotspots.find(h => Math.hypot(h.x - nh.x, h.y - nh.y) < 200);
            if (existing) {
              return {
                x: existing.x * 0.6 + nh.x * 0.4,
                y: existing.y * 0.6 + nh.y * 0.4,
                strength: existing.strength * 0.5 + nh.strength * 0.5,
              };
            }
            return nh;
          });
        }
      } else {
        // Fade out hotspots when no motion
        this.hotspots = this.hotspots
          .map(h => ({ ...h, strength: h.strength * 0.85 }))
          .filter(h => h.strength > 0.05);
      }
    } else {
      this.hotspots = this.hotspots
        .map(h => ({ ...h, strength: h.strength * 0.9 }))
        .filter(h => h.strength > 0.05);
    }

    // 3. Draw neural connections between hotspots
    for (let a = 0; a < this.hotspots.length; a++) {
      for (let b = a + 1; b < this.hotspots.length; b++) {
        const ha = this.hotspots[a], hb = this.hotspots[b];
        const dist = Math.hypot(ha.x - hb.x, ha.y - hb.y);
        if (dist > 600) continue;

        const alpha = Math.min(ha.strength, hb.strength) * (1 - dist / 600) * 0.8;
        const colorIdx = (a + b) % colors.length;
        const color = colors[colorIdx];

        // Bezier curve connection
        const cpx = (ha.x + hb.x) / 2 + (Math.random() - 0.5) * 80;
        const cpy = (ha.y + hb.y) / 2 - 60;

        ctx.beginPath();
        ctx.moveTo(ha.x, ha.y);
        ctx.quadraticCurveTo(cpx, cpy, hb.x, hb.y);
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.shadowBlur = 10;
        ctx.shadowColor = color;
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
      }
    }

    // 4. Draw node circles at hotspots
    for (const h of this.hotspots) {
      const colorIdx = Math.floor(this.asciiAnimTime) % colors.length;
      const color = colors[colorIdx];
      const r = 6 + h.strength * 12;

      ctx.beginPath();
      ctx.arc(h.x, h.y, r, 0, Math.PI * 2);
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.globalAlpha = h.strength;
      ctx.shadowBlur = 20;
      ctx.shadowColor = color;
      ctx.stroke();

      // Inner dot
      ctx.beginPath();
      ctx.arc(h.x, h.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = 1;
    }

    // 5. Spawn and animate data packets along edges
    if (this.hotspots.length >= 2 && Math.random() < 0.3) {
      const a = Math.floor(Math.random() * this.hotspots.length);
      let b = Math.floor(Math.random() * this.hotspots.length);
      if (b === a) b = (a + 1) % this.hotspots.length;
      this.packets.push({ nodeA: a, nodeB: b, t: 0, speed: 0.01 + Math.random() * 0.02, color: this.getRandomColor() });
    }

    this.packets = this.packets.filter(p => {
      p.t += p.speed;
      if (p.t > 1) return false;
      if (p.nodeA >= this.hotspots.length || p.nodeB >= this.hotspots.length) return false;
      const ha = this.hotspots[p.nodeA], hb = this.hotspots[p.nodeB];
      const px2 = ha.x + (hb.x - ha.x) * p.t;
      const py2 = ha.y + (hb.y - ha.y) * p.t;

      ctx.beginPath();
      ctx.arc(px2, py2, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color;
      ctx.shadowBlur = 15;
      ctx.shadowColor = p.color;
      ctx.fill();
      ctx.shadowBlur = 0;
      return true;
    });

    this.asciiAnimTime += 0.05;
  }

  // ==================================================================
  // MAIN LOOP
  // ==================================================================
  public start() {
    const loop = () => {
      const mode = this.settings.mode;

      // Capture camera data
      const data = this.captureCameraData();

      if (!data) {
        this.animationId = requestAnimationFrame(loop);
        return;
      }

      const motionList = this.detectMotion(data);

      // Build motion lookup structures
      const motionHits = new Set<number>();
      const motionMap = new Map<string, number>();
      const threshold = 255 - this.settings.sensitivity * 2.2;
      for (const m of motionList) {
        const dx = Math.floor((m.x / this.width) * this.DW);
        const dy = Math.floor((m.y / this.height) * this.DH);
        motionHits.add(dy * this.DW + dx);
        motionMap.set(`${dx},${dy}`, m.diff);
      }

      // ------- Special full-frame renderers -------
      if (mode === 'ascii') {
        this.renderASCII(data, motionHits);
        this.animationId = requestAnimationFrame(loop);
        return;
      }
      if (mode === 'contour') {
        this.renderContour(data, motionHits);
        this.animationId = requestAnimationFrame(loop);
        return;
      }
      if (mode === 'magnet-shatter') {
        this.renderMagnetShatter(data, motionMap);
        this.animationId = requestAnimationFrame(loop);
        return;
      }
      if (mode === 'neural-ascii') {
        this.renderNeuralAscii(data, motionHits, motionList);
        this.animationId = requestAnimationFrame(loop);
        return;
      }

      // ------- Standard particle modes -------
      if (this.settings.showCamera) {
        if (mode === 'trails') {
          this.ctx.fillStyle = 'rgba(10,10,26,0.2)'; this.ctx.fillRect(0, 0, this.width, this.height);
        } else {
          this.ctx.clearRect(0, 0, this.width, this.height);
        }
      } else {
        if (mode === 'trails') {
          this.ctx.fillStyle = 'rgba(5,5,16,0.2)'; this.ctx.fillRect(0, 0, this.width, this.height);
        } else {
          this.ctx.fillStyle = '#050510'; this.ctx.fillRect(0, 0, this.width, this.height);
        }
      }

      const maxSpawns = Math.floor(this.settings.particleCount / 2);
      let spawned = 0;
      for (const m of motionList) {
        if (spawned >= maxSpawns) break;
        if (Math.random() > 0.4) {
          this.particles.push(new Particle(m.x, m.y, this.getRandomColor(), mode));
          spawned++;
        }
      }

      if (this.particles.length > 2500) this.particles.splice(0, this.particles.length - 2500);

      for (let i = this.particles.length - 1; i >= 0; i--) {
        const p = this.particles[i];
        p.update();
        if (p.life <= 0) this.particles.splice(i, 1);
        else p.draw(this.ctx, this.width);
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

// Core rendering and particle engine detached from React for maximum performance

export type EffectMode = 'particles' | 'trails' | 'ripple' | 'mirror' | 'ascii' | 'contour' | 'magnet-shatter' | 'neural-ascii';
export type Palette = 'neon' | 'fire' | 'ocean' | 'matrix';

export interface ArtSettings {
  mode: EffectMode;
  palette: Palette;
  particleCount: number;
  sensitivity: number;
  showCamera: boolean;
  demoMode?: boolean;
}

const PALETTES: Record<Palette, string[]> = {
  neon:   ['#FFD700', '#FF2D78', '#00FFFF', '#FF6B00', '#9B59B6'],
  fire:   ['#FF0000', '#FF4000', '#FF8000', '#FFBF00', '#FFFF00'],
  ocean:  ['#00FFFF', '#00BFFF', '#0080FF', '#0040FF', '#00E5FF'],
  matrix: ['#00FF41', '#008F11', '#00FF41', '#003B00', '#00FF41'],
};

const ASCII_CHARS = [' ', '.', ':', ';', '+', 'x', '%', '#', '@'];

// ---------------------------------------------------------------------------
// Standard Particle
// ---------------------------------------------------------------------------
class Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; decay: number; color: string; size: number;
  mode: EffectMode;

  constructor(x: number, y: number, color: string, mode: EffectMode) {
    this.x = x; this.y = y;
    const spd = mode === 'trails' ? 2.5 : 4;
    this.vx = (Math.random() - 0.5) * spd;
    this.vy = (Math.random() - 0.5) * spd;
    this.life = 1.0;
    this.decay = Math.random() * 0.02 + 0.01;
    this.color = color;
    this.size = Math.random() * 4 + 2;
    this.mode = mode;
    if (mode === 'ripple') { this.size = 1; this.vx = 0; this.vy = 0; this.decay = 0.02; }
  }

  update() {
    this.x += this.vx; this.y += this.vy;
    if (this.mode === 'particles' || this.mode === 'mirror') { this.vy += 0.08; this.vx *= 0.98; }
    else if (this.mode === 'ripple') { this.size += 3; }
    this.life -= this.decay;
  }

  draw(ctx: CanvasRenderingContext2D, W: number) {
    ctx.globalAlpha = Math.max(0, this.life);
    if (this.mode === 'ripple') {
      ctx.strokeStyle = this.color; ctx.lineWidth = 2;
      ctx.shadowBlur = 15; ctx.shadowColor = this.color;
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.stroke();
    } else {
      ctx.fillStyle = this.color; ctx.shadowBlur = 10; ctx.shadowColor = this.color;
      if (this.mode === 'particles') {
        ctx.beginPath(); ctx.arc(this.x, this.y, this.size * 2, 0, Math.PI * 2);
        ctx.globalAlpha = Math.max(0, this.life * 0.3); ctx.fill();
        ctx.globalAlpha = Math.max(0, this.life);
      }
      ctx.beginPath(); ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2); ctx.fill();
      if (this.mode === 'mirror') {
        const mx = W - this.x;
        ctx.beginPath(); ctx.arc(mx, this.y, this.size, 0, Math.PI * 2); ctx.fill();
        if (this.life > 0.8 && Math.random() > 0.8) {
          ctx.strokeStyle = this.color; ctx.lineWidth = 1; ctx.globalAlpha = 0.4;
          ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(mx, this.y); ctx.stroke();
        }
      }
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1.0;
  }
}

// ---------------------------------------------------------------------------
// Magnet shard
// ---------------------------------------------------------------------------
interface Shard {
  srcX: number; srcY: number; x: number; y: number;
  vx: number; vy: number; life: number;
  r: number; g: number; b: number;
}

// ---------------------------------------------------------------------------
// Neural packet
// ---------------------------------------------------------------------------
interface Packet {
  nodeA: number; nodeB: number; t: number; speed: number; color: string;
}

// ---------------------------------------------------------------------------
// ArtEngine
// ---------------------------------------------------------------------------
export class ArtEngine {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private offCanvas: HTMLCanvasElement;
  private offCtx: CanvasRenderingContext2D;
  private video: HTMLVideoElement | null;

  private particles: Particle[] = [];
  private prevData: Uint8ClampedArray | null = null;
  private animationId: number = 0;
  private settings: ArtSettings;

  private width = 0;
  private height = 0;
  private readonly DW = 120;
  private readonly DH = 90;

  // Magnet-shatter
  private shards: Shard[] = [];
  private shardCols = 0;
  private shardRows = 0;

  // Neural-ASCII
  private hotspots: { x: number; y: number; strength: number }[] = [];
  private packets: Packet[] = [];
  private asciiAnimTime = 0;

  // Demo mode state
  private demoTime = 0;
  private demoPhase = 0;

  constructor(
    canvas: HTMLCanvasElement,
    video: HTMLVideoElement | null,
    initialSettings: ArtSettings
  ) {
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

  public updateSettings(s: ArtSettings) {
    const modeChanged = s.mode !== this.settings.mode;
    this.settings = s;
    if (modeChanged) { this.particles = []; this.shards = []; this.hotspots = []; this.packets = []; }
  }

  private resize = () => {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.shards = [];
  };

  private getColor(i = 0) { return PALETTES[this.settings.palette][i % PALETTES[this.settings.palette].length]; }
  private getRandomColor() { const c = PALETTES[this.settings.palette]; return c[Math.floor(Math.random() * c.length)]; }

  // ------------------------------------------------------------------
  // Demo synthetic motion generator
  // Returns pixel data (DW×DH RGBA) + list of motion hits
  // ------------------------------------------------------------------
  private getDemoData(): { data: Uint8ClampedArray; hits: { x: number; y: number; diff: number }[] } {
    const data = new Uint8ClampedArray(this.DW * this.DH * 4);
    const t = this.demoTime;
    const hits: { x: number; y: number; diff: number }[] = [];

    // Generate a few animated "blobs" of motion
    const blobs = [
      { cx: 0.3 + 0.25 * Math.sin(t * 0.7),  cy: 0.4 + 0.2 * Math.cos(t * 0.5),  r: 0.15 },
      { cx: 0.7 + 0.2 * Math.cos(t * 0.9),   cy: 0.6 + 0.25 * Math.sin(t * 0.6), r: 0.12 },
      { cx: 0.5 + 0.3 * Math.sin(t * 0.4 + 1), cy: 0.5 + 0.15 * Math.sin(t * 1.1), r: 0.1 },
    ];

    for (let y = 0; y < this.DH; y++) {
      for (let x = 0; x < this.DW; x++) {
        const nx = x / this.DW, ny = y / this.DH;
        let brightness = 20;
        let isMotion = false;

        for (const b of blobs) {
          const dx = nx - b.cx, dy = ny - b.cy;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < b.r) {
            const v = Math.floor((1 - dist / b.r) * 200);
            brightness = Math.max(brightness, v);
            isMotion = true;
          }
        }

        // Background noise for interesting textures
        const noise = Math.sin(x * 0.3 + t) * Math.cos(y * 0.4 + t * 0.7) * 30 + 30;
        brightness = Math.min(255, brightness + noise);

        const i = (y * this.DW + x) * 4;
        data[i]   = Math.floor(brightness * 0.5);
        data[i+1] = Math.floor(brightness * 0.9);
        data[i+2] = Math.floor(brightness);
        data[i+3] = 255;

        if (isMotion) {
          hits.push({
            x: (x / this.DW) * this.width,
            y: (y / this.DH) * this.height,
            diff: brightness,
          });
        }
      }
    }

    this.demoTime += 0.025;
    return { data, hits };
  }

  // ------------------------------------------------------------------
  // Camera capture
  // ------------------------------------------------------------------
  private captureCameraData(): Uint8ClampedArray | null {
    if (!this.video || this.video.readyState !== this.video.HAVE_ENOUGH_DATA) return null;
    this.offCtx.save();
    this.offCtx.translate(this.DW, 0);
    this.offCtx.scale(-1, 1);
    this.offCtx.drawImage(this.video, 0, 0, this.DW, this.DH);
    this.offCtx.restore();
    return this.offCtx.getImageData(0, 0, this.DW, this.DH).data;
  }

  private detectMotion(data: Uint8ClampedArray): { x: number; y: number; diff: number }[] {
    const hits: { x: number; y: number; diff: number }[] = [];
    if (!this.prevData) { this.prevData = new Uint8ClampedArray(data); return hits; }
    const threshold = 255 - this.settings.sensitivity * 2.2;
    const scaleX = this.width / this.DW, scaleY = this.height / this.DH;
    for (let y = 0; y < this.DH; y += 2) {
      for (let x = 0; x < this.DW; x += 2) {
        const i = (y * this.DW + x) * 4;
        const diff = Math.abs(data[i] - this.prevData[i])
                   + Math.abs(data[i+1] - this.prevData[i+1])
                   + Math.abs(data[i+2] - this.prevData[i+2]);
        if (diff > threshold) hits.push({ x: x * scaleX, y: y * scaleY, diff });
      }
    }
    this.prevData.set(data);
    return hits;
  }

  // ==================================================================
  // ASCII renderer
  // ==================================================================
  private renderASCII(data: Uint8ClampedArray, motionHits: Set<number>) {
    const ctx = this.ctx;
    const charW = 10, charH = 16;
    const cols = Math.floor(this.width / charW);
    const rows = Math.floor(this.height / charH);
    const colors = PALETTES[this.settings.palette];

    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.font = `bold ${charH - 2}px "Share Tech Mono", monospace`;
    ctx.textBaseline = 'top';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dx = Math.floor((col / cols) * this.DW);
        const dy = Math.floor((row / rows) * this.DH);
        const di = (dy * this.DW + dx) * 4;
        const brightness = (data[di] * 0.299 + data[di+1] * 0.587 + data[di+2] * 0.114) / 255;
        const char = ASCII_CHARS[Math.min(ASCII_CHARS.length - 1, Math.floor(brightness * ASCII_CHARS.length))];
        const isMotion = motionHits.has(dy * this.DW + dx);
        const px = col * charW, py = row * charH;

        if (isMotion) {
          const ci = Math.floor(this.asciiAnimTime * 3 + col * 0.1 + row * 0.05) % colors.length;
          ctx.fillStyle = colors[ci]; ctx.shadowBlur = 12; ctx.shadowColor = colors[ci];
        } else {
          ctx.fillStyle = `rgba(0,${Math.floor(brightness * 120 + 40)},${Math.floor(brightness * 60)},${0.3 + brightness * 0.5})`;
          ctx.shadowBlur = 0;
        }
        ctx.fillText(char, px, py);
      }
    }
    ctx.shadowBlur = 0;
    this.asciiAnimTime += 0.05;
  }

  // ==================================================================
  // Contour renderer
  // ==================================================================
  private renderContour(data: Uint8ClampedArray, motionHits: Set<number>) {
    const ctx = this.ctx;
    ctx.fillStyle = '#050510';
    ctx.fillRect(0, 0, this.width, this.height);
    const scaleX = this.width / this.DW, scaleY = this.height / this.DH;
    const colors = PALETTES[this.settings.palette];

    const bri = (v: number) => data[v] * 0.299 + data[v+1] * 0.587 + data[v+2] * 0.114;

    for (let y = 1; y < this.DH - 1; y++) {
      for (let x = 1; x < this.DW - 1; x++) {
        const tl = bri(((y-1)*this.DW+(x-1))*4), t = bri(((y-1)*this.DW+x)*4), tr = bri(((y-1)*this.DW+(x+1))*4);
        const l  = bri((y*this.DW+(x-1))*4),                                        r  = bri((y*this.DW+(x+1))*4);
        const bl = bri(((y+1)*this.DW+(x-1))*4), b = bri(((y+1)*this.DW+x)*4), br = bri(((y+1)*this.DW+(x+1))*4);
        const gx = -tl - 2*l - bl + tr + 2*r + br;
        const gy = -tl - 2*t - tr + bl + 2*b + br;
        const mag = Math.sqrt(gx*gx + gy*gy);
        if (mag < 30) continue;
        const sx = x * scaleX, sy = y * scaleY;
        const isMotion = motionHits.has(y * this.DW + x);
        const intensity = Math.min(1, mag / 300);
        let color: string, glowSize: number;
        if (isMotion) {
          const ci = Math.floor(this.asciiAnimTime * 4 + x * 0.05) % colors.length;
          color = colors[ci]; glowSize = 20;
        } else {
          color = `rgba(0,${Math.floor(200 * intensity)},${Math.floor(255 * intensity)},${0.2 + intensity * 0.5})`; glowSize = 5;
        }
        ctx.beginPath(); ctx.arc(sx, sy, Math.max(1, intensity * 2.5), 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.shadowBlur = glowSize; ctx.shadowColor = color; ctx.fill();
      }
    }
    // Scan line
    const scanY = ((Date.now() * 0.0003) % 1) * this.height;
    const grad = ctx.createLinearGradient(0, scanY - 40, 0, scanY + 40);
    grad.addColorStop(0, 'rgba(0,255,255,0)'); grad.addColorStop(0.5, 'rgba(0,255,255,0.08)'); grad.addColorStop(1, 'rgba(0,255,255,0)');
    ctx.fillStyle = grad; ctx.shadowBlur = 0; ctx.fillRect(0, scanY - 40, this.width, 80);
    this.asciiAnimTime += 0.04;
  }

  // ==================================================================
  // Magnet-shatter
  // ==================================================================
  private initShards(data: Uint8ClampedArray) {
    const bW = 8, bH = 8;
    this.shardCols = Math.floor(this.width / bW);
    this.shardRows = Math.floor(this.height / bH);
    this.shards = [];
    for (let row = 0; row < this.shardRows; row++) {
      for (let col = 0; col < this.shardCols; col++) {
        const dx = Math.floor((col / this.shardCols) * this.DW);
        const dy = Math.floor((row / this.shardRows) * this.DH);
        const di = (dy * this.DW + dx) * 4;
        this.shards.push({ srcX: col * bW, srcY: row * bH, x: col * bW, y: row * bH, vx: 0, vy: 0, life: 0, r: data[di], g: data[di+1], b: data[di+2] });
      }
    }
  }

  private renderMagnetShatter(data: Uint8ClampedArray, motionMap: Map<string, number>) {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(5,5,16,0.4)'; ctx.fillRect(0, 0, this.width, this.height);
    const bW = 8;
    if (this.shards.length === 0) this.initShards(data);

    const colors = PALETTES[this.settings.palette];
    const scaleX = this.width / this.DW, scaleY = this.height / this.DH;
    const attractors: { x: number; y: number; force: number }[] = [];
    for (const [key, diff] of motionMap) {
      const [gx, gy] = key.split(',').map(Number);
      attractors.push({ x: gx * scaleX, y: gy * scaleY, force: diff / 255 });
    }

    for (let i = 0; i < this.shards.length; i += 3) {
      const s = this.shards[i];
      const col = Math.floor(s.srcX / bW);
      const row = Math.floor(s.srcY / bW);
      const dx2 = Math.floor((col / this.shardCols) * this.DW);
      const dy2 = Math.floor((row / this.shardRows) * this.DH);
      const di = (dy2 * this.DW + dx2) * 4;
      s.r = data[di]; s.g = data[di+1]; s.b = data[di+2];
    }

    for (const s of this.shards) {
      let fx = 0, fy = 0;
      for (const att of attractors) {
        const ddx = att.x - s.x, ddy = att.y - s.y;
        const dist = Math.sqrt(ddx*ddx + ddy*ddy) + 1;
        if (dist < 200) {
          const repel = dist < 40 ? -1 : 1;
          const str = (att.force * 800) / (dist * dist) * repel;
          fx += (ddx / dist) * str; fy += (ddy / dist) * str;
          s.life = Math.min(1, s.life + 0.05);
        }
      }
      fx += (s.srcX - s.x) * 0.05; fy += (s.srcY - s.y) * 0.05;
      s.vx = (s.vx + fx) * 0.85; s.vy = (s.vy + fy) * 0.85;
      s.x += s.vx; s.y += s.vy;
      s.life = Math.max(0, s.life - 0.01);

      const displaced = Math.abs(s.x - s.srcX) + Math.abs(s.y - s.srcY);
      if (displaced > 4 && s.life > 0) {
        const ci = Math.floor(s.life * colors.length) % colors.length;
        ctx.fillStyle = colors[ci]; ctx.shadowBlur = 8; ctx.shadowColor = colors[ci];
        ctx.fillRect(s.x, s.y, 10, 10);
      } else {
        const bright = (s.r * 0.299 + s.g * 0.587 + s.b * 0.114) / 255;
        ctx.fillStyle = `rgba(${Math.floor(s.r * 0.3)},${Math.floor(bright * 180 + 40)},${Math.floor(s.b * 0.5 + bright * 120)},0.7)`;
        ctx.shadowBlur = 0; ctx.fillRect(s.x, s.y, 8, 8);
      }
    }
    ctx.shadowBlur = 0;
  }

  // ==================================================================
  // Neural-ASCII
  // ==================================================================
  private renderNeuralAscii(data: Uint8ClampedArray, motionHits: Set<number>, motionList: { x: number; y: number; diff: number }[]) {
    const ctx = this.ctx;
    const charW = 12, charH = 18;
    const cols = Math.floor(this.width / charW), rows = Math.floor(this.height / charH);
    const colors = PALETTES[this.settings.palette];

    ctx.fillStyle = '#050510'; ctx.fillRect(0, 0, this.width, this.height);
    ctx.font = `${charH - 3}px "Share Tech Mono", monospace`; ctx.textBaseline = 'top';

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const dx = Math.floor((col / cols) * this.DW), dy = Math.floor((row / rows) * this.DH);
        const di = (dy * this.DW + dx) * 4;
        const bright = (data[di] * 0.299 + data[di+1] * 0.587 + data[di+2] * 0.114) / 255;
        const char = ASCII_CHARS[Math.min(ASCII_CHARS.length - 1, Math.floor(bright * ASCII_CHARS.length))];
        const isM = motionHits.has(dy * this.DW + dx);
        if (isM) {
          const ci = Math.floor(this.asciiAnimTime * 2 + col * 0.07 + row * 0.03) % colors.length;
          ctx.fillStyle = colors[ci]; ctx.shadowBlur = 14; ctx.shadowColor = colors[ci];
        } else {
          ctx.fillStyle = `rgba(0,${Math.floor(bright * 100 + 30)},${Math.floor(bright * 50)},${0.15 + bright * 0.4})`;
          ctx.shadowBlur = 0;
        }
        ctx.fillText(char, col * charW, row * charH);
      }
    }
    ctx.shadowBlur = 0;

    // Cluster into hotspot nodes
    if (motionList.length > 0) {
      const zW = this.width / 6, zH = this.height / 4;
      const zones = new Map<string, { sumX: number; sumY: number; count: number }>();
      for (const h of motionList) {
        const key = `${Math.floor(h.x / zW)},${Math.floor(h.y / zH)}`;
        const z = zones.get(key) ?? { sumX: 0, sumY: 0, count: 0 };
        z.sumX += h.x; z.sumY += h.y; z.count++;
        zones.set(key, z);
      }
      const newHS: typeof this.hotspots = [];
      for (const z of zones.values()) {
        if (z.count > 3) newHS.push({ x: z.sumX / z.count, y: z.sumY / z.count, strength: Math.min(1, z.count / 20) });
      }
      if (newHS.length > 0) {
        this.hotspots = newHS.map(n => {
          const ex = this.hotspots.find(h => Math.hypot(h.x - n.x, h.y - n.y) < 200);
          return ex ? { x: ex.x * 0.6 + n.x * 0.4, y: ex.y * 0.6 + n.y * 0.4, strength: ex.strength * 0.5 + n.strength * 0.5 } : n;
        });
      } else {
        this.hotspots = this.hotspots.map(h => ({ ...h, strength: h.strength * 0.85 })).filter(h => h.strength > 0.05);
      }
    } else {
      this.hotspots = this.hotspots.map(h => ({ ...h, strength: h.strength * 0.9 })).filter(h => h.strength > 0.05);
    }

    // Draw connections
    for (let a = 0; a < this.hotspots.length; a++) {
      for (let b2 = a + 1; b2 < this.hotspots.length; b2++) {
        const ha = this.hotspots[a], hb = this.hotspots[b2];
        if (Math.hypot(ha.x - hb.x, ha.y - hb.y) > 600) continue;
        const alpha = Math.min(ha.strength, hb.strength) * 0.8;
        const color = colors[(a + b2) % colors.length];
        const cpx = (ha.x + hb.x) / 2 + (Math.random() - 0.5) * 80;
        const cpy = (ha.y + hb.y) / 2 - 60;
        ctx.beginPath(); ctx.moveTo(ha.x, ha.y); ctx.quadraticCurveTo(cpx, cpy, hb.x, hb.y);
        ctx.strokeStyle = color; ctx.globalAlpha = alpha; ctx.lineWidth = 1;
        ctx.shadowBlur = 10; ctx.shadowColor = color; ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }

    // Draw nodes
    for (const h of this.hotspots) {
      const color = colors[Math.floor(this.asciiAnimTime) % colors.length];
      ctx.beginPath(); ctx.arc(h.x, h.y, 6 + h.strength * 12, 0, Math.PI * 2);
      ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.globalAlpha = h.strength;
      ctx.shadowBlur = 20; ctx.shadowColor = color; ctx.stroke();
      ctx.beginPath(); ctx.arc(h.x, h.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = color; ctx.fill(); ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    }

    // Packets
    if (this.hotspots.length >= 2 && Math.random() < 0.3) {
      const a = Math.floor(Math.random() * this.hotspots.length);
      let b2 = Math.floor(Math.random() * this.hotspots.length);
      if (b2 === a) b2 = (a + 1) % this.hotspots.length;
      this.packets.push({ nodeA: a, nodeB: b2, t: 0, speed: 0.01 + Math.random() * 0.02, color: this.getRandomColor() });
    }
    this.packets = this.packets.filter(p => {
      p.t += p.speed;
      if (p.t > 1 || p.nodeA >= this.hotspots.length || p.nodeB >= this.hotspots.length) return false;
      const ha = this.hotspots[p.nodeA], hb = this.hotspots[p.nodeB];
      const px2 = ha.x + (hb.x - ha.x) * p.t, py2 = ha.y + (hb.y - ha.y) * p.t;
      ctx.beginPath(); ctx.arc(px2, py2, 3, 0, Math.PI * 2);
      ctx.fillStyle = p.color; ctx.shadowBlur = 15; ctx.shadowColor = p.color; ctx.fill(); ctx.shadowBlur = 0;
      return true;
    });

    this.asciiAnimTime += 0.05;
  }

  // ==================================================================
  // Main loop
  // ==================================================================
  public start() {
    const loop = () => {
      const mode = this.settings.mode;
      const isDemo = this.settings.demoMode;

      let data: Uint8ClampedArray | null;
      let motionList: { x: number; y: number; diff: number }[];

      if (isDemo) {
        const demo = this.getDemoData();
        data = demo.data;
        motionList = demo.hits;
      } else {
        data = this.captureCameraData();
        if (!data) { this.animationId = requestAnimationFrame(loop); return; }
        motionList = this.detectMotion(data);
      }

      // Build sets/maps for special renderers
      const motionHits = new Set<number>();
      const motionMap = new Map<string, number>();
      for (const m of motionList) {
        const dx = Math.floor((m.x / this.width) * this.DW);
        const dy = Math.floor((m.y / this.height) * this.DH);
        motionHits.add(dy * this.DW + dx);
        motionMap.set(`${dx},${dy}`, m.diff);
      }

      if (mode === 'ascii')          { this.renderASCII(data, motionHits);                  this.animationId = requestAnimationFrame(loop); return; }
      if (mode === 'contour')        { this.renderContour(data, motionHits);                this.animationId = requestAnimationFrame(loop); return; }
      if (mode === 'magnet-shatter') { this.renderMagnetShatter(data, motionMap);           this.animationId = requestAnimationFrame(loop); return; }
      if (mode === 'neural-ascii')   { this.renderNeuralAscii(data, motionHits, motionList); this.animationId = requestAnimationFrame(loop); return; }

      // Particle modes
      if (this.settings.showCamera && !isDemo) {
        if (mode === 'trails') { this.ctx.fillStyle = 'rgba(10,10,26,0.2)'; this.ctx.fillRect(0, 0, this.width, this.height); }
        else { this.ctx.clearRect(0, 0, this.width, this.height); }
      } else {
        if (mode === 'trails') { this.ctx.fillStyle = 'rgba(5,5,16,0.2)'; this.ctx.fillRect(0, 0, this.width, this.height); }
        else { this.ctx.fillStyle = '#050510'; this.ctx.fillRect(0, 0, this.width, this.height); }
      }

      const maxSpawns = Math.floor(this.settings.particleCount / 2);
      let spawned = 0;
      for (const m of motionList) {
        if (spawned >= maxSpawns) break;
        if (Math.random() > 0.4) { this.particles.push(new Particle(m.x, m.y, this.getRandomColor(), mode)); spawned++; }
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

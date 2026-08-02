class BrainRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');

    this.time = 0;
    this.neurons = [];
    this.connections = [];

    this.setupCanvas();
    this.generateNeurons();
    this.generateConnections();

    this.animate();
    window.addEventListener('resize', () => {
      this.setupCanvas();
      this.generateNeurons();
      this.generateConnections();
    });
  }

  setupCanvas() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
  }

  // 🧠 Real brain-like structure (NOT random)
  generateNeurons() {
    const cx = this.canvas.width * 0.45;
    const cy = this.canvas.height * 0.5;

    this.neurons = [];

    const layers = 14;

    for (let i = 0; i < layers; i++) {
      const t = i / layers;

      const width = 240 * (1 - t * 0.6);
      const height = 170 * (1 - t * 0.5);

      const points = 28;

      for (let j = 0; j < points; j++) {
        const angle = (j / points) * Math.PI * 2;

        // 🔥 brain silhouette + folds
        const x =
          cx +
          Math.pow(Math.sin(angle), 3) * width +
          (Math.random() - 0.5) * 6;

        const y =
          cy +
          Math.cos(angle) * height +
          Math.sin(angle * 3) * 14 + // folds
          (Math.random() - 0.5) * 6;

        this.neurons.push({
          x,
          y,
          z: t,
          radius: 1.5 + Math.random() * 1.5,
          pulse: Math.random() * Math.PI * 2
        });
      }
    }
  }

  // 🔗 Structured neural connectivity
  generateConnections() {
    this.connections = [];

    for (let i = 0; i < this.neurons.length; i++) {
      const a = this.neurons[i];

      for (let j = i + 1; j < this.neurons.length; j++) {
        const b = this.neurons[j];

        const dist = Math.hypot(a.x - b.x, a.y - b.y);

        if (dist < 65 && Math.abs(a.z - b.z) < 0.2) {
          if (Math.random() > 0.55) {
            this.connections.push({
              a,
              b,
              curve: (Math.random() - 0.5) * 40,
              phase: Math.random() * Math.PI * 2
            });
          }
        }
      }
    }
  }

  // 🌿 Organic fiber connections
  drawConnection(a, b, flow, curve) {
    const ctx = this.ctx;

    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);

    const nx = -dy / len;
    const ny = dx / len;

    const cx = midX + nx * curve;
    const cy = midY + ny * curve;

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(cx, cy, b.x, b.y);

    ctx.strokeStyle = `rgba(120,140,255,${0.15 + flow})`;
    ctx.lineWidth = 0.5 + flow * 1.5;
    ctx.stroke();

    // ⚡ signal particle
    if (flow > 0.6) {
      const t = (this.time * 1.5 + flow) % 1;

      const px =
        (1 - t) * (1 - t) * a.x +
        2 * (1 - t) * t * cx +
        t * t * b.x;

      const py =
        (1 - t) * (1 - t) * a.y +
        2 * (1 - t) * t * cy +
        t * t * b.y;

      ctx.beginPath();
      ctx.arc(px, py, 2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(244,114,182,${flow})`;
      ctx.fill();
    }
  }

  drawConnections() {
    for (const c of this.connections) {
      const flow =
        Math.sin(this.time * 2 + c.phase) * 0.5 + 0.5;

      this.drawConnection(c.a, c.b, flow, c.curve);
    }
  }

  drawNeurons() {
    const ctx = this.ctx;

    for (const n of this.neurons) {
      const pulse =
        Math.sin(this.time * 2 + n.pulse) * 0.5 + 0.5;

      const size = n.radius + pulse * 1.5;
      const glow = size * 5;

      ctx.globalCompositeOperation = 'lighter';

      const gradient = ctx.createRadialGradient(
        n.x, n.y, 0,
        n.x, n.y, glow
      );

      gradient.addColorStop(0, 'rgba(180,190,255,0.9)');
      gradient.addColorStop(0.4, 'rgba(130,140,255,0.4)');
      gradient.addColorStop(1, 'rgba(0,0,0,0)');

      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(n.x, n.y, glow, 0, Math.PI * 2);
      ctx.fill();

      // core
      ctx.fillStyle = 'white';
      ctx.beginPath();
      ctx.arc(n.x, n.y, size, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalCompositeOperation = 'source-over';
    }
  }

  // 🧠 Real silhouette
  drawBrainShape() {
    const ctx = this.ctx;

    const cx = this.canvas.width * 0.45;
    const cy = this.canvas.height * 0.5;

    ctx.strokeStyle = 'rgba(120,140,255,0.25)';
    ctx.lineWidth = 2;

    ctx.beginPath();

    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * Math.PI * 2;

      const x =
        cx + Math.pow(Math.sin(t), 3) * 240;

      const y =
        cy +
        Math.cos(t) * 170 +
        Math.sin(t * 3) * 14;

      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }

    ctx.closePath();
    ctx.stroke();
  }

  animate() {
    this.time += 0.016;

    // fade trail
    this.ctx.fillStyle = 'rgba(2,6,23,0.18)';
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    // 🫁 subtle breathing
    this.ctx.save();
    const scale = 1 + Math.sin(this.time * 0.6) * 0.015;

    this.ctx.translate(
      this.canvas.width / 2,
      this.canvas.height / 2
    );
    this.ctx.scale(scale, scale);
    this.ctx.translate(
      -this.canvas.width / 2,
      -this.canvas.height / 2
    );

    this.drawBrainShape();
    this.drawConnections();
    this.drawNeurons();

    this.ctx.restore();

    requestAnimationFrame(() => this.animate());
  }
}

// Initialize brain on page load
document.addEventListener('DOMContentLoaded', function() {
  const canvas = document.getElementById('brainCanvas');
  if (canvas) {
    new BrainRenderer(canvas);
  }
  // Theme is owned by theme.js (minime_theme) — do not override here.
});

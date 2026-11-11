// The sound engine samples this canvas just like an uploaded image.
export function createDemo() {
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900;
  const brush = canvas.getContext('2d');
  let seed = 173;
  const random = () => ((seed = Math.imul(1664525, seed) + 1013904223 >>> 0) / 4294967296);

  const sky = brush.createRadialGradient(890, 410, 40, 840, 440, 880);
  sky.addColorStop(0, '#222033');
  sky.addColorStop(0.52, '#121119');
  sky.addColorStop(1, '#0c0b10');
  brush.fillStyle = sky;
  brush.fillRect(0, 0, canvas.width, canvas.height);

  // Distant motes provide scale without obscuring the central surface.
  for (let i = 0; i < 2000; i++) {
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    const size = 0.5 + random() ** 3 * 2.4;
    brush.fillStyle = 'rgba(197, 184, 229,' + (0.08 + random() * 0.38) + ')';
    brush.fillRect(x, y, size, size);
  }

  // Orbital guides are part of the sample image only.
  brush.save();
  brush.translate(815, 440);
  brush.rotate(-0.32);
  for (const [rx, ry, alpha] of [[697, 246, 0.20], [653, 283, 0.10]]) {
    brush.beginPath();
    brush.ellipse(0, 0, rx, ry, 0, 0, 2 * Math.PI);
    brush.strokeStyle = 'rgba(197,180,238,' + alpha + ')';
    brush.stroke();
  }
  brush.restore();
  const tau = 2 * Math.PI;
  const points = [];
  for (let ring = 0; ring < 392; ring++) {
    const u = ring / 392 * tau;
    const orbit = 322 + 50 * Math.cos(3 * u - 0.6);
    const tube = 99 + 38 * Math.sin(3 * u + 0.8);
    for (let row = 0; row < 92; row++) {
      const v = row / 92 * tau + 0.88 * u;
      const radius = tube * (1 + 0.035 * Math.cos(7 * v - 3 * u));
      const x = (orbit + radius * Math.cos(v)) * Math.cos(u);
      const y = (orbit + radius * Math.cos(v)) * Math.sin(u);
      const z = 136 * Math.sin(2 * u + 0.55) + radius * Math.sin(v);
      // Tilt and project the folded torus. Nearby particles appear larger.
      const vertical = 0.65 * y - 0.76 * z;
      const depth = 0.76 * y + 0.65 * z;
      const perspective = 1300 / (1420 - depth * 0.38);
      const px = 797 + perspective * 1.43 * (0.94 * x + 0.34 * vertical);
      const py = 447 + perspective * 1.19 * (vertical * 0.94 - x * 0.34);
      const rim = (0.5 + 0.5 * Math.cos(v - 1.1 + 0.6 * Math.sin(u))) ** 1.9;
      const light = 0.23 + 0.77 * rim;
      const warmth = (0.5 + 0.5 * Math.cos(u - 3.8)) ** 5;
      const color = [
        Math.round(108 + 106 * light + warmth * 35),
        Math.round(85 + 119 * light + warmth * 24),
        Math.round(152 + 99 * light - warmth * 12)
      ];
      const opacity = Math.min(1, 0.17 + light * 0.48 + (depth + 400) / 1900);
      points.push({ x: px + random() - 0.5, y: py + random() - 0.5, depth,
        size: (0.8 + 1.1 * light + random() * 0.42) * perspective,
        color: 'rgba(' + color.join(',') + ',' + opacity.toFixed(2) + ')' });
    }
  }
  points.sort((a, b) => a.depth - b.depth);
  // Frame the entire projected surface, including its nearest fold.
  const bounds = points.reduce((box, point) => ({
    left: Math.min(box.left, point.x), right: Math.max(box.right, point.x),
    top: Math.min(box.top, point.y), bottom: Math.max(box.bottom, point.y)
  }), {left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity});
  const centerX = (bounds.left + bounds.right) / 2;
  const centerY = (bounds.top + bounds.bottom) / 2;
  const fit = Math.min(canvas.width * 0.82 / (bounds.right - bounds.left),
                       canvas.height * 0.80 / (bounds.bottom - bounds.top));
  brush.translate(canvas.width / 2, canvas.height * 0.48);
  brush.scale(fit, fit);
  brush.translate(-centerX, -centerY);
  for (const point of points) {
    brush.fillStyle = point.color;
    brush.fillRect(point.x, point.y, point.size, point.size);
  }
  return canvas;
}

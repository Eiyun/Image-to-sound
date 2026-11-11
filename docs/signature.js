// A static sound-wave study for the masthead. Draw only when its size changes.
const canvas = document.querySelector('#signature');
const context = canvas.getContext('2d');

function drawSignature() {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  if (!width || !height) return;
  const scale = Math.min(devicePixelRatio, 2);
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  context.setTransform(scale, 0, 0, scale, 0, 0);

  const stroke = context.createLinearGradient(0, 0, width, 0);
  stroke.addColorStop(0, 'rgba(158, 140, 202, 0)');
  stroke.addColorStop(0.27, '#51475f');
  stroke.addColorStop(0.56, '#a497b5');
  stroke.addColorStop(0.78, '#79678d');
  stroke.addColorStop(1, 'rgba(158, 140, 202, 0)');
  context.strokeStyle = stroke;
  context.lineWidth = 0.8;
  for (let strand = 0; strand < 44; strand++) {
    const angle = strand / 44 * Math.PI * 2;
    context.beginPath();
    for (let x = 0; x <= width; x += 2) {
      const t = x / width;
      const envelope = Math.sin(Math.PI * t) ** 1.7;
      const center = Math.sin(t * 10 - 1.8) * 0.16;
      const twist = Math.sin(t * 12 + angle) * (0.17 + 0.15 * Math.cos(t * 11));
      const y = height * (0.5 + envelope * (center + twist));
      if (!x) context.moveTo(x, y);
      else context.lineTo(x, y);
    }
    context.stroke();
  }
}

new ResizeObserver(drawSignature).observe(canvas);

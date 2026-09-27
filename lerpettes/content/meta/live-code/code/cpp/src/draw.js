// The picture. Everything here is yours: this is a plain 2D canvas context, so
// anything you know about canvas works, and the page owns the frame loop.

// lerpit:trail:highlight:start
// Ten seconds of history at sixty frames a second.
const TRAIL = 600;
const past = [];
// lerpit:trail:highlight:end

// lerpit:paint:highlight:start
export function draw(g, s, view) {
  const midY = view.height / 2;
  const scale = Math.min(view.height / 2 - 16, 90);
  const clamp = (x) => Math.max(-2, Math.min(2, x));

  g.strokeStyle = 'rgba(81, 131, 173, 0.42)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(0, midY);
  g.lineTo(view.width, midY);
  g.stroke();

  past.push(s.x);
  if (past.length > TRAIL) past.shift();

  const stride = view.width / (TRAIL - 1);
  g.strokeStyle = '#2e6da4';
  g.lineWidth = 1.5;
  g.beginPath();
  past.forEach((x, i) => {
    const px = view.width - (past.length - 1 - i) * stride;
    const py = midY - clamp(x) * scale;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  });
  g.stroke();

  const bobY = midY - clamp(s.x) * scale;
  g.strokeStyle = '#20313f';
  g.lineWidth = 1.4;
  g.setLineDash([4, 4]);
  g.beginPath();
  g.moveTo(48, midY);
  g.lineTo(48, bobY);
  g.stroke();
  g.setLineDash([]);

  g.fillStyle = '#d17041';
  g.strokeStyle = '#a04e25';
  g.lineWidth = 2;
  g.beginPath();
  g.arc(48, bobY, 11, 0, Math.PI * 2);
  g.fill();
  g.stroke();
}
// lerpit:paint:highlight:end

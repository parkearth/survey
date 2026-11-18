import { pt, bounds, deg, distance, rings, outlines, offset, area, ping, angle, turn } from './model.js';
export const colors = {
  structural: '#1A1A1A',
  partition: '#514e48',
  balcony: '#3B8A5A',
  arcade: '#938267',
  door: '#E68A3E',
  window: '#2B7A9B',
  stairs: '#b08838'
};
export function dimensions(f) {
  const r = rings(f),
    all = f.walls.flatMap(w => [w.start, w.end]);
  if (!all.length) return [];
  const inside = bounds(r.length ? r.flatMap(v => offset(v, -f.wallThickness / 2)) : all),
    out = bounds(r.length ? outlines(f).flat() : all),
    result = [];
  for (const outer of [false, true]) {
    const box = outer ? out : inside,
      gap = outer ? 76 : 37;
    for (const y of [out.t - gap, out.b + gap]) result.push([pt(box.l, y), pt(box.r, y), box.r - box.l]);
    for (const x of [out.l - gap, out.r + gap]) result.push([pt(x, box.t), pt(x, box.b), box.b - box.t]);
  }
  return result;
}
export function handles(o) {
  if (o.start) return [o.start, o.end];
  return [turn(pt(o.x + o.width / 2, o.y + o.depth / 2), o.rotation, o), turn(pt(o.x, o.y - o.depth / 2 - 23), o.rotation, o)];
}
export function draw(canvas, f, project, state = {}, resolution = devicePixelRatio) {
  const W = state.width || canvas.clientWidth || 400,
    H = state.height || canvas.clientHeight || 400;
  canvas.width = Math.round(W * resolution);
  canvas.height = Math.round(H * resolution);
  const c = canvas.getContext('2d');
  c.scale(resolution, resolution);
  const pts = f.walls.flatMap(w => [w.start, w.end]);
  for (const o of [...f.furnitures, ...f.openings]) for (const i of [-1, 1]) for (const j of [-1, 1]) pts.push(turn(pt(o.x + i * o.width / 2, o.y + j * o.depth / 2), o.rotation, o));
  const b = state.lockBounds || bounds(pts.length ? pts : [pt(0, 0), pt(300, 300)]),
    k = Math.min((W - 24) / (b.r - b.l + 208), (H - 100) / (b.b - b.t + 208)) * (state.zoom || 1),
    ox = W / 2 - (b.r + b.l) * k / 2 + (state.pan?.x || 0),
    oy = (H + 56) / 2 - (b.b + b.t) * k / 2 + (state.pan?.y || 0);
  const line = (x, y, u, v) => {
      c.beginPath();
      c.moveTo(x, y);
      c.lineTo(u, v);
      c.stroke();
    },
    text = (s, x, y) => c.fillText(s, x, y);
  c.fillStyle = '#FAF8F4';
  c.fillRect(0, 0, W, H);
  c.save();
  c.translate(ox, oy);
  c.scale(k, k);
  for (const step of [20, 100]) {
    if (k * step < 4) continue;
    c.strokeStyle = step === 20 ? '#eae8e2' : '#d7d7cc';
    c.lineWidth = .65 / k;
    for (let x = Math.floor(-ox / k / step) * step; x < (W - ox) / k; x += step) line(x, -oy / k, x, (H - oy) / k);
    for (let y = Math.floor(-oy / k / step) * step; y < (H - oy) / k; y += step) line(-ox / k, y, (W - ox) / k, y);
  }
  for (const type of ['balcony', 'arcade']) for (const v of rings(f, type)) {
    c.save();
    c.beginPath();
    v.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y));
    c.closePath();
    c.clip();
    const b = bounds(v);
    c.fillStyle = type === 'balcony' ? '#dde9db' : '#e6dfd2';
    c.fillRect(b.l, b.t, b.r - b.l, b.b - b.t);
    c.strokeStyle = '#a8b6a5';
    c.lineWidth = 1;
    for (let x = b.l - (b.b - b.t); x < b.r; x += 12) line(x, b.t, x + b.b - b.t, b.b);
    c.restore();
  }
  for (const w of f.walls) {
    c.strokeStyle = colors[w.type];
    c.lineWidth = w.thickness;
    c.lineCap = 'square';
    line(w.start.x, w.start.y, w.end.x, w.end.y);
  }
  c.lineCap = 'butt';
  for (const o of [...(state.furniture === false ? [] : f.furnitures), ...f.openings]) {
    c.save();
    c.translate(o.x, o.y);
    c.rotate(deg(o.rotation));
    const w = o.width,
      d = o.depth,
      x = -w / 2,
      y = -d / 2;
    c.lineWidth = 1.6;
    c.strokeStyle = '#383d36';
    c.fillStyle = '#e6e2d7';
    c.fillRect(x, y, w, d);
    if (o.type === 'door') {
      const s = o.swingDirection || 1;
      c.fillStyle = '#faf8f4';
      c.fillRect(x, y - 1, w, d + 2);
      if (o.passage) {
        c.restore();
        continue;
      }
      c.strokeStyle = colors.door;
      c.fillStyle = '#e68a3e24';
      c.beginPath();
      c.moveTo(x, 0);
      c.arc(x, 0, w, 0, s * Math.PI / 2, s < 0);
      c.closePath();
      c.fill();
      c.beginPath();
      c.setLineDash([6, 4]);
      c.arc(x, 0, w, 0, s * Math.PI / 2, s < 0);
      c.stroke();
      c.setLineDash([]);
      c.strokeRect(x, Math.min(0, s * w), 4, w);
    } else if (o.type?.includes('window')) {
      c.fillStyle = '#e3f0f3';
      c.fillRect(x, y, w, d);
      c.strokeStyle = colors.window;
      c.strokeRect(x, y, w, d);
      line(x, 0, w / 2, 0);
    } else {
      c.strokeStyle = o.type ? colors.stairs : '#56584d';
      c.strokeRect(x, y, w, d);
      c.strokeRect(x + 3, y + 3, w - 6, d - 6);
      if (o.type === 'stairs') {
        for (let a = y + 18; a < d / 2; a += 18) line(x, a, w / 2, a);
      } else if (o.type === 'elevator') {
        line(x, y, -x, -y);
        line(-x, y, x, -y);
      } else if (o.category?.includes('cabinet') || o.category === 'wardrobe') {
        c.save();
        c.beginPath();
        c.rect(x + 3, y + 3, w - 6, d - 6);
        c.clip();
        for (let i = x - d; i < w / 2; i += 10) line(i, y, i + d, -y);
        c.restore();
      } else if (o.category?.startsWith('sofa')) {
        for (let i = 1; i < 3; i++) c.strokeRect(x + i * w / 3, y + 8, w / 3 - 4, d - 18);
        if (o.category === 'sofa_l') c.strokeRect(x, y + d * .55, w * .4, d * .45);
      }
      if (state.labels !== false) {
        const size = Math.max(8, Math.min(18, w / 5, d / 3));
        c.font = size + 'px sans-serif';
        c.textAlign = 'center';
        const dim = Math.round(w) + '×' + Math.round(d);
        const bw = Math.max(c.measureText(o.label).width, c.measureText(dim).width) + 6;
        c.fillStyle = '#faf8f4';
        c.fillRect(-bw / 2, -size - 2, bw, size * 2 + 4);
        c.fillStyle = '#334137';
        text(o.label, 0, -1);
        text(dim, 0, size);
      }
    }
    c.restore();
  }
  if (state.dims !== false) for (const [a, b, val] of dimensions(f)) {
    c.save();
    c.translate(a.x, a.y);
    c.rotate(Math.atan2(b.y - a.y, b.x - a.x));
    const len = distance(a, b);
    c.lineWidth = 1 / k;
    c.strokeStyle = '#6e756a';
    line(0, 0, len, 0);
    for (const x of [0, len]) {
      line(x, -5, x, 6);
      line(x - 4, 4, x + 4, -4);
    }
    c.fillStyle = '#424d44';
    c.font = Math.min(20, 10 / k) + 'px monospace';
    c.textAlign = 'center';
    text(String(Math.round(val)), len / 2, -4);
    c.restore();
  }
  const a = f.anchorPoint;
  c.strokeStyle = '#97723f';
  c.lineWidth = 1.4 / k;
  c.beginPath();
  c.arc(a.x, a.y, 4 / k, 0, Math.PI * 2);
  c.stroke();
  line(a.x - 7 / k, a.y, a.x + 7 / k, a.y);
  line(a.x, a.y - 7 / k, a.x, a.y + 7 / k);
  if (state.selected) {
    c.fillStyle = '#bc8a4b';
    c.strokeStyle = 'white';
    for (const p of handles(state.selected)) {
      c.beginPath();
      c.arc(p.x, p.y, 5 / k, 0, Math.PI * 2);
      c.fill();
      c.stroke();
    }
  }
  c.restore();
  c.fillStyle = '#fffcf5';
  c.strokeStyle = '#c6ae80';
  c.lineWidth = 1;
  c.beginPath();
  c.roundRect(9, 9, Math.min(W - 18, 270), 49, 8);
  c.fill();
  c.stroke();
  c.fillStyle = '#263c32';
  c.font = 'bold 13px sans-serif';
  text(f.label + '  ' + project.name.slice(0, 20), 19, 29);
  c.font = '11px sans-serif';
  text((area(f) ? ping(area(f)) + ' 坪  /  ' + area(f).toFixed(2) + ' m²' : '待閉合外牆') + '   ·   ' + f.usage.slice(0, 15), 19, 46);
  return {
    b,
    k,
    world: (x, y) => pt((x - ox) / k, (y - oy) / k),
    center: pt((b.l + b.r) / 2, (b.t + b.b) / 2)
  };
}

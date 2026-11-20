import { pt, turn, outlines, rings, offset, signed } from './model.js';
export const floorMaterials = {
  wood: {
    label: '木地板',
    color: '#c4ae91',
    line: '#9b846a'
  },
  tile: {
    label: '磁磚',
    color: '#d6d3c8',
    line: '#a8aaa0'
  },
  marble: {
    label: '大理石',
    color: '#e5e0d7',
    line: '#acaaa1'
  },
  terrazzo: {
    label: '磨石子',
    color: '#c7c6b9',
    line: '#90988d'
  },
  concrete: {
    label: '水泥地坪',
    color: '#b8bdb4',
    line: '#969e94'
  },
  vinyl: {
    label: '塑膠／SPC 地板',
    color: '#b5aaa0',
    line: '#91867e'
  }
};
export const isFloorHole = o => ['floor_opening', 'stair_opening', 'shaft_opening'].includes(o.subtype);
export const rectangle = o => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => turn(pt(o.x + x * o.width / 2, o.y + y * o.depth / 2), o.rotation, o));
export const floorHoles = f => (f.components || []).filter(isFloorHole).map(rectangle);
export const floorFootprints = f => [...outlines(f), ...rings(f, 'balcony').map(v => offset(v, f.wallThickness / 2)), ...rings(f, 'arcade').map(v => offset(v, f.wallThickness / 2))];
// Exact vertical arrangement: split at vertices AND edge intersections, then subtract
// the union of hole intervals from the union of footprint intervals in each strip.
// Every interval boundary is linear within a strip, yielding non-overlapping trapezoids.
// This supports rotated holes, overlapping holes, and holes crossing a concave boundary.
export function cutSurface(positive, negative = []) {
  const edges = polys => polys.map(p => p.map((a, i) => ({
    a,
    b: p[(i + 1) % p.length]
  })));
  const pos = edges(positive),
    neg = edges(negative),
    all = [...pos, ...neg].flat(),
    xs = all.flatMap(e => [e.a.x, e.b.x]);
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const {
        a,
        b
      } = all[i],
      {
        a: c,
        b: d
      } = all[j],
      dx = b.x - a.x,
      dy = b.y - a.y,
      ex = d.x - c.x,
      ey = d.y - c.y,
      det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-9) continue;
    const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / det,
      u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / det;
    if (t > 0 && t < 1 && u > 0 && u < 1) xs.push(a.x + t * dx);
  }
  const cuts = xs.sort((a, b) => a - b).filter((x, i, a) => !i || x - a[i - 1] > 1e-7),
    result = [];
  const at = (e, x) => e.a.y + (x - e.a.x) * (e.b.y - e.a.y) / (e.b.x - e.a.x);
  function intervals(groups, x) {
    const spans = [];
    for (const edges of groups) {
      const hits = edges.filter(e => x > Math.min(e.a.x, e.b.x) && x < Math.max(e.a.x, e.b.x)).sort((a, b) => at(a, x) - at(b, x));
      for (let i = 1; i < hits.length; i += 2) spans.push([hits[i - 1], hits[i]]);
    }
    spans.sort((a, b) => at(a[0], x) - at(b[0], x));
    const merged = [];
    for (const s of spans) {
      const last = merged.at(-1);
      if (last && at(s[0], x) <= at(last[1], x) + 1e-8) {
        if (at(s[1], x) > at(last[1], x)) last[1] = s[1];
      } else merged.push([...s]);
    }
    return merged;
  }
  for (let i = 1; i < cuts.length; i++) {
    const left = cuts[i - 1],
      right = cuts[i],
      x = (left + right) / 2,
      holes = intervals(neg, x);
    for (const [lo, hi] of intervals(pos, x)) {
      let bottom = lo;
      const emit = (a, b) => {
        if (at(b, x) - at(a, x) < 1e-7) return;
        const poly = [pt(left, at(a, left)), pt(right, at(a, right)), pt(right, at(b, right)), pt(left, at(b, left))];
        const clean = poly.filter((p, j) => Math.hypot(p.x - poly[(j + 1) % 4].x, p.y - poly[(j + 1) % 4].y) > 1e-7);
        if (clean.length >= 3 && Math.abs(signed(clean)) > 1e-7) result.push(clean);
      };
      for (const [a, b] of holes) {
        if (at(b, x) <= at(bottom, x) || at(a, x) >= at(hi, x)) continue;
        if (at(a, x) > at(bottom, x)) emit(bottom, a);
        if (at(b, x) >= at(hi, x)) {
          bottom = hi;
          break;
        }
        bottom = b;
      }
      emit(bottom, hi);
    }
  }
  return result;
}
export const floorPieces = f => cutSurface(floorFootprints(f), floorHoles(f));
export function floorMetrics(f) {
  const sum = ps => cutSurface(ps).reduce((s, p) => s + Math.abs(signed(p)), 0) / 10000;
  const gross = sum(floorFootprints(f)),
    net = floorPieces(f).reduce((s, p) => s + Math.abs(signed(p)), 0) / 10000;
  return {
    gross,
    net,
    hole: Math.max(0, gross - net)
  };
}
// Deterministic, repeatable finish patterns; same colors used in offline 3D.
export function paintFinish(g, key, x, y, w, h, unit = 1) {
  const m = floorMaterials[key] || floorMaterials.wood;
  g.fillStyle = m.color;
  g.fillRect(x, y, w, h);
  g.strokeStyle = m.line;
  g.lineWidth = .65 * unit;
  const line = (a, b, c, d) => {
    g.beginPath();
    g.moveTo(a, b);
    g.lineTo(c, d);
    g.stroke();
  };
  if (key === 'tile') {
    const s = 60 * unit;
    for (let a = Math.floor(x / s) * s; a < x + w; a += s) line(a, y, a, y + h);
    for (let b = Math.floor(y / s) * s; b < y + h; b += s) line(x, b, x + w, b);
  } else if (key === 'wood' || key === 'vinyl' || !floorMaterials[key]) {
    const s = 18 * unit,
      L = 120 * unit;
    for (let b = Math.floor(y / s) * s; b < y + h; b += s) {
      line(x, b, x + w, b);
      for (let a = Math.floor(x / L) * L + (Math.round(b / s) % 2 ? L / 2 : 0); a < x + w; a += L) line(a, b, a, b + s);
    }
  } else if (key === 'marble') {
    const s = 90 * unit;
    for (let a = Math.floor((x - h) / s) * s; a < x + w; a += s) {
      g.beginPath();
      g.moveTo(a, y);
      g.bezierCurveTo(a + 55 * unit, y + h * .28, a - 35 * unit, y + h * .6, a + h * .6, y + h);
      g.stroke();
    }
  } else {
    const step = (key === 'terrazzo' ? 14 : 27) * unit;
    g.fillStyle = m.line;
    for (let a = Math.floor(x / step) * step; a < x + w; a += step) for (let b = Math.floor(y / step) * step; b < y + h; b += step) {
      const jitter = Math.sin(a * 1.73 + b * 3.91);
      g.fillRect(a + jitter * step * .3, b - jitter * step * .2, (key === 'terrazzo' ? 2.4 : .8) * unit, (key === 'terrazzo' ? 1.4 : .8) * unit);
    }
  }
}


export function id() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = bytes[6] & 15 | 64;
  bytes[8] = bytes[8] & 63 | 128;
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
  return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join('-');
}
export const copy = o => JSON.parse(JSON.stringify(o)),
  pt = (x, y) => ({
    x,
    y
  });
export const deg = a => a * Math.PI / 180,
  angle = w => Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x) * 180 / Math.PI;
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  wrap = a => ((a + 180) % 360 + 360) % 360 - 180;
export function turn(p, a, c = pt(0, 0)) {
  const t = deg(a),
    x = p.x - c.x,
    y = p.y - c.y;
  return pt(c.x + x * Math.cos(t) - y * Math.sin(t), c.y + x * Math.sin(t) + y * Math.cos(t));
}
export function bounds(points) {
  const xs = points.map(p => p.x),
    ys = points.map(p => p.y);
  return {
    l: Math.min(...xs),
    r: Math.max(...xs),
    t: Math.min(...ys),
    b: Math.max(...ys)
  };
}
export function wall(a, b, type = 'structural', thickness = 12) {
  return {
    id: id(),
    start: {
      ...a
    },
    end: {
      ...b
    },
    thickness,
    type
  };
}
export const surfaces = (v, type = 'structural') => v.map((p, i) => wall(p, v[(i + 1) % v.length], type));
export const types = {
  wardrobe: ['系統衣櫃', 181, 58, 230],
  shoe_cabinet: ['鞋櫃', 100, 35, 100],
  tv_cabinet: ['電視櫃', 160, 40, 60],
  sofa_3: ['三人沙發', 204, 86, 82],
  sofa_l: ['L 型沙發', 230, 150, 82],
  bed: ['床', 150, 188, 52],
  stairs: ['樓梯', 95, 215, 280],
  elevator: ['電梯', 145, 150, 230],
  door: ['門扇', 88, 12, 205],
  floor_window: ['落地窗', 160, 12, 220],
  sliding_window: ['橫拉窗', 120, 12, 115]
};
export function item(type, x, y) {
  const [label, width, depth, height] = types[type],
    v = {
      id: id(),
      label,
      x,
      y,
      width,
      depth,
      height,
      rotation: 0
    };
  return ['door', 'sliding_window', 'floor_window', 'stairs', 'elevator'].includes(type) ? {
    ...v,
    type,
    wallId: null,
    swingDirection: 1
  } : {
    ...v,
    category: type
  };
}
export const templates = ['矩形套房', 'L 型住宅', '透天梯廳'];
export function template(k = 0, n = 1) {
  const vertices = [[[0, 0], [427, 0], [427, 302], [0, 302]], [[0, 0], [680, 0], [680, 310], [440, 310], [440, 530], [0, 530]], [[0, 0], [480, 0], [480, 650], [0, 650]]][k].map(([x, y]) => pt(x, y));
  const walls = surfaces(vertices),
    door = item('door', 100, 0),
    window = item('floor_window', vertices[1].x, 165);
  Object.assign(door, {
    wallId: walls[0].id
  });
  Object.assign(window, {
    wallId: walls[1].id,
    rotation: 90
  });
  const f = {
    floorIndex: n,
    label: n + 'F',
    usage: ['客廳臥室', '起居餐廳', '樓梯梯廳'][k],
    source: '尺寸範本',
    wallThickness: 12,
    ceilingHeight: 280,
    rotationAngle: 0,
    anchorPoint: pt(100, 0),
    walls,
    openings: [door, window],
    furnitures: [item('wardrobe', vertices[1].x - 110, 40), item(k === 1 ? 'sofa_l' : 'sofa_3', 130, 220)]
  };
  if (k === 2) {
    const s = item('stairs', 90, 470);
    f.openings.push(s);
    f.anchorPoint = pt(s.x, s.y + s.depth / 2);
    f.anchorId = s.id;
  }
  return f;
}
export function rotate(f, a) {
  for (const w of f.walls) {
    w.start = turn(w.start, a, f.anchorPoint);
    w.end = turn(w.end, a, f.anchorPoint);
  }
  for (const o of [...f.openings, ...f.furnitures]) Object.assign(o, turn(o, a, f.anchorPoint), {
    rotation: wrap(o.rotation + a)
  });
  f.rotationAngle = wrap(f.rotationAngle + a);
}
export function straighten(f) {
  const w = f.walls.filter(w => w.type === 'structural').sort((a, b) => distance(b.start, b.end) - distance(a.start, a.end))[0];
  if (w) {
    const a = angle(w);
    rotate(f, 90 * Math.round(a / 90) - a);
  }
}
export function signed(v) {
  return v.reduce((s, p, i) => {
    const q = v[(i + 1) % v.length];
    return s + p.x * q.y - q.x * p.y;
  }, 0) / 2;
}
// Trace the outside face of each connected wall graph. Interior partitions never contribute area.
export function rings(f, kind = 'structural') {
  const nodes = [],
    edges = [];
  function node(p) {
    let i = nodes.findIndex(q => distance(q, p) < 3);
    if (i < 0) {
      i = nodes.length;
      nodes.push({
        ...p,
        links: []
      });
    }
    return i;
  }
  for (const w of f.walls.filter(w => w.type === kind)) {
    const a = node(w.start),
      b = node(w.end);
    if (a === b) continue;
    nodes[a].links.push(b);
    nodes[b].links.push(a);
    edges.push([a, b], [b, a]);
  }
  for (const p of nodes) p.links.sort((a, b) => Math.atan2(nodes[a].y - p.y, nodes[a].x - p.x) - Math.atan2(nodes[b].y - p.y, nodes[b].x - p.x));
  const used = new Set(),
    out = [];
  for (let [a, b] of edges) {
    let loop = [];
    while (!used.has(a + ',' + b)) {
      used.add(a + ',' + b);
      loop.push(nodes[a]);
      const l = nodes[b].links,
        c = l[(l.indexOf(a) + l.length - 1) % l.length];
      a = b;
      b = c;
    }
    if (signed(loop) < -1) out.push(loop.reverse().map(p => pt(p.x, p.y)));
  }
  return out;
}
export function offset(v, t) {
  return v.map((p, i) => {
    const prev = v[(i + v.length - 1) % v.length],
      next = v[(i + 1) % v.length],
      a = distance(p, prev) || 1,
      b = distance(p, next) || 1,
      n = pt((p.y - prev.y) / a, (prev.x - p.x) / a),
      m = pt((next.y - p.y) / b, (p.x - next.x) / b),
      d = Math.max(.02, 1 + n.x * m.x + n.y * m.y);
    return pt(p.x + (n.x + m.x) * t / d, p.y + (n.y + m.y) * t / d);
  });
}
export const outlines = f => rings(f).map(v => offset(v, f.wallThickness / 2));
// Integrate the union of closed footprints. Slab endpoints include every edge crossing,
// so the union width varies linearly between them, even for overlapping annexes.
export function unionArea(polygons) {
  const edges = polygons.map(poly => poly.map((a, i) => [a, poly[(i + 1) % poly.length]]));
  const all = edges.flat(),
    breaks = new Set(all.flat().map(p => p.x));
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
    const [a, b] = all[i],
      [c, d] = all[j],
      dx = b.x - a.x,
      dy = b.y - a.y,
      ex = d.x - c.x,
      ey = d.y - c.y;
    const det = dx * ey - dy * ex;
    if (Math.abs(det) < 1e-9) continue;
    const t = ((c.x - a.x) * ey - (c.y - a.y) * ex) / det,
      u = ((c.x - a.x) * dy - (c.y - a.y) * dx) / det;
    if (t > 0 && t < 1 && u > 0 && u < 1) breaks.add(a.x + t * dx);
  }
  const xs = [...breaks].sort((a, b) => a - b);
  let total = 0;
  for (let i = 1; i < xs.length; i++) {
    const gap = xs[i] - xs[i - 1],
      x = (xs[i] + xs[i - 1]) / 2,
      spans = [];
    for (const group of edges) {
      const ys = group.filter(([a, b]) => x > Math.min(a.x, b.x) && x < Math.max(a.x, b.x)).map(([a, b]) => a.y + (x - a.x) * (b.y - a.y) / (b.x - a.x)).sort((a, b) => a - b);
      for (let k = 1; k < ys.length; k += 2) spans.push([ys[k - 1], ys[k]]);
    }
    spans.sort((a, b) => a[0] - b[0]);
    let last = -Infinity;
    for (const [lo, hi] of spans) {
      total += Math.max(0, hi - Math.max(lo, last)) * gap;
      last = Math.max(last, hi);
    }
  }
  return total;
}
export function area(f) {
  return unionArea([...outlines(f), ...rings(f, 'balcony').map(v => offset(v, f.wallThickness / 2)), ...rings(f, 'arcade').map(v => offset(v, f.wallThickness / 2))]) / 10000;
}
export const ping = m => (m * .3025).toFixed(2);
export function snap(o, f) {
  if (!['door', 'floor_window', 'sliding_window'].includes(o.type)) return;
  let best = null;
  for (const w of f.walls) {
    const dx = w.end.x - w.start.x,
      dy = w.end.y - w.start.y,
      len = distance(w.start, w.end);
    if (len < o.width) continue;
    const margin = o.width / (2 * len),
      t = Math.max(margin, Math.min(1 - margin, ((o.x - w.start.x) * dx + (o.y - w.start.y) * dy) / len ** 2)),
      p = pt(w.start.x + t * dx, w.start.y + t * dy),
      d = distance(o, p);
    if (!best || d < best.d) best = {
      w,
      p,
      d
    };
  }
  if (best) Object.assign(o, best.p, {
    wallId: best.w.id,
    rotation: angle(best.w),
    depth: best.w.thickness
  });else o.wallId = null;
}
export class StorageManager {
  constructor() {
    this.key = 'surveybridge:projects:v4';
  }
  list() {
    return JSON.parse(localStorage.getItem(this.key) || '[]');
  }
  put(p) {
    const all = this.list();
    p.updatedAt = new Date().toISOString();
    localStorage.setItem(this.key, JSON.stringify([copy(p), ...all.filter(x => x.id !== p.id)]));
  }
  remove(id) {
    localStorage.setItem(this.key, JSON.stringify(this.list().filter(x => x.id !== id)));
  }
}
export function normalizeRoom(raw, n) {
  const unpack = m => {
    const v = Array.isArray(m) ? m.flat() : m?.columns?.flat();
    if (v?.length !== 16 || !v.every(Number.isFinite)) throw Error('無法讀取 RoomPlan 4×4 矩陣');
    return v;
  };
  const f = template(0, n);
  f.walls = [];
  f.openings = [];
  f.furnitures = [];
  f.source = 'RoomPlan';
  const surface = s => {
    const m = unpack(s.transform),
      d = s.dimensions;
    if (!Array.isArray(d) || d.length < 3 || !d.every(Number.isFinite)) throw Error('無效的 RoomPlan 尺寸');
    return {
      x: m[12] * 100,
      y: m[14] * 100,
      rotation: Math.atan2(m[2], m[0]) * 180 / Math.PI,
      width: d[0] * 100,
      height: d[1] * 100,
      depth: d[2] * 100
    };
  };
  for (const s of raw.walls || []) {
    const o = surface(s),
      v = turn(pt(o.width / 2, 0), o.rotation);
    f.walls.push({
      ...wall(pt(o.x - v.x, o.y - v.y), pt(o.x + v.x, o.y + v.y)),
      id: s.identifier || id()
    });
    f.ceilingHeight = Math.round(o.height);
  }
  if (!f.walls.length) throw Error('掃描結果沒有牆面');
  const baseY = Math.min(...raw.walls.map(w => unpack(w.transform)[13] * 100 - w.dimensions[1] * 50));
  for (const [arr, type] of [[raw.doors, 'door'], [raw.windows, 'sliding_window'], [raw.openings, 'door']]) for (const s of arr || []) {
    const o = {
      ...item(type, 0, 0),
      ...surface(s)
    };
    if (type === 'sliding_window') {
      o.sillHeight = Math.max(0, unpack(s.transform)[13] * 100 - o.height / 2 - baseY);
      if (o.sillHeight < 15) {
        o.type = 'floor_window';
        o.label = '落地窗';
      }
    }
    if (arr === raw.openings) {
      o.passage = true;
      o.label = '開口';
    }
    snap(o, f);
    f.openings.push(o);
  }
  for (const s of raw.objects || []) {
    const key = typeof s.category === 'string' ? s.category : Object.keys(s.category || {})[0],
      t = {
        storage: 'wardrobe',
        sofa: 'sofa_3',
        bed: 'bed',
        stairs: 'stairs'
      }[key];
    if (t) {
      const o = {
        ...item(t, 0, 0),
        ...surface(s)
      };
      (o.type ? f.openings : f.furnitures).push(o);
    }
  }
  const anchor = f.openings.find(o => o.type === 'stairs') || f.openings[0];
  f.anchorPoint = anchor ? pt(anchor.x, anchor.y) : {
    ...f.walls[0].start
  };
  if (anchor) f.anchorId = anchor.id;
  return f;
}

// Rectangular annexes are stored as four ordinary CAD walls with a shared group identifier.
export function annexes(f) {
  const groups = new Map();
  for (const w of f.walls) {
    if (!w.regionId) continue;
    if (!groups.has(w.regionId)) groups.set(w.regionId, []);
    groups.get(w.regionId).push(w);
  }
  return [...groups.entries()].filter(([, walls]) => walls.length === 4).map(([regionId, walls]) => {
    const [a, b, c] = walls.map(w => w.start);
    return {
      regionId,
      type: walls[0].type,
      label: walls[0].type === 'balcony' ? '陽台／露台' : '騎樓／車庫',
      x: (a.x + c.x) / 2,
      y: (a.y + c.y) / 2,
      width: distance(a, b),
      depth: distance(b, c),
      rotation: angle(walls[0])
    };
  });
}
export function reshapeAnnex(f, o) {
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([i, j]) => turn(pt(o.x + i * o.width / 2, o.y + j * o.depth / 2), o.rotation, o));
  f.walls.filter(w => w.regionId === o.regionId).forEach((w, i) => {
    w.start = {
      ...corners[i]
    };
    w.end = {
      ...corners[(i + 1) % 4]
    };
  });
}

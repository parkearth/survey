import { id, pt, wall, surfaces, snap, turn, copy } from './model.js';
import { catalog } from './catalog.js';
export function createFloor(values, index) {
  const thickness = Number(values.thickness),
    width = Number(values.width),
    depth = Number(values.depth);
  const cutWidth = Number(values.cutWidth),
    cutDepth = Number(values.cutDepth);
  if (![width, depth, thickness, Number(values.height)].every(Number.isFinite) || thickness < 4 || width <= thickness * 4 || depth <= thickness * 4) throw Error('樓層長寬需大於四倍牆厚，請檢查尺寸。');
  const w = width - thickness,
    d = depth - thickness;
  if (values.shape === 'L' && (!(cutWidth > 0 && cutDepth > 0) || cutWidth >= w - thickness * 2 || cutDepth >= d - thickness * 2)) throw Error('L 型缺角需小於外框，並保留至少兩倍牆厚的空間。');
  const vertices = (values.shape === 'L' ? [[0, 0], [w, 0], [w, d - cutDepth], [w - cutWidth, d - cutDepth], [w - cutWidth, d], [0, d]] : [[0, 0], [w, 0], [w, d], [0, d]]).map(([x, y]) => pt(x + thickness / 2, y + thickness / 2));
  return {
    floorIndex: index,
    label: values.label || index + 'F',
    usage: values.usage || '住宅',
    construction: values.construction || 'RC',
    floorMaterial: values.floorMaterial || 'wood',
    slabThickness: 15,
    wallThickness: thickness,
    ceilingHeight: Number(values.height),
    rotationAngle: 0,
    anchorPoint: pt(thickness / 2, thickness / 2),
    walls: surfaces(vertices).map(w => ({
      ...w,
      thickness
    })),
    openings: [],
    furnitures: [],
    components: [],
    source: '手動輸入',
    createdAt: new Date().toISOString(),
    manualEnvelope: {
      width,
      depth,
      shape: values.shape,
      cutWidth,
      cutDepth
    }
  };
}
export function addObject(f, key, values) {
  const spec = catalog[key];
  if (spec.kind === 'finish') {
    f.floorMaterial = spec.material;
    return null;
  }
  const o = {
    id: id(),
    label: values.label || spec.label,
    subtype: key,
    x: +values.x,
    y: +values.y,
    width: +values.width,
    depth: +values.depth,
    height: +values.height,
    rotation: +values.rotation || 0,
    elevation: +values.elevation || 0
  };
  if (![o.x, o.y, o.width, o.depth, o.height, o.rotation, o.elevation].every(Number.isFinite) || Math.min(o.width, o.depth, o.height) <= 0) throw Error('請輸入有效尺寸。');
  if (spec.kind === 'wall') {
    const a = turn(pt(o.x - o.width / 2, o.y), o.rotation, o),
      b = turn(pt(o.x + o.width / 2, o.y), o.rotation, o);
    const w = {
      ...wall(a, b, key, o.depth),
      height: o.height,
      label: o.label
    };
    f.walls.push(w);
    return w;
  }
  if (spec.kind === 'region') {
    const regionId = id();
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => turn(pt(o.x + a * o.width / 2, o.y + b * o.depth / 2), o.rotation, o));
    f.walls.push(...surfaces(corners, key).map(w => ({
      ...w,
      regionId,
      height: o.height,
      thickness: 12,
      label: o.label
    })));
    return {
      ...o,
      regionId,
      type: key
    };
  }
  if (spec.kind === 'opening') {
    o.type = key.startsWith('stairs') ? 'stairs' : key === 'elevator' ? 'elevator' : key.includes('window') ? key : 'door';
    o.wallId = null;
    o.swingDirection = 1;
    if (key === 'passage') o.passage = true;
    if (key === 'sliding_window') o.sillHeight = values.sillHeight === undefined ? 90 : +values.sillHeight;
    snap(o, f);
    f.openings.push(o);
  } else if (spec.kind === 'furniture') {
    o.category = key;
    f.furnitures.push(o);
  } else {
    (f.components ||= []).push(o);
  }
  return o;
}
export function upgrade(p) {
  // Defaults are supplied in memory. Old projects retain their storage key and object identifiers.
  for (const f of p.floors) {
    f.components ||= [];
    f.floorMaterial ||= 'wood';
    f.slabThickness ??= 4.5;
    f.construction ||= 'RC';
    f.source ||= '既有資料';
  }
  return p;
}
export const arrangements = {
  residential: {
    label: '住宅基本配置',
    items: ['door', 'sliding_window', 'bed', 'wardrobe', 'sofa_3']
  },
  office: {
    label: '辦公基本配置',
    items: ['door', 'sliding_window', 'desk', 'chair', 'shoe_cabinet']
  },
  service: {
    label: '廚衛設備配置',
    items: ['kitchen_counter', 'sink', 'toilet', 'shower']
  },
  roof: {
    label: '屋頂設備配置',
    items: ['water_tank', 'ac_unit', 'parapet']
  }
};
export function applyArrangement(f, key) {
  const points = f.walls.flatMap(w => [w.start, w.end]);
  const left = points.length ? Math.min(...points.map(p => p.x)) : 0,
    top = points.length ? Math.min(...points.map(p => p.y)) : 0;
  arrangements[key].items.forEach((key, i) => {
    const c = catalog[key];
    addObject(f, key, {
      ...c,
      x: left + 120 + i % 2 * 220,
      y: top + 120 + Math.floor(i / 2) * 210,
      rotation: 0,
      elevation: 0
    });
  });
}
export function duplicateFloor(f, index) {
  const v = copy(f),
    mapping = new Map();
  for (const o of [...v.walls, ...v.openings, ...v.furnitures, ...v.components]) {
    const old = o.id;
    o.id = id();
    mapping.set(old, o.id);
  }
  for (const w of v.walls) {
    if (w.regionId) {
      if (!mapping.has(w.regionId)) mapping.set(w.regionId, id());
      w.regionId = mapping.get(w.regionId);
    }
  }
  for (const o of v.openings) o.wallId = mapping.get(o.wallId) || null;
  v.anchorId = mapping.get(v.anchorId);
  v.floorIndex = index;
  v.label = index + 'F';
  v.source = '複製・' + f.label;
  return v;
}


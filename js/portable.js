// Offline renderer and exporters consume the same centimetre-to-metre model as the WebGL viewer.
import { geometryFactory } from './geometry3d.js';
import { saveFile, png } from './exports.js';
const V = (x = 0, y = 0, z = 0) => ({
  x,
  y,
  z,
  set(a, b, c) {
    this.x = a;
    this.y = b;
    this.z = c;
  }
});
class Node {
  constructor() {
    this.children = [];
    this.position = V();
    this.rotation = V();
    this.userData = {};
    this.visible = true;
  }
  add(n) {
    this.children.push(n);
  }
}
class Mesh extends Node {
  constructor(geo, mat) {
    super();
    this.geo = geo;
    this.mat = mat;
  }
}
class Box {
  constructor(w, h, d) {
    const x = w / 2,
      y = h / 2,
      z = d / 2;
    this.v = [[-x, -y, -z], [x, -y, -z], [x, y, -z], [-x, y, -z], [-x, -y, z], [x, -y, z], [x, y, z], [-x, y, z]];
    this.faces = [[3, 2, 1, 0], [4, 5, 6, 7], [1, 2, 6, 5], [4, 7, 3, 0], [7, 6, 2, 3], [0, 1, 5, 4]];
  }
}
const cross = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
function triangulate(points) {
  let ids = points.map((_, i) => i),
    out = [];
  if (points.reduce((s, a, i) => {
    const b = points[(i + 1) % points.length];
    return s + a[0] * b[1] - b[0] * a[1];
  }, 0) < 0) ids.reverse();
  while (ids.length > 2) {
    let clipped = false;
    for (let j = 0; j < ids.length; j++) {
      const a = ids[(j + ids.length - 1) % ids.length],
        b = ids[j],
        c = ids[(j + 1) % ids.length];
      if (cross(points[a], points[b], points[c]) <= 1e-9) continue;
      if (ids.some(i => i !== a && i !== b && i !== c && [[a, b], [b, c], [c, a]].every(([p, q]) => cross(points[p], points[q], points[i]) >= 0))) continue;
      out.push([a, b, c]);
      ids.splice(j, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  return out;
}
class Slab {
  constructor(shape, {
    depth
  }) {
    const pts = shape.pts.map(p => [p.x, p.y]),
      n = pts.length;
    this.v = [...pts.map(p => [...p, 0]), ...pts.map(p => [...p, depth])];
    this.faces = [];
    for (const f of triangulate(pts)) this.faces.push(f.slice().reverse(), f.map(i => i + n));
    for (let i = 0; i < n; i++) {
      let j = (i + 1) % n;
      this.faces.push([i, j, j + n, i + n]);
    }
  }
}
class Material {
  constructor(props) {
    Object.assign(this, props);
  }
}
const build = geometryFactory({
  Group: Node,
  Mesh,
  BoxGeometry: Box,
  MeshStandardMaterial: Material,
  CanvasTexture: class {},
  Vector2: class {
    constructor(x, y) {
      Object.assign(this, {
        x,
        y
      });
    }
  },
  Shape: class {
    constructor(pts) {
      this.pts = pts;
    }
  },
  ExtrudeGeometry: Slab,
  LineSegments: Node,
  EdgesGeometry: class {},
  LineBasicMaterial: Material
});
function transform(v, n) {
  let [x, y, z] = v;
  const a = n.rotation.x,
    b = n.rotation.y;
  [y, z] = [y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)];
  return [x * Math.cos(b) + z * Math.sin(b) + n.position.x, y + n.position.y, -x * Math.sin(b) + z * Math.cos(b) + n.position.z];
}
function collect(n, parents = [], out = []) {
  if (!n.visible) return out;
  const chain = [n, ...parents];
  if (n.geo) out.push({
    verts: n.geo.v.map(v => chain.reduce(transform, v)),
    faces: n.geo.faces,
    color: n.mat.map ? '#c9b799' : n.mat.color,
    alpha: n.mat.opacity
  });
  for (const child of n.children) collect(child, chain, out);
  return out;
}
const rgb = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16) / 255);
const enc = new TextEncoder(),
  pad = (n, a) => (a - n % a) % a;
function join(items) {
  const b = new Uint8Array(items.reduce((s, a) => s + a.length, 0));
  let at = 0;
  for (const a of items) {
    b.set(a, at);
    at += a.length;
  }
  return b;
}
function glb(meshes) {
  const doc = {
      asset: {
        version: '2.0',
        generator: 'SurveyBridge'
      },
      scene: 0,
      scenes: [{
        nodes: []
      }],
      nodes: [],
      meshes: [],
      materials: [],
      buffers: [],
      bufferViews: [],
      accessors: []
    },
    chunks = [];
  let length = 0;
  const mats = new Map();
  for (const m of meshes) {
    const positions = [],
      normals = [];
    for (const f of m.faces) for (let i = 1; i < f.length - 1; i++) {
      const [a, b, c] = [f[0], f[i], f[i + 1]].map(j => m.verts[j]);
      const u = b.map((v, j) => v - a[j]),
        v = c.map((x, j) => x - a[j]),
        n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]],
        l = Math.hypot(...n) || 1;
      positions.push(...a, ...b, ...c);
      for (let j = 0; j < 3; j++) normals.push(...n.map(x => x / l));
    }
    if (!positions.length) continue;
    const attrs = {};
    for (const [key, data] of [['POSITION', positions], ['NORMAL', normals]]) {
      const arr = new Float32Array(data),
        bin = new Uint8Array(arr.buffer),
        bufferView = doc.bufferViews.length;
      doc.bufferViews.push({
        buffer: 0,
        byteOffset: length,
        byteLength: bin.length,
        target: 34962
      });
      chunks.push(bin);
      length += bin.length;
      const accessor = {
        bufferView,
        componentType: 5126,
        count: data.length / 3,
        type: 'VEC3'
      };
      if (key === 'POSITION') {
        accessor.min = [0, 1, 2].map(i => Math.min(...m.verts.map(v => v[i])));
        accessor.max = [0, 1, 2].map(i => Math.max(...m.verts.map(v => v[i])));
      }
      attrs[key] = doc.accessors.length;
      doc.accessors.push(accessor);
    }
    const k = m.color + m.alpha;
    if (!mats.has(k)) {
      mats.set(k, doc.materials.length);
      doc.materials.push({
        pbrMetallicRoughness: {
          baseColorFactor: [...rgb(m.color), m.alpha],
          metallicFactor: 0,
          roughnessFactor: .86
        },
        doubleSided: true,
        alphaMode: m.alpha < 1 ? 'BLEND' : 'OPAQUE'
      });
    }
    doc.scenes[0].nodes.push(doc.nodes.length);
    doc.nodes.push({
      mesh: doc.meshes.length
    });
    doc.meshes.push({
      primitives: [{
        attributes: attrs,
        material: mats.get(k)
      }]
    });
  }
  doc.buffers = [{
    byteLength: length
  }];
  const json = enc.encode(JSON.stringify(doc)),
    js = join([json, new Uint8Array(pad(json.length, 4)).fill(32)]),
    buf = join(chunks),
    header = new Uint32Array([0x46546c67, 2, 28 + js.length + buf.length, js.length, 0x4e4f534a]);
  return join([new Uint8Array(header.buffer), js, new Uint8Array(new Uint32Array([buf.length, 0x004e4942]).buffer), buf]);
}
function usdz(meshes) {
  const fmt = n => String(Number(n.toFixed(6))),
    vec = v => '(' + v.map(fmt).join(', ') + ')';
  let usd = '#usda 1.0\n(\n defaultPrim = "Building"\n metersPerUnit = 1\n upAxis = "Y"\n)\ndef Xform "Building" {\n';
  meshes.forEach((m, i) => {
    usd += 'def Mesh "Part' + i + '" {\n point3f[] points = [' + m.verts.map(vec) + ']\n int[] faceVertexCounts = [' + m.faces.map(f => f.length) + ']\n int[] faceVertexIndices = [' + m.faces.flat() + ']\n uniform token subdivisionScheme = "none"\n bool doubleSided = true\n color3f[] primvars:displayColor = [' + vec(rgb(m.color)) + ']\n float[] primvars:displayOpacity = [' + m.alpha + ']\n}\n';
  });
  const data = enc.encode(usd + '}\n'),
    name = enc.encode('Building.usda');
  let crc = -1;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = crc >>> 1 ^ (crc & 1 ? 0xedb88320 : 0);
  }
  crc = ~crc >>> 0;
  const pack = (len, fn) => {
    const b = new Uint8Array(len),
      v = new DataView(b.buffer);
    fn((i, x) => v.setUint16(i, x, true), (i, x) => v.setUint32(i, x, true));
    return b;
  };
  const extra = 64 - 30 - name.length;
  const local = pack(30, (s, l) => {
      l(0, 0x04034b50);
      s(4, 20);
      s(12, 33);
      l(14, crc);
      l(18, data.length);
      l(22, data.length);
      s(26, name.length);
      s(28, extra);
    }),
    padding = pack(extra, s => {
      s(0, 0x1986);
      s(2, extra - 4);
    }),
    central = pack(46, (s, l) => {
      l(0, 0x02014b50);
      s(4, 20);
      s(6, 20);
      s(14, 33);
      l(16, crc);
      l(20, data.length);
      l(24, data.length);
      s(28, name.length);
    }),
    end = pack(22, (s, l) => {
      l(0, 0x06054b50);
      s(8, 1);
      s(10, 1);
      l(12, central.length + name.length);
      l(16, 64 + data.length);
    });
  return join([local, name, padding, data, central, name, end]);
}
export function viewer(host, p, idx) {
  const canvas = document.createElement('canvas');
  host.replaceChildren(canvas);
  const g = canvas.getContext('2d'),
    levels = p.floors.map(build),
    targets = [],
    pts = new Map();
  let mode = 'stack',
    yaw = .72,
    pitch = .53,
    zoom = 1,
    persp = false,
    frame = 0,
    from = [],
    time = 0,
    pinch = 0;
  function layout(m) {
    mode = m;
    from = levels.map(g => g.position.y);
    time = performance.now();
    let y = 0;
    levels.forEach((g, i) => {
      g.visible = m !== 'single' || i === idx;
      g.position.x = -p.floors[i].anchorPoint.x / 100;
      g.position.z = -p.floors[i].anchorPoint.y / 100;
      targets[i] = m === 'single' ? 0 : y;
      y += p.floors[i].ceilingHeight / 100 + (m === 'explode' ? 2.2 : 0);
    });
    render();
  }
  const meshes = () => levels.flatMap(g => collect(g));
  function render() {
    cancelAnimationFrame(frame);
    let progress = Math.min(1, (performance.now() - time) / 360);
    levels.forEach((g, i) => g.position.y = from[i] + (targets[i] - from[i]) * (1 - (1 - progress) ** 3));
    const w = host.clientWidth,
      h = host.clientHeight;
    canvas.width = w * 2;
    canvas.height = h * 2;
    g.setTransform(2, 0, 0, 2, 0, 0);
    g.fillStyle = '#f4f0e7';
    g.fillRect(0, 0, w, h);
    const project = ([x, y, z]) => {
      const depth = x * Math.sin(yaw) + z * Math.cos(yaw),
        v = y * Math.sin(pitch) + depth * Math.cos(pitch),
        s = persp ? 24 / Math.max(8, 24 - v) : 1;
      return [(x * Math.cos(yaw) - z * Math.sin(yaw)) * s, (-y * Math.cos(pitch) + depth * Math.sin(pitch)) * s, v];
    };
    const faces = [],
      all = [];
    for (const m of meshes()) {
      const v = m.verts.map(project);
      all.push(...v);
      for (const f of m.faces) {
        const pts = f.map(i => v[i]);
        faces.push({
          pts,
          color: m.color,
          alpha: m.alpha,
          order: pts.reduce((s, p) => s + p[2], 0) / pts.length
        });
      }
    }
    if (!all.length) return;
    const range = i => {
        const a = all.map(v => v[i]);
        return [Math.min(...a), Math.max(...a)];
      },
      [l, r] = range(0),
      [t, b] = range(1),
      s = Math.min((w - 40) / (r - l || 1), (h - 48) / (b - t || 1)) * zoom;
    g.translate(w / 2, h / 2);
    g.scale(s, s);
    g.translate(-(r + l) / 2, -(b + t) / 2);
    g.lineWidth = .65 / s;
    for (const f of faces.sort((a, b) => a.order - b.order)) {
      g.beginPath();
      f.pts.forEach(([x, y], i) => i ? g.lineTo(x, y) : g.moveTo(x, y));
      g.closePath();
      g.fillStyle = f.color;
      g.globalAlpha = f.alpha;
      g.fill();
      g.strokeStyle = '#665f50';
      g.globalAlpha = .35 * f.alpha;
      g.stroke();
    }
    g.globalAlpha = 1;
    if (mode === 'explode') {
      g.setLineDash([4 / s, 4 / s]);
      g.beginPath();
      const a = project([0, 0, 0]),
        b = project([0, levels.at(-1).position.y, 0]);
      g.moveTo(a[0], a[1]);
      g.lineTo(b[0], b[1]);
      g.stroke();
    }
    if (progress < 1) frame = requestAnimationFrame(render);
  }
  function sep() {
    const [a, b] = pts.values();
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
  canvas.onpointerdown = e => {
    canvas.setPointerCapture(e.pointerId);
    pts.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY
    });
    if (pts.size === 2) pinch = sep();
  };
  canvas.onpointermove = e => {
    const a = pts.get(e.pointerId);
    if (!a) return;
    pts.set(e.pointerId, {
      x: e.clientX,
      y: e.clientY
    });
    if (pts.size === 2) {
      const d = sep();
      zoom = Math.max(.25, Math.min(5, zoom * d / (pinch || 1)));
      pinch = d;
    } else {
      yaw += (e.clientX - a.x) * .012;
      pitch = Math.max(.06, Math.min(1.49, pitch + (e.clientY - a.y) * .009));
    }
    render();
  };
  canvas.onpointerup = canvas.onpointercancel = e => pts.delete(e.pointerId);
  canvas.onwheel = e => {
    e.preventDefault();
    zoom = Math.max(.25, Math.min(5, zoom * Math.exp(-e.deltaY * .002)));
    render();
  };
  const ro = new ResizeObserver(render);
  ro.observe(host);
  layout(mode);
  return {
    layout,
    camera() {
      persp = !persp;
      render();
    },
    toggle(v) {
      for (const g of levels) g.children.find(n => n.name === 'Furniture').visible = v;
      render();
    },
    png() {
      png(canvas, p.name + '-3D.png');
    },
    export(ext) {
      levels.forEach((g, i) => g.position.y = targets[i]);
      const m = meshes();
      saveFile(ext === 'usdz' ? usdz(m) : glb(m), p.name + '.' + ext, ext === 'usdz' ? 'model/vnd.usdz+zip' : 'model/gltf-binary');
    },
    destroy() {
      cancelAnimationFrame(frame);
      ro.disconnect();
    }
  };
}

import { distance, deg, angle, rings, outlines } from './model.js';
export function geometryFactory(T) {
  const material = (color, opacity = 1) => new T.MeshStandardMaterial({
    color,
    roughness: .86,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1
  });
  function plank() {
    const c = document.createElement('canvas');
    c.width = c.height = 256;
    const g = c.getContext('2d');
    g.fillStyle = '#cfb89d';
    g.fillRect(0, 0, 256, 256);
    for (let y = 0; y < 256; y += 32) {
      g.fillStyle = '#776751';
      g.fillRect(0, y, 256, 1);
      g.fillRect(y * 3 % 256, y, 1, 32);
      for (let j = 2; j < 30; j += 3) {
        g.strokeStyle = 'rgba(103,74,45,.15)';
        g.beginPath();
        g.moveTo(0, y + j);
        g.bezierCurveTo(70, y + j + 3, 190, y + j - 3, 256, y + j);
        g.stroke();
      }
    }
    const tex = new T.CanvasTexture(c);
    tex.wrapS = tex.wrapT = T.RepeatWrapping;
    tex.colorSpace = T.SRGBColorSpace;
    return tex;
  }
  function box(parent, x, y, z, w, h, d, mat, edges = false) {
    if (Math.min(w, h, d) <= .001) return;
    const mesh = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    parent.add(mesh);
    if (edges) mesh.add(new T.LineSegments(new T.EdgesGeometry(mesh.geometry), new T.LineBasicMaterial({
      color: 0x746e60,
      transparent: true,
      opacity: .58
    })));
    return mesh;
  }
  function buildFloor(f) {
    const group = new T.Group(),
      furniture = new T.Group();
    group.userData.floor = f.floorIndex;
    furniture.name = 'Furniture';
    group.add(furniture);
    const cream = material('#efeadc', .55),
      wood = material('#5a3e28'),
      white = material('#dedbd0'),
      dark = material('#817e72'),
      glass = material('#84b5bd', .48),
      cloth = material('#8c9c8f');
    const floorMat = material('#ffffff');
    floorMat.map = plank();
    floorMat.side = T.DoubleSide;
    for (const v of [...outlines(f), ...rings(f, 'balcony'), ...rings(f, 'arcade')]) {
      const shape = new T.Shape(v.map(p => new T.Vector2(p.x / 100, -p.y / 100)));
      const geo = new T.ExtrudeGeometry(shape, {
          depth: .045,
          bevelEnabled: false
        }),
        mesh = new T.Mesh(geo, floorMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -.045;
      group.add(mesh);
    }
    for (const w of f.walls) {
      const root = new T.Group(),
        len = distance(w.start, w.end) / 100,
        h = (w.type === 'balcony' ? 95 : f.ceilingHeight) / 100,
        t = w.thickness / 100;
      root.position.set(w.start.x / 100, 0, w.start.y / 100);
      root.rotation.y = -deg(angle(w));
      group.add(root);
      const gaps = f.openings.filter(o => o.wallId === w.id).map(o => ({
        o,
        x: distance(o, w.start) / 100
      })).sort((a, b) => a.x - b.x);
      let last = 0;
      const panel = (a, b, lo, hi) => box(root, (a + b) / 2, (lo + hi) / 2, 0, b - a, hi - lo, t, cream, true);
      for (const {
        o,
        x
      } of gaps) {
        const l = Math.max(last, 0, x - o.width / 200),
          r = Math.min(len, x + o.width / 200);
        if (r <= l) continue;
        panel(last, l, 0, h);
        const sill = (o.sillHeight ?? (o.type === 'sliding_window' ? 85 : 0)) / 100,
          top = Math.min(h, sill + o.height / 100);
        panel(l, r, 0, sill);
        panel(l, r, top, h);
        last = r;
      }
      panel(last, len, 0, h);
    }
    for (const o of [...f.openings, ...f.furnitures]) {
      const g = new T.Group();
      g.position.set(o.x / 100, 0, o.y / 100);
      g.rotation.y = -deg(o.rotation);
      (o.category ? furniture : group).add(g);
      const w = o.width / 100,
        d = o.depth / 100,
        h = o.height / 100;
      if (o.passage) continue;
      if (o.type === 'door') {
        for (const x of [-w / 2, w / 2]) box(g, x, h / 2, 0, .045, h, d, wood);
        box(g, 0, h, 0, w, .05, d, wood);
        const hinge = new T.Group();
        hinge.position.x = -w / 2;
        hinge.rotation.y = -deg(85) * (o.swingDirection || 1);
        g.add(hinge);
        box(hinge, w / 2, h / 2, 0, w - .04, h - .04, .035, wood, true);
      } else if (o.type?.includes('window')) {
        let s = (o.sillHeight ?? (o.type === 'sliding_window' ? 85 : 0)) / 100;
        box(g, 0, s + h / 2, 0, w, h, .025, glass, true);
        for (const x of [-w / 2, 0, w / 2]) box(g, x, s + h / 2, 0, .03, h, .05, dark);
        for (const y of [s, s + h]) box(g, 0, y, 0, w, .03, .05, dark);
      } else if (o.type === 'stairs') {
        for (let i = 0; i < 12; i++) {
          let v = (12 - i) * f.ceilingHeight / 1200;
          box(g, 0, v / 2, (i - 5.5) * d / 12, w, v, d / 12, white, true);
        }
      } else if (o.type === 'elevator') box(g, 0, h / 2, 0, w, h, d, glass, true);else if (o.category.startsWith('sofa')) {
        box(g, 0, .22, 0, w, .44, d * (o.category === 'sofa_l' ? .6 : 1), cloth, true);
        box(g, 0, h / 2, -d * .34, w, h, .15, cloth, true);
        if (o.category === 'sofa_l') box(g, -w * .3, .21, d * .24, w * .4, .42, d * .52, cloth);
      } else if (o.category === 'bed') {
        box(g, 0, .13, 0, w, .26, d, wood);
        box(g, 0, .26 + h * .22, 0, w, h * .44, d, white, true);
      } else {
        box(g, 0, h / 2, 0, w, h, d, dark);
        for (const y of [.035, h - .035]) box(g, 0, y, 0, w + .02, .07, d + .02, wood);
        for (const side of [-1, 1]) {
          box(g, side * w / 4, h / 2, d / 2, w / 2 - .018, h - .16, .035, white, true);
          box(g, side * w / 4, h / 2, d / 2 + .018, w / 2 - .09, h - .27, .009, dark);
        }
      }
    }
    return group;
  }
  return buildFloor;
}

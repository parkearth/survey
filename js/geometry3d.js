import { floorPieces, floorHoles, floorMaterials, paintFinish, isFloorHole, cutSurface, rectangle } from './floors.js';
import { distance, deg, angle, rings, outlines } from './model.js';
export function geometryFactory(T) {
  const material = (color, opacity = 1) => new T.MeshStandardMaterial({
    color,
    roughness: .86,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity === 1
  });
  function plank(key) {
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
    paintFinish(g, key, 0, 0, 256, 256, 1);
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
    const floorMat = material((floorMaterials[f.floorMaterial] || floorMaterials.wood).color);
    floorMat.map = plank(f.floorMaterial);
    floorMat.color?.set?.('#ffffff');
    floorMat.roughness = f.floorMaterial === 'marble' ? .3 : f.floorMaterial === 'tile' ? .55 : .86;
    floorMat.side = T.DoubleSide;
    for (const v of floorPieces(f)) {
      const shape = new T.Shape(v.map(p => new T.Vector2(p.x / 100, -p.y / 100)));
      const geo = new T.ExtrudeGeometry(shape, {
          depth: (f.slabThickness ?? 4.5) / 100,
          bevelEnabled: false
        }),
        mesh = new T.Mesh(geo, floorMat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = -(f.slabThickness ?? 4.5) / 100;
      group.add(mesh);
    }
    for (const w of f.walls) {
      const root = new T.Group(),
        len = distance(w.start, w.end) / 100,
        h = (w.height ?? (w.type === 'balcony' ? 95 : f.ceilingHeight)) / 100,
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
        const sill = ((o.elevation || 0) + (o.sillHeight ?? (o.type === 'sliding_window' ? 85 : 0))) / 100,
          top = Math.min(h, sill + o.height / 100);
        panel(l, r, 0, sill);
        panel(l, r, top, h);
        last = r;
      }
      panel(last, len, 0, h);
    }
    for (const o of [...f.openings, ...f.furnitures, ...(f.components || [])]) {
      if (isFloorHole(o)) continue;
      if (o.subtype === 'slab') {
        for (const v of cutSurface([rectangle(o)], floorHoles(f))) {
          const shape = new T.Shape(v.map(p => new T.Vector2(p.x / 100, -p.y / 100)));
          const mesh = new T.Mesh(new T.ExtrudeGeometry(shape, {
            depth: o.height / 100,
            bevelEnabled: false
          }), floorMat);
          mesh.rotation.x = -Math.PI / 2;
          mesh.position.y = (o.elevation || 0) / 100;
          group.add(mesh);
        }
        continue;
      }
      const g = new T.Group();
      g.position.set(o.x / 100, (o.elevation || 0) / 100, o.y / 100);
      g.rotation.y = -deg(o.rotation);
      (o.category ? furniture : group).add(g);
      const w = o.width / 100,
        d = o.depth / 100,
        h = o.height / 100;
      if (o.passage) continue;
      if (!o.type && !o.category) {
        const panel = material('#b2aea3'),
          metal = material('#899b96'),
          ceramic = material('#e4e1d8');
        switch (o.subtype) {
          case 'ramp':
            {
              const shape = new T.Shape([new T.Vector2(0, 0), new T.Vector2(d, 0), new T.Vector2(d, h)]);
              const mesh = new T.Mesh(new T.ExtrudeGeometry(shape, {
                depth: w,
                bevelEnabled: false
              }), panel);
              mesh.rotation.y = Math.PI / 2;
              mesh.position.set(-w / 2, 0, d / 2);
              g.add(mesh);
              break;
            }
          case 'railing':
            for (let x = -w / 2; x <= w / 2 + .001; x += Math.max(.1, w / 8)) box(g, x, h / 2, 0, .035, h, d, metal);
            box(g, 0, h - .025, 0, w, .05, d, metal);
            break;
          case 'shower':
            box(g, 0, .025, 0, w, .05, d, ceramic);
            box(g, -w / 2, h / 2, 0, .025, h, d, glass, true);
            box(g, 0, h / 2, -d / 2, w, h, .025, glass, true);
            break;
          case 'toilet':
            box(g, 0, h * .27, d * .12, w * .7, h * .54, d * .65, ceramic, true);
            box(g, 0, h * .8, -d * .33, w, h * .4, d * .25, ceramic, true);
            break;
          case 'sink':
          case 'bathtub':
          case 'kitchen_counter':
            box(g, 0, h / 2, 0, w, h, d, panel, true);
            box(g, 0, h + .005, 0, w * .6, .012, d * .65, metal, true);
            break;
          case 'ac_unit':
            box(g, 0, h / 2, 0, w, h, d, ceramic, true);
            for (let y = .06; y < h; y += .08) box(g, 0, y, d / 2 + .005, w * .85, .02, .01, metal);
            break;
          case 'roof':
          case 'canopy':
          case 'slab':
            box(g, 0, h / 2, 0, w, h, d, material('#b9b3a5', .4), true);
            break;
          default:
            box(g, 0, h / 2, 0, w, h, d, panel, true);
        }
      } else if (o.type === 'door') {
        for (const x of [-w / 2, w / 2]) box(g, x, h / 2, 0, .045, h, d, wood);
        box(g, 0, h, 0, w, .05, d, wood);
        if (['sliding_door', 'roller_door'].includes(o.subtype)) {
          box(g, 0, h / 2, 0, w - .05, h - .04, .035, dark, true);
          if (o.subtype === 'roller_door') for (let y = .1; y < h; y += .12) box(g, 0, y, .025, w, .015, .015, white);
          continue;
        }
        if (o.subtype === 'double_door') {
          for (const side of [-1, 1]) {
            const leaf = new T.Group();
            leaf.position.x = side * w / 2;
            leaf.rotation.y = side * deg(85) * (o.swingDirection || 1);
            g.add(leaf);
            box(leaf, -side * w / 4, h / 2, 0, w / 2 - .03, h - .04, .035, wood, true);
          }
          continue;
        }
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
          if (o.subtype === 'stairs_u') {
            const a = (12 - i) * h / 24,
              b = h / 2 + (i + 1) * h / 24;
            box(g, -w / 4, a / 2, (i - 5.5) * d / 12, w / 2 - .04, a, d / 12, white, true);
            box(g, w / 4, b / 2, (i - 5.5) * d / 12, w / 2 - .04, b, d / 12, white, true);
          } else {
            const v = (12 - i) * h / 12;
            box(g, 0, v / 2, (i - 5.5) * d / 12, w, v, d / 12, white, true);
          }
        }
      } else if (o.type === 'elevator') box(g, 0, h / 2, 0, w, h, d, glass, true);else if (o.category.startsWith('sofa')) {
        box(g, 0, .22, 0, w, .44, d * (o.category === 'sofa_l' ? .6 : 1), cloth, true);
        box(g, 0, h / 2, -d * .34, w, h, .15, cloth, true);
        if (o.category === 'sofa_l') box(g, -w * .3, .21, d * .24, w * .4, .42, d * .52, cloth);
      } else if (['desk', 'dining_table', 'chair'].includes(o.category)) {
        const seat = o.category === 'chair' ? h * .52 : h;
        box(g, 0, seat - .035, 0, w, .07, d, wood, true);
        for (const x of [-w * .4, w * .4]) for (const z of [-d * .4, d * .4]) box(g, x, seat / 2, z, .04, seat, .04, dark);
        if (o.category === 'chair') box(g, 0, (seat + h) / 2, -d * .45, w, h - seat, .05, white, true);
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


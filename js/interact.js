import { draw, handles } from './drawing.js';
import { copy, pt, distance, turn, snap, angle, wrap, annexes, reshapeAnnex } from './model.js';
export function editor(canvas, f, p, s, api) {
  let view,
    drag = null,
    points = new Map(),
    pinch = 0;
  const paint = () => {
      view = draw(canvas, f, p, s);
    },
    ro = new ResizeObserver(paint);
  ro.observe(canvas);
  paint();
  const local = e => {
      const r = canvas.getBoundingClientRect();
      return pt(e.clientX - r.left, e.clientY - r.top);
    },
    world = v => view.world(v.x, v.y);
  function hit(v) {
    for (const o of [...f.openings, ...(s.furniture ? f.furnitures : [])].reverse()) {
      const u = turn(v, -o.rotation, o);
      if (Math.abs(u.x - o.x) <= Math.max(8 / view.k, o.width / 2) && Math.abs(u.y - o.y) <= Math.max(8 / view.k, o.depth / 2)) return o;
    }
    for (const region of annexes(f).reverse()) {
      const q = turn(v, -region.rotation, region);
      if (Math.abs(q.x - region.x) <= region.width / 2 + 3 && Math.abs(q.y - region.y) <= region.depth / 2 + 3) return region;
    }
    return [...f.walls].reverse().find(w => {
      const len = distance(w.start, w.end);
      return len && distance(v, w.start) + distance(v, w.end) < len + 10 / view.k && Math.abs((v.x - w.start.x) * (w.end.y - w.start.y) - (v.y - w.start.y) * (w.end.x - w.start.x)) / len < Math.max(w.thickness / 2, 7 / view.k);
    });
  }
  function finish() {
    if (drag?.changed) {
      const o = s.selected;
      if (o && !o.start && drag.mode !== 'orient') snap(o, f);
      api.commit(drag.before);
    }
    drag = null;
    s.lockBounds = null;
  }
  canvas.onpointerdown = e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    const a = local(e),
      v = world(a);
    points.set(e.pointerId, a);
    if (points.size === 2) {
      finish();
      pinch = distance(...points.values());
      return;
    }
    if (s.anchorPick) {
      api.anchor(v);
      return;
    }
    let o = s.selected,
      mode = 'move',
      handle = o ? handles(o).findIndex(h => distance(h, v) < 11 / view.k) : -1;
    if (handle >= 0) mode = o.start ? 'endpoint' : handle === 0 ? 'size' : 'orient';else o = hit(v);
    s.selected = o;
    api.selection(o);
    s.lockBounds = view.b;
    drag = {
      o,
      mode,
      handle,
      v,
      a,
      orig: o && copy(o),
      before: copy(p),
      pan: {
        ...s.pan
      }
    };
    paint();
  };
  canvas.onpointermove = e => {
    if (!points.has(e.pointerId)) return;
    const a = local(e);
    points.set(e.pointerId, a);
    if (points.size === 2) {
      const d = distance(...points.values());
      if (pinch) s.zoom = Math.max(.25, Math.min(8, s.zoom * d / pinch));
      pinch = d;
      paint();
      return;
    }
    if (!drag) return;
    const {
        o,
        orig,
        v,
        mode
      } = drag,
      u = world(a);
    if (!o) {
      s.pan = pt(drag.pan.x + a.x - drag.a.x, drag.pan.y + a.y - drag.a.y);
      paint();
      return;
    }
    if (distance(a, drag.a) < 2 && !drag.changed) return;
    drag.changed = true;
    const dx = u.x - v.x,
      dy = u.y - v.y;
    if (o.start) {
      const oldFloor = drag.before.floors.find(x => x.floorIndex === f.floorIndex);
      for (const w of f.walls) {
        const old = oldFloor.walls.find(a => a.id === w.id);
        for (const key of ['start', 'end']) {
          const movable = (mode !== 'endpoint' || drag.handle === 0) && distance(old[key], orig.start) < 3 || (mode !== 'endpoint' || drag.handle === 1) && distance(old[key], orig.end) < 3;
          if (movable) w[key] = pt(old[key].x + dx, old[key].y + dy);
        }
      }
      for (const op of f.openings.filter(o => o.wallId)) {
        const wall = f.walls.find(w => w.id === op.wallId),
          old = oldFloor.walls.find(w => w.id === op.wallId),
          source = oldFloor.openings.find(o => o.id === op.id);
        if (!wall || !old) continue;
        const t = distance(source, old.start) / (distance(old.start, old.end) || 1);
        Object.assign(op, {
          x: wall.start.x + t * (wall.end.x - wall.start.x),
          y: wall.start.y + t * (wall.end.y - wall.start.y),
          rotation: angle(wall)
        });
      }
    } else if (mode === 'size') {
      const q = turn(u, -o.rotation, o);
      o.width = Math.max(8, Math.round(2 * Math.abs(q.x - o.x)));
      o.depth = Math.max(4, Math.round(2 * Math.abs(q.y - o.y)));
    } else if (mode === 'orient') {
      o.rotation = wrap(Math.round(Math.atan2(u.y - o.y, u.x - o.x) * 180 / Math.PI + 90));
      if (o.wallId) o.wallId = null;
    } else Object.assign(o, {
      x: orig.x + dx,
      y: orig.y + dy
    });
    if (o.regionId && !o.start) reshapeAnnex(f, o);
    paint();
  };
  function up(e) {
    points.delete(e.pointerId);
    finish();
    paint();
  }
  canvas.onpointerup = up;
  canvas.onpointercancel = up;
  canvas.onwheel = e => {
    e.preventDefault();
    s.zoom = Math.max(.25, Math.min(8, s.zoom * Math.exp(-e.deltaY * .002)));
    paint();
  };
  return {
    paint,
    destroy() {
      ro.disconnect();
      canvas.onpointerdown = canvas.onpointermove = canvas.onpointerup = canvas.onpointercancel = canvas.onwheel = null;
    }
  };
}

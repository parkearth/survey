import { id, pt, copy, StorageManager, area, ping, rotate, straighten, item, snap, wall, surfaces, templates, template, turn, angle, reshapeAnnex } from './model.js';
import { editor } from './interact.js';
import { scan } from './scan.js';
import { planPNG, report, DXFGenerator, saveFile } from './exports.js';
import { cover } from './cover.js';
import { viewer as portableViewer } from './portable.js';
const app = document.querySelector('#app'),
  $ = s => document.querySelector(s),
  db = new StorageManager(),
  defaultBrand = '臺北市政府工務局空間光達實測系統｜建築物查估 2D/3D 自動建模引擎';
let brand = localStorage.getItem('survey:brand') || defaultBrand,
  project,
  idx = 0,
  mode = 'plan',
  view,
  revision = 0,
  past = [],
  future = [],
  stack = 'stack',
  furn3 = true,
  toastTimer;
const esc = s => String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[c]),
  button = (key, t, cl = '') => '<button data-key="' + key + '" class="' + cl + '">' + t + '</button>',
  floor = () => project.floors[idx];
let state;
function reset() {
  state = {
    furniture: true,
    dims: true,
    labels: true,
    zoom: 1,
    pan: pt(0, 0),
    selected: null
  };
  stack = 'stack';
}
function toast(t) {
  $('#toast').textContent = t;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 4400);
}
function destroy() {
  revision++;
  view?.destroy();
  view = null;
  app.classList.remove('expanded');
}
function persist() {
  db.put(project);
}
function commit(before) {
  if (JSON.stringify(before.floors) === JSON.stringify(project.floors) && before.name === project.name) return;
  try {
    persist();
    past.push(before);
    if (past.length > 60) past.shift();
    future = [];
  } catch (e) {
    project = before;
    work();
    throw e;
  }
}
function edit(fn) {
  const before = copy(project);
  fn();
  commit(before);
  state.selected = null;
  work();
}
function history(undo) {
  const a = undo ? past : future,
    b = undo ? future : past;
  if (!a.length) return toast(undo ? '沒有可復原的編輯' : '沒有可重做的編輯');
  b.push(copy(project));
  project = a.pop();
  idx = Math.min(idx, project.floors.length - 1);
  reset();
  persist();
  work();
}
const modal = (title, fields = []) => new Promise(resolve => {
  const d = $('#dialog');
  d.querySelector('h2').textContent = title;
  $('#fields').innerHTML = fields.map(([name, label, value, type = 'text']) => '<label>' + esc(label) + '<input required maxlength="100" name="' + name + '" type="' + type + '" ' + (type === 'number' ? 'min="1" max="2000" step="any"' : '') + ' value="' + esc(value) + '"></label>').join('');
  d.returnValue = 'cancel';
  d.onclose = () => resolve(d.returnValue === 'ok' ? Object.fromEntries(new FormData(d.querySelector('form'))) : null);
  d.showModal();
});
function bind(map) {
  app.onclick = async e => {
    const b = e.target.closest('[data-key]');
    if (!b) return;
    try {
      await map[b.dataset.key]?.(b);
    } catch (err) {
      toast(err.message);
    }
  };
}
function newProject() {
  const now = new Date();
  return {
    id: id(),
    name: '實測 (' + now.toLocaleString('zh-TW', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }) + ')',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    floors: []
  };
}
function start(newCase) {
  destroy();
  if (newCase) {
    project = newProject();
    past = [];
    future = [];
  }
  const n = project.floors.length ? Math.max(...project.floors.map(f => f.floorIndex)) + 1 : 1;
  scan(app, n, f => {
    const before = copy(project);
    const prior = project.floors.at(-1);
    const reference = prior?.openings.find(o => o.id === prior.anchorId);
    const current = f.openings.find(o => o.id === f.anchorId);
    if (reference && current?.type === reference.type && ['stairs', 'elevator'].includes(current.type)) {
      rotate(f, 90 * Math.round((reference.rotation - current.rotation) / 90));
    }
    project.floors.push(f);
    idx = project.floors.length - 1;
    if (newCase) persist();else commit(before);
    reset();
    mode = 'plan';
    work();
  }, () => newCase ? home() : work(), toast);
}
function home() {
  destroy();
  const all = db.list();
  $('#brand').textContent = brand;
  app.innerHTML = '<header class="mast"><span class="mark">⌑</span><div><small>TAIPEI PUBLIC WORKS</small><strong>' + esc(brand.split('｜')[0]) + '</strong></div>' + button('brand', '⚙', 'icon') + '</header><section class="heading"><span class="eyebrow">SPATIAL SURVEY</span><h1>建築物查估</h1><p>空間掃描與 2D / 3D 自動建模</p></section><div class="plate"><canvas id="cover" aria-label="雙層住宅軸測分解圖"></canvas></div>' + button('start', '<span>⌖　啟動新物件 LiDAR 光達掃描</span><b>↗</b>', 'gold wide heroBtn') + '<section class="library"><div class="row spread"><h2>空間紀錄庫 <i>' + String(all.length).padStart(2, '0') + '</i></h2><small>已儲存專案</small></div>' + (!all.length ? '<div class="empty">尚無空間紀錄<br><small>掃描新物件，或選擇下方範本開始編輯。</small></div>' : all.map(p => '<article><div class="row spread"><strong>' + esc(p.name) + '</strong><i>共 ' + p.floors.length + ' 層</i></div><p>' + esc(p.floors.map(f => f.label + ' ' + f.usage).join(' · ')) + '</p><div class="row spread"><b>' + ping(p.floors.reduce((s, f) => s + area(f), 0)) + ' 坪' + (p.floors.some(f => !area(f)) ? '（有待閉合樓層）' : '') + '</b><div>' + button('open-' + p.id, '開啟編輯') + button('del-' + p.id, '<span aria-label="刪除專案">⌫</span>') + '</div></div></article>').join('')) + '</section><section><h2>空間範本</h2><div class="sampleRow">' + templates.map((t, i) => button('t' + i, '<b>' + ['▭', '◩', '▥'][i] + '</b>' + t)).join('') + '</div></section>';
  cover($('#cover'));
  const a = {
    start: () => start(true),
    brand: async () => {
      const v = await modal('自訂品牌', [['brand', '品牌與版權文字', brand]]);
      if (v) {
        brand = v.brand.trim() || defaultBrand;
        localStorage.setItem('survey:brand', brand);
        home();
      }
    }
  };
  for (const p of all) {
    a['open-' + p.id] = () => open(p);
    a['del-' + p.id] = async () => {
      if (await modal('刪除「' + p.name + '」？')) {
        db.remove(p.id);
        home();
      }
    };
  }
  templates.forEach((t, i) => a['t' + i] = () => {
    const p = newProject();
    p.name = t + '・範本';
    const f = template(i);
    f.scannedAt = p.createdAt;
    p.floors.push(f);
    db.put(p);
    open(p);
  });
  bind(a);
}
function open(p) {
  project = p;
  idx = 0;
  past = [];
  future = [];
  reset();
  mode = 'plan';
  work();
}
const adds = {
  balcony: '陽台／露台',
  arcade: '騎樓／車庫',
  partition: '隔間牆',
  sofa_3: '三人沙發',
  sofa_l: 'L 型沙發',
  wardrobe: '系統衣櫃',
  shoe_cabinet: '鞋櫃',
  tv_cabinet: '電視櫃',
  bed: '床',
  stairs: '樓梯',
  elevator: '電梯',
  door: '門扇',
  floor_window: '落地窗',
  sliding_window: '橫拉窗'
};
function anchorOf(o) {
  return ['stairs', 'elevator'].includes(o.type) ? turn(pt(o.x, o.y + o.depth / 2), o.rotation, o) : pt(o.x, o.y);
}
function syncAnchor(f) {
  const o = f.openings.find(o => o.id === f.anchorId);
  if (o) f.anchorPoint = anchorOf(o);
}
async function work() {
  destroy();
  const ticket = revision,
    f = floor();
  const tabs = project.floors.map((f, i) => button('f' + i, f.label, i === idx ? 'active' : '')).join('');
  app.innerHTML = '<div class="row spread">' + button('home', '‹ 紀錄庫') + button('rename', esc(project.name) + ' ✎', 'titleBtn') + button('png', '存圖') + '</div><div class="row scroll floors">' + tabs + button('scan', '＋ 光達掃新樓層') + button('copy', '複製為上一層') + '</div><div class="row scroll">' + button('usage', esc(f.usage) + ' ✎') + button('settings', '樓層設定') + button('pdf', '匯出 PDF') + button('dxf', 'DXF (CAD)') + '</div><nav>' + [['plan', '2D 平面/對位'], ['three', '3D 立體/透天'], ['parts', '樓梯/電梯/門窗']].map(([k, v]) => button(k, v, k === mode ? 'active' : '')).join('') + '</nav><div id="tools"></div><div id="stage"></div><div id="below"></div>';
  const a = {
    home,
    rename: async () => {
      const v = await modal('專案名稱', [['name', '案名', project.name]]);
      if (v) edit(() => project.name = v.name.trim() || project.name);
    },
    usage: async () => {
      const v = await modal('樓層用途', [['usage', '用途', f.usage]]);
      if (v) edit(() => f.usage = v.usage);
    },
    settings: async () => {
      const v = await modal('樓層設定', [['h', '樓高（cm）', f.ceilingHeight, 'number'], ['t', '外牆厚度（cm）', f.wallThickness, 'number']]);
      if (v) edit(() => {
        f.ceilingHeight = +v.h;
        f.wallThickness = +v.t;
        f.walls.filter(w => w.type === 'structural').forEach(w => w.thickness = +v.t);
      });
    },
    png: () => planPNG(project, f),
    pdf: () => report(project, brand),
    dxf: () => saveFile(new DXFGenerator().generate(f), project.name + '-' + f.label + '.dxf', 'application/dxf'),
    scan: () => start(false),
    copy: () => edit(() => {
      const dup = copy(f);
      dup.floorIndex = Math.max(...project.floors.map(f => f.floorIndex)) + 1;
      dup.label = dup.floorIndex + 'F';
      dup.source = f.source.includes('複製') ? f.source : f.source + '・複製';
      project.floors.push(dup);
      idx = project.floors.length - 1;
      reset();
    }),
    undo: () => history(true),
    redo: () => history(false)
  };
  for (const m of ['plan', 'three', 'parts']) a[m] = () => {
    mode = m;
    state.selected = null;
    work();
  };
  project.floors.forEach((_, i) => a['f' + i] = () => {
    idx = i;
    reset();
    work();
  });
  if (mode === 'three') {
    const modes = [['stack', '整棟堆疊'], ['explode', '爆炸懸浮'], ['single', '單層顯示']];
    $('#tools').innerHTML = '<div class="row">' + modes.map(([k, v]) => button(k, v, k === stack ? 'active' : '')).join('') + '</div>';
    $('#stage').className = 'three';
    $('#stage').textContent = '載入 3D 模型…';
    $('#below').innerHTML = '<div class="row wrap">' + button('vFurniture', '家具：' + (furn3 ? '顯示' : '隱藏')) + button('camera', '正交／透視') + button('shot', '3D 截圖') + button('usdz', '匯出 USDZ') + button('glb', '匯出 GLB') + '</div>';
    for (const [k] of modes) a[k] = () => {
      stack = k;
      view?.layout(k);
      modes.forEach(([m]) => app.querySelector('[data-key="' + m + '"]').classList.toggle('active', k === m));
    };
    a.vFurniture = b => {
      furn3 = !furn3;
      view?.toggle(furn3);
      b.textContent = '家具：' + (furn3 ? '顯示' : '隱藏');
    };
    a.camera = () => view?.camera();
    a.shot = () => view?.png();
    for (const k of ['usdz', 'glb']) a[k] = () => view?.export(k);
    bind(a);
    const stage = $('#stage');
    view = portableViewer(stage, project, idx);
    view.layout(stack);
    view.toggle(furn3);
    try {
      const {
        viewer
      } = await import('./scene.js');
      if (ticket !== revision) return;
      view.destroy();
      try {
        view = viewer(stage, project, idx);
      } catch {
        view = portableViewer(stage, project, idx);
      }
      view.layout(stack);
      view.toggle(furn3);
    } catch {/* The local renderer remains available offline. */}
    return;
  }
  $('#tools').innerHTML = '<div class="row scroll">' + [['furniture', '格局：含家具'], ['dims', '尺寸標註'], ['labels', '標籤：名稱＋尺寸']].map(([k, v]) => button(k, v, state[k] ? 'on' : '')).join('') + '</div><div class="row scroll">' + button('straight', '∠ 自動轉正') + button('rotate', '↻ 轉90°') + button('center', '置中') + button('anchor', state.anchorPick ? '請點選畫布錨點' : '設定錨點') + '</div><label class="range">微調 <input id="tilt" type="range" min="-45" max="45" value="0" step=".1"><span id="angle">0°</span></label>';
  $('#stage').innerHTML = '<canvas id="plan"></canvas><div class="floating">' + button('full', '⛶') + button('undo', '↶') + button('redo', '↷') + '</div>';
  ['全螢幕', '復原', '重做'].forEach((s, i) => {
    const el = $('.floating').children[i];
    el.title = s;
    el.setAttribute('aria-label', s);
  });
  $('#below').innerHTML = '<div id="selection"></div><div class="row spread"><h2>新增元件</h2><small>單位 cm</small></div><div class="chips">' + Object.entries(adds).filter(([k]) => mode !== 'parts' || ['stairs', 'elevator', 'door', 'floor_window', 'sliding_window'].includes(k)).map(([k, v]) => button('add-' + k, '＋ ' + v)).join('') + '</div><p class="note">' + esc(f.source) + '　·　20 cm 方格　·　' + (area(f) ? '外牆外緣計坪' : '外牆未閉合，請校正端點') + '</p>';
  const select = o => {
    $('#selection').innerHTML = o ? '<div class="row wrap"><b>' + esc(o.label || adds[o.type] || '結構牆') + '</b>' + (!o.start ? button('props', '尺寸／旋轉') : '') + (o.type === 'door' ? button('swing', '反轉開門') : '') + (['stairs', 'elevator', 'door'].includes(o.type) ? button('useAnchor', '作為對齊錨點') : '') + button('remove', '刪除') + '</div>' : '';
  };
  select(state.selected);
  view = editor($('#plan'), f, project, state, {
    selection: select,
    anchor: v => edit(() => {
      f.anchorPoint = v;
      delete f.anchorId;
      state.anchorPick = false;
    }),
    commit: before => {
      syncAnchor(f);
      commit(before);
    }
  });
  for (const k of ['furniture', 'labels', 'dims']) a[k] = b => {
    state[k] = !state[k];
    b.classList.toggle('on', state[k]);
    if (k === 'furniture' && !state[k] && state.selected?.category) {
      state.selected = null;
      select(null);
    }
    view.paint();
  };
  Object.assign(a, {
    straight: () => edit(() => straighten(f)),
    rotate: () => edit(() => rotate(f, 90)),
    center: () => {
      state.zoom = 1;
      state.pan = pt(0, 0);
      view.paint();
    },
    anchor: () => {
      state.anchorPick = !state.anchorPick;
      work();
    },
    full: () => {
      app.classList.toggle('expanded');
      view.paint();
    },
    remove: () => edit(() => {
      const o = state.selected;
      for (const k of ['walls', 'openings', 'furnitures']) f[k] = f[k].filter(x => o.regionId ? x.regionId !== o.regionId : x.id !== o.id);
      f.openings.forEach(x => {
        if (x.wallId === o.id) x.wallId = null;
      });
      if (f.anchorId === o.id) delete f.anchorId;
    }),
    swing: () => edit(() => state.selected.swingDirection *= -1),
    useAnchor: () => edit(() => {
      f.anchorId = state.selected.id;
      syncAnchor(f);
    }),
    props: async () => {
      const o = state.selected,
        v = await modal('元件尺寸與方向', [['w', '寬度（cm）', o.width, 'number'], ['d', '深度（cm）', o.depth, 'number'], ['h', '高度（cm）', o.height || f.ceilingHeight, 'number'], ['r', '旋轉角度（度）', o.rotation]]);
      if (v && Number.isFinite(+v.r)) edit(() => {
        Object.assign(o, {
          width: +v.w,
          depth: +v.d,
          height: +v.h,
          rotation: +v.r % 360
        });
        if (o.regionId) reshapeAnnex(f, o);
        if (o.wallId) {
          if (Math.abs(o.rotation - (f.walls.find(w => w.id === o.wallId) ? angle(f.walls.find(w => w.id === o.wallId)) : 0)) > .001) o.wallId = null;else snap(o, f);
        }
        syncAnchor(f);
      });
    }
  });
  for (const k of Object.keys(adds)) a['add-' + k] = () => {
    const ws = f.walls.flatMap(w => [w.start, w.end]),
      x = ws.reduce((s, p) => s + p.x, 0) / (ws.length || 1),
      y = ws.reduce((s, p) => s + p.y, 0) / (ws.length || 1);
    edit(() => {
      if (k === 'partition') f.walls.push(wall(pt(x - 75, y), pt(x + 75, y), k, 8));else if (['balcony', 'arcade'].includes(k)) {
        const regionId = id();
        f.walls.push(...surfaces([pt(x - 90, y - 50), pt(x + 90, y - 50), pt(x + 90, y + 50), pt(x - 90, y + 50)], k).map(w => ({
          ...w,
          regionId
        })));
      } else {
        const o = item(k, x, y);
        snap(o, f);
        (o.category ? f.furnitures : f.openings).push(o);
      }
    });
  };
  let initial = null,
    previous = 0;
  $('#tilt').oninput = e => {
    initial ??= copy(project);
    const a = +e.target.value;
    rotate(f, a - previous);
    previous = a;
    $('#angle').textContent = a + '°';
    view.paint();
  };
  $('#tilt').onchange = () => {
    if (initial) commit(initial);
    initial = null;
    previous = 0;
    $('#tilt').value = 0;
    $('#angle').textContent = '0°';
  };
  bind(a);
}
window.addEventListener('error', e => toast(e.message));
window.addEventListener('unhandledrejection', e => toast(e.reason?.message || '操作未完成'));
home();
if (['http:', 'https:'].includes(location.protocol) && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});

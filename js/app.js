import { floorMaterials, isFloorHole, floorMetrics } from './floors.js';
import { id, pt, copy, StorageManager, area, ping, rotate, straighten, snap, angle, turn, distance, bounds, reshapeAnnex, annexes } from './model.js';
import { catalog, groups, constructionTypes, objectGroup } from './catalog.js';
import { createFloor, addObject, upgrade, arrangements, applyArrangement, duplicateFloor } from './manual.js';
import { editor } from './interact.js';
import { scan } from './scan.js';
import { planPNG, report, DXFGenerator, saveFile } from './exports.js';
import { cover } from './cover.js';
import { viewer as portableViewer } from './portable.js';
const app = document.querySelector('#app'),
  $ = s => document.querySelector(s),
  db = new StorageManager();
const defaultBrand = '臺北市政府工務局空間建模系統｜建築物查估工作台';
let brand = localStorage.getItem('survey:brand') || defaultBrand;
let project,
  idx = 0,
  mode = 'plan',
  view,
  revision = 0,
  past = [],
  future = [],
  stack = 'stack',
  furn3 = true;
let state,
  category = 'flooring',
  toastTimer;
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
})[c]);
const button = (key, text, cls = '') => `<button type="button" data-key="${key}" class="${cls}">${text}</button>`;
const floor = () => project.floors[idx];
const labelFor = n => n < 0 ? 'B' + Math.abs(n) : n + 'F';
const nextIndex = () => Math.max(0, ...project.floors.map(f => f.floorIndex)) + 1;
const field = (name, label, value, type = 'text', min = '', max = '') => `<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${type === 'number' ? `step="any" min="${min}" max="${max}"` : 'maxlength="100"'} required></label>`;
const select = (name, label, options, value) => `<label>${label}<select name="${name}">${Object.entries(options).map(([k, v]) => `<option value="${k}" ${k === value ? 'selected' : ''}>${esc(v.label || v)}</option>`).join('')}</select></label>`;
const number = (name, label, value, min = .1, max = 50000) => field(name, label, value, 'number', min, max);
function toast(text) {
  $('#toast').textContent = text;
  $('#toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('#toast').classList.remove('show'), 5000);
}
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
  if (JSON.stringify(before) === JSON.stringify(project)) return;
  try {
    persist();
    past.push(before);
    if (past.length > 60) past.shift();
    future = [];
  } catch (e) {
    project = before;
    idx = Math.min(idx, project.floors.length - 1);
    state.selected = null;
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
  const from = undo ? past : future,
    to = undo ? future : past;
  if (!from.length) return;
  const candidate = copy(from.at(-1));
  db.put(candidate);
  to.push(copy(project));
  from.pop();
  project = candidate;
  idx = Math.min(idx, project.floors.length - 1);
  reset();
  work();
}
function modal(title, html = '', validate = () => {}) {
  return new Promise(resolve => {
    const d = $('#dialog'),
      form = d.querySelector('form');
    d.querySelector('h2').textContent = title;
    $('#fields').innerHTML = html + '<p class="formError" role="alert"></p>';
    d.returnValue = 'cancel';
    form.onsubmit = e => {
      if (e.submitter?.value === 'cancel') return;
      try {
        validate(Object.fromEntries(new FormData(form)));
      } catch (err) {
        e.preventDefault();
        d.querySelector('.formError').textContent = err.message;
      }
    };
    d.onclose = () => {
      form.onsubmit = null;
      resolve(d.returnValue === 'ok' ? Object.fromEntries(new FormData(form)) : null);
    };
    d.showModal();
  });
}
function bind(actions) {
  app.onclick = async e => {
    const b = e.target.closest('[data-key]');
    if (!b || b.disabled) return;
    try {
      await actions[b.dataset.key]?.(b);
    } catch (err) {
      toast(err.message);
    }
  };
}
function newProject() {
  const now = new Date().toISOString();
  return {
    id: id(),
    name: '建物查估 ' + new Date().toLocaleDateString('zh-TW'),
    createdAt: now,
    updatedAt: now,
    floors: []
  };
}
function open(p) {
  project = upgrade(copy(p));
  idx = 0;
  past = [];
  future = [];
  reset();
  mode = 'plan';
  work();
}
function home() {
  destroy();
  app.className = 'home';
  $('#brand').textContent = brand;
  const all = db.list();
  app.innerHTML = `<header class="mast"><span class="mark">⌑</span><div><small>SURVEYBRIDGE · v2.1</small><strong>${esc(brand.split('｜')[0])}</strong></div>${button('brand', '品牌設定', 'quiet')}</header>
    <section class="intro"><div><span class="eyebrow">空間建模工作站</span><h1>從尺寸開始，<br>建立建物全貌。</h1><p>記錄樓層與構造，完成可編輯的平面與立體模型。</p></div><div class="plate"><canvas id="cover" aria-label="多樓層建築示意"></canvas></div></section>
    <div class="entryGrid">
      ${button('manual', '<span class="entryIcon">⌑</span><span><strong>手動數據建模</strong><small>輸入尺寸 · 選擇構造 · 加入物件</small></span><span class="entryArrow">↗</span>', 'entry primary')}
      ${button('lidar', '<span class="entryIcon">⌖</span><span><strong>啟用光達建模</strong><small>' + (window.webkit?.messageHandlers?.roomPlanBridge ? '原生橋接已連線' : '功能保留 · 待原生 App 安裝啟用') + '</small></span><span class="entryArrow">↗</span>', 'entry secondary')}
    </div>
    <section class="library"><div class="sectionHead"><div><h2>建物紀錄庫 <span>${all.length}</span></h2><p>保存在這台裝置，可匯出專案帶到其他工作站。</p></div>${button('import', '匯入專案', 'quiet')}<input id="projectFile" type="file" accept=".json" hidden></div>
    <div class="projectGrid">${all.length ? all.map(p => `<article><div class="row spread"><strong>${esc(p.name)}</strong><span class="badge">${p.floors.length} 層</span></div><p>${esc(p.floors.map(f => f.label + ' ' + f.usage).join(' · '))}</p><div class="row spread"><div><b>${ping(p.floors.reduce((s, f) => s + area(f), 0))}</b> <small>坪</small></div><div class="row">${button('open-' + p.id, '開啟工作台')}${button('delete-' + p.id, '刪除', 'quiet')}</div></div></article>`).join('') : '<div class="empty"><strong>開始第一個建物專案</strong><p>選擇上方手動數據建模，輸入現場量測的尺寸。</p></div>'}</div></section>`;
  cover($('#cover'));
  const actions = {
    manual: () => manualPage(true),
    lidar: () => lidarPage(true),
    import: () => $('#projectFile').click(),
    brand: async () => {
      const v = await modal('品牌文字', field('brand', '首頁及頁尾', brand));
      if (v) {
        brand = v.brand.trim() || defaultBrand;
        localStorage.setItem('survey:brand', brand);
        home();
      }
    }
  };
  for (const p of all) {
    actions['open-' + p.id] = () => open(p);
    actions['delete-' + p.id] = async () => {
      if (await modal('刪除建物紀錄', `<p>將刪除「${esc(p.name)}」與其樓層資料。</p>`)) {
        db.remove(p.id);
        home();
      }
    };
  }
  bind(actions);
  $('#projectFile').onchange = importProject;
}
function validateProject(data) {
  if (!data || !Array.isArray(data.floors) || !data.floors.length || data.floors.length > 100) throw Error('專案樓層格式錯誤。');
  const used = new Set();
  for (const f of data.floors) {
    if (!Number.isInteger(f.floorIndex) || f.floorIndex === 0 || used.has(f.floorIndex)) throw Error('樓層編號重複或無效。');
    used.add(f.floorIndex);
    if (![f.ceilingHeight, f.wallThickness, f.anchorPoint?.x, f.anchorPoint?.y, f.rotationAngle].every(Number.isFinite) || f.ceilingHeight <= 0 || f.wallThickness <= 0) throw Error('樓層尺寸或錨點無效。');
    for (const key of ['walls', 'openings', 'furnitures']) if (!Array.isArray(f[key])) throw Error('專案物件格式錯誤。');
    if (f.components !== undefined && !Array.isArray(f.components)) throw Error('構造物件格式錯誤。');
    for (const w of f.walls) if (![w.start?.x, w.start?.y, w.end?.x, w.end?.y, w.thickness].every(Number.isFinite) || w.thickness <= 0) throw Error('牆體尺寸無效。');
    for (const o of [...f.openings, ...f.furnitures, ...(f.components || [])]) if (![o.x, o.y, o.width, o.depth, o.height, o.rotation].every(Number.isFinite) || Math.min(o.width, o.depth, o.height) <= 0) throw Error('物件尺寸無效。');
    if (f.slabThickness !== undefined && (!Number.isFinite(f.slabThickness) || f.slabThickness <= 0 || f.slabThickness > 100)) throw Error('樓板厚度無效。');
    if (!floorMaterials[f.floorMaterial]) f.floorMaterial = 'wood';
    f.label = String(f.label || labelFor(f.floorIndex));
    f.usage = String(f.usage || '未分類');
  }
  data.name = String(data.name || '匯入建物');
  return upgrade(data);
}
async function importProject(e) {
  try {
    const file = e.target.files[0];
    if (!file) return;
    const data = JSON.parse(await file.text());
    const p = validateProject(data.project || data);
    const now = new Date().toISOString();
    p.id = id();
    p.createdAt ||= now;
    p.name += '・匯入';
    db.put(p);
    open(p);
  } catch (err) {
    toast('匯入失敗：' + err.message);
  }
}
function manualPage(isNew) {
  destroy();
  app.className = 'setup';
  const initial = isNew ? null : floor(),
    structure = initial?.construction || 'RC';
  app.innerHTML = `<header class="row spread">${button('back', '‹ 返回', 'quiet')}<small>手動數據建模</small></header><h1>${isNew ? '建立建物專案' : '新增樓層'}</h1><p class="lead">先建立外牆輪廓，再於工作台加入構造與設備。所有尺寸以公分輸入。</p>
    <form id="manualForm"><section class="formCard"><h2>建物與樓層</h2><div class="formGrid">
      ${isNew ? field('name', '專案名稱', newProject().name) : ''}
      ${isNew ? number('count', '建立樓層數', 1, 1, 30) : number('floorIndex', '樓層編號（地下層用負數）', nextIndex(), -20, 100)}
      ${field('usage', '樓層用途', initial?.usage || '住宅')}
      ${select('construction', '構造類別', constructionTypes, structure)}${select('floorMaterial', '地板材質', floorMaterials, initial?.floorMaterial || 'wood')}
    </div><p class="hint">${isNew ? '多層建物會先套用相同外框，進入工作台後可分層修改。' : '新增後依樓層編號排序，例如 B1、1F、2F。'}</p></section>
    <section class="formCard"><h2>外框數據</h2><div class="formGrid">
      ${select('shape', '平面形狀', {
    rectangle: '矩形',
    L: 'L 型（右下缺角）'
  }, 'rectangle')}
      ${number('width', '外牆外緣總寬', 600, 100, 50000)}${number('depth', '外牆外緣總深', 800, 100, 50000)}
      ${number('height', '樓高', initial?.ceilingHeight || 280, 100, 2000)}${number('thickness', '外牆厚度', constructionTypes[structure]?.thickness || 15, 4, 100)}
    </div><div id="notch" class="formGrid" hidden>${number('cutWidth', '右下缺角寬度', 200, 1, 49000)}${number('cutDepth', '右下缺角深度', 300, 1, 49000)}</div>
    <div class="shapeHelp"><div class="shapeDemo"></div><p>尺寸取外牆外緣。牆厚會依構造類別帶入起始值，請以現場資料確認。</p></div></section>
    <p id="formError" role="alert" class="formError"></p><button class="primary wide" type="submit">${isNew ? '建立專案並進入工作台' : '建立這一層'} ↗</button></form>`;
  bind({
    back: () => isNew ? home() : work()
  });
  const form = $('#manualForm');
  form.elements.construction.onchange = e => form.elements.thickness.value = constructionTypes[e.target.value].thickness;
  form.elements.shape.onchange = e => {
    $('#notch').hidden = e.target.value !== 'L';
    $('.shapeDemo').classList.toggle('lshape', e.target.value === 'L');
  };
  form.onsubmit = e => {
    e.preventDefault();
    try {
      const v = Object.fromEntries(new FormData(form));
      if (isNew) {
        const count = +v.count;
        if (!Number.isInteger(count) || count < 1 || count > 30) throw Error('請輸入 1 至 30 的整數樓層數。');
        const p = newProject();
        p.name = v.name.trim() || p.name;
        p.floors = Array.from({
          length: count
        }, (_, i) => createFloor(v, i + 1));
        db.put(p);
        open(p);
      } else {
        const n = +v.floorIndex;
        if (!Number.isInteger(n) || n === 0 || project.floors.some(f => f.floorIndex === n)) throw Error('請輸入未使用的整數樓層編號，0 不代表樓層。');
        const f = createFloor({
          ...v,
          label: labelFor(n)
        }, n);
        edit(() => {
          project.floors.push(f);
          project.floors.sort((a, b) => a.floorIndex - b.floorIndex);
          idx = project.floors.indexOf(f);
          reset();
        });
      }
    } catch (err) {
      $('#formError').textContent = err.message;
    }
  };
}
function lidarPage(isNew) {
  if (window.webkit?.messageHandlers?.roomPlanBridge) return startScan(isNew);
  destroy();
  app.className = 'setup';
  app.innerHTML = `${button('back', '‹ 返回', 'quiet')}<section class="formCard reserved"><span class="entryIcon">⌖</span><h1>光達建模</h1><span class="badge">功能保留</span><p>完成原生 App 的 Xcode 簽署與手機安裝後，即可從 App 內開啟光達實測。</p><p>目前可使用手動數據建立樓層、構造及 2D／3D 模型。</p>${button('manual', '使用手動數據建模', 'primary wide')}</section>`;
  bind({
    back: () => isNew ? home() : work(),
    manual: () => manualPage(isNew)
  });
}
function startScan(isNew) {
  destroy();
  if (isNew) {
    project = newProject();
    past = [];
    future = [];
  }
  const n = nextIndex();
  scan(app, n, f => {
    upgrade({
      floors: [f]
    });
    const before = copy(project);
    const prior = project.floors.at(-1);
    const reference = prior?.openings.find(o => o.id === prior.anchorId),
      current = f.openings.find(o => o.id === f.anchorId);
    if (reference && current?.type === reference.type && ['stairs', 'elevator'].includes(current.type)) rotate(f, 90 * Math.round((reference.rotation - current.rotation) / 90));
    project.floors.push(f);
    idx = project.floors.length - 1;
    if (isNew) persist();else commit(before);
    reset();
    mode = 'plan';
    work();
  }, () => isNew ? home() : work(), toast);
}
function syncAnchor(f) {
  const o = f.openings.find(o => o.id === f.anchorId);
  if (o) f.anchorPoint = ['stairs', 'elevator'].includes(o.type) ? turn(pt(o.x, o.y + o.depth / 2), o.rotation, o) : pt(o.x, o.y);
}
function catalogHTML() {
  return `<section class="catalog"><div class="sectionHead"><h2>加入建模物件</h2><small>42 種物件 · 6 種材質</small></div><div class="categories">${Object.entries(groups).map(([key, label]) => button('category-' + key, label, category === key ? 'active' : '')).join('')}</div><div class="objectGrid">${Object.values(catalog).filter(c => c.group === category).map(c => button('add-' + c.key, `<span class="objectSymbol symbol-${c.kind}"></span><span>${c.label}</span><small>${c.kind === 'finish' ? '套用至目前樓層' : c.width + ' × ' + c.depth + ' cm'}</small>`, 'objectTile')).join('')}</div></section>`;
}
async function add(key) {
  const f = floor(),
    spec = catalog[key],
    center = view?.center?.() || pt(200, 200);
  if (spec.kind === 'finish') {
    if (await modal('套用' + spec.label, '<p>將目前樓層的自動地坪改為' + spec.label + '。樓板開口會保留；可復原。</p>')) edit(() => f.floorMaterial = spec.material);
    return;
  }
  let height = spec.height,
    elevation = 0;
  if (['column', 'pipe_shaft', 'stairs', 'stairs_u', 'structural', 'partition', 'arcade'].includes(key)) height = f.ceilingHeight;
  if (key === 'beam') elevation = Math.max(0, f.ceilingHeight - height);
  if (['roof', 'canopy'].includes(key)) elevation = f.ceilingHeight;
  const v = await modal('新增' + spec.label, `<div class="formGrid">${number('width', '寬／長（cm）', spec.width)}${number('depth', '深／厚（cm）', spec.depth)}${spec.kind === 'hole' ? '<input type="hidden" name="height" value="15">' : number('height', '高度（cm）', height)}${number('x', '中心 X（cm）', Math.round(center.x), -50000)}${number('y', '中心 Y（cm）', Math.round(center.y), -50000)}${number('rotation', '旋轉角度', 0, -180, 180)}${['wall', 'region', 'hole'].includes(spec.kind) ? '' : number('elevation', '底部離地高（cm）', elevation, 0)}</div><p class="hint">${spec.kind === 'hole' ? '開口切穿本層自動地坪與樓板物件；樓梯開口通常設在樓梯抵達的上一層。可在 3D 單層模式檢查。' : '門窗會貼齊最近可容納的牆段。新增後可拖曳或修改座標。'}</p>`);
  if (v) {
    edit(() => addObject(f, key, v));
    toast('已加入' + spec.label);
  }
}
async function properties() {
  const f = floor(),
    o = state.selected;
  if (!o) return;
  if (o.start) {
    const v = await modal('牆體數據', `<div class="formGrid">${number('sx', '起點 X', o.start.x, -50000)}${number('sy', '起點 Y', o.start.y, -50000)}${number('ex', '終點 X', o.end.x, -50000)}${number('ey', '終點 Y', o.end.y, -50000)}${number('thickness', '牆厚', o.thickness, 1, 200)}${number('height', '牆高', o.height || f.ceilingHeight)}</div>`, v => {
      if (Math.hypot(v.ex - v.sx, v.ey - v.sy) < 1) throw Error('牆長需大於 1 cm。');
    });
    if (v) edit(() => {
      const a = {
          ...o.start
        },
        b = {
          ...o.end
        };
      for (const w of f.walls) for (const key of ['start', 'end']) {
        if (distance(w[key], a) < 3) w[key] = pt(+v.sx, +v.sy);else if (distance(w[key], b) < 3) w[key] = pt(+v.ex, +v.ey);
      }
      o.thickness = +v.thickness;
      o.height = +v.height;
      for (const op of f.openings.filter(x => x.wallId === o.id)) snap(op, f);
      syncAnchor(f);
    });
    return;
  }
  const v = await modal('物件數據', `<div class="formGrid">${field('label', '物件名稱', o.label)}${number('width', '寬度（cm）', o.width)}${number('depth', '深度（cm）', o.depth)}${isFloorHole(o) ? '' : number('height', '高度（cm）', o.height || f.ceilingHeight)}${number('x', '中心 X（cm）', o.x, -50000)}${number('y', '中心 Y（cm）', o.y, -50000)}${number('rotation', '旋轉角度', o.rotation, -180, 180)}${o.regionId || isFloorHole(o) ? '' : number('elevation', '底部離地高（cm）', o.elevation || 0, 0)}${o.type?.includes('window') ? number('sillHeight', '窗台離地高（cm）', o.sillHeight || 0, 0) : ''}</div>`);
  if (v) edit(() => {
    for (const [key, value] of Object.entries(v)) o[key] = key === 'label' ? value : +value;
    if (o.regionId) reshapeAnnex(f, o);else snap(o, f);
    syncAnchor(f);
  });
}
function selectedHTML(o) {
  if (!o) return '<p class="hint">點選圖面或下方物件清單，可編輯尺寸與座標。</p>';
  return `<div class="selectionHead"><strong>${esc(o.label || catalog[o.type]?.label || '牆體')}</strong><small>${o.start ? Math.round(distance(o.start, o.end)) + ' cm' : Math.round(o.width) + ' × ' + Math.round(o.depth) + ' cm'}</small></div><div class="row wrap">${button('props', '尺寸／位置', 'primary')}${o.type === 'door' && !o.passage ? button('swing', '開門方向') : ''}${['stairs', 'elevator', 'door'].includes(o.type) ? button('useAnchor', '設為錨點') : ''}${button('remove', '刪除', 'quiet')}</div>`;
}
function objectsHTML(f) {
  const objects = [...annexes(f), ...f.walls.filter(w => !w.regionId), ...f.openings, ...f.furnitures, ...f.components];
  return `<details class="objectList"><summary>本層物件清單 <span>${objects.length}</span></summary>${objects.map((o, i) => button('select-' + i, `<span>${esc(o.label || catalog[o.type]?.label || '外牆')}</span><small>${o.start ? Math.round(distance(o.start, o.end)) + ' cm' : Math.round(o.width) + ' × ' + Math.round(o.depth)}</small>`)).join('')}</details>`;
}
async function floorSettings() {
  const f = floor();
  const v = await modal('樓層與構造', `<div class="formGrid">${field('label', '樓層標籤', f.label)}${field('usage', '用途', f.usage)}${select('construction', '構造類別', constructionTypes, f.construction)}${number('height', '樓高（cm）', f.ceilingHeight, 100, 2000)}${number('thickness', '外牆厚度（cm）', f.wallThickness, 4, 100)}${select('floorMaterial', '地板材質', floorMaterials, f.floorMaterial)}${number('slabThickness', '自動樓板厚度（cm）', f.slabThickness, 1, 100)}</div><p class="hint">外牆與柱的個別高度可在物件數據中調整。</p>`);
  if (v) edit(() => {
    f.label = v.label;
    f.usage = v.usage;
    f.construction = v.construction;
    f.floorMaterial = v.floorMaterial;
    f.slabThickness = +v.slabThickness;
    f.ceilingHeight = +v.height;
    f.wallThickness = +v.thickness;
    f.walls.filter(w => w.type === 'structural').forEach(w => w.thickness = +v.thickness);
  });
}
async function work() {
  destroy();
  app.className = 'workbench';
  upgrade(project);
  const ticket = revision,
    f = floor();
  app.innerHTML = `<header class="workHeader">${button('home', '‹ 紀錄庫', 'quiet')}<div><small>建物工作台</small>${button('rename', esc(project.name) + ' ✎', 'titleBtn')}</div><details class="exportMenu"><summary>匯出 ↗</summary><div>${button('png', '平面 PNG')}${button('pdf', '全棟 PDF')}${button('dxf', '本層 DXF')}${button('backup', '專案 JSON')}</div></details></header>
    <section class="floorBar"><div class="floorTabs">${project.floors.map((f, i) => button('floor-' + i, esc(f.label), i === idx ? 'active' : '')).join('')}</div><div class="row">${button('newFloor', '＋ 樓層')}${button('copy', '複製', 'quiet')}</div></section>
    <div class="floorInfo"><div><b>${esc(f.usage)}</b><span>${esc(constructionTypes[f.construction]?.label || f.construction)} · ${esc(floorMaterials[f.floorMaterial]?.label || '木地板')} · 樓高 ${f.ceilingHeight} cm</span></div>${button('settings', '設定 ✎', 'quiet')}</div>
    <div class="workGrid"><section class="drawingPanel"><nav class="viewTabs">${button('plan', '2D 平面圖', mode === 'plan' ? 'active' : '')}${button('three', '3D 立體圖', mode === 'three' ? 'active' : '')}</nav><div id="tools"></div><div id="stage"></div><div class="canvasCaption"><span>${esc(f.source)} · ${area(f).toFixed(2)} m² / ${ping(area(f))} 坪</span><span>開口 ${floorMetrics(f).hole.toFixed(2)} m² · 淨地坪 ${floorMetrics(f).net.toFixed(2)} m²</span></div><div id="viewBottom"></div></section>
    <aside class="sidePanel"><section id="selection" class="selection"></section><div id="catalogHost">${catalogHTML()}</div><section class="formCard compact"><h2>套用常用配置</h2><div class="row wrap">${Object.entries(arrangements).map(([key, v]) => button('preset-' + key, v.label)).join('')}</div><p class="hint">以起始尺寸加入本層，套用後請調整位置。</p></section>${objectsHTML(f)}<div class="row wrap">${button('lidar', '光達新增樓層', 'quiet')}${button('deleteFloor', '刪除本層', 'quiet')}</div></aside></div>`;
  const actions = {
    home,
    rename: async () => {
      const v = await modal('專案名稱', field('name', '名稱', project.name));
      if (v) edit(() => project.name = v.name);
    },
    newFloor: () => manualPage(false),
    lidar: () => lidarPage(false),
    settings: floorSettings,
    copy: () => edit(() => {
      const v = duplicateFloor(f, nextIndex());
      project.floors.push(v);
      idx = project.floors.length - 1;
      reset();
    }),
    deleteFloor: async () => {
      if (project.floors.length === 1) return toast('請至少保留一個樓層。');
      if (await modal('刪除樓層', `<p>將刪除 ${esc(f.label)} 及本層全部物件。</p>`)) edit(() => {
        project.floors.splice(idx, 1);
        idx = Math.min(idx, project.floors.length - 1);
        reset();
      });
    },
    png: () => planPNG(project, f),
    pdf: () => report(project, brand),
    dxf: () => saveFile(new DXFGenerator().generate(f), project.name + '-' + f.label + '.dxf', 'application/dxf'),
    backup: () => saveFile(JSON.stringify({
      format: 'SurveyBridge.Project.2.1',
      project
    }, null, 2), project.name + '.json', 'application/json'),
    undo: () => history(true),
    redo: () => history(false),
    props: properties,
    swing: () => edit(() => state.selected.swingDirection = -(state.selected.swingDirection || 1)),
    useAnchor: () => edit(() => {
      f.anchorId = state.selected.id;
      syncAnchor(f);
    }),
    remove: async () => {
      const o = state.selected;
      if (!o) return;
      edit(() => {
        for (const key of ['walls', 'openings', 'furnitures', 'components']) f[key] = f[key].filter(x => o.regionId ? x.regionId !== o.regionId : x.id !== o.id);
        for (const op of f.openings) if (op.wallId === o.id) op.wallId = null;
        if (f.anchorId === o.id) delete f.anchorId;
      });
    }
  };
  for (const m of ['plan', 'three']) actions[m] = () => {
    mode = m;
    state.selected = null;
    work();
  };
  project.floors.forEach((_, i) => actions['floor-' + i] = () => {
    idx = i;
    reset();
    work();
  });
  for (const key of Object.keys(groups)) actions['category-' + key] = () => {
    category = key;
    $('#catalogHost').innerHTML = catalogHTML();
  };
  for (const key of Object.keys(catalog)) actions['add-' + key] = () => add(key);
  for (const key of Object.keys(arrangements)) actions['preset-' + key] = async () => {
    if (await modal('套用' + arrangements[key].label, '<p>會將這組物件加入目前樓層，完成後可逐一調整。</p>')) edit(() => applyArrangement(f, key));
  };
  const objects = [...annexes(f), ...f.walls.filter(w => !w.regionId), ...f.openings, ...f.furnitures, ...f.components];
  objects.forEach((o, i) => actions['select-' + i] = () => {
    state.selected = o;
    if (o.category) state.furniture = true;
    $('#selection').innerHTML = selectedHTML(o);
    view?.paint?.();
    $('#selection').scrollIntoView({
      behavior: 'smooth',
      block: 'nearest'
    });
  });
  $('#selection').innerHTML = selectedHTML(state.selected);
  if (mode === 'three') {
    const modes = {
      stack: '整棟堆疊',
      explode: '爆炸懸浮',
      single: '單層'
    };
    $('#tools').innerHTML = `<div class="row scroll">${Object.entries(modes).map(([k, v]) => button(k, v, k === stack ? 'active' : '')).join('')}</div>`;
    $('#stage').className = 'three';
    $('#viewBottom').innerHTML = `<div class="row wrap">${button('vFurniture', furn3 ? '家具顯示' : '家具隱藏')}${button('camera', '正交／透視')}${button('shot', '3D 截圖')}${button('usdz', 'USDZ')}${button('glb', 'GLB')}</div>`;
    for (const key of Object.keys(modes)) actions[key] = () => {
      stack = key;
      view.layout(key);
      for (const m of Object.keys(modes)) app.querySelector(`[data-key="${m}"]`).classList.toggle('active', key === m);
    };
    actions.vFurniture = b => {
      furn3 = !furn3;
      view.toggle(furn3);
      b.textContent = furn3 ? '家具顯示' : '家具隱藏';
    };
    actions.camera = () => view.camera();
    actions.shot = () => view.png();
    for (const ext of ['usdz', 'glb']) actions[ext] = () => view.export(ext);
    bind(actions);
    const host = $('#stage');
    view = portableViewer(host, project, idx);
    view.layout(stack);
    view.toggle(furn3);
    try {
      const module = await import('./scene.js');
      if (ticket !== revision) return;
      view.destroy();
      try {
        view = module.viewer(host, project, idx);
      } catch {
        view = portableViewer(host, project, idx);
      }
      view.layout(stack);
      view.toggle(furn3);
    } catch {}
    return;
  }
  $('#tools').innerHTML = `<div class="row scroll">${[['furniture', '家具'], ['dims', '尺寸'], ['labels', '名稱']].map(([key, label]) => button(key, label, state[key] ? 'on' : '')).join('')}${button('center', '置中', 'quiet')}${button('undo', '↶ 復原', 'quiet')}${button('redo', '↷ 重做', 'quiet')}</div><details class="alignment"><summary>旋轉與跨層對位</summary><div class="row wrap">${button('straight', '自動轉正')}${button('rotate', '旋轉 90°')}${button('anchor', state.anchorPick ? '點選圖面定位' : '設定錨點')}</div><label class="range">微調<input id="tilt" type="range" min="-45" max="45" value="0" step=".1"><span id="angle">0°</span></label></details>`;
  $('#stage').innerHTML = `<canvas id="plan"></canvas><div class="floating">${button('full', '⛶')}</div>`;
  app.querySelector('[data-key="full"]').setAttribute('aria-label', '切換全螢幕');
  $('#viewBottom').innerHTML = '<p class="hint">單指選取與拖曳 · 雙指縮放 · 金色控制點調尺寸／旋轉</p>';
  view = editor($('#plan'), f, project, state, {
    selection: o => $('#selection').innerHTML = selectedHTML(o),
    anchor: p => edit(() => {
      f.anchorPoint = p;
      delete f.anchorId;
      state.anchorPick = false;
    }),
    commit: before => {
      syncAnchor(f);
      commit(before);
      $('.canvasCaption').lastElementChild.textContent = '開口 ' + floorMetrics(f).hole.toFixed(2) + ' m² · 淨地坪 ' + floorMetrics(f).net.toFixed(2) + ' m²';
      $('.canvasCaption').firstElementChild.textContent = f.source + ' · ' + area(f).toFixed(2) + ' m² / ' + ping(area(f)) + ' 坪';
    }
  });
  for (const key of ['furniture', 'dims', 'labels']) actions[key] = b => {
    state[key] = !state[key];
    b.classList.toggle('on', state[key]);
    if (key === 'furniture' && !state[key] && state.selected?.category) {
      state.selected = null;
      $('#selection').innerHTML = selectedHTML(null);
    }
    view.paint();
  };
  Object.assign(actions, {
    straight: () => edit(() => straighten(f)),
    rotate: () => edit(() => rotate(f, 90)),
    anchor: () => {
      state.anchorPick = !state.anchorPick;
      work();
    },
    center: () => {
      state.zoom = 1;
      state.pan = pt(0, 0);
      view.paint();
    },
    full: () => {
      app.classList.toggle('expanded');
      view.paint();
    }
  });
  let initial = null,
    previous = 0;
  $('#tilt').oninput = e => {
    initial ||= copy(project);
    const value = +e.target.value;
    rotate(f, value - previous);
    previous = value;
    $('#angle').textContent = value + '°';
    view.paint();
  };
  $('#tilt').onchange = () => {
    if (initial) commit(initial);
    initial = null;
    previous = 0;
    $('#tilt').value = 0;
    $('#angle').textContent = '0°';
  };
  bind(actions);
}
window.addEventListener('error', e => toast(e.message));
window.addEventListener('unhandledrejection', e => toast(e.reason?.message || '操作未完成'));
home();
if (['http:', 'https:'].includes(location.protocol) && 'serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(() => {});


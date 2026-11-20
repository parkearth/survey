import { floorPieces, floorMetrics, floorMaterials, isFloorHole } from './floors.js';
import { constructionTypes } from './catalog.js';
import { draw, dimensions } from './drawing.js';
import { pt, turn, area, ping, distance } from './model.js';
export function saveFile(data, name, type) {
  name = name.replace(/[\\/:*?"<>|]/g, '-');
  const blob = data instanceof Blob ? data : new Blob([data], {
    type
  });
  if (window.webkit?.messageHandlers?.fileBridge) {
    const r = new FileReader();
    r.onload = () => window.webkit.messageHandlers.fileBridge.postMessage({
      name,
      base64: r.result.split(',')[1]
    });
    r.readAsDataURL(blob);
    return;
  }
  const url = URL.createObjectURL(blob);
  if (name.toLowerCase().endsWith('.usdz') && document.createElement('a').relList?.supports?.('ar')) {
    document.querySelector('#quicklook')?.remove();
    const overlay = document.createElement('dialog');
    overlay.id = 'quicklook';
    const ar = document.createElement('a');
    ar.rel = 'ar';
    ar.href = url;
    const img = document.createElement('img');
    img.src = './icon192.png';
    img.alt = '以 AR Quick Look 開啟';
    img.width = 64;
    ar.append(img);
    const title = document.createElement('h2');
    title.textContent = '在實體空間檢視模型';
    const text = document.createElement('p');
    text.textContent = '點選模型圖示開啟 AR Quick Look。';
    const download = document.createElement('a');
    download.href = url;
    download.download = name;
    download.textContent = '下載 USDZ';
    const close = document.createElement('button');
    close.textContent = '關閉';
    close.onclick = () => overlay.close();
    overlay.append(title, text, ar, download, close);
    document.body.append(overlay);
    overlay.onclose = () => {
      URL.revokeObjectURL(url);
      overlay.remove();
    };
    overlay.showModal();
    return;
  }
  const a = document.createElement('a');
  a.download = name;
  a.href = url;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
export const png = (c, name) => c.toBlob(b => {
  if (b) saveFile(b, name, 'image/png');
}, 'image/png');
export function planPNG(p, f) {
  const c = document.createElement('canvas');
  draw(c, f, p, {
    width: 880,
    height: 820
  }, 3);
  png(c, p.name + '-' + f.label + '.png');
}
export class DXFGenerator {
  generate(f) {
    const out = [],
      pair = (...a) => out.push(...a),
      coord = v => Number(v.toFixed(5)),
      s = t => Array.from(t).map(c => c.charCodeAt(0) > 127 ? '\\U+' + c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0') : c).join('').replace(/[\r\n]/g, ' ');
    let handle = 256;
    const entity = (kind, layer, cls) => pair(0, kind, 5, (handle++).toString(16), 100, 'AcDbEntity', 8, layer, 100, cls);
    const line = (l, a, b) => {
      entity('LINE', l, 'AcDbLine');
      pair(10, coord(a.x), 20, coord(-a.y), 30, 0, 11, coord(b.x), 21, coord(-b.y), 31, 0);
    };
    const label = (l, p, t) => {
      entity('TEXT', l, 'AcDbText');
      pair(10, coord(p.x), 20, coord(-p.y), 30, 0, 40, 8, 1, s(t), 100, 'AcDbText');
    };
    const rect = (l, o) => {
      entity('LWPOLYLINE', l, 'AcDbPolyline');
      pair(90, 4, 70, 1);
      for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const p = turn(pt(o.x + a * o.width / 2, o.y + b * o.depth / 2), o.rotation, o);
        pair(10, coord(p.x), 20, coord(-p.y));
      }
    };
    pair(0, 'SECTION', 2, 'HEADER', 9, '$ACADVER', 1, 'AC1015', 9, '$INSUNITS', 70, 5, 0, 'ENDSEC', 0, 'SECTION', 2, 'TABLES', 0, 'TABLE', 2, 'LAYER', 5, '2', 100, 'AcDbSymbolTable', 70, 10);
    for (const [l, c] of [['0', 7], ['WALL', 7], ['DOOR', 30], ['WINDOW', 5], ['FURNITURE', 8], ['DIM', 2], ['STRUCTURE', 8], ['EQUIPMENT', 4], ['FLOOR', 8], ['FLOOR_OPENING', 30]]) pair(0, 'LAYER', 5, (handle++).toString(16), 330, '2', 100, 'AcDbSymbolTableRecord', 100, 'AcDbLayerTableRecord', 2, l, 70, 0, 62, c, 6, 'CONTINUOUS');
    pair(0, 'ENDTAB', 0, 'ENDSEC', 0, 'SECTION', 2, 'ENTITIES');
    for (const p of floorPieces(f)) {
      entity('LWPOLYLINE', 'FLOOR', 'AcDbPolyline');
      pair(90, p.length, 70, 1);
      for (const v of p) pair(10, coord(v.x), 20, coord(-v.y));
    }
    const metrics = floorMetrics(f);
    label('FLOOR', f.anchorPoint, (floorMaterials[f.floorMaterial] || floorMaterials.wood).label + ' / net ' + metrics.net.toFixed(2) + ' m2 / opening ' + metrics.hole.toFixed(2) + ' m2');
    for (const w of f.walls) {
      line('WALL', w.start, w.end);
      rect('WALL', {
        x: (w.start.x + w.end.x) / 2,
        y: (w.start.y + w.end.y) / 2,
        width: distance(w.start, w.end),
        depth: w.thickness,
        rotation: Math.atan2(w.end.y - w.start.y, w.end.x - w.start.x) * 180 / Math.PI
      });
    }
    for (const o of [...f.furnitures, ...f.openings, ...(f.components || [])]) {
      const l = isFloorHole(o) ? 'FLOOR_OPENING' : o.type === 'door' ? 'DOOR' : o.type?.includes('window') ? 'WINDOW' : !o.type && !o.category ? ['column', 'beam', 'slab', 'roof', 'canopy', 'parapet', 'railing', 'ramp'].includes(o.subtype) ? 'STRUCTURE' : 'EQUIPMENT' : 'FURNITURE';
      rect(l, o);
      if (l === 'DOOR' && !o.passage && !['sliding_door', 'roller_door'].includes(o.subtype)) {
        const radius = o.subtype === 'double_door' ? o.width / 2 : o.width;
        for (const side of o.subtype === 'double_door' ? [-1, 1] : [-1]) {
          const h = turn(pt(o.x + side * o.width / 2, o.y), o.rotation, o);
          const a = -o.rotation + (side === 1 ? 180 : 0),
            b = -o.rotation - 90 * (o.swingDirection || 1);
          const start = (side < 0 ? (o.swingDirection || 1) > 0 : (o.swingDirection || 1) < 0) ? b : a;
          entity('ARC', l, 'AcDbCircle');
          pair(10, coord(h.x), 20, coord(-h.y), 30, 0, 40, radius, 100, 'AcDbArc', 50, (start + 720) % 360, 51, (start + 90 + 720) % 360);
          line(l, h, turn(pt(h.x, h.y + radius * (o.swingDirection || 1)), o.rotation, h));
        }
      } else label(l, o, o.label);
    }
    for (const [a, b, v] of dimensions(f)) {
      line('DIM', a, b);
      for (const p of [a, b]) line('DIM', pt(p.x - 4, p.y + 4), pt(p.x + 4, p.y - 4));
      label('DIM', pt((a.x + b.x) / 2, (a.y + b.y) / 2 - 4), String(Math.round(v)));
    }
    pair(0, 'ENDSEC', 0, 'EOF');
    return out.join('\r\n') + '\r\n';
  }
}
const enc = new TextEncoder();
function rasterPDF(images) {
  const chunks = [],
    offsets = [0];
  let bytes = 0;
  function push(x) {
    let v = typeof x === 'string' ? enc.encode(x) : x;
    chunks.push(v);
    bytes += v.length;
  }
  function obj(i, data) {
    offsets[i] = bytes;
    push(i + ' 0 obj\n');
    for (const x of data) push(x);
    push('\nendobj\n');
  }
  push('%PDF-1.4\n');
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, ['<< /Type /Pages /Count ' + images.length + ' /Kids [' + images.map((_, i) => 3 + i * 3 + ' 0 R').join(' ') + '] >>']);
  images.forEach(({
    data,
    width,
    height
  }, i) => {
    let n = 3 + i * 3;
    obj(n, ['<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im ' + (n + 1) + ' 0 R >> >> /Contents ' + (n + 2) + ' 0 R >>']);
    obj(n + 1, ['<< /Type /XObject /Subtype /Image /Width ' + width + ' /Height ' + height + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + data.length + ' >>\nstream\n', data, '\nendstream']);
    const content = 'q 595.28 0 0 841.89 0 0 cm /Im Do Q';
    obj(n + 2, ['<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream']);
  });
  const pos = bytes;
  push('xref\n0 ' + offsets.length + '\n0000000000 65535 f \n');
  for (const n of offsets.slice(1)) push(String(n).padStart(10, '0') + ' 00000 n \n');
  push('trailer\n<< /Root 1 0 R /Size ' + offsets.length + ' >>\nstartxref\n' + pos + '\n%%EOF\n');
  return new Blob(chunks, {
    type: 'application/pdf'
  });
}
export async function report(p, brand) {
  const pages = [];
  function page() {
    const c = document.createElement('canvas');
    c.width = 1240;
    c.height = 1754;
    const g = c.getContext('2d');
    g.fillStyle = '#faf8f4';
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = '#647969';
    g.fillRect(0, 0, 1240, 180);
    g.fillStyle = '#e9e5d7';
    g.font = '25px sans-serif';
    g.fillText(brand, 60, 63, 1120);
    g.fillStyle = '#ffffff';
    g.font = 'bold 46px sans-serif';
    g.fillText(p.name, 60, 135, 1120);
    g.fillStyle = '#263e34';
    return [c, g];
  }
  async function append(c) {
    const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .95));
    pages.push({
      width: c.width,
      height: c.height,
      data: new Uint8Array(await blob.arrayBuffer())
    });
  }
  for (let i = 0; i < p.floors.length; i += 18) {
    const [c, g] = page();
    g.font = 'bold 38px sans-serif';
    g.fillText('建築物查估｜樓層面積明細', 60, 280);
    g.font = '25px sans-serif';
    g.fillText('建案時間  ' + new Date(p.createdAt).toLocaleString('zh-TW'), 60, 348);
    g.fillText('樓層       空間用途                          平方公尺           坪數            資料來源', 60, 435);
    p.floors.slice(i, i + 18).forEach((f, j) => {
      let y = 515 + j * 58;
      for (const [s, x, max] of [[f.label, 60, 90], [f.usage, 190, 300], [area(f) ? area(f).toFixed(2) : '待閉合', 535, 120], [area(f) ? ping(area(f)) : '—', 750, 100], [f.source, 920, 250]]) g.fillText(s, x, y, max);
    });
    g.fillText('全棟已閉合外牆合計  ' + ping(p.floors.reduce((s, f) => s + area(f), 0)) + ' 坪', 60, 1650);
    await append(c);
  }
  for (const f of p.floors) {
    const [c, g] = page();
    g.font = 'bold 36px sans-serif';
    g.fillText(f.label + '  ' + f.usage, 60, 270);
    g.font = '24px sans-serif';
    g.fillText('建模時間  ' + new Date(f.scannedAt || p.createdAt).toLocaleString('zh-TW') + '     來源  ' + f.source, 60, 332);
    g.fillText('構造  ' + (constructionTypes[f.construction]?.label || f.construction || '未分類') + '     樓高 ' + f.ceilingHeight + ' cm · ' + (floorMaterials[f.floorMaterial] || floorMaterials.wood).label, 60, 375, 1120);
    const plan = document.createElement('canvas');
    draw(plan, f, p, {
      width: 750,
      height: 760
    }, 2);
    g.drawImage(plan, 48, 410, 1144, 1120);
    const metrics = floorMetrics(f);
    g.fillText('外框 ' + metrics.gross.toFixed(2) + ' m² · 開口 ' + metrics.hole.toFixed(2) + ' m² · 淨地坪 ' + metrics.net.toFixed(2) + ' m²', 60, 1588, 1120);
    g.font = '24px sans-serif';
    let x = 60;
    for (const [t, color] of [['結構牆', '#1a1a1a'], ['門扇', '#a77862'], ['窗框', '#718b95'], ['陽台', '#78947c'], ['垂直動線', '#b08838']]) {
      g.fillStyle = color;
      g.fillRect(x, 1630, 23, 23);
      g.fillStyle = '#23392d';
      g.fillText(t, x + 36, 1652);
      x += 208;
    }
    await append(c);
  }
  saveFile(rasterPDF(pages), p.name + '.pdf', 'application/pdf');
}


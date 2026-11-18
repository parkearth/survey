import { id, templates, template, normalizeRoom, straighten, rotate, snap, turn, pt } from './model.js';
export function scan(host, n, done, cancel, notice) {
  const bridge = window.webkit?.messageHandlers?.roomPlanBridge;
  host.innerHTML = '<div class="row spread"><button id="back">✕　取消返回</button><span class="status">● 正在掃描新物件 ' + n + 'F</span></div><h1>空間掃描</h1><aside>剛開始請掃一下樓梯起步處或電梯門，完成後系統將自動水平轉正並與上下層對齊。</aside><div class="hud"><video playsinline muted autoplay></video><canvas></canvas><div class="reticle"></div><strong id="hint"></strong></div><div class="row"><b id="source"></b><select id="sample">' + templates.map((s, i) => '<option value="' + i + '">' + s + '</option>').join('') + '</select></div><p id="scanInfo"></p><button id="finish" class="gold wide">✓　完成本層掃描並自動對齊</button>';
  const q = s => host.querySelector(s),
    c = q('canvas'),
    g = c.getContext('2d'),
    video = q('video');
  let alive = true,
    stream,
    raf,
    move = 0,
    start = performance.now(),
    native = !!bridge;
  const token = id();
  const motion = () => move = Math.min(100, move + 1);
  host.onpointermove = motion;
  window.addEventListener('deviceorientation', motion);
  function cleanup() {
    alive = false;
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    host.onpointermove = null;
    window.removeEventListener('deviceorientation', motion);
    window.removeEventListener('pagehide', cleanup);
    window.onNativeRoomPlanResult = undefined;
  }
  window.addEventListener('pagehide', cleanup);
  function finish(f) {
    straighten(f);
    f.scannedAt = new Date().toISOString();
    cleanup();
    done(f);
  }
  async function web() {
    native = false;
    q('#sample').hidden = false;
    q('#finish').disabled = false;
    q('#source').textContent = 'Web 相機模擬';
    q('#scanInfo').textContent = '模型採用所選尺寸範本，相機影像僅供掃描引導。';
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment'
        },
        audio: false
      });
      if (!alive) {
        stream.getTracks().forEach(t => t.stop());
        return;
      }
      video.srcObject = stream;
      await video.play();
    } catch {
      if (alive) q('#scanInfo').textContent = '已啟用網格模擬。完成掃描會載入所選尺寸範本。';
    }
  }
  function frame(now) {
    if (!alive) return;
    const w = c.clientWidth,
      h = c.clientHeight;
    c.width = w * 2;
    c.height = h * 2;
    g.scale(2, 2);
    const t = (now - start) / 1000,
      progress = Math.min(1, (t + move / 4) / 11),
      ox = w * .52,
      oy = h * .69;
    const P = (x, y, z) => [ox + x * w * .22 - y * w * .18, oy + x * h * .08 + y * h * .09 - z * h * .25];
    function line(a, b, col) {
      g.strokeStyle = col;
      g.beginPath();
      g.moveTo(...a);
      g.lineTo(...b);
      g.stroke();
    }
    for (let i = -8; i <= 8; i++) {
      line(P(i, -8, 0), P(i, 8, 0), '#99c7ae32');
      line(P(-8, i, 0), P(8, i, 0), '#99c7ae32');
    }
    const faces = [[[-1, -1, 0], [1, -1, 0], [1, -1, 1], [-1, -1, 1]], [[-1, -1, 0], [-1, 1, 0], [-1, 1, 1], [-1, -1, 1]], [[.1, -.8, 0], [.8, -.8, 0], [.8, -.8, .5], [.1, -.8, .5]], [[.1, -.8, .5], [.8, -.8, .5], [.8, -.4, .5], [.1, -.4, .5]]];
    faces.forEach((face, i) => {
      const a = Math.min(1, Math.max(0, progress * 4 - i));
      g.beginPath();
      face.forEach(([x, y, z], j) => j ? g.lineTo(...P(x, y, z * a)) : g.moveTo(...P(x, y, z * a)));
      g.closePath();
      g.fillStyle = '#7bda9d28';
      g.fill();
      g.strokeStyle = '#a3ecb4aa';
      g.stroke();
    });
    const sweep = t * .28 % 1;
    line([0, sweep * h], [w, sweep * h], '#a4ffd2aa');
    for (let x = 0; x < 10; x++) for (let y = 0; y < 6; y++) {
      g.fillStyle = 'rgba(222,247,229,' + (.25 + .5 * Math.abs(Math.sin(t + x * .4 + y * .3))) + ')';
      g.fillRect(w * .38 + x * w * .027, h * .36 + y * h * .032, 2, 2);
    }
    q('#hint').textContent = ['Move device to start', 'Point camera at bottom edge of wall', 'Scanning walls and cabinets...'][Math.min(2, Math.floor(progress * 3))];
    raf = requestAnimationFrame(frame);
  }
  raf = requestAnimationFrame(frame);
  q('#back').onclick = () => {
    if (native) bridge.postMessage({
      action: 'cancelScan',
      token
    });
    cleanup();
    cancel();
  };
  q('#finish').onclick = () => {
    const f = template(Number(q('#sample').value), n);
    rotate(f, 13);
    finish(f);
  };
  if (native) {
    q('#source').textContent = '原生 LiDAR';
    q('#sample').hidden = true;
    q('#finish').disabled = true;
    q('#scanInfo').textContent = '請在原生掃描畫面按「完成掃描」。';
    window.onNativeRoomPlanResult = result => {
      if (typeof result === "string") {
        try {
          result = JSON.parse(result);
        } catch {
          notice("原生掃描回傳格式錯誤");
          web();
          return;
        }
      }
      if (!alive || result.token && result.token !== token) return;
      if (result.cancelled) {
        cleanup();
        cancel();
        return;
      }
      try {
        if (result.error) throw Error(result.error);
        const f = result.floorData || normalizeRoom(result.room || result, n);
        if (!f.walls.length) throw Error('掃描未取得牆面');
        for (const o of f.openings) snap(o, f);
        const a = f.openings.find(o => o.id === f.anchorId);
        if (a) f.anchorPoint = a.type === 'stairs' ? turn(pt(a.x, a.y + a.depth / 2), a.rotation, a) : pt(a.x, a.y);
        finish(f);
      } catch (e) {
        notice(e.message);
        web();
      }
    };
    bridge.postMessage({
      action: 'startScan',
      floor: n,
      token
    });
  } else web();
}

import { id, templates, template, normalizeRoom, straighten, rotate, snap, turn, pt } from './model.js';
export function scan(host, n, done, cancel, notice) {
  const bridge = window.webkit?.messageHandlers?.roomPlanBridge;
  host.innerHTML = `<div class="row spread"><button id="back">✕　取消返回</button><span class="status" id="status"></span></div>
    <h1>空間掃描 · ${n}F</h1>
    <aside>光達實測請掃過樓梯起步處或電梯門，再沿牆面緩慢移動。</aside>
    <p id="scanInfo" role="status"></p>
    <div class="row wrap" id="routes">
      <a id="launch" class="gold nativeLink" href="surveybridge-scan://capture?floor=${n}">開啟 iPhone 原生光達 App</a>
      <button id="retry">重試原生光達</button>
      <label class="nativeLink" for="captureFile">匯入原生實測檔</label>
      <input id="captureFile" type="file" accept=".json,application/json" hidden>
      <button id="simulate">使用相機模擬</button>
    </div>
    <div id="demo" hidden>
      <div class="hud"><video playsinline muted autoplay></video><canvas></canvas><div class="reticle"></div><strong id="hint"></strong></div>
      <div class="row"><b>模擬範本</b><select id="sample">${templates.map((s,i)=>`<option value="${i}">${s}</option>`).join('')}</select></div>
      <button id="finish" class="gold wide">載入本層模擬範本</button>
    </div>`;
  const q = s => host.querySelector(s),
    c = q('canvas'),
    g = c.getContext('2d'),
    video = q('video');
  let alive = true,
    stream,
    raf,
    move = 0,
    start = performance.now(),
    native = false, token, watchdog;

  const motion = () => move = Math.min(100, move + 1);
  host.onpointermove = motion;
  window.addEventListener('deviceorientation', motion);
  function cleanup() {
    alive = false;
    clearTimeout(watchdog);
    cancelAnimationFrame(raf);
    stream?.getTracks().forEach(t => t.stop());
    video.srcObject = null;
    host.onpointermove = null;
    window.removeEventListener('deviceorientation', motion);
    window.removeEventListener('pagehide', leaving);
    window.onNativeRoomPlanResult = undefined;
  }
  function leaving(e) {
    if (!e.persisted) cleanup();
    else if (stream) { stream.getTracks().forEach(t=>t.stop()); video.srcObject=null; }
  }
  window.addEventListener('pagehide', leaving);
  function finish(f) {
    straighten(f);
    f.scannedAt ||= new Date().toISOString();
    cleanup();
    done(f);
  }
  async function web() {
    if (!alive || !q('#demo').hidden) return;
    native = false;
    q('#routes').hidden=true;
    q('#demo').hidden=false;
    q('#status').textContent='● 相機模擬';
    raf=requestAnimationFrame(frame);
    q('#sample').hidden = false;
    q('#finish').disabled = false;
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
  q('#back').onclick = () => {
    if (native) bridge.postMessage({action:'cancelScan', token});
    cleanup();
    cancel();
  };
  q('#finish').onclick = () => {
    if (!alive || q('#demo').hidden) return;
    const f = template(Number(q('#sample').value), n);
    rotate(f, 13);
    finish(f);
  };
  function choices(message) {
    clearTimeout(watchdog);
    native = false;
    token = null;
    q('#routes').hidden=false;
    q('#launch').hidden=!!bridge;
    q('#retry').hidden=!bridge;
    q('#status').textContent='待選擇來源';
    q('#scanInfo').textContent=message;
  }
  function ingest(result, imported) {
    if (!result || typeof result !== 'object') throw Error('實測資料格式錯誤。');
    const raw=result.room || result;
    // Files are decoded from the captured surfaces. Never trust arbitrary floorData from a picked file.
    const f=(!imported && result.floorData) || normalizeRoom(raw,n);
    if (imported && !raw.walls?.every(w=>w.dimensions?.[0]>0 && w.dimensions?.[1]>0)) throw Error('牆面尺寸無效。');
    if (!Array.isArray(f.walls) || !f.walls.length || f.walls.some(w=>![w.start?.x,w.start?.y,w.end?.x,w.end?.y].every(Number.isFinite))) throw Error('掃描沒有可用的實測牆面。');
    for(const o of f.openings) snap(o,f);
    const anchor=f.openings.find(o=>o.id===f.anchorId);
    if(anchor) f.anchorPoint=anchor.type==='stairs'?turn(pt(anchor.x,anchor.y+anchor.depth/2),anchor.rotation,anchor):pt(anchor.x,anchor.y);
    const meta=result.captureInfo;
    f.source=imported?'RoomPlan 匯入':'RoomPlan';
    if (meta && Number.isInteger(meta.depthSamples) && meta.depthSamples>0) {
      f.captureInfo={depthSamples:meta.depthSamples,wallCount:f.walls.length};
      f.source+=' · 深度取樣 '+meta.depthSamples+' 幀';
    }
    if (meta?.capturedAt && Number.isFinite(Date.parse(meta.capturedAt))) f.scannedAt=new Date(meta.capturedAt).toISOString();
    finish(f);
  }
  function beginNative() {
    if(!alive || !bridge || native) return;
    native=true;
    token=id();
    q('#routes').hidden=true;
    q('#status').textContent='正在連接原生 App';
    q('#scanInfo').textContent='正在等候 RoomPlan 回應。';
    watchdog=setTimeout(()=>{
      if(!alive || !native) return;
      try { bridge.postMessage({action:'cancelScan',token}); } catch {}
      choices('原生橋接未回應。請安裝 v1.1 原生 App 後重試。');
    },10000);
    window.onNativeRoomPlanResult=value=>{
      if(!alive || !native) return;
      try {
        const result=typeof value==='string'?JSON.parse(value):value;
        if(result?.token && result.token!==token) return;
        clearTimeout(watchdog);
        if(result?.state==='accepted'){
          q('#status').textContent='原生 RoomPlan 已連線';
          q('#scanInfo').textContent='請在原生畫面確認有效深度取樣幀數。';
          return;
        }
        if(result?.cancelled){cleanup();cancel();return}
        if(result?.error) throw Error(result.error);
        ingest(result,false);
      } catch(e) {choices(e.message);}
    };
    try { bridge.postMessage({action:'startScan',floor:n,token}); }
    catch(e) {choices('無法開啟原生掃描：'+e.message);}
  }
  q('#simulate').onclick=web;
  q('#retry').onclick=beginNative;
  q('#launch').onclick=()=>{q('#scanInfo').textContent='請使用已安裝的 v1.1 原生 App 實測。完成後回此頁匯入 JSON；若未開啟 App，請先安裝 Xcode 專案或機關簽署版本。';};
  q('#captureFile').onchange=async e=>{
    const file=e.target.files[0];
    if(!file) return;
    try {
      const result=JSON.parse(await file.text());
      if(alive) ingest(result,true);
    } catch(err) {if(alive) choices('匯入失敗：'+err.message);}
    e.target.value='';
  };
  if(bridge) beginNative();
  else choices('目前為網頁模式。在 iPhone 15 Pro 實測，請開啟已安裝的原生 App。完成後可將實測檔匯回本層。');
}

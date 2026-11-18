import * as T from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { USDZExporter } from 'three/addons/exporters/USDZExporter.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { distance, deg, angle, rings, outlines } from './model.js';
import { saveFile, png } from './exports.js';
import { geometryFactory } from './geometry3d.js';
const buildFloor = geometryFactory(T);
export function viewer(host, p, index) {
  const renderer = new T.WebGLRenderer({
    antialias: true,
    preserveDrawingBuffer: true
  });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio));
  renderer.setClearColor('#f3efe6');
  host.replaceChildren(renderer.domElement);
  const scene = new T.Scene(),
    model = new T.Group();
  scene.add(model, new T.HemisphereLight(0xfff9ea, 0x868477, 2.6));
  const light = new T.DirectionalLight(0xfff8e7, 2);
  light.position.set(5, 9, 7);
  scene.add(light);
  const floors = p.floors.map(f => {
    const g = buildFloor(f);
    g.position.x = -f.anchorPoint.x / 100;
    g.position.z = -f.anchorPoint.y / 100;
    model.add(g);
    return g;
  });
  let mode = 'stack',
    raf,
    guide,
    perspective = false,
    frustum = 10;
  const ortho = new T.OrthographicCamera(),
    persp = new T.PerspectiveCamera(39, 1, .01, 1500);
  let camera = ortho,
    controls = new OrbitControls(camera, renderer.domElement);
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight,
      a = w / h;
    renderer.setSize(w, h, false);
    ortho.left = -frustum * a / 2;
    ortho.right = frustum * a / 2;
    ortho.top = frustum / 2;
    ortho.bottom = -frustum / 2;
    ortho.near = .01;
    ortho.far = 1500;
    persp.aspect = a;
    ortho.updateProjectionMatrix();
    persp.updateProjectionMatrix();
  }
  function layout(m, fit = true) {
    mode = m;
    let y = 0;
    const bounds = new T.Box3();
    floors.forEach((g, i) => {
      g.visible = m !== 'single' || i === index;
      g.userData.target = m === 'single' ? 0 : y;
      y += p.floors[i].ceilingHeight / 100 + (m === 'explode' ? 2.2 : 0);
      if (g.visible) {
        const v = g.position.y;
        g.position.y = g.userData.target;
        bounds.union(new T.Box3().setFromObject(g));
        g.position.y = v;
      }
    });
    if (guide) {
      scene.remove(guide);
      guide.geometry.dispose();
      guide.material.dispose();
      guide = null;
    }
    if (m === 'explode' && floors.length > 1) {
      const geom = new T.BufferGeometry().setFromPoints([new T.Vector3(), new T.Vector3(0, floors.at(-1).userData.target, 0)]);
      guide = new T.Line(geom, new T.LineDashedMaterial({
        color: 0x967750,
        dashSize: .15,
        gapSize: .1
      }));
      guide.computeLineDistances();
      scene.add(guide);
    }
    if (fit && !bounds.isEmpty()) {
      const center = bounds.getCenter(new T.Vector3()),
        radius = Math.max(1, bounds.getSize(new T.Vector3()).length() / 2);
      frustum = radius * 2.15 * Math.max(1, host.clientHeight / host.clientWidth);
      camera.position.copy(center).add(new T.Vector3(1, .9, 1.25).normalize().multiplyScalar(frustum * 1.65));
      controls.target.copy(center);
      camera.zoom = 1;
      controls.update();
      resize();
    }
  }
  function frame() {
    raf = requestAnimationFrame(frame);
    for (const g of floors) g.position.y += (g.userData.target - g.position.y) * .14;
    controls.update();
    renderer.render(scene, camera);
  }
  layout(mode);
  const ro = new ResizeObserver(resize);
  ro.observe(host);
  frame();
  return {
    layout,
    toggle(v) {
      floors.forEach(g => g.getObjectByName('Furniture').visible = v);
    },
    camera() {
      perspective = !perspective;
      controls.dispose();
      camera = perspective ? persp : ortho;
      controls = new OrbitControls(camera, renderer.domElement);
      layout(mode);
    },
    png() {
      renderer.render(scene, camera);
      png(renderer.domElement, p.name + '-3D.png');
    },
    async export(ext) {
      const clean = new T.Scene();
      for (const g of floors.filter(g => g.visible)) {
        const c = g.clone(true);
        c.position.y = g.userData.target;
        const omit = [];
        c.traverse(o => {
          if (o.isLine || !o.visible) omit.push(o);
        });
        omit.forEach(o => o.removeFromParent());
        clean.add(c);
      }
      const data = ext === 'usdz' ? await new USDZExporter().parseAsync(clean) : await new GLTFExporter().parseAsync(clean, {
        binary: true
      });
      saveFile(data, p.name + '.' + ext, ext === 'usdz' ? 'model/vnd.usdz+zip' : 'model/gltf-binary');
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      controls.dispose();
      scene.traverse(o => {
        o.geometry?.dispose();
        o.material?.map?.dispose();
        o.material?.dispose();
      });
      renderer.dispose();
      renderer.forceContextLoss();
    }
  };
}

// 3D plant rendered with three.js. No hand-rolled WebGL.
// Bodies: cylinder + cone roof + hopper; inner grain mesh scaled by level.
// Diesel: horizontal cylinder + inner fuel cylinder clipped by level.

import * as THREE from 'three';
import { levelPct, statusOf } from './sim.js';

const SEV_COLOR = { ok: 0x2ecc71, warn: 0xffae00, alarm: 0xff5252, flow: 0x37c6ff };

export function initPlant3D(container, plant, onSelect) {
  const W = container.clientWidth || 800, H = 420;
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setSize(W, H);
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x0b1117, 40, 110);
  const camera = new THREE.PerspectiveCamera(45, W / H, 0.1, 500);

  // lights (library lighting, no custom shaders)
  scene.add(new THREE.HemisphereLight(0xdfeaff, 0x1a1206, 0.9));
  const sun = new THREE.DirectionalLight(0xfff2d8, 1.6);
  sun.position.set(18, 26, 12);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0x37c6ff, 0.35);
  fill.position.set(-18, 10, -14);
  scene.add(fill);

  // ground + grid (library helpers)
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 60),
    new THREE.MeshStandardMaterial({ color: 0x111a23, roughness: 1 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  scene.add(new THREE.GridHelper(110, 55, 0x2a3d50, 0x1a2836));

  const group = new THREE.Group();
  scene.add(group);

  const steel = new THREE.MeshStandardMaterial({ color: 0xc7d0d8, metalness: 0.65, roughness: 0.35 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x8d99a5, metalness: 0.6, roughness: 0.4 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x39434d, metalness: 0.4, roughness: 0.7 });

  const items = [];
  // Explicit two-row site plan: every vessel gets its own footprint so
  // nothing hides inside another (back row = 40 m silos, front = small units).
  const plan = {
    grain: { x0: -32, dx: 8, z: -8 },
    dirty: { x0: -8, dx: 8, z: -8 },
    cond: { x0: -32, dx: 4.6, z: 8 },
    flour: { x0: 6, dx: 4.6, z: -1 },
    diesel: { x0: 33, dx: 0, z: 8 }
  };
  const scaleFor = (v) => (v.group === 'grain' || v.group === 'dirty' ? 1 : v.group === 'cond' ? 0.55 : v.group === 'flour' ? 0.5 : 0.5);

  const slotUsed = {};
  for (const v of plant.vessels) {
    const slot = plan[v.group];
    const n = (slotUsed[v.group] || 0);
    slotUsed[v.group] = n + 1;
    const s = scaleFor(v);
    const x = slot.x0 + n * slot.dx;
    const z = slot.z;

    const root = new THREE.Group();
    root.position.set(x, 0, z);

    if (!v.isDiesel) {
      const R = 2 * s, bodyH = 10 * s;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(R, R, bodyH, 28), steel.clone());
      body.position.y = bodyH / 2 + 1.6 * s;
      const roof = new THREE.Mesh(new THREE.ConeGeometry(R * 1.02, 1.6 * s, 28), roofMat);
      roof.position.y = body.position.y + bodyH / 2 + 0.8 * s;
      const hop = new THREE.Mesh(new THREE.ConeGeometry(R, 1.6 * s, 28), darkMat);
      hop.rotation.x = Math.PI; hop.position.y = 0.8 * s;
      const legs = new THREE.Group();
      for (let k = 0; k < 4; k++) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 1.8 * s), darkMat);
        leg.position.set(Math.cos(k * Math.PI / 2 + Math.PI / 4) * R * 0.85, 0.9 * s, Math.sin(k * Math.PI / 2 + Math.PI / 4) * R * 0.85);
        legs.add(leg);
      }
      // grain inside (library mesh, scaled)
      const grainMat = new THREE.MeshStandardMaterial({ color: 0xd9a441, roughness: 0.9 });
      const grain = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.93, R * 0.93, 1, 24), grainMat);
      grain.position.y = 0;
      root.add(body, roof, hop, legs, grain);
      // status ring
      const ring = new THREE.Mesh(new THREE.TorusGeometry(R + 0.25, 0.09, 10, 40),
        new THREE.MeshBasicMaterial({ color: 0x2ecc71 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.15;
      root.add(ring);
      // label sprite
      root.add(makeLabel(v.id, 13.2 * s + 1.2));
      group.add(root);
      items.push({ v, root, body, grain, ring, bodyH, baseY: 1.6 * s, R, s });
    } else {
      // horizontal diesel tank on saddles
      const r = 1.5, len = 5;
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 28), steel.clone());
      shell.rotation.z = Math.PI / 2; shell.position.y = r + 0.5;
      const fuel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.92, r * 0.92, len * 0.96, 24),
        new THREE.MeshStandardMaterial({ color: 0x7a4d12, roughness: 0.4, metalness: 0.2 }));
      fuel.rotation.z = Math.PI / 2; fuel.position.y = shell.position.y;
      root.add(shell, fuel);
      [-1.6, 1.6].forEach(dx => {
        const sad = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.6, r * 1.6), darkMat);
        sad.position.set(dx, 0.3, 0); root.add(sad);
      });
      // status ring on the ground around the tank, like the silos have
      const dring = new THREE.Mesh(new THREE.TorusGeometry(3.4, 0.09, 10, 48),
        new THREE.MeshBasicMaterial({ color: 0x2ecc71 }));
      dring.rotation.x = Math.PI / 2; dring.position.y = 0.15;
      root.add(dring);
      root.add(makeLabel(v.id, 5));
      group.add(root);
      items.push({ v, root, fuel, shell, ring: dring, diesel: true });
    }
    root.userData.vessel = v;
  }

  // ---- simple orbit (drag + wheel), avoids OrbitControls addon ----
  let raf = 0;
  let focusGroup = 'all';
  function setFocus(g) { focusGroup = g || 'all'; }
  // default view: fairly frontal so rows don't bunch up, wide enough to fit all
  let theta = 0.3, phi = 0.98, radius = 62, tx = 2, tz = 0;
  const el = renderer.domElement;
  let drag = null;
  el.style.cursor = 'grab';
  el.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; el.setPointerCapture(e.pointerId); });
  el.addEventListener('pointermove', e => {
    if (drag) { theta -= (e.clientX - drag.x) * 0.005; phi = Math.min(1.35, Math.max(0.35, phi - (e.clientY - drag.y) * 0.004)); drag = { x: e.clientX, y: e.clientY }; }
  });
  el.addEventListener('pointerup', () => (drag = null));
  el.addEventListener('wheel', e => { e.preventDefault(); radius = Math.min(110, Math.max(22, radius + e.deltaY * 0.05)); }, { passive: false });

  // click select (raycaster library picking)
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  el.addEventListener('click', e => {
    const r = el.getBoundingClientRect();
    ptr.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    ptr.y = -((e.clientY - r.top) / r.height) * 2 + 1;
    ray.setFromCamera(ptr, camera);
    const hits = ray.intersectObjects(group.children, true);
    if (hits.length) {
      let o = hits[0].object;
      while (o && !o.userData.vessel) o = o.parent;
      if (o) onSelect(o.userData.vessel);
    }
  });

  function makeLabel(text, y) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = 'rgba(5,10,15,.75)'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = '#ffb020'; g.font = 'bold 30px monospace'; g.textAlign = 'center';
    g.fillText(text, 128, 42);
    const tex = new THREE.CanvasTexture(c);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true }));
    sp.scale.set(4.4, 1.1, 1); sp.position.y = y;
    return sp;
  }

  function resize() {
    const w = container.clientWidth, h = 420;
    renderer.setSize(w, h);
    camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  function update() {
    // alarm vessels pulse red so they stand out across the plant
    const blinkOn = Math.floor(Date.now() / 500) % 2 === 0;
    const flowBlue = new THREE.Color(SEV_COLOR.flow);
    for (const it of items) {
      const p = levelPct(it.v) / 100;
      const { sev } = statusOf(it.v);
      const col = new THREE.Color(SEV_COLOR[sev]);
      const alarming = sev === 'alarm';
      const glow = alarming ? (blinkOn ? 0xff2222 : 0x661111) : 0x000000;
      // active flow alternates the ring between flow-blue and status color
      const isFlowing = it.v.fillRate > 0 || it.v.disRate > 0 || !!it.v.genOn;
      let ringCol = col;
      if (isFlowing) {
        if (sev === 'ok') ringCol = blinkOn ? flowBlue : col;
        else if (!blinkOn) ringCol = flowBlue;
      }
      // sidebar group filter: focused vessels glow bright white to shout
      const focused = focusGroup !== 'all' && it.v.group === focusGroup && !alarming;
      let emHex = glow;
      if (focused) {
        emHex = blinkOn ? 0xdfe9f2 : 0x6a7683;
        ringCol = new THREE.Color(0xffffff);
      }
      if (!it.diesel) {
        const h = Math.max(0.001, it.bodyH * p);
        it.grain.scale.y = h;
        it.grain.position.y = it.baseY + h / 2;
        it.grain.material.color.set(it.v.group === 'flour' ? 0xefe6d2 : it.v.group === 'dirty' ? 0x9a7433 : 0xd9a441);
        it.ring.material.color = ringCol;
        it.ring.scale.setScalar(alarming && blinkOn ? 1.15 : 1);
        it.body.material.emissive.setHex(emHex);
      } else {
        // fuel: scale cross-section by level (simple + truthful enough visually)
        it.fuel.scale.x = it.fuel.scale.z = 0.25 + 0.75 * p;
        it.fuel.position.y = it.shell.position.y - (1 - p) * 0.8;
        it.fuel.material.color.set(col).lerp(new THREE.Color(0x7a4d12), 0.55);
        it.shell.material.emissive.setHex(emHex);
        it.ring.material.color = ringCol;
        it.ring.scale.setScalar(alarming && blinkOn ? 1.12 : 1);
      }
    }
  }

  (function loop() {
    raf = requestAnimationFrame(loop);
    camera.position.set(tx + radius * Math.sin(phi) * Math.sin(theta), radius * Math.cos(phi), tz + radius * Math.sin(phi) * Math.cos(theta));
    camera.lookAt(tx, 5, tz);
    renderer.render(scene, camera);
  })();

  function destroy() {
    cancelAnimationFrame(raf);
    removeEventListener('resize', resize);
    renderer.dispose();
    container.innerHTML = '';
  }

  return { update, resize, destroy, setFocus };
}

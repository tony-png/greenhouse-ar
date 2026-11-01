// The virtual backyard for VR: sky, lawn, a gravel path to the front door, a fence and a few trees. Generated, no files.
// The greenhouse stands at the origin with its front door towards -z; you start on the path.
import * as THREE from "three";

function noiseTexture(size, paint) {
  const c = document.createElement("canvas");
  c.width = c.height = size;
  paint(c.getContext("2d"), size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}
let seed = 11;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

export function buildYard() {
  const group = new THREE.Group();
  group.name = "yard";
  const horizon = new THREE.Color(0xdfe8e6), zenith = new THREE.Color(0x5f97cf);

  // sky: a gradient dome
  const sky = new THREE.Mesh(new THREE.SphereGeometry(220, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: zenith }, bottom: { value: horizon } },
    vertexShader: "varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
    fragmentShader: "uniform vec3 top; uniform vec3 bottom; varying vec3 vP; void main() { float h = clamp(normalize(vP).y * 2.2, 0.0, 1.0); gl_FragColor = vec4(mix(bottom, top, pow(h, 0.7)), 1.0); }",
  }));
  sky.renderOrder = -10;
  group.add(sky);

  // lawn: speckled grass, mown stripes
  const grass = noiseTexture(256, (x, n) => {
    x.fillStyle = "#5b8a3c";
    x.fillRect(0, 0, n, n);
    for (let i = 0; i < 9000; i++) {
      const g = 90 + rnd() * 70;
      x.fillStyle = `rgba(${40 + rnd() * 40}, ${g}, ${30 + rnd() * 20}, ${0.35 + rnd() * 0.4})`;
      x.fillRect(rnd() * n, rnd() * n, 1 + rnd() * 2, 2 + rnd() * 4);
    }
  });
  grass.repeat.set(120, 120);
  const lawn = new THREE.Mesh(new THREE.CircleGeometry(200, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: grass, roughness: 1 }));
  lawn.position.y = -0.01; // below the gravel pad (flush with y = 0), far enough not to fight it
  lawn.receiveShadow = true;
  lawn.name = "lawn";
  group.add(lawn);
  // gravel path from where you start to the front door
  const gravel = noiseTexture(128, (x, n) => {
    x.fillStyle = "#b3a68a";
    x.fillRect(0, 0, n, n);
    for (let i = 0; i < 2500; i++) { const v = 120 + rnd() * 90; x.fillStyle = `rgb(${v}, ${v - 8}, ${v - 25})`; x.fillRect(rnd() * n, rnd() * n, 2, 2); }
  });
  gravel.repeat.set(1.2, 5);
  const path = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 6).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: gravel, roughness: 1 }));
  path.position.set(0, 0.006, -5.95);
  path.receiveShadow = true;
  group.add(path);

  // fence round the yard
  const wood = new THREE.MeshStandardMaterial({ color: 0x8a6a48, roughness: 0.9 });
  const fence = new THREE.Group();
  const W = 9, Z0 = -11, Z1 = 12;
  const postGeo = new THREE.BoxGeometry(0.09, 1.25, 0.09), railGeo = new THREE.BoxGeometry(1, 0.08, 0.03), board = new THREE.BoxGeometry(0.14, 1.1, 0.018);
  const side = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), n = Math.round(len / 2.2), ang = Math.atan2(bz - az, bx - ax);
    for (let i = 0; i <= n; i++) {
      const t = i / n, p = new THREE.Mesh(postGeo, wood);
      p.position.set(ax + (bx - ax) * t, 0.62, az + (bz - az) * t);
      fence.add(p);
    }
    for (const y of [0.3, 0.95]) {
      const r = new THREE.Mesh(railGeo, wood);
      r.scale.x = len;
      r.position.set((ax + bx) / 2, y, (az + bz) / 2);
      r.rotation.y = -ang;
      fence.add(r);
    }
    const boards = new THREE.InstancedMesh(board, wood, Math.floor(len / 0.16));
    const m = new THREE.Matrix4(), q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -ang);
    for (let i = 0; i < boards.count; i++) {
      const t = (i + 0.5) / boards.count;
      m.compose(new THREE.Vector3(ax + (bx - ax) * t, 0.6, az + (bz - az) * t), q, new THREE.Vector3(1, 0.92 + 0.1 * rnd(), 1));
      boards.setMatrixAt(i, m);
    }
    fence.add(boards);
  };
  side(-W, Z0, W, Z0);
  side(W, Z0, W, Z1);
  side(W, Z1, -W, Z1);
  side(-W, Z1, -W, Z0);
  group.add(fence);

  // trees and shrubs outside and along the fence
  const bark = new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 1 });
  const leafMats = [0x3f6e2c, 0x4d7f33, 0x355f27].map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.95, flatShading: true }));
  const tree = (x, z, s) => {
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.12 * s, 0.18 * s, 2.2 * s, 7), bark);
    trunk.position.y = 1.1 * s;
    t.add(trunk);
    for (let i = 0; i < 4; i++) {
      const b = new THREE.Mesh(new THREE.IcosahedronGeometry((0.9 + rnd() * 0.6) * s, 1), leafMats[i % 3]);
      b.position.set((rnd() - 0.5) * 1.2 * s, (2.3 + rnd() * 1.4) * s, (rnd() - 0.5) * 1.2 * s);
      t.add(b);
    }
    t.position.set(x, 0, z);
    t.rotation.y = rnd() * 6;
    group.add(t);
  };
  [[-12, -4, 1.4], [-13, 6, 1.7], [12.5, -7, 1.5], [13, 4, 1.2], [6, 15, 1.8], [-5, 16, 1.5], [-14, -14, 1.3], [15, 14, 1.6], [0, 22, 2.0], [-20, 2, 2.2], [21, -3, 2.0]]
    .forEach(([x, z, s]) => tree(x, z, s));
  for (let i = 0; i < 14; i++) {
    const along = rnd() * 2 - 1, onSide = i % 2 ? -1 : 1;
    const b = new THREE.Mesh(new THREE.IcosahedronGeometry(0.35 + rnd() * 0.3, 1), leafMats[i % 3]);
    b.scale.y = 0.7;
    b.position.set(onSide * (W - 0.6), 0.25, 0.5 + along * 9);
    group.add(b);
  }
  return { group, background: horizon, fog: new THREE.Fog(horizon, 40, 200) };
}

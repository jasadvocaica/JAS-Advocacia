import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  DEPARTAMENTOS,
  OBSTACLES,
  destination,
  route,
  type Point,
} from "./model";
export type Quality = "alta" | "media" | "economica";
export interface SceneAgent {
  id: string;
  nome: string;
  point: Point;
  color: string;
}
export function buildOffice(
  host: HTMLElement,
  agents: SceneAgent[],
  select: (id: string) => void,
  selectRoom: (id: string) => void,
  onLost: () => void,
) {
  if (typeof WebGL2RenderingContext === "undefined")
    throw new Error("WebGL indisponível");
  const scene = new THREE.Scene();
  scene.background = new THREE.Color("#f3f6fa");
  const renderer = new THREE.WebGLRenderer({
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setClearColor("#f3f6fa");
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.1;
  host.appendChild(renderer.domElement);
  const camera = new THREE.PerspectiveCamera(39, 1, 0.1, 200);
  camera.position.set(53, 49, 57);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(19, 0, 13);
  controls.minDistance = 12;
  controls.maxDistance = 95;
  controls.minPolarAngle = 0.3;
  controls.maxPolarAngle = 1.25;
  controls.enableDamping = true;
  controls.dampingFactor = 0.1;
  controls.saveState();
  scene.add(new THREE.HemisphereLight("#ffffff", "#b9c6d6", 1.6));
  const sun = new THREE.DirectionalLight("#fff4df", 2.2);
  sun.position.set(5, 40, 18);
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -50;
  sun.shadow.camera.right = 50;
  sun.shadow.camera.top = 45;
  sun.shadow.camera.bottom = -45;
  sun.shadow.normalBias = 0.05;
  scene.add(sun);
  scene.add(sun.target);
  const geometries = new Set<THREE.BufferGeometry>(),
    materials = new Map<string, THREE.MeshStandardMaterial>(),
    textures: THREE.Texture[] = [];
  const boxGeo = new THREE.BoxGeometry(1, 1, 1),
    sphereGeo = new THREE.SphereGeometry(1, 10, 8),
    cylinderGeo = new THREE.CylinderGeometry(1, 1, 1, 10);
  geometries.add(boxGeo);
  geometries.add(sphereGeo);
  geometries.add(cylinderGeo);
  const mat = (color: string, glass = false) => {
    const key = color + glass;
    if (!materials.has(key))
      materials.set(
        key,
        new THREE.MeshStandardMaterial({
          color,
          roughness: 0.7,
          transparent: glass,
          opacity: glass ? 0.28 : 1,
          depthWrite: !glass,
        }),
      );
    return materials.get(key)!;
  };
  function box(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    w: number,
    h: number,
    d: number,
    color: string,
    glass = false,
  ) {
    const mesh = new THREE.Mesh(boxGeo, mat(color, glass));
    mesh.position.set(x, y, z);
    mesh.scale.set(w, h, d);
    mesh.castShadow = !glass;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }
  function sphere(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    r: number,
    color: string,
  ) {
    const mesh = new THREE.Mesh(sphereGeo, mat(color));
    mesh.position.set(x, y, z);
    mesh.scale.setScalar(r);
    parent.add(mesh);
    return mesh;
  }
  function plant(x: number, z: number) {
    const pot = new THREE.Mesh(cylinderGeo, mat("#ffffff"));
    pot.position.set(x, 0.3, z);
    pot.scale.set(0.32, 0.6, 0.32);
    scene.add(pot);
    for (let i = 0; i < 3; i++) {
      const leaf = sphere(
        scene,
        x + (i - 1) * 0.2,
        0.9 + i * 0.18,
        z,
        0.35,
        "#6f947b",
      );
      leaf.scale.y *= 1.5;
    }
  }
  function label(text: string, x: number, z: number, color = "#355475") {
    const canvas = document.createElement("canvas");
    canvas.width = 512;
    canvas.height = 80;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "rgba(255,255,255,.92)";
    ctx.beginPath();
    ctx.roundRect(0, 0, 512, 80, 16);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.font = "600 40px Inter, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, 256, 54, 480);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    textures.push(texture);
    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
    });
    const sprite = new THREE.Sprite(material);
    sprite.position.set(x, 3.2, z);
    sprite.scale.set(6.8, 1.2, 1);
    scene.add(sprite);
    return sprite;
  }
  box(scene, 19, -0.35, 14, 40, 0.5, 30, "#e8eef5");
  box(scene, 19, -0.03, 14, 38, 0.12, 28, "#e7e0d5");
  const roomMeshes: THREE.Object3D[] = [];
  DEPARTAMENTOS.forEach((r, i) => {
    const floor = box(
      scene,
      r.x + 4,
      0.1,
      r.z + 3,
      8,
      0.15,
      6,
      i === 1
        ? "#c8a985"
        : i === 2
          ? "#e7d2a4"
          : i === 11
            ? "#e6e9e5"
            : "#f4eee5",
    );
    floor.userData.room = r.id;
    roomMeshes.push(floor);
    // Low cutaway walls preserve the view; glass partitions above them.
    const walls = OBSTACLES.slice(i * 6, i * 6 + 5);
    walls.forEach((o) => {
      box(scene, o.x + o.w / 2, 0.6, o.z + o.d / 2, o.w, 1, o.d, "#ffffff");
      if (o.d > 1)
        box(
          scene,
          o.x + o.w / 2,
          1.65,
          o.z + o.d / 2,
          o.w,
          1.15,
          o.d,
          "#a9c8d6",
          true,
        );
    });
    box(
      scene,
      r.x + 2.25,
      1.05,
      r.z + 2.25,
      2.5,
      0.14,
      1.5,
      i === 1 ? "#c8a985" : "#dfc9aa",
    );
    box(scene, r.x + 1.3, 0.55, r.z + 2.25, 0.16, 1, 0.9, "#d3dbe3");
    box(scene, r.x + 3.2, 0.55, r.z + 2.25, 0.16, 1, 0.9, "#d3dbe3");
    box(scene, r.x + 2.25, 1.55, r.z + 1.95, 0.85, 0.7, 0.08, "#172a45");
    box(scene, r.x + 2.25, 1.55, r.z + 2.01, 0.7, 0.53, 0.03, "#9ab9ca");
    box(scene, r.x + 2.25, 1.17, r.z + 2.55, 0.7, 0.04, 0.25, "#69798e");
    box(scene, r.x + 2.25, 0.55, r.z + 3.4, 0.75, 0.2, 0.75, "#355475");
    box(scene, r.x + 2.25, 0.95, r.z + 3.7, 0.75, 0.8, 0.14, "#355475");
    if (i === 10) {
      box(scene, r.x + 5, 1, r.z + 3, 2, 0.18, 3, "#c8a985");
      for (const z of [2, 4])
        box(scene, r.x + 6.3, 0.6, r.z + z, 0.6, 0.9, 0.7, "#355475");
    }
    if (i === 11) {
      box(scene, r.x + 5, 1, r.z + 1.1, 3, 1.8, 1, "#ffffff");
      box(scene, r.x + 5, 2, r.z + 1.1, 3, 0.1, 1, "#c8a985");
      box(scene, r.x + 5, 2.3, r.z + 1.1, 0.5, 0.5, 0.5, "#172a45");
    }
    plant(r.x + 6.8, r.z + 1.1);
    label(r.nome, r.x + 4, r.z + 0.1);
  });
  // Clara's dedicated workstation is included in routing obstacles.
  box(scene, 35.5, 1.05, 2, 2, 0.14, 1, "#dfc9aa");
  box(scene, 35.5, 1.55, 1.85, 0.85, 0.7, 0.09, "#172a45");
  box(scene, 35.5, 0.6, 3.5, 0.7, 0.2, 0.7, "#355475");
  const people = new Map<string, THREE.Group>();
  const avatarParts = new Map<
    string,
    {
      left: THREE.Group;
      right: THREE.Group;
      legs: THREE.Group[];
      halo: THREE.Mesh;
    }
  >();
  function person(a: SceneAgent) {
    const group = new THREE.Group();
    group.position.set(a.point.x, 0.2, a.point.z);
    group.userData.agent = a.id;
    scene.add(group);
    people.set(a.id, group);
    box(group, 0, 1, 0, 0.6, 0.72, 0.35, a.color);
    sphere(group, 0, 1.65, 0, 0.28, "#c58e65");
    const hair = sphere(group, 0, 1.78, -0.04, 0.28, "#3c302c");
    hair.scale.y = 0.7;
    const arm = (x: number) => {
      const g = new THREE.Group();
      g.position.set(x, 1.25, 0);
      box(g, 0, -0.3, 0, 0.17, 0.65, 0.2, a.color);
      sphere(g, 0, -0.65, 0, 0.1, "#c58e65");
      group.add(g);
      return g;
    };
    const legs = [-0.16, 0.16].map((x) => {
      const g = new THREE.Group();
      g.position.set(x, 0.65, 0);
      box(g, 0, -0.25, 0, 0.22, 0.65, 0.25, "#243247");
      group.add(g);
      return g;
    });
    const ringGeo = new THREE.TorusGeometry(0.52, 0.045, 6, 20);
    geometries.add(ringGeo);
    const halo = new THREE.Mesh(ringGeo, mat("#c6a15b"));
    halo.rotation.x = Math.PI / 2;
    halo.position.y = 0.05;
    group.add(halo);
    avatarParts.set(a.id, { left: arm(-0.42), right: arm(0.42), legs, halo });
    const tag = label(a.nome, 0, -0.8);
    scene.remove(tag);
    group.add(tag);
    return group;
  }
  agents.forEach(person);
  const clara = people.get("clara-txt-v1")!;
  let state: string | undefined,
    initial = true,
    path: Point[] = [],
    stale = true,
    ambient = false,
    reduce = false,
    follow = false,
    visible = true,
    disposed = false,
    lastFrame = 0,
    raf = 0,
    quality: Quality = "media";
  const raycaster = new THREE.Raycaster(),
    pointer = new THREE.Vector2();
  let down = { x: 0, y: 0 };
  const downFn = (e: PointerEvent) => {
    down = { x: e.clientX, y: e.clientY };
  };
  const click = (e: PointerEvent) => {
    if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(
      [...people.values(), ...roomMeshes],
      true,
    );
    for (const hit of hits) {
      let obj: THREE.Object3D | null = hit.object;
      while (obj) {
        if (obj.userData.agent) {
          select(obj.userData.agent);
          return;
        }
        if (obj.userData.room) {
          selectRoom(obj.userData.room);
          return;
        }
        obj = obj.parent;
      }
    }
  };
  renderer.domElement.addEventListener("pointerdown", downFn);
  renderer.domElement.addEventListener("pointerup", click);
  function resize() {
    const w = host.clientWidth,
      h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    const desiredFov = w / h < 0.8 ? 63 : 39;
    if (camera.fov !== desiredFov) camera.fov = desiredFov;
    camera.updateProjectionMatrix();
  }
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(host);
  resize();
  const observer = new IntersectionObserver((entries) => {
    visible = entries[0]?.isIntersecting ?? true;
  });
  observer.observe(host);
  function animate(now: number) {
    if (disposed) return;
    raf = requestAnimationFrame(animate);
    const interval =
      quality === "economica" || (!path.length && state !== "running")
        ? 1000 / 20
        : 1000 / 40;
    if (document.hidden || !visible || now - lastFrame < interval) return;
    const dt = Math.min((now - lastFrame) / 1000, 0.08);
    lastFrame = now;
    const moving = !stale && !reduce && path.length > 0;
    if (!stale && path.length) {
      if (reduce) {
        const end = path[path.length - 1];
        clara.position.set(end.x, 0.2, end.z);
        path = [];
      } else {
        const dest = path[0],
          dx = dest.x - clara.position.x,
          dz = dest.z - clara.position.z,
          dist = Math.hypot(dx, dz);
        if (dist < 0.08) path.shift();
        else {
          const step = Math.min(dist, dt * 2.8);
          clara.position.x += (dx / dist) * step;
          clara.position.z += (dz / dist) * step;
          clara.rotation.y = Math.atan2(dx, dz);
        }
      }
    }
    const parts = avatarParts.get("clara-txt-v1")!;
    const working = !stale && state === "running" && !moving && !reduce;
    parts.left.rotation.x = working
      ? -0.8 + Math.sin(now * 0.015) * 0.12
      : moving
        ? Math.sin(now * 0.01) * 0.45
        : 0;
    parts.right.rotation.x = working
      ? -0.8 - Math.sin(now * 0.015) * 0.12
      : moving
        ? -Math.sin(now * 0.01) * 0.45
        : 0;
    parts.legs.forEach((leg, i) => {
      leg.rotation.x = moving
        ? Math.sin(now * 0.01 + i * Math.PI) * 0.5
        : working
          ? -0.65
          : 0;
    });
    clara.position.y =
      0.2 +
      (!stale && ambient && !reduce && !moving && !working
        ? Math.sin(now * 0.002) * 0.025
        : 0);
    if (follow) {
      const target = new THREE.Vector3(clara.position.x, 1, clara.position.z);
      const delta = target.clone().sub(controls.target);
      camera.position.add(delta);
      controls.target.copy(target);
    }
    controls.update();
    renderer.render(scene, camera);
  }
  raf = requestAnimationFrame(animate);
  const lost = (e: Event) => {
    e.preventDefault();
    onLost();
  };
  renderer.domElement.addEventListener("webglcontextlost", lost);
  return {
    state(next: string | undefined, offline: boolean) {
      stale = offline;
      if (offline && initial) return;
      if (next !== state || initial) {
        state = next;
        const dest = destination(next);
        if (initial) {
          clara.position.set(dest.x, 0.2, dest.z);
          initial = false;
        } else
          path = route(
            { x: clara.position.x, z: clara.position.z },
            dest,
            agents.filter((a) => a.id !== "clara-txt-v1").map((a) => a.point),
          );
        avatarParts.get("clara-txt-v1")!.halo.material = mat(
          next === "failed"
            ? "#d94a4a"
            : next === "completed"
              ? "#22a06b"
              : "#c6a15b",
        );
      }
    },
    options(opts: {
      ambient: boolean;
      reduce: boolean;
      quality: Quality;
      follow: boolean;
    }) {
      ambient = opts.ambient;
      reduce = opts.reduce;
      quality = opts.quality;
      follow = opts.follow;
      renderer.setPixelRatio(
        Math.min(
          devicePixelRatio,
          quality === "alta" ? 2 : quality === "media" ? 1.5 : 1,
        ),
      );
      renderer.shadowMap.enabled = quality === "alta";
      sun.castShadow = quality === "alta";
      resize();
    },
    focus(point?: Point) {
      follow = false;
      if (!point) {
        controls.reset();
        return;
      }
      const target = new THREE.Vector3(point.x, 0, point.z),
        delta = target.clone().sub(controls.target);
      camera.position.add(delta);
      controls.target.copy(target);
      controls.update();
    },
    zoom(factor: number) {
      camera.position
        .sub(controls.target)
        .multiplyScalar(factor)
        .add(controls.target);
      controls.update();
    },
    dispose() {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
      observer.disconnect();
      controls.dispose();
      renderer.domElement.removeEventListener("pointerdown", downFn);
      renderer.domElement.removeEventListener("pointerup", click);
      renderer.domElement.removeEventListener("webglcontextlost", lost);
      geometries.forEach((g) => g.dispose());
      materials.forEach((m) => m.dispose());
      textures.forEach((t) => t.dispose());
      scene.traverse((o) => {
        if (o instanceof THREE.Sprite)
          (o.material as THREE.SpriteMaterial).dispose();
      });
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}

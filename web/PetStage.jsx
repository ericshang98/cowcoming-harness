import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { forms } from "../src/pet-content.mjs";
import { sampleScore } from "../src/motion-score.mjs";

export default function PetStage({
  form,
  emotion,
  score,
  onComplete,
  onFailure,
}) {
  const host = useRef(),
    state = useRef(),
    callbacks = useRef({ onComplete, onFailure });
  callbacks.current = { onComplete, onFailure };
  const [error, setError] = useState("");
  useEffect(() => {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError("3D 画面无法启动，请换一个支持 WebGL 的浏览器。");
      callbacks.current.onFailure?.();
      return;
    }
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#f5eee3", 1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    host.current.appendChild(renderer.domElement);
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(32, 1, 0.1, 100);
    camera.position.set(3.8, 2.6, 6);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0, 1.05, 0);
    orbit.enableDamping = true;
    orbit.enablePan = false;
    orbit.minDistance = 4;
    orbit.maxDistance = 9;
    orbit.maxPolarAngle = Math.PI * 0.49;
    scene.add(new THREE.HemisphereLight("#fff9ee", "#b9b5c2", 1.7));
    const light = new THREE.DirectionalLight("#fff6dc", 2);
    light.position.set(-3, 6, 4);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    scene.add(light);
    const skin = new THREE.MeshStandardMaterial({
        color: "#eadac2",
        roughness: 0.5,
      }),
      accent = new THREE.MeshStandardMaterial({
        color: "#998666",
        roughness: 0.6,
      });
    const material = (color) =>
      new THREE.MeshStandardMaterial({ color, roughness: 0.55 });
    const ball = (parent, size, pos, mat) => {
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(1, 32, 24),
        typeof mat === "string" ? material(mat) : mat,
      );
      mesh.scale.set(...size);
      mesh.position.set(...pos);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      parent.add(mesh);
      return mesh;
    };
    const root = new THREE.Group(),
      body = new THREE.Group(),
      head = new THREE.Group(),
      left = new THREE.Group(),
      right = new THREE.Group();
    scene.add(root);
    root.add(body);
    body.position.y = 0.8;
    head.position.y = 0.83;
    head.position.z = 0.06;
    body.add(head);
    left.position.set(0.48, 0.38, 0);
    right.position.set(-0.48, 0.38, 0);
    body.add(left, right);
    ball(body, [0.55, 0.67, 0.43], [0, 0, 0], skin);
    ball(body, [0.37, 0.43, 0.12], [0, -0.02, 0.37], "#f7eee1");
    ball(head, [0.65, 0.55, 0.48], [0, 0, 0], skin);
    ball(head, [0.41, 0.23, 0.23], [0, -0.21, 0.4], "#d5ac99");
    for (const x of [-1, 1]) {
      const ear = ball(head, [0.23, 0.12, 0.12], [x * 0.65, 0.15, 0], accent);
      ear.rotation.z = x * 0.25;
      const horn = new THREE.Mesh(
        new THREE.ConeGeometry(0.085, 0.28, 24),
        material("#e2c38f"),
      );
      horn.position.set(x * 0.39, 0.56, -0.04);
      horn.rotation.z = -x * 0.25;
      head.add(horn);
      ball(head, [0.035, 0.024, 0.023], [x * 0.14, -0.18, 0.6], "#725b50");
      ball(body, [0.2, 0.23, 0.28], [x * 0.27, -0.6, 0.07], accent);
    }
    const eyes = [-1, 1].map((x) =>
      ball(head, [0.075, 0.105, 0.065], [x * 0.26, 0.04, 0.455], "#292924"),
    );
    const brows = [-1, 1].map((x) =>
      ball(head, [0.1, 0.02, 0.018], [x * 0.26, 0.22, 0.44], accent),
    );
    const cheeks = [-1, 1].map((x) =>
      ball(head, [0.1, 0.05, 0.016], [x * 0.41, -0.1, 0.4], "#dd938b"),
    );
    for (const x of [-1, 1])
      ball(
        head,
        [0.019, 0.022, 0.009],
        [x * 0.26 - 0.02, 0.07, 0.516],
        "#ffffff",
      );
    for (const arm of [left, right]) {
      ball(arm, [0.145, 0.32, 0.14], [0, -0.24, 0], skin);
      ball(arm, [0.15, 0.13, 0.15], [0, -0.5, 0.03], accent);
    }
    const halo = new THREE.Mesh(
      new THREE.TorusGeometry(0.4, 0.025, 12, 64),
      material("#dfb36b"),
    );
    halo.rotation.x = Math.PI / 2;
    halo.position.set(0, 0.85, 0);
    head.add(halo);
    const crown = new THREE.Mesh(
      new THREE.ConeGeometry(0.27, 0.3, 5),
      material("#baa1d0"),
    );
    crown.position.set(0, 0.69, 0);
    head.add(crown);
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(1.28, 1.4, 0.14, 64),
      material("#e6dccb"),
    );
    floor.position.y = -0.09;
    floor.receiveShadow = true;
    scene.add(floor);
    const plane = new THREE.Mesh(
      new THREE.PlaneGeometry(200, 200),
      material("#f5eee3"),
    );
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = -0.18;
    plane.receiveShadow = true;
    scene.add(plane);
    state.current = {
      root,
      body,
      head,
      left,
      right,
      skin,
      accent,
      halo,
      crown,
      eyes,
      brows,
      cheeks,
      pose: {},
      motion: null,
      emotion: "neutral",
      lastId: null,
    };
    const resize = () => {
      if (!host.current) return;
      const w = host.current.clientWidth,
        h = host.current.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(host.current);
    resize();
    let frame;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const s = state.current;
      if (!s) return;
      const now = performance.now();
      if (s.motion) {
        const elapsed = now - s.start;
        s.pose = sampleScore(s.motion, elapsed);
        if (elapsed >= s.motion.durationMs) {
          const done = s.motion;
          s.motion = null;
          callbacks.current.onComplete?.(done.requestId);
        }
      }
      const p = s.pose;
      body.rotation.set((p.bodyLean || 0) * 0.5, (p.bodyYaw || 0) * 0.65, 0);
      body.position.y = 0.8 + (p.bodyLift || 0) * 0.35;
      head.rotation.set(
        (p.headPitch || 0) * 0.5,
        (p.headYaw || 0) * 0.8,
        (p.headRoll || 0) * 0.55,
      );
      head.position.y = 0.83 + (p.headLift || 0) * 0.2;
      left.rotation.z = -(p.leftArm || 0) * 2.5;
      right.rotation.z = (p.rightArm || 0) * 2.5;
      const blink = Math.sin(now / 800) > 0.997;
      for (const e of eyes)
        e.scale.y = blink
          ? 0.018
          : s.emotion === "sleepy"
            ? 0.035
            : s.emotion === "joyful"
              ? 0.065
              : s.emotion === "proud"
                ? 0.07
                : s.emotion === "curious"
                  ? 0.12
                  : 0.105;
      brows.forEach((b, i) => {
        b.rotation.z =
          (i ? 1 : -1) *
          (s.emotion === "sad" ? 0.3 : s.emotion === "proud" ? -0.25 : 0);
        b.position.y = s.emotion === "curious" ? (i ? 0.28 : 0.22) : 0.2;
      });
      cheeks.forEach(
        (c) => (c.visible = s.emotion === "joyful" || s.emotion === "proud"),
      );
      orbit.update();
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect();
      orbit.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        if (o.material) [o.material].flat().forEach((m) => m.dispose());
      });
      renderer.dispose();
      renderer.domElement.remove();
      state.current = null;
    };
  }, []);
  useEffect(() => {
    const s = state.current;
    if (!s) return;
    const f = forms[form];
    s.skin.color.set(f.color);
    s.accent.color.set(f.accent);
    s.root.scale.setScalar(f.scale);
    s.halo.visible = form === "celestial";
    s.crown.visible = form === "dark";
  }, [form]);
  useEffect(() => {
    if (state.current) state.current.emotion = emotion;
  }, [emotion]);
  useEffect(() => {
    const s = state.current;
    if (!s) {
      if (score) callbacks.current.onFailure?.();
      return;
    }
    s.motion = score;
    s.start = performance.now();
  }, [score]);
  return (
    <div
      className="pet-canvas"
      ref={host}
      role="img"
      aria-label={`${forms[form].name}的互动舞台`}
    >
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

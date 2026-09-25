import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export default function Stage({ motion, asset, onAsset, onPlayback }) {
  const host = useRef(),
    api = useRef(),
    callbacks = useRef({ onAsset, onPlayback });
  callbacks.current = { onAsset, onPlayback };
  const [error, setError] = useState("");
  useEffect(() => {
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      setError("此设备无法初始化 3D 预览；仍可查看决策与执行记录。");
      return;
    }
    const scene = new THREE.Scene(),
      camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
    camera.position.set(4, 2.8, 6);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setClearColor("#e9eee7", 1);
    host.current.append(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, 1, 0);
    controls.enableDamping = true;
    controls.minDistance = 2;
    controls.maxDistance = 14;
    scene.add(new THREE.HemisphereLight(0xffffff, 0x62705d, 3));
    const light = new THREE.DirectionalLight(0xffffff, 4);
    light.position.set(4, 6, 5);
    scene.add(light);
    const floor = new THREE.Mesh(
      new THREE.CylinderGeometry(1.6, 1.6, 0.12, 64),
      new THREE.MeshStandardMaterial({ color: "#d1dacc", roughness: 1 }),
    );
    floor.position.y = -0.1;
    scene.add(floor);
    const robot = new THREE.Group(),
      head = new THREE.Group(),
      arm = new THREE.Group();
    scene.add(robot);
    head.position.y = 1.65;
    robot.add(head);
    arm.position.set(-0.65, 1.15, 0);
    robot.add(arm);
    const mesh = (geometry, color, parent, pos) => {
      const m = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color, roughness: 0.7 }),
      );
      m.position.set(...pos);
      parent.add(m);
      return m;
    };
    mesh(new THREE.BoxGeometry(0.9, 0.85, 0.6), "#738867", robot, [0, 0.85, 0]);
    mesh(new THREE.BoxGeometry(1.1, 0.78, 0.78), "#f8f4de", head, [0, 0, 0]);
    for (const x of [-0.25, 0.25]) {
      mesh(new THREE.SphereGeometry(0.09, 16, 16), "#1e3029", head, [
        x,
        0.03,
        0.41,
      ]);
      mesh(new THREE.BoxGeometry(0.25, 0.3, 0.4), "#526549", robot, [
        x,
        0.25,
        0,
      ]);
    }
    mesh(
      new THREE.BoxGeometry(0.23, 0.65, 0.25),
      "#b1c09a",
      arm,
      [0, -0.25, 0],
    );
    mesh(
      new THREE.BoxGeometry(0.23, 0.65, 0.25),
      "#b1c09a",
      robot,
      [0.65, 0.95, 0],
    );
    mesh(
      new THREE.BoxGeometry(0.26, 0.055, 0.06),
      "#c47c60",
      head,
      [0, -0.21, 0.4],
    );
    const state = {
      scene,
      robot,
      head,
      arm,
      custom: null,
      mixer: null,
      clips: [],
      motion: null,
      start: 0,
      action: null,
      disposed: false,
    };
    api.current = state;
    const resize = () => {
      const w = host.current.clientWidth,
        h = host.current.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host.current);
    resize();
    let frame,
      prev = performance.now();
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const now = performance.now(),
        dt = Math.min((now - prev) / 1000, 0.1);
      prev = now;
      state.mixer?.update(dt);
      const m = state.motion,
        t = (now - state.start) / 1000;
      robot.rotation.set(0, 0, 0);
      head.rotation.set(0, 0, 0);
      arm.rotation.z = 0;
      robot.position.y = 0;
      if (m && !state.custom) {
        const wave = Math.sin((t * Math.PI * 2) / 1.2),
          env = Math.min(1, t * 5, Math.max(0, (m.durationMs / 1000 - t) * 5));
        if (m.visual === "nod" || m.visual === "nod_double")
          head.rotation.x =
            Math.sin(
              (t * Math.PI * 2) / (m.visual === "nod_double" ? 0.75 : 1.3),
            ) *
            0.25 *
            env;
        if (m.visual === "shake_head") head.rotation.y = wave * 0.4 * env;
        if (m.visual === "tilt_left" || m.visual === "tilt_right")
          head.rotation.z =
            (m.visual === "tilt_left" ? 1 : -1) *
            0.3 *
            Math.sin(Math.min(1, t / (m.durationMs / 1000)) * Math.PI);
        if (m.visual === "wave") arm.rotation.z = (-1.6 + wave * 0.4) * env;
        if (m.visual === "dance") {
          robot.rotation.y = wave * 0.35 * env;
          robot.position.y = Math.abs(wave) * 0.12 * env;
          arm.rotation.z = -1.5 * env;
        }
      }
      if (m && now - state.start >= m.durationMs) {
        state.motion = null;
        state.action?.stop();
        callbacks.current.onPlayback?.("动画播完");
      }
      controls.update();
      renderer.render(scene, camera);
    };
    loop();
    return () => {
      state.disposed = true;
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse((o) => {
        o.geometry?.dispose();
        for (const material of o.material ? [o.material].flat() : []) {
          Object.values(material).forEach((v) => v?.isTexture && v.dispose());
          material.dispose();
        }
      });
      renderer.domElement.remove();
      api.current = null;
    };
  }, []);
  useEffect(() => {
    const s = api.current;
    if (!s) return;
    let cancelled = false;
    s.mixer?.stopAllAction();
    s.motion = null;
    if (s.custom) {
      s.scene.remove(s.custom);
      s.custom.traverse((o) => {
        o.geometry?.dispose();
        [o.material]
          .flat()
          .filter(Boolean)
          .forEach((m) => {
            Object.values(m).forEach((v) => v?.isTexture && v.dispose());
            m.dispose();
          });
      });
      s.custom = null;
    }
    callbacks.current.onPlayback?.("等待播放");
    callbacks.current.onAsset?.([]);
    s.robot.visible = !asset;
    s.clips = [];
    s.mixer = null;
    setError("");
    if (!asset) {
      callbacks.current.onAsset?.([]);
      return;
    }
    setError("正在读取本地 3D 资源…");
    asset
      .arrayBuffer()
      .then(
        (buffer) =>
          new Promise((resolve, reject) => {
            // Local GLB only. Never fetch external textures/buffers embedded in an imported file.
            const manager = new THREE.LoadingManager();
            manager.setURLModifier((url) => {
              if (url.startsWith("blob:") || url.startsWith("data:"))
                return url;
              throw Error("GLB 必须内嵌纹理和缓冲区");
            });
            new GLTFLoader(manager).parse(buffer, "", resolve, reject);
          }),
      )
      .then((gltf) => {
        if (cancelled || s.disposed) {
          gltf.scene.traverse((o) => {
            o.geometry?.dispose();
            [o.material]
              .flat()
              .filter(Boolean)
              .forEach((m) => {
                Object.values(m).forEach((v) => v?.isTexture && v.dispose());
                m.dispose();
              });
          });
          return;
        }
        const model = gltf.scene,
          box = new THREE.Box3().setFromObject(model),
          size = box.getSize(new THREE.Vector3()),
          factor = 2.4 / Math.max(size.x, size.y, size.z, 0.01);
        model.scale.multiplyScalar(factor);
        const adjusted = new THREE.Box3().setFromObject(model),
          center = adjusted.getCenter(new THREE.Vector3());
        model.position.x -= center.x;
        model.position.z -= center.z;
        model.position.y -= adjusted.min.y;
        s.custom = model;
        s.scene.add(model);
        s.mixer = new THREE.AnimationMixer(model);
        s.clips = gltf.animations;
        setError("");
        callbacks.current.onAsset?.(
          s.clips.map((c) => ({ name: c.name, duration: c.duration })),
        );
      })
      .catch(() => {
        if (!cancelled) {
          setError(
            "模型加载失败。请使用内嵌资源的 GLB；文件留在你的浏览器中。",
          );
          callbacks.current.onAsset?.([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [asset]);
  useEffect(() => {
    const s = api.current;
    if (!s) return;
    s.action?.stop();
    s.motion = null;
    if (!motion) {
      callbacks.current.onPlayback?.("等待播放 / 动画已停止");
      return;
    }
    if (asset && !s.custom) {
      callbacks.current.onPlayback?.("角色尚未加载，不播放预览");
      return;
    }
    if (s.custom) {
      const clip = s.clips.find((c) => c.name === motion.clip);
      if (!clip) {
        callbacks.current.onPlayback?.("动画未绑定：不播放替代动作");
        return;
      }
      s.action = s.mixer.clipAction(clip);
      s.action.setLoop(THREE.LoopOnce, 1);
      s.action.clampWhenFinished = true;
      s.action.reset().play();
      s.motion = { ...motion, durationMs: clip.duration * 1000 };
    } else {
      if (
        ![
          "nod",
          "nod_double",
          "shake_head",
          "tilt_left",
          "tilt_right",
          "wave",
          "dance",
        ].includes(motion.visual)
      ) {
        callbacks.current.onPlayback?.("此能力没有绑定预览动画");
        return;
      }
      s.motion = motion;
    }
    s.start = performance.now();
    callbacks.current.onPlayback?.("动画播放中");
  }, [motion]);
  return (
    <div className="stage" ref={host} aria-label="3D 角色预览">
      {error && (
        <p className="stage-error" role="status">
          {error}
        </p>
      )}
      <div className="stage-caption">
        {asset ? asset.name : "内置示例角色 · 无需下载模型"}
        <span>拖动旋转 · 滚轮缩放</span>
      </div>
    </div>
  );
}

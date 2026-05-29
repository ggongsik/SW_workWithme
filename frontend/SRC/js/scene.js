// js/scene.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadBackground } from './background.js';
import { loadCharacter, updateCharacter, change3DPose, switchCharacter } from './character.js';
import { noteDebugRenderFrame } from './debug.js';

let scene, camera, renderer, clock;

// 절차적 애니메이션 상태 변수
window.targetPoseEntries = [];
let breathTime = 0;
const LERP_SPEED = 4.0;
const MAX_PIXEL_RATIO = 1.5;

export function init3DScene() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  //  렌더러 세팅
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 무대와 카메라 세팅
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(7.774, 5.086, 5.825);

  // 조작 세팅
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(4.617, 4.179, 1.410);
  controls.update();

  // 조명 세팅
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(2, 4, 2);
  scene.add(dirLight);

  // 배경과 캐릭터 불러오기
  loadBackground(scene);
  loadCharacter(scene);

  // 창 크기 변경 대응
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 애니메이션 루프 시작
  clock = new THREE.Clock();
  animate();

  // 외부 호출을 위한 전역 연결
  window.change3DPose = change3DPose;
  window.switchCharacter = switchCharacter;
  window.setupPipRenderer = setupPipRenderer; // ui.js의 Document PiP에서 호출함
}

// 절차적 보간 애니메이션 함수 (feat/UI 방식: 캐시된 bone 참조 사용)
function updateProceduralAnimation(delta) {
  if (!window.currentVRM || !window.targetPoseEntries.length) return;

  for (let i = 0; i < window.targetPoseEntries.length; i++) {
    const { bone, target: tgt } = window.targetPoseEntries[i];
    if (!bone) continue;

    bone.rotation.x += (tgt.x - bone.rotation.x) * LERP_SPEED * delta;
    bone.rotation.y += (tgt.y - bone.rotation.y) * LERP_SPEED * delta;
    bone.rotation.z += (tgt.z - bone.rotation.z) * LERP_SPEED * delta;
  }
}

// 호흡 모션 함수 (feat/UI 방식: breathingBones 캐시 사용)
function updateBreathing(delta) {
  if (!window.currentVRM) return;
  breathTime += delta;

  const chest = window.breathingBones?.chest;
  if (chest) chest.rotation.x += Math.sin(breathTime * 1.5) * 0.004;

  const spine = window.breathingBones?.spine;
  if (spine) spine.rotation.x += Math.sin(breathTime * 1.2 + 0.5) * 0.002;
}

// 메인 렌더링 루프
function animate() {
  requestAnimationFrame(animate);

  // UI 드래그 중이거나 탭이 숨겨진 경우 렌더링 스킵 (최적화)
  if (window.isUIDragging || document.hidden) {
    clock.getDelta();
    return;
  }

  const delta = Math.min(clock.getDelta(), 0.05);

  updateCharacter(delta);

  if (window.currentVRM) {
    updateProceduralAnimation(delta);
    updateBreathing(delta);
  }

  renderer.render(scene, camera);
  noteDebugRenderFrame();
}

let pipRenderer = null;
export function setupPipRenderer(pw) {
  const container = pw.document.getElementById('pip-3d');
  if (!container) return;

  if (pipRenderer) {
    pipRenderer.dispose();
    pipRenderer = null;
  }
  container.replaceChildren();

  const c = pw.document.createElement('canvas');
  container.appendChild(c);

  pipRenderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: false });
  pipRenderer.setPixelRatio(1);
  pipRenderer.outputColorSpace = THREE.SRGBColorSpace;

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (w && h) pipRenderer.setSize(w, h);
  };
  resize();
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(container);

  pw.addEventListener('pagehide', () => {
    resizeObserver.disconnect();
    pipRenderer?.dispose();
    pipRenderer = null;
  }, { once: true });

  const pipCam = camera.clone();
  let lastPipFrame = 0;
  const PIP_FPS_INTERVAL = 1000 / 30;

  (function pipAnimate() {
    if (!pipRenderer || !pw || pw.closed) return;
    pw.requestAnimationFrame(pipAnimate);

    const now = performance.now();
    if (now - lastPipFrame < PIP_FPS_INTERVAL) return; // 30프레임 초과 시 스킵
    lastPipFrame = now;

    // 메인 카메라와 동일한 시점 동기화
    pipCam.position.copy(camera.position);
    pipCam.rotation.copy(camera.rotation);
    pipCam.aspect = container.clientWidth / container.clientHeight;
    pipCam.updateProjectionMatrix();

    pipRenderer.render(scene, pipCam);
  })();
}
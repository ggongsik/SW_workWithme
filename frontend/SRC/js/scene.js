// js/scene.js

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadBackground } from './background.js';
import { loadCharacter, updateCharacter, change3DPose } from './character.js';

let scene, camera, renderer, clock;

// ✨ 절차적 애니메이션 상태 변수 (전역으로 열어두어 character.js에서 덮어쓸 수 있게 함)
window.targetPoseEntries = []; 
let breathTime = 0;
const LERP_SPEED = 4.0;

export function init3DScene() {
  const canvas = document.getElementById('bg-canvas');
  if (!canvas) return;

  // 1. 렌더러 세팅
  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  // 2. 무대(Scene)와 카메라 세팅
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(7.774, 5.086, 5.825);

  // 3. 조작(OrbitControls) 세팅
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(4.617, 4.179, 1.410);
  controls.update();

  // 4. 조명 세팅
  scene.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
  dirLight.position.set(2, 4, 2);
  scene.add(dirLight);

  // 5. 배경과 캐릭터 불러오기
  loadBackground(scene);
  loadCharacter(scene);

  // 6. 창 크기 변경 대응
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // 7. 애니메이션 루프 시작
  clock = new THREE.Clock();
  animate();
  
  // 외부 호출을 위한 전역 연결
  window.change3DPose = change3DPose;
  window.setupPipRenderer = setupPipRenderer; // ui.js의 Document PiP에서 호출함
}

// ✨ 절차적 보간 애니메이션 함수
function updateProceduralAnimation(delta) {
  // character.js에서 등록한 window.currentVRM을 사용합니다.
  if (!window.currentVRM || !window.targetPoseEntries.length) return;
  
  for (let i = 0; i < window.targetPoseEntries.length; i++) {
    const [boneName, tgt] = window.targetPoseEntries[i];
    const bone = window.currentVRM.humanoid.getNormalizedBoneNode(boneName);
    if (!bone) continue;
    
    bone.rotation.x += (tgt.x - bone.rotation.x) * LERP_SPEED * delta;
    bone.rotation.y += (tgt.y - bone.rotation.y) * LERP_SPEED * delta;
    bone.rotation.z += (tgt.z - bone.rotation.z) * LERP_SPEED * delta;
  }
}

// ✨ 자연스러운 호흡(숨쉬기) 모션 함수
function updateBreathing(delta) {
  if (!window.currentVRM) return;
  breathTime += delta;
  
  const chest = window.currentVRM.humanoid.getNormalizedBoneNode('chest');
  if (chest) chest.rotation.x += Math.sin(breathTime * 1.5) * 0.004;
  
  const spine = window.currentVRM.humanoid.getNormalizedBoneNode('spine');
  if (spine) spine.rotation.x += Math.sin(breathTime * 1.2 + 0.5) * 0.002;
}

// ✨ 메인 렌더링 루프
function animate() {
  requestAnimationFrame(animate);
  
  // UI 드래그 중 간섭 방지 (기존 코드 유지)
  if (window.isUIDragging) return;
  
  const delta = clock.getDelta();
  
  // 1. 기본 캐릭터 로직 업데이트 (vrm.update 등)
  updateCharacter(delta); 
  
  // 2. 새로운 절차적 애니메이션 및 호흡 적용
  if (window.currentVRM) {
    updateProceduralAnimation(delta);
    updateBreathing(delta);
  }
  
  renderer.render(scene, camera);
}

// ✨ PiP 창 내부에 3D 씬을 쏴주는 별도 렌더러 설정 (GPU 최적화 포함)
let pipRenderer = null;
export function setupPipRenderer(pw) {
  const container = pw.document.getElementById('pip-3d');
  if (!container) return;

  const c = pw.document.createElement('canvas');
  container.appendChild(c);

  // antialias OFF = PiP 창의 GPU 부하 30% 감소
  pipRenderer = new THREE.WebGLRenderer({ canvas: c, alpha: true, antialias: false });
  pipRenderer.setPixelRatio(1);
  pipRenderer.outputColorSpace = THREE.SRGBColorSpace;

  const resize = () => {
    const w = container.clientWidth, h = container.clientHeight;
    if (w && h) pipRenderer.setSize(w, h);
  };
  resize();
  new ResizeObserver(resize).observe(container);

  // PiP 전용 카메라 및 30fps 제한 렌더 루프
  const pipCam = camera.clone();
  let lastPipFrame = 0;
  const PIP_FPS_INTERVAL = 1000 / 30; // 30fps

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
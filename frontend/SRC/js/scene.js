import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { loadBackground } from './background.js';
import { loadCharacter, updateCharacter, change3DPose } from './character.js';

let scene, camera, renderer, clock;

export function init3DScene() {
  const canvas = document.getElementById('bg-canvas'); // HTML에 있는 캔버스 ID
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

  // 5. 배경과 캐릭터 불러오기 (만들어둔 모듈 사용!)
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
  
  // MediaPipe가 상태를 바꿀 때 접근할 수 있도록 window 객체에 연결
  window.change3DPose = change3DPose;
}

function animate() {
  requestAnimationFrame(animate);
  if (window.isUIDragging) return;
  const deltaTime = clock.getDelta();
  updateCharacter(deltaTime); // 캐릭터 물리 효과 업데이트
  
  renderer.render(scene, camera);
}
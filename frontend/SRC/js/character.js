// ============================================================================
// js/character.js
// VRM 아바타 로딩, 포즈 데이터(POSES) 관리 및 업데이트
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// ✨ UI 담당자님이 작성하신 방대한 뼈대 각도 데이터 (필수!)
const POSES = {
  idle: {
    label: 'IDLE - 작업 중', color: '#4ade80', expression: 'neutral',
    bones: {
      leftUpperLeg: new THREE.Euler(1.40, 0.00, 0.00),
      leftLowerLeg: new THREE.Euler(-1.50, 0.00, 0.00),
      rightUpperLeg: new THREE.Euler(1.40, 0.00, 0.00),
      rightLowerLeg: new THREE.Euler(-1.50, 0.00, 0.00),
      spine: new THREE.Euler(0.05, 0.00, 0.00),
      chest: new THREE.Euler(0.02, 0.00, 0.00),
      neck: new THREE.Euler(0.05, 0.00, 0.00),
      head: new THREE.Euler(0.05, 0.00, 0.00),
      leftUpperArm: new THREE.Euler(0.00, 0.00, 1.20),
      leftLowerArm: new THREE.Euler(0.00, -1.42, 0.00),
      leftHand: new THREE.Euler(0.00, 0.00, 0.00),
      rightUpperArm: new THREE.Euler(0.00, 0.00, -1.20),
      rightLowerArm: new THREE.Euler(0.00, 1.48, 0.00),
      rightHand: new THREE.Euler(0.00, 0.00, 0.00),
    }
  },
  warn: {
    label: 'WARN - 걱정/주시', color: '#fb923c', expression: 'sad',
    bones: {
      leftUpperLeg: new THREE.Euler(1.40, 0.00, 0.00),
      leftLowerLeg: new THREE.Euler(-1.50, 0.00, 0.00),
      rightUpperLeg: new THREE.Euler(1.40, 0.00, 0.00),
      rightLowerLeg: new THREE.Euler(-1.50, 0.00, 0.00),
      spine: new THREE.Euler(0.15, 0.00, 0.00),
      chest: new THREE.Euler(0.10, 0.00, 0.00),
      neck: new THREE.Euler(-0.13, -0.91, 0.11),
      head: new THREE.Euler(-0.15, 0.00, 0.00),
      leftUpperArm: new THREE.Euler(0.20, 0.00, 1.30),
      leftLowerArm: new THREE.Euler(0.00, -1.04, 0.00),
      rightUpperArm: new THREE.Euler(0.20, 0.00, -1.30),
      rightLowerArm: new THREE.Euler(0.00, 1.13, 0.00),
    }
  },
  alert: {
    label: 'ALERT - 손가락질', color: '#f87171', expression: 'angry',
    bones: {
      leftUpperLeg: new THREE.Euler(1.40, 0.00, 0.00),
      leftLowerLeg: new THREE.Euler(-1.50, 0.00, 0.00),
      rightUpperLeg: new THREE.Euler(1.40, 0.00, 0.00),
      rightLowerLeg: new THREE.Euler(-1.50, 0.00, 0.00),
      spine: new THREE.Euler(-0.05, 0.00, 0.00),
      chest: new THREE.Euler(-0.05, 0.00, 0.00),
      neck: new THREE.Euler(-0.13, -1.08, -0.05),
      head: new THREE.Euler(0.00, 0.00, 0.00),
      leftUpperArm: new THREE.Euler(0.58, 0.09, 0.55),
      leftLowerArm: new THREE.Euler(0.02, -2.87, 0.49),
      leftHand: new THREE.Euler(1.52, 0.00, 0.00),
      rightUpperArm: new THREE.Euler(0.91, 0.04, -0.29),
      rightLowerArm: new THREE.Euler(-0.24, 0.60, 0.27),
      rightHand: new THREE.Euler(0.24, -0.20, -0.11),
      rightThumbProximal: new THREE.Euler(0, 0, -0.5),
      rightThumbIntermediate: new THREE.Euler(0, 0, -0.5),
      rightThumbDistal: new THREE.Euler(0, 0, -0.5),
      rightMiddleProximal: new THREE.Euler(0, 0, -1.0),
      rightMiddleIntermediate: new THREE.Euler(0, 0, -1.0),
      rightMiddleDistal: new THREE.Euler(0, 0, -1.0),
      rightRingProximal: new THREE.Euler(0, 0, -1.0),
      rightRingIntermediate: new THREE.Euler(0, 0, -1.0),
      rightRingDistal: new THREE.Euler(0, 0, -1.0),
      rightLittleProximal: new THREE.Euler(0, 0, -1.0),
      rightLittleIntermediate: new THREE.Euler(0, 0, -1.0),
      rightLittleDistal: new THREE.Euler(0, 0, -1.0),
    }
  }
};

const loader = new GLTFLoader();
loader.register((p) => new VRMLoaderPlugin(p));

// 캐릭터 로드
export function loadCharacter(scene) {
  loader.load('./models/HatsuneMikuNT.vrm', 
    (gltf) => {
      const vrm = gltf.userData.vrm;
      VRMUtils.rotateVRM0(vrm);
      
      window.currentVRM = vrm; 

      vrm.scene.position.set(4.300, -2.330, 0.470);
      vrm.scene.rotation.set(0.087, -1.484, 0.070);
      vrm.scene.scale.setScalar(5.000);
      
      scene.add(vrm.scene);

      change3DPose('idle'); 
      console.log("캐릭터 로드 완료 및 IDLE 포즈 적용됨");
    },
    (progress) => {

    },
    (error) => {
      console.error('캐릭터 로딩 실패:', error);
    }
  );
}

// 캐릭터 업데이트
export function updateCharacter(delta) {
  if (window.currentVRM) {
    window.currentVRM.update(delta);
  }
}

//  포즈 변경 함수
export function change3DPose(poseName) {
  if (!window.currentVRM) return;
  const pose = POSES[poseName];
  
  if (!pose) {
    console.error(`${poseName} 포즈가 정의되지 않았습니다.`);
    return;
  }
  
  // 뼈대 데이터를 임시 객체에 담아 배열 형태로 전환
  let targetPose = {};
  for (const [bname, euler] of Object.entries(pose.bones)) {
    targetPose[bname] = { x: euler.x, y: euler.y, z: euler.z };
  }
  
  window.targetPoseEntries = Object.entries(targetPose); 
  
  // 표정 변경
  if (window.currentVRM.expressionManager) {
    ['happy', 'sad', 'angry', 'surprised', 'neutral'].forEach(e => { 
      try { window.currentVRM.expressionManager.setValue(e, 0); } catch (_) {} 
    });
    try { window.currentVRM.expressionManager.setValue(pose.expression, 1.0); } catch (_) {}
  }
}
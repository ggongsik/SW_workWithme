// ============================================================================
// js/character.js
// VRM 캐릭터 로드 및 포즈(자세/표정) 제어 전담 모듈
// ============================================================================

import * as THREE from 'three'; 
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

let vrm = null;
let currentPoseName = ''; // 빈 문자열로 시작 
// 사용자가 튜닝한 완벽한 포즈 데이터
const POSES = {
  idle: {
    expression:'neutral',
    bones: {
      leftUpperLeg:  new THREE.Euler( 1.40,  0.00,  0.00),
      leftLowerLeg:  new THREE.Euler(-1.50,  0.00,  0.00),
      rightUpperLeg: new THREE.Euler( 1.40,  0.00,  0.00),
      rightLowerLeg: new THREE.Euler(-1.50,  0.00,  0.00),
      spine:         new THREE.Euler( 0.05,  0.00,  0.00),
      chest:         new THREE.Euler( 0.02,  0.00,  0.00),
      neck:          new THREE.Euler( 0.05,  0.00,  0.00),
      head:          new THREE.Euler( 0.05,  0.00,  0.00),
      leftUpperArm:  new THREE.Euler( 0.00,  0.00,  1.20),
      leftLowerArm:  new THREE.Euler( 0.00, -1.42,  0.00),
      leftHand:      new THREE.Euler( 0.00,  0.00,  0.00),
      rightUpperArm: new THREE.Euler( 0.00,  0.00, -1.20),
      rightLowerArm: new THREE.Euler( 0.00,  1.48,  0.00),
      rightHand:     new THREE.Euler( 0.00,  0.00,  0.00),
    }
  },
  warn: {
    expression:'sad',
    bones: {
      leftUpperLeg:  new THREE.Euler( 1.40,  0.00,  0.00),
      leftLowerLeg:  new THREE.Euler(-1.50,  0.00,  0.00),
      rightUpperLeg: new THREE.Euler( 1.40,  0.00,  0.00),
      rightLowerLeg: new THREE.Euler(-1.50,  0.00,  0.00),
      spine:         new THREE.Euler( 0.15,  0.00,  0.00),
      chest:         new THREE.Euler( 0.10,  0.00,  0.00),
      neck:          new THREE.Euler(-0.13, -0.91,  0.11),
      head:          new THREE.Euler(-0.15,  0.00,  0.00),
      leftUpperArm:  new THREE.Euler( 0.20,  0.00,  1.30),
      leftLowerArm:  new THREE.Euler( 0.00, -1.04,  0.00),
      rightUpperArm: new THREE.Euler( 0.20,  0.00, -1.30),
      rightLowerArm: new THREE.Euler( 0.00,  1.13,  0.00),
    }
  },
  alert: {
    expression:'angry',
    bones: {
      leftUpperLeg:  new THREE.Euler( 1.40,  0.00,  0.00),
      leftLowerLeg:  new THREE.Euler(-1.50,  0.00,  0.00),
      rightUpperLeg: new THREE.Euler( 1.40,  0.00,  0.00),
      rightLowerLeg: new THREE.Euler(-1.50,  0.00,  0.00),
      spine:         new THREE.Euler(-0.05,  0.00,  0.00),
      chest:         new THREE.Euler(-0.05,  0.00,  0.00),
      neck:          new THREE.Euler(-0.13, -1.08, -0.05),
      head:          new THREE.Euler( 0.00,  0.00,  0.00),
      leftUpperArm:  new THREE.Euler( 0.58,  0.09,  0.55),
      leftLowerArm:  new THREE.Euler( 0.02, -2.87,  0.49),
      rightUpperArm: new THREE.Euler( 0.91,  0.04, -0.29),
      rightLowerArm: new THREE.Euler(-0.24,  0.60,  0.27),
      rightHand:     new THREE.Euler( 0.24, -0.20, -0.11),
      rightThumbProximal:     new THREE.Euler(0, 0, -0.5),
      rightThumbIntermediate: new THREE.Euler(0, 0, -0.5),
      rightThumbDistal:       new THREE.Euler(0, 0, -0.5),
      rightMiddleProximal:    new THREE.Euler(0, 0, -1.0),
      rightMiddleIntermediate:new THREE.Euler(0, 0, -1.0),
      rightMiddleDistal:      new THREE.Euler(0, 0, -1.0),
      rightRingProximal:      new THREE.Euler(0, 0, -1.0),
      rightRingIntermediate:  new THREE.Euler(0, 0, -1.0),
      rightRingDistal:        new THREE.Euler(0, 0, -1.0),
      rightLittleProximal:    new THREE.Euler(0, 0, -1.0),
      rightLittleIntermediate:new THREE.Euler(0, 0, -1.0),
      rightLittleDistal:      new THREE.Euler(0, 0, -1.0),
    }
  }
};

// 외부(pose.js)에서 호출할 포즈 변경 함수
export function change3DPose(poseName) {
  if (!vrm || currentPoseName === poseName) return;
  currentPoseName = poseName;
  const pose = POSES[poseName];
  
  // 뼈대 각도 조절
  for (const [bname, euler] of Object.entries(pose.bones)) {
    const bone = vrm.humanoid.getNormalizedBoneNode(bname);
    if (bone) bone.rotation.set(euler.x, euler.y, euler.z);
  }
  
  // 표정 조절
  if (vrm.expressionManager) {
    ['happy','sad','angry','surprised','neutral'].forEach(e => { 
      try { vrm.expressionManager.setValue(e, 0); } catch(err){} 
    });
    try { vrm.expressionManager.setValue(pose.expression, 1.0); } catch(err){}
  }
}

export function loadCharacter(scene) {
  const loader = new GLTFLoader();
  loader.register(parser => new VRMLoaderPlugin(parser));

  // 🚨 본인의 폴더 위치에 맞게 경로를 수정하세요!
  loader.load('./models/HatsuneMikuNT.vrm', (gltf) => {
    vrm = gltf.userData.vrm;
    VRMUtils.rotateVRM0(vrm);
    
    // 캐릭터 위치/회전/크기 세팅 (사용자 설정값 유지)
    vrm.scene.position.set(4.300, -2.330, 0.470);
    vrm.scene.rotation.set(0.087, -1.484, 0.070);
    vrm.scene.scale.setScalar(5.000);
    
    // 무대에 올리기 전에 미리 예쁘게 앉히기
    change3DPose('idle'); 
    
    // 강제 업데이트로 T포즈 방지
    vrm.scene.updateMatrixWorld(true);
    
    scene.add(vrm.scene);
    console.log("캐릭터 로드 완료 및 포즈 적용 완료");
    
  }, undefined, (error) => {
    console.error("캐릭터 로드 실패:", error);
  });
}

// 매 프레임마다 캐릭터(머리카락, 옷자락 등)를 렌더링하기 위한 함수
export function updateCharacter(deltaTime) {
  if (vrm) {
    vrm.update(deltaTime);
  }
}
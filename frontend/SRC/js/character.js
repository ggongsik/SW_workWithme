// ============================================================================
// js/character.js
// VRM avatar loading, model switching, pose data management, and updates
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

const MIKU_POSES = {
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

const KIPFEL_POSES = {
  idle: {
    label: 'IDLE - 작업 중', color: '#4ade80', expression: 'neutral',
    bones: {
      leftUpperLeg: new THREE.Euler(-1.40, 0.00, 0.00),
      leftLowerLeg: new THREE.Euler(1.50, 0.00, 0.00),
      rightUpperLeg: new THREE.Euler(-1.40, 0.00, 0.00),
      rightLowerLeg: new THREE.Euler(1.50, 0.00, 0.00),
      spine: new THREE.Euler(0.05, 0.00, 0.00),
      chest: new THREE.Euler(0.02, 0.00, 0.00),
      neck: new THREE.Euler(0.05, 0.00, 0.00),
      head: new THREE.Euler(0.05, 0.00, 0.00),
      leftUpperArm: new THREE.Euler(-0.80, 0.00, -0.75),
      leftLowerArm: new THREE.Euler(0.09, -0.35, -0.57),
      leftHand: new THREE.Euler(1.04, 0.00, 0.00),
      rightUpperArm: new THREE.Euler(-1.46, -0.46, 0.80),
      rightLowerArm: new THREE.Euler(0.15, -0.31, 1.10),
      rightHand: new THREE.Euler(1.88, -0.22, 0.16),
    }
  },
  warn: {
    label: 'WARN - 걱정/주시', color: '#fb923c', expression: 'sad',
    bones: {
      leftUpperLeg: new THREE.Euler(-1.40, 0.00, 0.00),
      leftLowerLeg: new THREE.Euler(1.50, 0.00, 0.00),
      rightUpperLeg: new THREE.Euler(-1.40, 0.00, 0.00),
      rightLowerLeg: new THREE.Euler(1.50, 0.00, 0.00),
      spine: new THREE.Euler(0.15, 0.00, 0.00),
      chest: new THREE.Euler(0.10, 0.00, 0.00),
      neck: new THREE.Euler(-0.13, -0.91, 0.11),
      head: new THREE.Euler(-0.15, 0.00, 0.00),
      leftUpperArm: new THREE.Euler(-0.55, -0.40, -1.17),
      leftLowerArm: new THREE.Euler(0.00, -1.04, 0.00),
      rightUpperArm: new THREE.Euler(0.20, 0.77, 0.70),
      rightLowerArm: new THREE.Euler(0.00, 1.13, 0.00),
      rightMiddleProximal: new THREE.Euler(1, 1, 1.0),
      rightMiddleIntermediate: new THREE.Euler(1, 1, 1.0),
      rightMiddleDistal: new THREE.Euler(1, 1, 1.0),
      rightRingProximal: new THREE.Euler(0, 0, -1.0),
      rightRingIntermediate: new THREE.Euler(0, 0, -1.0),
      rightRingDistal: new THREE.Euler(0, 0, -1.0),
      rightLittleProximal: new THREE.Euler(0, 0, -1.0),
      rightLittleIntermediate: new THREE.Euler(0, 0, -1.0),
      rightLittleDistal: new THREE.Euler(0, 0, -1.0),
    }
  },
  alert: {
    label: 'ALERT - 손가락질', color: '#f87171', expression: 'angry',
    bones: {
      leftUpperLeg: new THREE.Euler(-1.40, 0.00, 0.00),
      leftLowerLeg: new THREE.Euler(1.50, 0.00, 0.00),
      rightUpperLeg: new THREE.Euler(-1.40, 0.00, 0.00),
      rightLowerLeg: new THREE.Euler(1.50, 0.00, 0.00),
      spine: new THREE.Euler(-0.05, 0.00, 0.00),
      chest: new THREE.Euler(-0.05, 0.00, 0.00),
      neck: new THREE.Euler(-0.13, -0.82, -0.05),
      head: new THREE.Euler(0.00, 0.00, 0.00),
      leftUpperArm: new THREE.Euler(-1.41, -0.91, -1.11),
      leftLowerArm: new THREE.Euler(0.02, -2.87, 0.49),
      leftHand: new THREE.Euler(1.52, 0.00, 0.00),
      rightUpperArm: new THREE.Euler(-0.97, 0.27, 0.31),
      rightLowerArm: new THREE.Euler(-0.24, 0.60, 0.27),
      rightHand: new THREE.Euler(0.24, -0.13, 0.00),
      rightThumbProximal: new THREE.Euler(0, 0, 0.5),
      rightThumbIntermediate: new THREE.Euler(0, 0, 0.5),
      rightThumbDistal: new THREE.Euler(0, 0, 0.5),
      rightMiddleProximal: new THREE.Euler(0, 0, 1.0),
      rightMiddleIntermediate: new THREE.Euler(0, 0, 1.0),
      rightMiddleDistal: new THREE.Euler(0, 0, 1.0),
      rightRingProximal: new THREE.Euler(0, 0, 1.0),
      rightRingIntermediate: new THREE.Euler(0, 0, 1.0),
      rightRingDistal: new THREE.Euler(0, 0, 1.0),
      rightLittleProximal: new THREE.Euler(0, 0, 1.0),
      rightLittleIntermediate: new THREE.Euler(0, 0, 1.0),
      rightLittleDistal: new THREE.Euler(0, 0, 1.0),
    }
  }
};

const CHARACTER_CONFIGS = {
  miku: {
    label: 'Miku',
    path: './models/HatsuneMikuNT.vrm',
    transform: {
      position: [4.300, -2.330, 0.470],
      rotation: [0.087, -1.484, 0.070],
      scale: 5.000,
    },
    poses: MIKU_POSES,
  },
  kipfel: {
    label: 'Kipfel',
    path: './models/Kipfel.vrm',
    transform: {
      position: [4.650, -0.230, 0.230],
      rotation: [0.087, 1.466, 0.070],
      scale: 7.040,
    },
    poses: KIPFEL_POSES,
  },
};

const loader = new GLTFLoader();
loader.register((p) => new VRMLoaderPlugin(p));

let activeScene = null;
let activeCharacterKey = 'miku';
let activePoseName = 'idle';
let loadRequestId = 0;
const loadedCharacters = new Map();

function applyTransform(vrm, transform) {
  vrm.scene.position.set(...transform.position);
  vrm.scene.rotation.set(...transform.rotation);
  vrm.scene.scale.setScalar(transform.scale);
}

function setActiveCharacter(characterKey, vrm) {
  if (window.currentVRM?.scene && window.currentVRM !== vrm) {
    window.currentVRM.scene.visible = false;
  }

  const config = CHARACTER_CONFIGS[characterKey];
  activeCharacterKey = characterKey;
  window.currentCharacter = characterKey;
  window.currentVRM = vrm;
  window.currentVRM.scene.visible = true;
  window.breathingBones = {
    chest: vrm.humanoid.getNormalizedBoneNode('chest'),
    spine: vrm.humanoid.getNormalizedBoneNode('spine'),
  };

  applyTransform(vrm, config.transform);
  syncCharacterButtons();
  change3DPose(activePoseName);
}

function syncCharacterButtons() {
  document.querySelectorAll('[data-character]').forEach((button) => {
    button.classList.toggle('on', button.dataset.character === activeCharacterKey);
  });
}

function disposeVRM(vrm) {
  if (!vrm?.scene) return;
  if (activeScene) activeScene.remove(vrm.scene);
  vrm.scene.traverse((node) => {
    if (!node.isMesh) return;
    node.geometry?.dispose?.();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    materials.forEach((material) => {
      if (!material) return;
      ['map', 'normalMap', 'emissiveMap', 'roughnessMap', 'metalnessMap', 'alphaMap'].forEach((key) => {
        material[key]?.dispose?.();
      });
      material.dispose?.();
    });
  });
}

function getActiveConfig() {
  return CHARACTER_CONFIGS[activeCharacterKey];
}

// 캐릭터 로드
export function loadCharacter(scene, characterKey = activeCharacterKey) {
  activeScene = scene;
  return switchCharacter(characterKey);
}

export function switchCharacter(characterKey = 'miku') {
  const config = CHARACTER_CONFIGS[characterKey];
  if (!config || !activeScene) return Promise.resolve(null);

  const requestId = ++loadRequestId;
  const cachedVRM = loadedCharacters.get(characterKey);
  if (cachedVRM) {
    setActiveCharacter(characterKey, cachedVRM);
    return Promise.resolve(cachedVRM);
  }

  window.targetPoseEntries = [];

  return new Promise((resolve, reject) => {
    loader.load(
      config.path,
      (gltf) => {
        if (requestId !== loadRequestId) {
          disposeVRM(gltf.userData.vrm);
          resolve(null);
          return;
        }

        const vrm = gltf.userData.vrm;
        VRMUtils.rotateVRM0(vrm);
        loadedCharacters.set(characterKey, vrm);

        activeScene.add(vrm.scene);
        setActiveCharacter(characterKey, vrm);
        console.log(`${config.label} 로드 완료 및 ${activePoseName.toUpperCase()} 포즈 적용됨`);
        resolve(vrm);
      },
      undefined,
      (error) => {
        console.error(`${config.label} 로딩 실패:`, error);
        reject(error);
      }
    );
  });
}

// 캐릭터 업데이트
export function updateCharacter(delta) {
  if (window.currentVRM) {
    window.currentVRM.update(delta);
  }
}

// 포즈 변경 함수
export function change3DPose(poseName) {
  if (!window.currentVRM) return;

  const pose = getActiveConfig().poses[poseName];
  if (!pose) {
    console.error(`${poseName} 포즈가 정의되지 않았습니다.`);
    return;
  }

  activePoseName = poseName;
  const targetPoseEntries = [];
  for (const [boneName, euler] of Object.entries(pose.bones)) {
    const bone = window.currentVRM.humanoid.getNormalizedBoneNode(boneName);
    if (bone) {
      targetPoseEntries.push({ bone, target: { x: euler.x, y: euler.y, z: euler.z } });
    }
  }

  window.targetPoseEntries = targetPoseEntries;

  if (window.currentVRM.expressionManager) {
    ['happy', 'sad', 'angry', 'surprised', 'neutral'].forEach((expression) => {
      try { window.currentVRM.expressionManager.setValue(expression, 0); } catch (_) {}
    });
    try { window.currentVRM.expressionManager.setValue(pose.expression, 1.0); } catch (_) {}
  }
}

export function getCurrentCharacter() {
  return activeCharacterKey;
}

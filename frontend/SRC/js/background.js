import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export function loadBackground(scene) {
  const loader = new GLTFLoader();
  
  loader.load('./models/lofi_room.glb', (gltf) => {
    const mapRoot = gltf.scene;
    // 배경 위치/크기 세팅
    mapRoot.position.set(0, 0, 0);
    mapRoot.scale.setScalar(1.0);
    
    // 그림자 설정 (선택 사항)
    mapRoot.traverse(node => { 
      if (node.isMesh) { 
        node.castShadow = true; 
        node.receiveShadow = true; 
      } 
    });
    
    scene.add(mapRoot);
    console.log("배경 로드 완료");
  }, undefined, (error) => {
    console.error("배경 로드 실패:", error);
  });
}
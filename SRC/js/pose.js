// ============================================================================
// js/pose.js
// MediaPipe를 이용한 자세 인식 및 좌표 웹소켓 전송 로직 
// ============================================================================

import { sendPoseData } from './network.js';

// ── 1. 상태 변수 세팅 ──
let currentLandmarks = null;    // 현재 프레임의 랜드마크 좌표
let baselineLandmarks = null;   // 10초 캘리브레이션으로 저장된 기준 좌표

let calibCamera = null;         // MediaPipe 카메라 인스턴스
let calibTimer = null;          // 캘리브레이션 10초 타이머
let trackingTimer = null;       // 1초 단위 백그라운드 트래킹 타이머


// ============================================================================
// ── 2. MediaPipe Pose 초기화 및 설정 ──
// ============================================================================
const pose = new Pose({
  locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
  modelComplexity: 1, 
  smoothLandmarks: true, 
  minDetectionConfidence: 0.5, 
  minTrackingConfidence: 0.5
});

pose.onResults((results) => {
  currentLandmarks = results.poseLandmarks || null;
  
  const videoEl = document.getElementById('calib-video');
  const canvasEl = document.getElementById('calib-canvas');
  if (!videoEl || !canvasEl) return;

  const canvasCtx = canvasEl.getContext('2d');
  
  canvasEl.width = videoEl.videoWidth;
  canvasEl.height = videoEl.videoHeight;
  
  canvasCtx.save();
  canvasCtx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  
  const badge = document.getElementById('calib-status-badge');
  
  if (results.poseLandmarks) {
    badge.innerText = '랜드마크 감지됨';
    badge.style.background = 'rgba(0, 180, 255, 0.5)';
    
    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#00bfff', lineWidth: 3 });
    drawLandmarks(canvasCtx, results.poseLandmarks, { color: '#c8e6ff', lineWidth: 1, radius: 2 });
  } else {
    badge.innerText = '인식 불가! (자세를 맞춰주세요)';
    badge.style.background = 'rgba(255, 60, 80, 0.5)';
  }
  canvasCtx.restore();
});


// ============================================================================
// ── 3. 자세 트래킹 및 좌표 전송 로직 ──
// ============================================================================
// ── 🌟 자세 트래킹 및 ArrayBuffer 바이너리 전송 ──

// 파일 상단에 재사용할 캔버스를 한 번만 생성해 둡니다.
const encodeCanvas = document.createElement('canvas');
encodeCanvas.width = 1080; 
encodeCanvas.height = 720;
// 하드웨어 가속 최적화 플래그 (willReadFrequently)
const encodeCtx = encodeCanvas.getContext('2d', { willReadFrequently: true });

function startPostureTracking() {
  if (trackingTimer) clearInterval(trackingTimer);

  trackingTimer = setInterval(() => {
    if (!currentLandmarks) return;

    // 1. 좌표 데이터 추출
    const targetPoints = [0, 11, 12];
    const payloadPoints = {};

    targetPoints.forEach(idx => {
      const curr = currentLandmarks[idx];
      if (curr) {
        payloadPoints[idx] = { x: curr.x, y: curr.y };
      }
    });
    const videoEl = document.getElementById('calib-video');
    if (videoEl && videoEl.videoWidth > 0) {
      encodeCtx.drawImage(videoEl, 0, 0, encodeCanvas.width, encodeCanvas.height);
      
      encodeCanvas.toBlob(async (blob) => {
        if (!blob) return;
        // 이미지의 ArrayBuffer 추출
        const imageBuffer = await blob.arrayBuffer();
        // 메타데이터(좌표, 시간)를 JSON 문자열로 만든 뒤 UTF-8 바이트 배열로 변환
        const metaStr = JSON.stringify({ points: payloadPoints, timestamp: Date.now() });
        const metaBytes = new TextEncoder().encode(metaStr);
        
        const totalLength = 4 + metaBytes.length + imageBuffer.byteLength;
        const finalBuffer = new ArrayBuffer(totalLength);
        const dataView = new DataView(finalBuffer);
        const uint8View = new Uint8Array(finalBuffer);
        
        // 1) JSON 길이 쓰기 (Little-Endian)
        dataView.setUint32(0, metaBytes.length, true); 
        // 2) JSON 데이터 쓰기
        uint8View.set(metaBytes, 4);
        // 3) 이미지 데이터 쓰기
        uint8View.set(new Uint8Array(imageBuffer), 4 + metaBytes.length);

        console.log("[웹소켓 전송] 좌표 데이터:\n", metaStr);
        console.log(`[웹소켓 전송] 전체 크기: ${finalBuffer.byteLength} bytes (이미지: ${imageBuffer.byteLength} bytes)`);
         /*
        let debugImg = document.getElementById('debug-preview-img');
        if (!debugImg) {
          // 이미지를 보여줄 태그가 없으면 화면 좌측 상단에 새로 만듭니다.
          debugImg = document.createElement('img');
          debugImg.id = 'debug-preview-img';
          debugImg.style.position = 'absolute';
          debugImg.style.top = '10px';
          debugImg.style.left = '10px';
          debugImg.style.width = '160px'; // 화면을 가리지 않게 작게 표시
          debugImg.style.border = '2px solid #00bfff';
          debugImg.style.zIndex = '9999';
          document.body.appendChild(debugImg);
        }

        const testBlob = new Blob([imageBuffer], { type: 'image/jpeg' });
        const imageUrl = URL.createObjectURL(testBlob);
        debugImg.src = imageUrl; // 1초마다 이미지를 교체해서 보여줍니다.

        // 브라우저 메모리가 터지지 않도록, 이미지가 로딩되면 이전 링크는 메모리에서 삭제합니다.
        debugImg.onload = () => URL.revokeObjectURL(imageUrl);
        */
        // 웹소켓으로 바이너리 전송!
        sendPoseData(finalBuffer);
      }, 'image/jpeg', 0.8); // 화질 80% (hd)JPEG
    }
  }, 200); 
}

// ============================================================================
// 4. 외부로 내보내는 기능들 (export)
// ============================================================================

export let isTracking = false; 

// ✨ 추가: 웹캠 하드웨어 전원을 완전히 차단하는 함수
function stopCamera() {
  if (calibCamera) {
    calibCamera.stop();
    calibCamera = null;
  }
  const videoEl = document.getElementById('calib-video');
  if (videoEl && videoEl.srcObject) {
    // 쥐고 있는 모든 미디어 트랙(영상, 오디오)을 강제로 정지시킵니다.
    videoEl.srcObject.getTracks().forEach(track => track.stop());
    videoEl.srcObject = null;
  }
}

export function openCalibration() {
  const overlay = document.getElementById('calib-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => overlay.style.opacity = '1', 10);
  
  const videoEl = document.getElementById('calib-video');
  
  // 창을 열 때마다 카메라를 새롭게 켭니다.
  if (!calibCamera) {
    calibCamera = new Camera(videoEl, {
      onFrame: async () => { await pose.send({ image: videoEl }); },
      width: 640, height: 480
    });
  }
  calibCamera.start();
}

export function closeCalibration() {
  const overlay = document.getElementById('calib-overlay');
  overlay.style.opacity = '0';
  setTimeout(() => overlay.style.display = 'none', 400);
  
  if (calibTimer) clearInterval(calibTimer);
  
  const baseBtn = document.getElementById('calib-base-btn');
  if (baseBtn && baseBtn.innerText.includes("측정 중")) {
    baseBtn.disabled = false; 
    baseBtn.innerText = "기본 자세 설정";
  }

  // ✨ 핵심 로직: 현재 '트래킹(자세 교정)' 중이 아니라면 카메라 전원을 내립니다!
  // 트래킹 중일 때 창을 닫으면 백그라운드 작동을 위해 카메라는 켜둡니다.
  if (!isTracking) {
    stopCamera();
    console.log("📷 웹캠 전원이 완전히 차단되었습니다.");
  }
}

export function startCalibration() {
  if (!currentLandmarks) {
    alert("아직 사람을 정확히 인식하지 못했습니다. 카메라 중앙에 서주세요.");
    return;
  }
  
  const baseBtn = document.getElementById('calib-base-btn');
  const toggleBtn = document.getElementById('calib-toggle-btn');
  const closeBtn = document.getElementById('calib-close-btn');
  
  baseBtn.disabled = true;
  toggleBtn.disabled = true; 
  closeBtn.disabled = true;
  
  let count = 10;
  baseBtn.innerText = `측정 중... (${count}초 남음)`;
  
  calibTimer = setInterval(() => {
    count--;
    if (count > 0) {
      baseBtn.innerText = `측정 중... (${count}초 남음)`;
    } else {
      clearInterval(calibTimer);
      
      baselineLandmarks = JSON.parse(JSON.stringify(currentLandmarks));
      
      baseBtn.innerText = "측정 완료! ✓";
      baseBtn.style.background = "rgba(0, 255, 127, 0.2)";
      baseBtn.style.borderColor = "#00ff7f";
      baseBtn.style.color = "#00ff7f";
      
      setTimeout(() => {
         baseBtn.disabled = false;
         toggleBtn.disabled = false;
         closeBtn.disabled = false;
         baseBtn.innerText = "기본 자세 재설정";
         baseBtn.style = "";
      }, 2000);
    }
  }, 1000);
}

export function togglePostureCorrection() {
  const toggleBtn = document.getElementById('calib-toggle-btn');
  
  if (!isTracking) {
    // 🟢 트래킹 켜기
    isTracking = true;
    toggleBtn.innerText = "자세 교정 종료";
    toggleBtn.style.background = "rgba(255, 60, 80, 0.2)"; 
    toggleBtn.style.borderColor = "#ff3c50";
    toggleBtn.style.color = "#ff3c50";
    
    startPostureTracking(); 
    console.log("▶️ 자세 교정 시작됨! (백그라운드 카메라 가동 중)");
    
    closeCalibration(); 
  } else {
    // 🔴 트래킹 끄기
    isTracking = false;
    toggleBtn.innerText = "자세 교정 시작";
    toggleBtn.style.background = ""; 
    toggleBtn.style.borderColor = "";
    toggleBtn.style.color = "";
    
    if (trackingTimer) {
      clearInterval(trackingTimer);
      trackingTimer = null;
    }
    
    if (window.setUIGlow) window.setUIGlow('idle');
    if (window.change3DPose) window.change3DPose('idle');
    
    console.log("⏹️ 자세 교정 종료됨!");
    
    // ✨ 추가: 자세 교정을 종료할 때도 창을 닫으면서 카메라를 확실하게 꺼줍니다.
    closeCalibration();
  }
}
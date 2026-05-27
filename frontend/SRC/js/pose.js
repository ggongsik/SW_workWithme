// ============================================================================
// js/pose.js
// MediaPipe를 이용한 자세 인식 및 좌표 웹소켓 전송 로직 
// ============================================================================

import { sendPoseData, sendCommand, isCalibrated, setCalibrated } from './network.js';

// 상태 변수 세팅 
let currentLandmarks = null;    // 현재 프레임의 랜드마크 좌표
let baselineLandmarks = null;   // 10초 캘리브레이션으로 저장된 기준 좌표

let calibCamera = null;         // MediaPipe 카메라 인스턴스
let calibTimer = null;          // 캘리브레이션 10초 타이머
let trackingTimer = null;       // 1초 단위 백그라운드 트래킹 타이머


// ============================================================================
// MediaPipe Pose 초기화 및 설정
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
// 자세 트래킹 및 좌표 전송 로직 
// ============================================================================
//자세 트래킹 및 ArrayBuffer 바이너리 전송 

const encodeCanvas = document.createElement('canvas');
encodeCanvas.width = 1080; 
encodeCanvas.height = 720;
const encodeCtx = encodeCanvas.getContext('2d', { willReadFrequently: true });

function startPostureTracking() {
  if (trackingTimer) clearInterval(trackingTimer);

  trackingTimer = setInterval(() => {
    if (!currentLandmarks) return;

    //좌표 데이터 추출
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
        const imageBuffer = await blob.arrayBuffer();
        sendPoseData(imageBuffer); 
      }, 'image/jpeg', 0.8); // 화질 80% (hd)JPEG
    }
  }, 200); 
}

// ============================================================================
// 외부로 내보내는 기능
// ============================================================================

export let isTracking = false; 

function stopCamera() {
  if (calibCamera) {
    calibCamera.stop();
    calibCamera = null;
  }
  const videoEl = document.getElementById('calib-video');
  if (videoEl && videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach(track => track.stop());
    videoEl.srcObject = null;
  }
}

export function openCalibration() {
  const overlay = document.getElementById('calib-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => overlay.style.opacity = '1', 10);
  
  const videoEl = document.getElementById('calib-video');
  
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

  if (!isTracking) {
    stopCamera();
    if (trackingTimer) {
      clearInterval(trackingTimer);
      trackingTimer = null;
    }

    console.log("웹캠 전원이 완전히 차단되었습니다.");
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

  sendCommand("start_calibration");
  
  const wasTracking = isTracking;
  if (!wasTracking) {
    startPostureTracking();
  }

  calibTimer = setInterval(() => {
    count--;
    if (count > 0) {
      baseBtn.innerText = `측정 중... (${count}초 남음)`;
    } else {
      clearInterval(calibTimer);
      
      baselineLandmarks = JSON.parse(JSON.stringify(currentLandmarks));
      
      sendCommand("stop_calibration");
      
      baseBtn.innerText = "측정 완료! ✓";
      baseBtn.style.background = "rgba(0, 255, 127, 0.2)";
      baseBtn.style.borderColor = "#00ff7f";
      baseBtn.style.color = "#00ff7f";

      if (!wasTracking && !isTracking) {
         if (trackingTimer) {
           clearInterval(trackingTimer);
           trackingTimer = null;
         }
      }
      
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
  if (!isCalibrated) {
    alert(" 측정된 기준 자세가 없습니다. '기본 자세 설정'을 먼저 진행해 주세요!");
    return; 
  }
  const toggleBtn = document.getElementById('calib-toggle-btn');
  
  if (!isTracking) {
    // 트래킹 켜기
    isTracking = true;
    toggleBtn.innerText = "자세 교정 종료";
    toggleBtn.style.background = "rgba(255, 60, 80, 0.2)"; 
    toggleBtn.style.borderColor = "#ff3c50";
    toggleBtn.style.color = "#ff3c50";
    
    startPostureTracking(); 
    console.log("▶️ 자세 교정 시작됨! (백그라운드 카메라 가동 중)");
    
    closeCalibration(); 
  } else {
    // 트래킹 끄기
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

    sendCommand("stop_session");

    setCalibrated(false);

    console.log("⏹️ 자세 교정 종료됨!");
    
    closeCalibration();
  }
}
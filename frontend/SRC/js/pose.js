// ============================================================================
// js/pose.js
// MediaPipe를 이용한 자세 인식 및 좌표 웹소켓 전송 로직 
// ============================================================================

import { isWebSocketOpen, sendPoseData, sendCommand } from './network.js';
import {
  noteDebugFrameSent,
  noteDebugTrackingHeartbeat,
  setDebugTrackingStatus,
} from './debug.js';

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
  modelComplexity: 0,
  smoothLandmarks: true, 
  minDetectionConfidence: 0.5, 
  minTrackingConfidence: 0.5
});

pose.onResults((results) => {
  currentLandmarks = results.poseLandmarks || null;
  noteDebugTrackingHeartbeat(results.poseLandmarks ? 'landmarks' : 'no_landmarks');
  
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

const POSTURE_SEND_INTERVAL_MS = 250;
const ENCODE_WIDTH = 480;
const ENCODE_HEIGHT = 360;
const JPEG_QUALITY = 0.6;
const encodeCanvas = document.createElement('canvas');
encodeCanvas.width = ENCODE_WIDTH;
encodeCanvas.height = ENCODE_HEIGHT;
const encodeCtx = encodeCanvas.getContext('2d', { willReadFrequently: true });
let isEncodingFrame = false;

function startPostureTracking() {
  if (trackingTimer) clearInterval(trackingTimer);
  setDebugTrackingStatus('running', { interval_ms: POSTURE_SEND_INTERVAL_MS });

  trackingTimer = setInterval(() => {
    if (!currentLandmarks) {
      noteDebugTrackingHeartbeat('waiting_landmarks');
      return;
    }
    if (!isWebSocketOpen()) {
      noteDebugTrackingHeartbeat('waiting_websocket');
      return;
    }
    if (isEncodingFrame) {
      noteDebugTrackingHeartbeat('encoding_busy');
      return;
    }

    const videoEl = document.getElementById('calib-video');
    if (videoEl && videoEl.videoWidth > 0) {
      isEncodingFrame = true;
      encodeCtx.drawImage(videoEl, 0, 0, encodeCanvas.width, encodeCanvas.height);
      
      encodeCanvas.toBlob(async (blob) => {
        try {
          if (!blob) return;
          const imageBuffer = await blob.arrayBuffer();
          if (sendPoseData(imageBuffer)) noteDebugFrameSent(imageBuffer.byteLength);
        } finally {
          isEncodingFrame = false;
        }
      }, 'image/jpeg', JPEG_QUALITY);
    } else {
      noteDebugTrackingHeartbeat('waiting_video');
    }
  }, POSTURE_SEND_INTERVAL_MS);
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
  setDebugTrackingStatus('camera_stopped');
}

export function openCalibration() {
  const overlay = document.getElementById('calib-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => overlay.style.opacity = '1', 10);
  
  const videoEl = document.getElementById('calib-video');
  
  if (!calibCamera) {
    calibCamera = new Camera(videoEl, {
      onFrame: async () => {
        try {
          await pose.send({ image: videoEl });
        } catch (error) {
          setDebugTrackingStatus('error', { message: error.message });
          throw error;
        }
      },
      width: 480, height: 360
    });
  }
  calibCamera.start().catch((error) => {
    setDebugTrackingStatus('error', { message: error.message });
    console.error('Camera start failed:', error);
  });
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
      setDebugTrackingStatus('stopped');
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

  if (!sendCommand("start_calibration")) {
    alert("서버 연결이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
    baseBtn.disabled = false;
    toggleBtn.disabled = false;
    closeBtn.disabled = false;
    return;
  }
  
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
           setDebugTrackingStatus('calibration_done');
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
      setDebugTrackingStatus('stopped');
    }
    
    if (window.setUIGlow) window.setUIGlow('idle');
    if (window.change3DPose) window.change3DPose('idle');

    sendCommand("stop_session");

    console.log("⏹️ 자세 교정 종료됨!");
    
    closeCalibration();
  }
}

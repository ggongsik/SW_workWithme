// ============================================================================
// js/pose.js
// MediaPipe를 이용한 자세 인식 및 좌표 웹소켓 전송 로직
// ============================================================================

import { initWebSocket, isWebSocketOpen, sendPoseData, sendCommand, isCalibrated, setCalibrated } from './network.js';
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

    drawConnectors(canvasCtx, results.poseLandmarks, POSE_CONNECTIONS, { color: '#39c5bb', lineWidth: 3 });
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
// 자세 트래킹 및 ArrayBuffer 바이너리 전송

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

async function ensureWebSocketReady() {
  if (isWebSocketOpen()) return true;

  try {
    await initWebSocket();
    return isWebSocketOpen();
  } catch (error) {
    console.error('WebSocket 준비 실패:', error);
    setDebugTrackingStatus('error', { message: error.message });
    return false;
  }
}

function waitForCalibrationComplete(timeoutMs = 30000) {
  if (isCalibrated) return Promise.resolve(null);

  return new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      cleanup();
      reject(new Error('서버의 캘리브레이션 완료 응답을 받지 못했습니다. 다시 시도해주세요.'));
    }, timeoutMs);

    function cleanup() {
      window.clearTimeout(timeoutId);
      window.removeEventListener('posture:calibration-complete', onComplete);
      window.removeEventListener('posture:server-error', onError);
    }

    function onComplete(event) {
      cleanup();
      resolve(event.detail || null);
    }

    function onError(event) {
      const detail = event.detail || {};
      const calibrationErrors = new Set([
        'INSUFFICIENT_SAMPLES',
        'NOT_CALIBRATING',
        'INVALID_FRAME',
        'NOT CALIBRATED',
      ]);

      if (!calibrationErrors.has(detail.code)) return;
      cleanup();
      reject(new Error(detail.message || detail.code || '캘리브레이션에 실패했습니다.'));
    }

    window.addEventListener('posture:calibration-complete', onComplete);
    window.addEventListener('posture:server-error', onError);
  });
}

function stopCalibrationFrameSender(status = 'calibration_done') {
  if (trackingTimer) {
    clearInterval(trackingTimer);
    trackingTimer = null;
    setDebugTrackingStatus(status);
  }
}

export function stopCamera() {
  // 1. MediaPipe 겉핥기 정지
  if (calibCamera) {
    calibCamera.stop();
    calibCamera = null;
  }

  // 2. HTML 비디오 태그 정지
  const videoEl = document.getElementById('calib-video');
  if (videoEl && videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach(track => track.stop());
    videoEl.srcObject = null;
  }

  if (window.globalCameraStreams) {
    window.globalCameraStreams.forEach(stream => {
      stream.getTracks().forEach(track => {
        track.stop();
        console.log(" 숨어있던 MediaPipe 웹캠 끄기 ");
      });
    });
    window.globalCameraStreams = [];
  }

  isTracking = false;
  setDebugTrackingStatus('camera_stopped');
}

export function openCalibration() {
  const overlay = document.getElementById('calib-overlay');
  overlay.style.display = 'flex';
  setTimeout(() => overlay.style.opacity = '1', 10);
  initWebSocket().catch((error) => {
    console.warn('캘리브레이션 WebSocket 준비 대기:', error);
  });

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

export async function startCalibration() {
  if (!currentLandmarks) {
    alert("아직 사람을 정확히 인식하지 못했습니다. 카메라 중앙에 서주세요.");
    return;
  }

  const baseBtn = document.getElementById('calib-base-btn');
  const toggleBtn = document.getElementById('calib-toggle-btn');
  const closeBtn = document.getElementById('calib-close-btn');
  setCalibrated(false);
  baselineLandmarks = null;

  baseBtn.disabled = true;
  toggleBtn.disabled = true;
  closeBtn.disabled = true;

  baseBtn.innerText = "서버 연결 확인 중...";

  if (!await ensureWebSocketReady()) {
    alert("서버 연결이 아직 준비되지 않았습니다. Firebase 로그인 상태와 백엔드 실행 여부를 확인한 뒤 다시 시도해주세요.");
    baseBtn.disabled = false;
    toggleBtn.disabled = false;
    closeBtn.disabled = false;
    baseBtn.innerText = "기본 자세 설정";
    return;
  }

  let count = 10;
  baseBtn.innerText = `측정 중... (${count}초 남음)`;

  if (!sendCommand("start_calibration")) {
    alert("서버 연결이 아직 준비되지 않았습니다. 잠시 후 다시 시도해주세요.");
    baseBtn.disabled = false;
    toggleBtn.disabled = false;
    closeBtn.disabled = false;
    baseBtn.innerText = "기본 자세 설정";
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

      finishCalibration({ baseBtn, toggleBtn, closeBtn, wasTracking });
    }
  }, 1000);
}

async function finishCalibration({ baseBtn, toggleBtn, closeBtn, wasTracking }) {
  baselineLandmarks = currentLandmarks ? JSON.parse(JSON.stringify(currentLandmarks)) : null;
  baseBtn.innerText = "서버 기준값 확인 중...";

  const completion = waitForCalibrationComplete();
  if (!sendCommand("stop_calibration")) {
    setCalibrated(false);
    stopCalibrationFrameSender('error');
    alert("서버 연결이 끊겨 캘리브레이션을 완료하지 못했습니다. 다시 시도해주세요.");
    baseBtn.disabled = false;
    toggleBtn.disabled = false;
    closeBtn.disabled = false;
    baseBtn.innerText = "기본 자세 설정";
    return;
  }

  try {
    await completion;
    baseBtn.innerText = "측정 완료! ✓";
    baseBtn.style.background = "rgba(57, 197, 187, 0.18)";
    baseBtn.style.borderColor = "#39c5bb";
    baseBtn.style.color = "#9af3e6";

    if (!wasTracking && !isTracking) {
      stopCalibrationFrameSender('calibration_done');
    }

    setTimeout(() => {
      baseBtn.disabled = false;
      toggleBtn.disabled = false;
      closeBtn.disabled = false;
      baseBtn.innerText = "기본 자세 재설정";
      baseBtn.style = "";
    }, 1200);
  } catch (error) {
    setCalibrated(false);
    baselineLandmarks = null;
    if (!wasTracking && !isTracking) {
      stopCalibrationFrameSender('error');
    }
    alert(`캘리브레이션 실패: ${error.message}`);
    baseBtn.disabled = false;
    toggleBtn.disabled = false;
    closeBtn.disabled = false;
    baseBtn.innerText = "기본 자세 다시 설정";
    baseBtn.style = "";
  }
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
    sendCommand("start_monitoring");
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

    setCalibrated(false);

    console.log("⏹️ 자세 교정 종료됨!");

    closeCalibration();
  }
}

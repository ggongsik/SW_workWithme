// ============================================================================
// js/network.js
// 백엔드 통신 및 거북목 지속 시간에 따른 상태(idle/warn/alert) 제어
// ============================================================================

import { getUserToken } from './firebase.js';
import { fetchAndShowReport, setUIGlow } from './ui.js';
import { change3DPose } from './character.js';
import {
  getForcedDebugState,
  noteDebugPoseResult,
  noteDebugWebSocket,
  setDebugPostureState,
  setDebugWebSocketState,
} from './debug.js';

let ws = null;
let wsOpenPromise = null;
const LOCAL_DEV_AUTH_TOKEN = 'workwithme-local-admin';

// 거북목 지속 시간 추적 변수
let turtleStartTime = null;
let currentPoseState = 'idle';
export let isCalibrated = false;

function isLocalHost() {
  return ['localhost', '127.0.0.1', '::1', ''].includes(window.location.hostname);
}

export async function getBackendAuthToken() {
  const token = await getUserToken();
  if (token) return token;

  if (isLocalHost() && localStorage.getItem('lofi_user_id') === 'admin') {
    return LOCAL_DEV_AUTH_TOKEN;
  }

  return null;
}

export function getBackendApiBase() {
  const protocol = window.location.protocol === 'https:' ? 'https' : 'http';
  const host = window.POSTURE_API_HOST || `${window.location.hostname || 'localhost'}:8000`;
  return `${protocol}://${host}`;
}

function emitPostureEvent(name, detail) {
  window.dispatchEvent(new CustomEvent(`posture:${name}`, { detail }));
}

// 상태 전환 임계값 (분 단위)
// 개발 중에 테스트할 때는 이 값을 (1/60), (5/60) 처럼 초 단위로 바꿔서 테스트
const WARN_THRESHOLD_MIN = 5/60; // 5초
const ALERT_THRESHOLD_MIN = 10/60; // 10초

export async function initWebSocket() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    return ws;
  }
  if (ws && ws.readyState === WebSocket.CONNECTING && wsOpenPromise) {
    return wsOpenPromise;
  }

  const token = await getBackendAuthToken();
  if (!token) {
    setDebugWebSocketState('auth_required');
    noteDebugWebSocket('ws-error', 'auth token missing');
    throw new Error('Firebase 로그인 또는 로컬 admin 개발 인증이 필요합니다.');
  }

  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
  const host = window.POSTURE_WS_HOST || `${window.location.hostname || 'localhost'}:8000`;
  const wsURL = `${protocol}://${host}/ws/posture?token=${encodeURIComponent(token)}`;
  ws = new WebSocket(wsURL);
  ws.binaryType = 'arraybuffer';
  setDebugWebSocketState('connecting');
  noteDebugWebSocket('ws-out', 'connect', { url: wsURL.replace(/token=[^&]+/, 'token=***') });

  wsOpenPromise = new Promise((resolve, reject) => {
    const timeoutId = window.setTimeout(() => {
      setDebugWebSocketState('timeout');
      noteDebugWebSocket('ws-error', 'connection timeout');
      reject(new Error('WebSocket 연결 시간이 초과되었습니다.'));
      if (ws && ws.readyState === WebSocket.CONNECTING) ws.close();
      wsOpenPromise = null;
    }, 7000);

    ws.onopen = () => {
      window.clearTimeout(timeoutId);
      console.log('WebSocket Connected');
      setDebugWebSocketState('open');
      wsOpenPromise = null;
      resolve(ws);
    };
    ws.onerror = (error) => {
      window.clearTimeout(timeoutId);
      console.error('WebSocket Error:', error);
      setDebugWebSocketState('error');
      noteDebugWebSocket('ws-error', 'socket error', { type: error.type });
      wsOpenPromise = null;
      reject(new Error('WebSocket 연결에 실패했습니다.'));
    };
    ws.onclose = (event) => {
      window.clearTimeout(timeoutId);
      if (wsOpenPromise) {
        reject(new Error(`WebSocket 연결이 닫혔습니다. code=${event.code || 'unknown'}`));
      }
      ws = null;
      wsOpenPromise = null;
      turtleStartTime = null;
      currentPoseState = 'idle';
      setDebugWebSocketState('closed');
      noteDebugWebSocket('ws-in', 'closed', { code: event.code, reason: event.reason });
    };
  });

  ws.onmessage = (event) => {
    try {
      let dataStr = event.data;
      if (event.data instanceof ArrayBuffer) {
        dataStr = new TextDecoder('utf-8').decode(event.data);
      }

      const data = JSON.parse(dataStr);
      noteDebugPoseResult(data);

      // 백엔드에서 보낸 DetectionResultMsg 처리
      if (data && data.hasOwnProperty('is_turtle')) {

        if (data.is_turtle === false) {
          // 1. 정상 자세로 돌아온 경우
          turtleStartTime = null; // 누적 타이머 즉시 초기화
          changeUIState('idle');

        } else {
          // 2. 거북목 자세 감지 중인 경우 (is_turtle: true)
          if (turtleStartTime === null) {
            turtleStartTime = Date.now(); // 거북목이 시작된 최초 시간 기록
          }

          // 거북목이 몇 분째 지속되고 있는지 계산
          const durationMs = Date.now() - turtleStartTime;
          const durationMin = durationMs / (1000 * 60);

          // 지속 시간에 따라 프론트엔드 UI 상태 결정
          if (durationMin >= ALERT_THRESHOLD_MIN) {
            changeUIState('alert'); // alert 임계 초과 -> 빨간색 (2단계)
          } else if (durationMin >= WARN_THRESHOLD_MIN) {
            changeUIState('warn');  // warn 임계 초과 -> 주황색 (1단계)
          } else {
            // 거북목이긴 하지만 아직 임계치가 안 지났으므로 '봐줌' (idle 유지)
            changeUIState('idle');
          }
        }
      }
      else if (data && data.hasOwnProperty('baseline_delta_depth')) {
        isCalibrated = true;
        noteDebugWebSocket('ws-in', 'calibration_complete', data);
        emitPostureEvent('calibration-complete', data);
      }
      else if (data && data.type === 'error') {
        console.warn("서버 오류 응답:", data);
        noteDebugWebSocket('ws-error', data.code || 'server_error', data);
        emitPostureEvent('server-error', data);
      }
      else if (data && (data.type === 'session_ended' || data.type === 'SessionEnded' || data.hasOwnProperty('report_id'))) {
        console.log(" 세션 종료 및 리포트 ID 수신:", data.report_id);

        isCalibrated = false;

        if (data.report_id) {
            fetchAndShowReport(data.report_id);
        } else {
            alert("저장된 리포트 데이터가 없습니다.");
            if (window.restoreUI) window.restoreUI();
        }
      }
    } catch (err) {
      console.error("서버 응답 파싱 실패:", err);
    }
  };

  return wsOpenPromise;
}

// 중복 렌더링을 막기 위한 상태 변경 헬퍼 함수
function changeUIState(newState) {
  const forcedState = getForcedDebugState();
  const effectiveState = forcedState || newState;
  if (currentPoseState === newState) return; // 이미 같은 상태면 무시

  currentPoseState = newState;
  setDebugPostureState(newState, { effective_state: effectiveState, forced: !!forcedState });
  console.log(` 거북목 지속 상태 변경: ${newState}`);

  // 3D 캐릭터 포즈 및 화면 테두리 네온 효과 변경
  if (forcedState) return;
  change3DPose(effectiveState);
  setUIGlow(effectiveState);
}

//
export function isWebSocketOpen() {
  return !!(ws && ws.readyState === WebSocket.OPEN);
}

export function sendPoseData(buffer) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(buffer);
    return true;
  }
  noteDebugWebSocket('ws-drop', 'frame skipped: websocket not open');
  return false;
}

//  백엔드에 텍스트 제어 메시지를 보내는 함수 추가
export function sendCommand(commandType) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const msg = JSON.stringify({ type: commandType });
    ws.send(msg);
    console.log(`[웹소켓 명령 전송] ${msg}`);
    noteDebugWebSocket('ws-out', commandType);
    return true;
  }
  noteDebugWebSocket('ws-drop', `command skipped: ${commandType}`);
  return false;
}

export function setCalibrated(status) {
  isCalibrated = status;
}

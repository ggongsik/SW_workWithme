// ============================================================================
// js/network.js
// 백엔드 통신 및 거북목 지속 시간에 따른 상태(idle/warn/alert) 제어
// ============================================================================

import { getUserToken } from './firebase.js';
let ws = null; 

// 거북목 지속 시간 추적 변수
let turtleStartTime = null; 
let currentPoseState = 'idle'; 

// 상태 전환 임계값 (분 단위)
// 개발 중에 테스트할 때는 이 값을 (1/60), (5/60) 처럼 초 단위로 바꿔서 테스트
const WARN_THRESHOLD_MIN = 1; // 1분
const ALERT_THRESHOLD_MIN = 5; // 5분

export async function initWebSocket() {
  const token = await getUserToken();
  wsURL = new WebSocket('ws://localhost:8000/ws/posture'); // 실제 백엔드 주소로 바꿔주세요
  if (token) {
      wsURL += `?token=${token}`;
  }
  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer'; 
  
  ws.onopen = () => console.log('WebSocket Connected');
  ws.onerror = (error) => console.error('WebSocket Error:', error);
  
  ws.onmessage = (event) => {
    try {
      let dataStr = event.data;
      if (event.data instanceof ArrayBuffer) {
        dataStr = new TextDecoder('utf-8').decode(event.data);
      }
      
      const data = JSON.parse(dataStr);
      
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
            changeUIState('alert'); // 5분 이상 지속 -> 빨간색 (2단계)
          } else if (durationMin >= WARN_THRESHOLD_MIN) {
            changeUIState('warn');  // 1분 이상 지속 -> 주황색 (1단계)
          } else {
            // 거북목이긴 하지만 아직 1분이 안 지났으므로 '봐줌' (idle 유지)
            changeUIState('idle');  
          }
        }
      }
    } catch (err) {
      console.error("서버 응답 파싱 실패:", err);
    }
  };
}

// 중복 렌더링을 막기 위한 상태 변경 헬퍼 함수
function changeUIState(newState) {
  if (currentPoseState === newState) return; // 이미 같은 상태면 무시
  
  currentPoseState = newState;
  console.log(` 거북목 지속 상태 변경: ${newState}`);
  
  // 3D 캐릭터 포즈 및 화면 테두리 네온 효과 변경
  if (window.setPose) window.setPose(newState); // index.html의 캐릭터 포즈 함수
  if (window.setUIGlow) window.setUIGlow(newState); // ui.js의 네온 글로우 함수
}

// 
export function sendPoseData(buffer) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(buffer); 
  }
}

//  백엔드에 텍스트 제어 메시지를 보내는 함수 추가
export function sendCommand(commandType) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    const msg = JSON.stringify({ type: commandType });
    ws.send(msg);
    console.log(`[웹소켓 명령 전송] ${msg}`);
  }
}
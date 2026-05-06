// ============================================================================
// js/network.js
// 백엔드 서버와의 웹소켓 연결, ArrayBuffer 바이너리 데이터 전송 및 결과 수신
// ============================================================================

let ws = null; 

export function initWebSocket() {
  ws = new WebSocket('ws://localhost:8080'); // 실제 백엔드 주소로 변경하세요
  
  // ✨ 중요: 웹소켓이 바이너리 데이터를 ArrayBuffer 형태로 다루도록 설정
  ws.binaryType = 'arraybuffer'; 
  
  ws.onopen = () => console.log('WebSocket Connected');
  ws.onerror = (error) => console.error('WebSocket Error:', error);
  
  ws.onmessage = (event) => {
    try {
      let dataStr = event.data;
      
      // 서버가 바이너리로 응답했을 경우 텍스트로 디코딩
      if (event.data instanceof ArrayBuffer) {
        dataStr = new TextDecoder('utf-8').decode(event.data);
      }
      
      const data = JSON.parse(dataStr);
      
      if (data && data.state) {
        const stateName = data.state === "warning" ? "warn" : data.state;

        if (window.change3DPose) window.change3DPose(stateName);
        if (window.setUIGlow) window.setUIGlow(stateName);
        
        console.log(" 백엔드 판별 결과 적용:", stateName);
      }
    } catch (err) {
      console.error("서버 응답 파싱 실패:", err);
    }
  };
}

// pose.js에서 만든 ArrayBuffer를 그대로 서버로 전송합니다 (바이너리 프레임)
export function sendPoseData(buffer) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(buffer); 
  }
}
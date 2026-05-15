// ============================================================================
// js/ui.js
// 로그인, UI 토글, 패널 제어, 환경설정, 드래그 로직, 시계 및 PiP/네온 효과
// ============================================================================

let timeFmt = 12; // 시간 형식 (12시/24시)

// PiP 모드와 메인 UI가 공유할 현재 상태 변수
export let currentGlowState = 'idle';

// ── 1. 시계 로직 (내부 전용) ──
function updateClock() {
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');
  if(!timeEl || !dateEl) return;

  const d = new Date();
  const days = ['일','월','화','수','목','금','토'];
  let h = d.getHours();
  let m = d.getMinutes();
  let suffix = '';
  
  if (timeFmt === 12) {
    suffix = h < 12 ? ' AM' : ' PM';
    h = h % 12 || 12;
  }
  
  timeEl.textContent = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + suffix;
  dateEl.textContent = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + '(' + days[d.getDay()] + ')';
}

// ── js/ui.js : makeDraggable 함수 수정 ──
function makeDraggable(el, handle) {
  handle = handle || el;
  handle.style.touchAction = 'none'; 

  let startMouseX = 0, startMouseY = 0;
  let dragOverlay = null;

  handle.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    
    // ✨ 1. 전역 변수로 "나 지금 드래그 중이야!" 라고 3D 화면에 소리칩니다.
    window.isUIDragging = true; 

    // 간섭 방지 유리판
    dragOverlay = document.createElement('div');
    dragOverlay.style.cssText = 'position: fixed; inset: 0; z-index: 999999; cursor: grabbing; touch-action: none;';
    document.body.appendChild(dragOverlay);

    const rect = el.getBoundingClientRect();
    el.style.transform = 'none';
    el.style.left = rect.left + 'px';
    el.style.top = rect.top + 'px';
    el.style.right = 'auto';
    el.style.bottom = 'auto';
    el.style.willChange = 'transform'; 

    startMouseX = e.clientX; 
    startMouseY = e.clientY;

    const onMove = e2 => {
      const dx = e2.clientX - startMouseX;
      const dy = e2.clientY - startMouseY;
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };

    const onUp = () => {
      // ✨ 2. 마우스를 놓으면 다시 3D 렌더링을 켭니다.
      window.isUIDragging = false; 

      const finalRect = el.getBoundingClientRect();
      el.style.transform = 'none';
      el.style.left = Math.max(0, finalRect.left) + 'px';
      el.style.top = Math.max(0, finalRect.top) + 'px';
      el.style.willChange = 'auto'; 
      
      if (dragOverlay && dragOverlay.parentNode) {
        dragOverlay.parentNode.removeChild(dragOverlay);
      }
      
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
  });
}

// DOM이 로드되면 드래그 요소들과 시계, 그리고 메인 화면 네온 UI 세팅
window.addEventListener('DOMContentLoaded', () => {
  setInterval(updateClock, 1000); 
  updateClock();

  const pomoDrag = document.getElementById('pomo-drag');
  if(pomoDrag) makeDraggable(pomoDrag);

  let topZ = 15;
  document.querySelectorAll('.panel').forEach(panel => {
    const header = panel.querySelector('.panel-header');
    if (header) makeDraggable(panel, header);
    panel.addEventListener('mousedown', () => {
      topZ++;
      panel.style.zIndex = topZ;
    });
  });

  // ✨ 메인 화면 가장자리 네온 효과를 위한 CSS 및 오버레이 동적 추가
  /*const style = document.createElement('style');
  style.innerHTML = `
    #glow-overlay { position: fixed; inset: 0; pointer-events: none; z-index: 9999; }
    @keyframes glowWarn {
      0%, 100% { box-shadow: inset 0 0 20px rgba(251,146,60,0.3), inset 0 0 10px 12px rgba(251,146,60,0.3); }
      50% { box-shadow: inset 0 0 40px rgba(251,146,60,0.9), inset 0 0 25px 24px rgba(251,146,60,0.9); }
    }
    @keyframes glowAlert {
      0%, 100% { box-shadow: inset 0 0 30px rgba(248,113,113,0.7), inset 0 0 20px 20px rgba(248,113,113,0.7); }
      50% { box-shadow: inset 0 0 60px rgba(248,113,113,1), inset 0 0 35px 35px rgba(248,113,113,1); }
    }
    .glow-warn { animation: glowWarn 2s ease-in-out infinite; }
    .glow-alert { animation: glowAlert 0.3s ease-in-out infinite; }
  `;
  document.head.appendChild(style);
  
  const glowDiv = document.createElement('div');
  glowDiv.id = 'glow-overlay';
  document.body.appendChild(glowDiv);*/
});


// ============================================================================
// 🌟 3. 외부로 내보내는 기능들 (export)
// ============================================================================

export function checkLogin() { /* ... 기존과 동일 ... */ 
  const id = document.getElementById("lofi-id").value;
  const pw = document.getElementById("lofi-pw").value;
  if (id === "admin" && pw === "1234") {
    const overlay = document.getElementById("login-overlay");
    overlay.style.opacity = "0"; 
    setTimeout(() => { overlay.style.display = "none"; }, 500);
  } else {
    alert("아이디는 admin, 비밀번호는 1234를 입력해주세요.");
  }
}

export function logout() { /* ... 기존과 동일 ... */
  const isConfirmed = confirm("정말 종료하시겠습니까? (로그아웃됩니다)");
  if (!isConfirmed) return; 
  if (window.togglePlay && document.getElementById('play-btn').textContent === '⏸') {
    window.togglePlay(); 
  }
  document.getElementById("lofi-id").value = "";
  document.getElementById("lofi-pw").value = "";
  const overlay = document.getElementById("login-overlay");
  overlay.style.display = "flex"; 
  setTimeout(() => overlay.style.opacity = "1", 10);
}

export function togglePanel(id, btn) {
  const p = document.getElementById('panel-' + id);
  const wasOpen = p.classList.contains('open');
  p.classList.toggle('open', !wasOpen);
  if (btn && btn.classList) btn.classList.toggle('on', !wasOpen);
}

export function closePanel(id, btnId) {
  document.getElementById('panel-' + id).classList.remove('open');
  const b = document.getElementById(btnId);
  if (b) b.classList.remove('on');
}

export function hideUI() {
  ['ui-layer','sidebar','pomo-drag','bottom-bar-drag'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) { el.style.opacity='0'; el.style.pointerEvents='none'; }
  });
  document.querySelectorAll('.panel').forEach(p=>{p.style.opacity='0'; p.style.pointerEvents='none';});
  document.getElementById('tap-restore').style.display='block';
}

export function restoreUI() {
  ['ui-layer','sidebar','pomo-drag','bottom-bar-drag'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) { el.style.opacity='1'; el.style.pointerEvents=''; }
  });
  document.querySelectorAll('.panel').forEach(p=>{p.style.opacity='1'; p.style.pointerEvents='';});
  document.getElementById('tap-restore').style.display='none';
}

export function setTimeFmt(fmt, el) {
  timeFmt = fmt;
  document.querySelectorAll('#stab-gen .tpill').forEach(p => p.classList.remove('on'));
  el.classList.add('on');
  updateClock();
}

export function setTab(tab, el) {
  document.querySelectorAll('.stab').forEach(s => s.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('stab-gen').style.display = tab === 'gen' ? 'block' : 'none';
  document.getElementById('stab-audio').style.display = tab === 'audio' ? 'block' : 'none';
}



// ============================================================================
// 🌟 4. 네온 효과 및 캔버스 기반 PiP 모드
// ============================================================================
let isPipActive = false;
let pipVideo = null;
let pipCanvas = null;
let pipCtx = null;

// 외부(콘솔, 웹소켓)에서 상태를 바꿀 때 호출할 함수
export function setUIGlow(state) {
  currentGlowState = state; // PiP 렌더링 루프에 상태 전달
  
  // 메인 화면 전체의 테두리 네온 효과도 여기서 조작할 수 있습니다!
  // (HTML에 <div id="warning-border"></div> 같은 요소가 있다고 가정한 예시입니다)
  const screenBorder = document.getElementById('warning-border'); 
  if (screenBorder) {
    if (state === 'idle') {
      screenBorder.style.boxShadow = 'none';
    } else if (state === 'warn' || state === 'caution') {
      // 주황색 경고
      screenBorder.style.boxShadow = 'inset 0 0 50px rgba(251, 146, 60, 0.6)';
    } else if (state === 'alert') {
      // 빨간색 위험
      screenBorder.style.boxShadow = 'inset 0 0 100px rgba(248, 113, 113, 0.9)';
    }
  }
  
  console.log(`✨ UI 상태가 변경되었습니다: ${state}`);
}

// PiP 토글 기능
export async function togglePiP() {
  const mainCanvas = document.getElementById('bg-canvas');
  if (!mainCanvas) {
    alert('3D 캔버스가 렌더링되지 않았습니다.');
    return;
  }

  // HTML을 더럽히지 않도록 메모리상에서 비디오/캔버스 요소를 동적 생성[cite: 6]
  if (!pipVideo) {
    pipVideo = document.createElement('video');
    pipVideo.autoplay = true;
    pipVideo.muted = true;
    pipVideo.playsInline = true;
    
    pipCanvas = document.createElement('canvas');
    pipCtx = pipCanvas.getContext('2d');
    
    pipVideo.addEventListener('leavepictureinpicture', () => {
      isPipActive = false;
    });
  }

  try {
    if (document.pictureInPictureElement) {
      await document.exitPictureInPicture();
      isPipActive = false;
    } else {
      isPipActive = true;
      
      // 합성된 캔버스 화면을 스트림으로 캡처 (30fps)[cite: 6]
      const stream = pipCanvas.captureStream(30);
      pipVideo.srcObject = stream;
      
      pipVideo.onloadedmetadata = async () => {
        await pipVideo.play();
        await pipVideo.requestPictureInPicture();
      };
      
      // PiP 렌더링 루프 시작
      renderPipLoop(mainCanvas);
    }
  } catch (error) {
    console.error("PIP 모드 실행 실패:", error);
    isPipActive = false;
  }
}

let lastPipRenderTime = 0;
const PIP_FPS_LIMIT = 15; // ✨ 최적화 3: 15프레임으로 제한 (보조창이므로 충분함)
const PIP_INTERVAL = 1000 / PIP_FPS_LIMIT;

// PiP 캔버스의 가로 해상도를 480px로 고정하여 픽셀 연산량 90% 감소
const PIP_TARGET_WIDTH = 480; 

function renderPipLoop(mainCanvas) {
  if (!isPipActive) return;
  requestAnimationFrame(() => renderPipLoop(mainCanvas));

  const now = performance.now();
  const delta = now - lastPipRenderTime;

  if (delta < PIP_INTERVAL) return;
  lastPipRenderTime = now - (delta % PIP_INTERVAL);

  // 원본 캔버스의 비율을 계산
  const aspect = mainCanvas.height / mainCanvas.width;
  const targetHeight = PIP_TARGET_WIDTH * aspect;

  // PiP 캔버스가 작게 세팅되어 있지 않다면 한 번만 리사이징
  if (pipCanvas.width !== PIP_TARGET_WIDTH) {
    pipCanvas.width = PIP_TARGET_WIDTH;
    pipCanvas.height = targetHeight;
  }

  // 무거운 원본 화면을 작은 해상도로 압축해서 복사 (매우 가벼움)
  pipCtx.clearRect(0, 0, pipCanvas.width, pipCanvas.height);
  pipCtx.drawImage(mainCanvas, 0, 0, pipCanvas.width, pipCanvas.height);


  // 네온 테두리 효과 그리기
  if (currentGlowState !== 'idle') {
    const time = Date.now();
    let r, g, b, pulse;
    
    if (currentGlowState === 'caution' || currentGlowState === 'warn') {
      pulse = Math.abs(Math.sin(time / 400));
      r = 251; g = 146; b = 60; // 주황색 (Warn)
    } else {
      pulse = Math.abs(Math.sin(time / 150));
      r = 248; g = 113; b = 113; // 빨간색 (Alert)
    }

    // 깜빡임 강도 (최소 0.4 ~ 최대 1.0)
    const baseAlpha = 0.4 + pulse * 0.6;

    // ✨ 3겹 레이어 기법: 바깥쪽의 두꺼운 선부터 안쪽의 얇은 선으로 덮어 그립니다.
    const layers = [
      // 1. 가장 넓게 퍼지는 은은한 빛 (두께 48px)
      { width: 48, alpha: baseAlpha * 0.25, color: `${r}, ${g}, ${b}` }, 
      // 2. 중간 굵기의 진한 후광 (두께 20px)
      { width: 20, alpha: baseAlpha * 0.65, color: `${r}, ${g}, ${b}` }, 
      // 3. 가장 안쪽의 쨍한 중심선 (두께 6px) - Alert 상태일 땐 진짜 네온처럼 흰색 코어 사용
      { width: 6,  alpha: baseAlpha,        color: currentGlowState === 'alert' || currentGlowState === 'warning' ? '255, 230, 230' : `${r}, ${g}, ${b}` }
    ];

    layers.forEach(layer => {
      pipCtx.lineWidth = layer.width;
      pipCtx.strokeStyle = `rgba(${layer.color}, ${layer.alpha})`;
      
      // 선이 캔버스 밖으로 잘리지 않게 정확히 안쪽으로 밀어넣음
      const offset = layer.width / 2;
      pipCtx.strokeRect(offset, offset, pipCanvas.width - layer.width, pipCanvas.height - layer.width);
    });
  }
} 
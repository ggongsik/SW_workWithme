// ============================================================================
// js/ui.js
// 로그인, UI 토글, 패널 제어, 환경설정, 드래그 로직, 시계 및 PiP/네온 효과
// ============================================================================

let timeFmt = 12; // 시간 형식 (12시/24시)

// PiP 모드와 메인 UI가 공유할 현재 상태 변수
export let currentGlowState = 'idle';

// ── 시계 로직  ──
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

//  드래그기능
function makeDraggable(el, handle) {
  handle = handle || el;
  handle.style.touchAction = 'none'; 

  let startMouseX = 0, startMouseY = 0;
  let dragOverlay = null;

  handle.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input, textarea, select, [contenteditable]')) return;
    e.preventDefault();
    
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
      // 마우스를 놓으면 다시 3D 렌더링을 켭니다.
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
});


// ============================================================================
// 외부로 내보내는 기능들 (export)
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

export function logout() { 
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
// 네온 효과 및 Document PiP 모드
// ============================================================================

export let pipWindow = null;

// 외부(콘솔, 웹소켓)에서 상태를 바꿀 때 호출할 함수
export function setUIGlow(state) {
  currentGlowState = state; 
  
  // 메인 화면 전체 테두리 네온 효과 조작
  const screenBorder = document.getElementById('warning-border'); 
  if (screenBorder) {
    if (state === 'idle') {
      screenBorder.style.boxShadow = 'none';
    } else if (state === 'warn' || state === 'caution') {
      screenBorder.style.boxShadow = 'inset 0 0 50px rgba(251, 146, 60, 0.6)';
    } else if (state === 'alert') {
      screenBorder.style.boxShadow = 'inset 0 0 100px rgba(248, 113, 113, 0.9)';
    }
  }
  console.log(` UI 상태가 변경되었습니다: ${state}`);
}


// PiP 내부 네온 테두리 애니메이션
function setupPipNeon(pw) {
  const neon = pw.document.getElementById('pip-neon');
  if (!neon) return;

  function neonLoop() {
    if (!pw || pw.closed) return;
    pw.requestAnimationFrame(neonLoop);

    if (currentGlowState === 'idle') {
      neon.style.border = 'none';
      neon.style.boxShadow = 'none';
      return;
    }

    const t = Date.now();
    if (currentGlowState === 'warn' || currentGlowState === 'caution') {
      // 주황색 경고 (Warn)
      const a = 0.4 + Math.abs(Math.sin(t / 400)) * 0.6;
      const glow = 12 + Math.abs(Math.sin(t / 400)) * 18;
      const c = `rgba(251,146,60,${a})`;
      neon.style.border = `2px solid ${c}`;
      neon.style.boxShadow = `inset 0 0 ${glow}px ${c}, 0 0 ${glow}px ${c}, inset 0 0 ${glow * 2}px rgba(251,146,60,${a * 0.3})`;
    } else if (currentGlowState === 'alert') {
      // 빨간색 위험 (Alert)
      const a = 0.6 + Math.sin(t / 150) * 0.4;
      const glow = 20 + Math.sin(t / 150) * 20;
      const c = `rgba(248,113,113,${a})`;
      neon.style.border = `3px solid ${c}`;
      neon.style.boxShadow = `inset 0 0 ${glow}px ${c}, 0 0 ${glow}px ${c}, inset 0 0 ${glow * 2}px rgba(248,113,113,${a * 0.3})`;
    }
  }
  neonLoop(); // 애니메이션 시작
}


// Document PiP 토글 기능
export async function togglePiP() {
  if (!('documentPictureInPicture' in window)) {
    alert('Document PiP API를 지원하지 않는 브라우저입니다.');
    return;
  }

  try {
    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
      return;
    }

    // 창 크기 조절 
    pipWindow = await documentPictureInPicture.requestWindow({ width: 320, height: 240 });

    // CSS 복사 로직 
    [...document.styleSheets].forEach(sheet => {
      try {
        const css = [...sheet.cssRules].map(r => r.cssText).join('');
        const s = document.createElement('style');
        s.textContent = css;
        pipWindow.document.head.appendChild(s);
      } catch (e) {
        if (sheet.href) {
          const link = document.createElement('link');
          link.rel = 'stylesheet'; link.href = sheet.href;
          pipWindow.document.head.appendChild(link);
        }
      }
    });

    const wrap = pipWindow.document.createElement('div');
    wrap.className = 'pip-wrap';
    wrap.innerHTML = `
      <div class="pip-canvas-container" id="pip-3d" style="position: absolute; inset: 0; z-index: 0;"></div>
      <div class="pip-neon" id="pip-neon" style="position: absolute; inset: 0; pointer-events: none; z-index: 2;"></div>
      
      <div class="pip-overlay" style="z-index: 3;">
        <div class="pip-player-box" style="flex-direction: column; height: auto; gap: 4px; align-items: stretch;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <div id="player-info" style="flex: 1; min-width: 0;">
              <div id="pip-song-title">🎵 음악을 선택하세요</div>
              <div id="pip-song-artist">대기 중...</div>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; flex-shrink: 0;">
              <button class="pip-btn" id="pip-prev">⏮</button>
              <button class="pip-btn" id="pip-play" style="font-size: 18px;">▶</button>
              <button class="pip-btn" id="pip-next">⏭</button>
            </div>
          </div>
          <div id="pip-player-progress">
            <div id="pip-player-bar"></div>
          </div>
        </div>
      </div>
    `;
    pipWindow.document.body.appendChild(wrap);

    // 버튼 이벤트 연결
    pipWindow.document.getElementById('pip-prev').addEventListener('click', () => window.prevTrack?.());
    pipWindow.document.getElementById('pip-play').addEventListener('click', () => window.togglePlay?.());
    pipWindow.document.getElementById('pip-next').addEventListener('click', () => window.nextTrack?.());

    setupPipNeon(pipWindow);
    if (window.setupPipRenderer) window.setupPipRenderer(pipWindow);

    if (window.refreshPlayerUI) {window.refreshPlayerUI();}

    pipWindow.addEventListener('pagehide', () => { pipWindow = null; });

  } catch (err) {
    console.error('PiP 실행 실패:', err);
  }
}
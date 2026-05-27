// ============================================================================
// js/ui.js
// 로그인, UI 토글, 패널 제어, 환경설정, 드래그 로직, 시계 및 PiP/네온 효과
// ============================================================================

import { reloadPlaylistForUser } from './player.js';
import { registerUser, loginUser } from './firebase.js';
import { initWebSocket } from './network.js';

let timeFmt = 12; // 시간 형식 (12시/24시)

// PiP 모드와 메인 UI가 공유할 현재 상태 변수
export let currentGlowState = 'idle';
export let isSignupMode = false;

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

export async function checkLogin() { 
  const email = document.getElementById("lofi-id").value.trim();
  const pw = document.getElementById("lofi-pw").value.trim();

  // 테스트용 admin 계정 유지
  if (email === "admin" && pw === "1234") {
    localStorage.setItem('lofi_user_id', 'admin'); 
    reloadPlaylistForUser(); 
    closeLoginOverlay();
    return;
  }

  try {
    const userCredential = await loginUser(email, pw);
    
    localStorage.setItem('lofi_user_id', userCredential.user.email); 
    reloadPlaylistForUser(); 
    
    console.log("로그인 성공!", userCredential.user.email);
    closeLoginOverlay();

    await initWebSocket();

  } catch (error) {
    console.error("로그인 에러:", error);
    alert("이메일이나 비밀번호가 올바르지 않습니다.");
  }
}

export function logout() {
  const isConfirmed = confirm("정말 종료하시겠습니까? (오늘의 리포트가 생성됩니다)");
  if (!isConfirmed) return; 
  
  if (window.togglePlay && document.getElementById('play-btn').textContent === '⏸') {
    window.togglePlay(); 
  }

  // 로그아웃 창으로 바로 가지 않고 리포트 창 띄우기
  showDailyReport();
}

// 오늘의 리포트 생성 및 표시 함수
function showDailyReport() {
  //  임시 통계 데이터
  const mockData = {
    count: Math.floor(Math.random() * 15) + 5,      // 발생 횟수 (5~20회)
    totalTime: Math.floor(Math.random() * 40) + 10, // 총 시간 (10~50분)
    maxTime: Math.floor(Math.random() * 15) + 5,    // 최장 지속 시간 (5~20분)
    avgDepth: (Math.random() * 3 + 2).toFixed(1),   // 무너짐 정도 (2.0~5.0cm)
    chart: [
      Math.floor(Math.random() * 30) + 10, // 오전 빈도
      Math.floor(Math.random() * 50) + 20, // 오후 빈도
      Math.floor(Math.random() * 20) + 5   // 저녁 빈도
    ]
  };

  // 텍스트 업데이트
  document.getElementById('report-count').innerHTML = `${mockData.count}<span style="font-size:16px">회</span>`;
  document.getElementById('report-total-time').innerHTML = `${mockData.totalTime}<span style="font-size:16px">분</span>`;
  document.getElementById('report-max-time').textContent = `${mockData.maxTime}분`;
  document.getElementById('report-depth').textContent = `-${mockData.avgDepth}cm`;

  // 3시간대별 빈도 막대 그래프 렌더링
  const chartContainer = document.getElementById('report-chart');
  chartContainer.innerHTML = '';
  const maxVal = Math.max(...mockData.chart, 50); // 최대 높이 기준
  
  mockData.chart.forEach(val => {
    const heightPct = (val / maxVal) * 100;
    // 애니메이션 효과를 위해 처음엔 height: 0으로 생성
    const bar = document.createElement('div');
    bar.className = 'chart-bar';
    bar.style.height = '0%';
    bar.title = `${val}회`;
    chartContainer.appendChild(bar);
    
    // 약간의 딜레이 후 실제 높이 적용
    setTimeout(() => { bar.style.height = `${heightPct}%`; }, 100);
  });

  // 리포트 오버레이 
  const overlay = document.getElementById('report-overlay');
  overlay.style.display = 'flex'; 
  
  setTimeout(() => {
    overlay.classList.add('active');
  }, 10);
}

// 리포트 확인 후 최종 로그아웃 
export function closeReportAndLogout() {
  const overlay = document.getElementById('report-overlay');
  overlay.classList.remove('active'); 

  localStorage.removeItem('lofi_user_id');
  reloadPlaylistForUser(); 
  
  setTimeout(() => {
    overlay.style.display = 'none';
    
    document.getElementById("lofi-id").value = "";
    document.getElementById("lofi-pw").value = "";
    if (window.closeLoginForm) window.closeLoginForm(); 

    const loginOverlay = document.getElementById("login-overlay");
    loginOverlay.style.display = "flex"; 
    setTimeout(() => loginOverlay.style.opacity = "1", 10);
  }, 600); 
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



// 네온 효과 및 Document PiP 모드

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
              <div id="pip-song-title"> 음악을 선택하세요</div>
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


//로그인 ↔ 회원가입 모드 전환 함수
export function toggleSignupMode() {
  isSignupMode = !isSignupMode;
  
  const title = document.getElementById('form-title');
  const pwConfirm = document.getElementById('lofi-pw-confirm');
  const submitBtn = document.getElementById('submit-btn');
  const toggleText = document.getElementById('toggle-mode-text');

  if (isSignupMode) {
    // 회원가입 모드로 변신
    title.textContent = "회원가입";
    pwConfirm.style.display = "block";
    submitBtn.textContent = "가입하기";
    submitBtn.onclick = handleSignup; // 버튼 누르면 회원가입 함수 실행
    toggleText.innerHTML = `이미 계정이 있으신가요? <a href="#" onclick="toggleSignupMode()" style="color:#1DB954; text-decoration:none; font-weight:bold;">로그인</a>`;
  } else {
    // 로그인 모드로 변신
    title.textContent = "로그인";
    pwConfirm.style.display = "none";
    submitBtn.textContent = "입장하기";
    submitBtn.onclick = checkLogin; // 버튼 누르면 로그인 함수 실행
    toggleText.innerHTML = `계정이 없으신가요? <a href="#" onclick="toggleSignupMode()" style="color:#1DB954; text-decoration:none; font-weight:bold;">회원가입</a>`;
  }
}

//  회원가입 처리 함수 
export async function handleSignup() {
  const email = document.getElementById("lofi-id").value.trim();
  const pw = document.getElementById("lofi-pw").value.trim();
  const pwConfirm = document.getElementById("lofi-pw-confirm").value.trim();

  if (!email || !pw || !pwConfirm) { alert("모든 항목을 입력해주세요."); return; }
  if (pw !== pwConfirm) { alert("비밀번호가 일치하지 않습니다."); return; }
  if (pw.length < 6) { alert("비밀번호는 6자리 이상이어야 합니다."); return; }

  try {
    // 🔥 firebase.js 의 함수 호출
    const userCredential = await registerUser(email, pw);
    console.log("가입 성공!", userCredential.user);
    
    alert("회원가입이 완료되었습니다! 로그인해 주세요.");
    document.getElementById("lofi-pw").value = "";
    document.getElementById("lofi-pw-confirm").value = "";
    toggleSignupMode(); 

  } catch (error) {
    console.error("회원가입 에러:", error);
    if (error.code === 'auth/email-already-in-use') alert("이미 가입된 이메일입니다.");
    else if (error.code === 'auth/invalid-email') alert("올바른 이메일 형식이 아닙니다.");
    else alert("회원가입 중 오류가 발생했습니다.");
  }
}
function closeLoginOverlay() {
  const overlay = document.getElementById("login-overlay");
  overlay.style.opacity = "0"; 
  setTimeout(() => { overlay.style.display = "none"; }, 500);
  if (window.restoreUI) window.restoreUI();
}


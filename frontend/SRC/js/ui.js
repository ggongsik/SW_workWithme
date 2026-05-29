// ============================================================================
// js/ui.js
// 로그인, UI 토글, 패널 제어, 환경설정, 드래그 로직, 시계 및 PiP/네온 효과
// ============================================================================

import { reloadPlaylistForUser } from './player.js';
import { registerUser, loginUser, getUserToken} from './firebase.js';
import { initWebSocket, sendCommand } from './network.js';

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
  
  console.log("종료 처리 시작! 백엔드에 세션 종료 요청 및 리포트 강제 호출");
  
  // 1. 혹시 모를 열려있는 세션을 위해 종료 신호 전송
  sendCommand("stop_session");
  
  setTimeout(() => {
    if (typeof fetchAndShowReport === 'function') {
      fetchAndShowReport();
    }
  }, 1000);

export async function fetchAndShowReport() { 
    try {
        const token = await getUserToken();

        const response = await fetch(`http://localhost:8000/api/users/me/report`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (!response.ok) {
            throw new Error(`서버 에러: ${response.status}`);
        }

        const realData = await response.json();
        console.log("📊 리포트 데이터 도착:", realData);
        
        // 데이터 화면에 그리기
        showDailyReport(realData);

    } catch (error) {
        console.error("리포트 API 호출 에러:", error);
        alert("리포트를 불러오는 중 오류가 발생했습니다.");
        if (window.restoreUI) window.restoreUI();
    }
}

// 2. 화면에 데이터 렌더링하기 (새로운 레이아웃 반영)
export function showDailyReport(data) {
    if (!data || !data.today) {
        console.error("유효하지 않은 리포트 데이터입니다.");
        return;
    }

    const today = data.today;
    const weekly = data.weekly_trend || [];

    // --- 좌측 상단: 3가지 핵심 지표 ---
    // 초(sec)를 분(min)으로 반올림하고, 비율은 퍼센트(%)로 변환
    const totalDurationMin = Math.round(today.total_turtle_duration_sec / 60);
    const maxStreakMin = Math.round(today.longest_streak_sec / 60);
    const turtleRatioPct = (today.turtle_ratio * 100).toFixed(1);

    // HTML에 해당 ID가 있다고 가정하고 값 넣기
    const totalEl = document.getElementById('report-total-time');
    const maxEl = document.getElementById('report-max-time');
    const ratioEl = document.getElementById('report-ratio'); 

    if(totalEl) totalEl.innerHTML = `${totalDurationMin}<span style="font-size:16px">분</span>`;
    if(maxEl) maxEl.innerHTML = `${maxStreakMin}<span style="font-size:16px">분</span>`;
    if(ratioEl) ratioEl.innerHTML = `${turtleRatioPct}<span style="font-size:16px">%</span>`;


    // --- [2] 우측 반: 지난 7일간 추이 그래프 ---
    const chartContainer = document.getElementById('report-chart');
    if (chartContainer) {
        chartContainer.innerHTML = '';
        
        // 막대그래프 렌더링 (가장 비율이 높은 날을 100% 높이로 잡거나, 절대 퍼센트로 잡음)
        weekly.forEach(dayData => {
            // date ("2026-05-22") 에서 "05-22"만 추출
            const dateStr = dayData.date.slice(5); 
            
            // 비율(%) 계산 및 해당 날짜의 총 무너진 시간(분) 계산
            const heightPct = dayData.turtle_ratio * 100;
            const durationMin = Math.round((dayData.turtle_ratio * dayData.monitoring_duration_sec) / 60);

            // 막대를 감싸는 컨테이너 (막대 + 날짜 라벨)
            const barWrapper = document.createElement('div');
            barWrapper.style.display = 'flex';
            barWrapper.style.flexDirection = 'column';
            barWrapper.style.alignItems = 'center';
            barWrapper.style.flex = '1';

            // 실제 차트 막대
            const bar = document.createElement('div');
            bar.className = 'chart-bar';
            bar.style.height = '0%'; // 애니메이션 시작점
            // 마우스 올렸을 때 툴팁으로 시간과 비율 표시
            bar.title = `${durationMin}분 (${heightPct.toFixed(1)}%)`; 
            
            // 하단 날짜 텍스트
            const label = document.createElement('span');
            label.style.fontSize = '12px';
            label.style.color = '#fff';
            label.style.marginTop = '8px';
            label.innerText = dateStr;

            barWrapper.appendChild(bar);
            barWrapper.appendChild(label);
            chartContainer.appendChild(barWrapper);
            
            // 스르륵 차오르는 애니메이션
            setTimeout(() => { bar.style.height = `${heightPct}%`; }, 100);
        });
    }

    // 리포트 오버레이 띄우기
    const overlay = document.getElementById('report-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex'; 
    
    setTimeout(() => {
        overlay.classList.add('active');
    }, 10);
}

// 리포트 확인 후 최종 로그아웃 
export function closeReportAndLogout() {
  const overlay = document.getElementById('report-overlay');
  if (overlay) overlay.classList.remove('active'); 

  localStorage.removeItem('lofi_user_id');
  reloadPlaylistForUser(); 
  
  // 💡 수정 3: 징그러운 좀비 웹캠 확실하게 전원 뽑아버리기 🔫
  const videoEl = document.querySelector('video');
  if (videoEl && videoEl.srcObject) {
    videoEl.srcObject.getTracks().forEach(track => track.stop());
    videoEl.srcObject = null;
    console.log("웹캠 전원 완벽 차단 완료!");
  }
  
  setTimeout(() => {
    if (overlay) overlay.style.display = 'none';
    
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

window.testReport = function() {
    const mockData = {
        "today": {
            "date": "2026-05-29",
            "total_turtle_duration_sec": 2820.0,  // 47분
            "longest_streak_sec": 420.0,         // 7분
            "total_monitoring_duration_sec": 7200.0, 
            "turtle_ratio": 0.392                // 39.2%
        },
        "weekly_trend": [
            { "date": "2026-05-23", "turtle_ratio": 0.45, "monitoring_duration_sec": 5400.0 },
            { "date": "2026-05-24", "turtle_ratio": 0.41, "monitoring_duration_sec": 6200.0 },
            { "date": "2026-05-25", "turtle_ratio": 0.38, "monitoring_duration_sec": 4800.0 },
            { "date": "2026-05-26", "turtle_ratio": 0.40, "monitoring_duration_sec": 7000.0 },
            { "date": "2026-05-27", "turtle_ratio": 0.36, "monitoring_duration_sec": 5600.0 },
            { "date": "2026-05-28", "turtle_ratio": 0.35, "monitoring_duration_sec": 6800.0 },
            { "date": "2026-05-29", "turtle_ratio": 0.392, "monitoring_duration_sec": 7200.0 }
        ]
    };

    console.log("🔧 [Dev Mode] 가짜 데이터로 리포트 화면을 렌더링합니다!");
    showDailyReport(mockData);
};
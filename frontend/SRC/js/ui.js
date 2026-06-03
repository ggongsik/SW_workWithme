// ============================================================================
// js/ui.js
// 로그인, UI 토글, 패널 제어, 환경설정, 드래그 로직, 시계 및 PiP/네온 효과
// ============================================================================
import { setTimerVolume } from './pomodoro.js'; // 새로 추가!
import { reloadPlaylistForUser, setMusicVolume } from './player.js';
import { registerUser, loginUser, saveUserData, loadUserData } from './firebase.js';
import { getBackendApiBase, getBackendAuthToken, initWebSocket, sendCommand } from './network.js';
import { openCalibration, closeCalibration, startCalibration, togglePostureCorrection, stopCamera } from './pose.js';
let timeFmt = 12; // 시간 형식 (12시/24시)
let widgetSide = localStorage.getItem('lofi_widget_side') || 'left';

// PiP 모드와 메인 UI가 공유할 현재 상태 변수
export let currentGlowState = 'idle';
export let isSignupMode = false;

// ── 시계 로직  ──
function updateClock() {
  const timeEl = document.getElementById('clock-time');
  const dateEl = document.getElementById('clock-date');

  const d = new Date();
  const days = ['일','월','화','수','목','금','토'];
  let h = d.getHours();
  let m = d.getMinutes();
  let suffix = '';

  if (timeFmt === 12) {
    suffix = h < 12 ? ' AM' : ' PM';
    h = h % 12 || 12;
  }

  const displayTime = String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0') + suffix;
  const displayDate = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0') + '(' + days[d.getDay()] + ')';

  if (timeEl) timeEl.textContent = displayTime;
  if (dateEl) dateEl.textContent = displayDate;

  const phoneTime = document.getElementById('phone-time');
  const phoneDate = document.getElementById('phone-date');
  if (phoneTime) phoneTime.textContent = displayTime;
  if (phoneDate) phoneDate.textContent = `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ${days[d.getDay()]}`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function syncPhoneController() {
  const playerTitle = document.getElementById('player-title')?.textContent?.trim() || '파일을 추가하세요';
  const playerArtist = document.getElementById('player-artist')?.textContent?.trim() || 'Playlist';
  const playerBar = document.getElementById('player-bar')?.style.width || '0%';
  const noteCount = document.querySelectorAll('#note-list .note-item').length;
  const todoCount = document.getElementById('todo-count')?.textContent?.trim() || '0 / 0 완료';
  const d = new Date();

  setText('phone-track-title', playerTitle || '파일을 추가하세요');
  setText('phone-track-artist', playerArtist || 'Playlist');
  const phoneMusicBar = document.getElementById('phone-music-bar');
  if (phoneMusicBar) phoneMusicBar.style.width = playerBar;

  setText('phone-calendar-date', `${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`);
  setText('phone-note-count', `${noteCount} notes`);
  setText('phone-todo-count', todoCount.replace('완료', '').trim());
}

function updatePhonePostureVisual(state) {
  const normalized = state === 'caution' ? 'warn' : (state || 'idle');
  const widget = document.getElementById('phone-posture-widget');
  const controller = document.getElementById('phone-controller');
  if (widget) widget.dataset.state = normalized;
  if (controller) controller.dataset.posture = normalized;

  if (normalized === 'alert') setText('phone-posture-state', 'ALERT');
  else if (normalized === 'warn') setText('phone-posture-state', 'WARNING');
  else setText('phone-posture-state', 'NORMAL');
}

// 드래그 기능 (고무줄 현상 해결 버전)
function makeDraggable(el, handle) {
  handle = handle || el;
  handle.style.touchAction = 'none';

  let startMouseX = 0, startMouseY = 0;
  let dragOverlay = null;

  handle.addEventListener('pointerdown', e => {
    if (e.target.closest('button, input, textarea, select, [contenteditable]')) return;
    e.preventDefault();

    window.isUIDragging = true;

    dragOverlay = document.createElement('div');
    dragOverlay.style.cssText = 'position: fixed; inset: 0; z-index: 999999; cursor: grabbing; touch-action: none;';
    document.body.appendChild(dragOverlay);

    const rect = el.getBoundingClientRect();
    el.style.transform = 'none';
    
    el.style.setProperty('left', rect.left + 'px', 'important');
    el.style.setProperty('top', rect.top + 'px', 'important');
    el.style.setProperty('right', 'auto', 'important');
    el.style.setProperty('bottom', 'auto', 'important');
    el.style.willChange = 'transform';

    startMouseX = e.clientX;
    startMouseY = e.clientY;

    const onMove = e2 => {
      const dx = e2.clientX - startMouseX;
      const dy = e2.clientY - startMouseY;
      el.style.transform = `translate3d(${dx}px, ${dy}px, 0)`;
    };

    const onUp = () => {
      window.isUIDragging = false;

      const finalRect = el.getBoundingClientRect();
      el.style.transform = 'none';
      
      el.style.setProperty('left', Math.max(0, finalRect.left) + 'px', 'important');
      el.style.setProperty('top', Math.max(0, finalRect.top) + 'px', 'important');
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
  applyWidgetSide(widgetSide);
  setInterval(updateClock, 1000);
  setInterval(syncPhoneController, 1000);
  updateClock();
  syncPhoneController();
  updatePhonePostureVisual(currentGlowState);
  restoreSavedLogin();

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

  // 🎚️ 오디오 설정 패널 슬라이더 연동
  const volTimer = document.getElementById('vol-timer');
  const volWarning = document.getElementById('vol-warning');
  const volMusic = document.getElementById('vol-music');

  if (volTimer) {
    volTimer.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('val-timer').innerText = val + '%';
      setTimerVolume(val / 100); // 0.0 ~ 1.0 전달
    });
  }
  
  if (volWarning) {
    volWarning.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('val-warning').innerText = val + '%';
      warningVol = val / 100;
    });
  }
  
  if (volMusic) {
    volMusic.addEventListener('input', (e) => {
      const val = parseInt(e.target.value);
      document.getElementById('val-music').innerText = val + '%';
      setMusicVolume(val / 100);
    });
  }

  // 🎚️ 경고음 ON/OFF 버튼 연동
  const warnOn = document.getElementById('warn-on');
  const warnOff = document.getElementById('warn-off');
  if (warnOn && warnOff) {
    warnOn.addEventListener('click', () => {
      warningEnabled = true;
      warnOn.classList.add('on'); 
      warnOff.classList.remove('on');
    });
    warnOff.addEventListener('click', () => {
      warningEnabled = false;
      warnOff.classList.add('on'); 
      warnOn.classList.remove('on');
    });
  }
});

function restoreSavedLogin() {
  const savedUserId = localStorage.getItem('lofi_user_id');
  if (!savedUserId) return;

  reloadPlaylistForUser();
  closeLoginOverlay();
  initWebSocket().catch((error) => {
    console.warn('Saved login WebSocket restore failed:', error);
  });
}


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
    initWebSocket().catch((error) => {
      console.warn('로컬 admin WebSocket 연결 대기:', error);
    });
    return;
  }

  try {
    const userCredential = await loginUser(email, pw);

    localStorage.setItem('lofi_user_id', userCredential.user.email);
    reloadPlaylistForUser();

    console.log("로그인 성공!", userCredential.user.email);
    closeLoginOverlay();

    initWebSocket().catch((error) => {
      console.warn('로그인 후 WebSocket 연결 대기:', error);
    });

  } catch (error) {
    console.error("로그인 에러:", error);
    alert("이메일이나 비밀번호가 올바르지 않습니다.");
  }
}

export function logout() {
  const isConfirmed = confirm("정말 종료하시겠습니까? (오늘의 리포트가 생성됩니다)");
  if (!isConfirmed) return;

  const stopRequested = sendCommand("stop_session");
  if (!stopRequested) {
    console.warn("stop_session command could not be sent; relying on disconnect auto-save.");
  }

  if (typeof stopCamera === 'function') {
    stopCamera();
  }

  if (window.togglePlay && document.getElementById('play-btn').textContent === '||') {
    window.togglePlay();
  }

  console.log("종료 처리 시작! 백엔드에 세션 종료 요청");

  // session_ended WebSocket 메시지로 리포트를 불러오지만, 혹시 못 받으면 4초 후 fallback
  // 3. 만약 4초가 지났는데도 리포트 화면이 안 뜬다면? (진짜로 오늘 데이터가 0초인 경우)
  setTimeout(() => {
    const overlay = document.getElementById('report-overlay');
    // 리포트 오버레이가 안 열렸다면 강제 종료
    if (!overlay || !overlay.classList.contains('active')) {
      const totalTimeEl = document.getElementById('report-total-time');
      const maxTimeEl = document.getElementById('report-max-time');
      const ratioEl = document.getElementById('report-ratio');

      if (totalTimeEl) totalTimeEl.innerHTML = '0<span>분</span>';
      if (maxTimeEl) maxTimeEl.innerHTML = '0<span>분</span>';
      if (ratioEl) ratioEl.innerHTML = '0<span>%</span>';

      // 2. 쫓아내지 않고 리포트 창을 강제로 엽니다!
      const overlay = document.getElementById('report-overlay');
      if (overlay) {
          overlay.style.display = 'flex'; // 화면에 표시
          setTimeout(() => {
              overlay.classList.add('active'); 
          }, 10);
      }
return;
    }
  }, 4000);
}

export async function fetchAndShowReport() {
    try {
        const token = await getBackendAuthToken();
        if (!token) {
            throw new Error("백엔드 인증 토큰이 없습니다.");
        }

        // ✨ 캡처본에 있는 정확한 API 주소와 헤더 사용
        const response = await fetch(`${getBackendApiBase()}/api/users/me/report`, {
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

    const maxRatio = Math.max(0.01, ...weekly.map(day => (
        Number.isFinite(day.turtle_ratio) ? day.turtle_ratio : 0
    )));

    // HTML에 해당 ID가 있다고 가정하고 값 넣기
    const totalEl = document.getElementById('report-total-time');
    const maxEl = document.getElementById('report-max-time');
    const ratioEl = document.getElementById('report-ratio');

    if(totalEl) totalEl.innerHTML = `${totalDurationMin}<span style="font-size:16px">분</span>`;
    if(maxEl) maxEl.innerHTML = `${maxStreakMin}<span style="font-size:16px">분</span>`;
    if(ratioEl) ratioEl.innerHTML = `${turtleRatioPct}<span style="font-size:16px">%</span>`;

    const ratio = today.turtle_ratio; 
    const commentEl = document.getElementById('report-comment');

    if (commentEl) {
      // 상태 키워드 밑에 들어갈 상세 코멘트 텍스트 스타일링
      const textStyle = "font-size: 14px; color: #a0c0d8; line-height: 1.5; word-break: keep-all; font-weight: normal; margin-top: 5px;";

      if (ratio < 20) {
        commentEl.innerHTML = `
          <div style="color: #39c5bb;">안전 🟢</div>
          <div style="${textStyle}">
            훌륭합니다! 바른 자세를 아주 잘 유지하고 계시네요. <br> 지금처럼 척추 건강을 지켜주세요!
          </div>
        `;
      } else if (ratio < 50) {
        commentEl.innerHTML = `
          <div style="color: #f59e0b;">주의 🟡</div>
          <div style="${textStyle}">
            조금씩 목이 앞으로 나오고 있어요! <br> 모니터 높이를 점검하고, 지금 바로 가볍게 기지개를 켜볼까요? 
          </div>
        `;
      } else {
        commentEl.innerHTML = `
          <div style="color: #ef4444;">위험 🔴</div>
          <div style="${textStyle}">
            심각한 거북목 상태입니다! <br> 당장 하던 일을 멈추고 아래에 있는 교정 스트레칭을 꼭 해주세요!
          </div>
        `;
      }
    }


    // --- [2] 우측 반: 지난 7일간 추이 그래프 (위/아래 2단 막대그래프) ---
    const chartContainer = document.getElementById('report-chart');
    if (chartContainer) {
        chartContainer.innerHTML = '';
        
        // 💡 [핵심 해결] 가로 찌그러짐 방지! 
        // 기존 HTML의 align-items: flex-end 때문에 우측으로 쏠린 현상을 'stretch'로 풀어줍니다.
        chartContainer.style.display = 'flex';
        chartContainer.style.flexDirection = 'column';
        chartContainer.style.gap = '35px';
        chartContainer.style.justifyContent = 'center';
        chartContainer.style.alignItems = 'stretch'; // 🌟 가로 100% 꽉 채우기 마법의 속성!
        chartContainer.style.width = '100%'; 
        chartContainer.style.borderBottom = 'none'; 
        
        const timeData = weekly.map(dayData => Math.round((dayData.turtle_ratio * dayData.monitoring_duration_sec) / 60));
        const ratioData = weekly.map(dayData => Math.round(dayData.turtle_ratio * 100));
        
        const maxTime = Math.max(...timeData, 1);
        const maxRatio = Math.max(...ratioData, 1);

        // 🟦 1. 위쪽 그래프 (시간) 뼈대
        const topChart = document.createElement('div');
        topChart.style.flex = '1';
        topChart.style.display = 'flex';
        topChart.style.alignItems = 'flex-end'; 
        topChart.style.borderBottom = '1px solid rgba(0, 180, 255, 0.4)';
        topChart.style.position = 'relative';

        const topTitle = document.createElement('div');
        topTitle.innerText = '무너진 시간 (분)';
        topTitle.style.position = 'absolute';
        topTitle.style.top = '-18px';
        topTitle.style.left = '0';
        topTitle.style.fontSize = '12px';
        topTitle.style.color = '#00bfff';
        topTitle.style.fontWeight = 'bold';
        topChart.appendChild(topTitle);

        // 🟩 2. 아래쪽 그래프 (비율) 뼈대
        const botChart = document.createElement('div');
        botChart.style.flex = '1';
        botChart.style.display = 'flex';
        botChart.style.alignItems = 'flex-end';
        botChart.style.borderBottom = '1px solid rgba(0, 180, 255, 0.4)';
        botChart.style.position = 'relative';

        const botTitle = document.createElement('div');
        botTitle.innerText = '거북목 비율 (%)';
        botTitle.style.position = 'absolute';
        botTitle.style.top = '-18px';
        botTitle.style.left = '0';
        botTitle.style.fontSize = '12px';
        botTitle.style.color = '#4ade80';
        botTitle.style.fontWeight = 'bold';
        botChart.appendChild(botTitle);

        // 배경 눈금선 추가
        function addGridLines(chart) {
            for (let i = 1; i <= 3; i++) {
                const gridLine = document.createElement('div');
                gridLine.style.position = 'absolute';
                gridLine.style.bottom = `${i * 33}%`;
                gridLine.style.left = '0';
                gridLine.style.right = '0';
                gridLine.style.borderBottom = '1px dashed rgba(255, 255, 255, 0.15)';
                gridLine.style.zIndex = '0';
                chart.appendChild(gridLine);
            }
        }
        addGridLines(topChart);
        addGridLines(botChart);

        // 막대 렌더링 루프
        weekly.forEach((dayData, i) => {
            const dateStr = dayData.date.slice(5); 

            // --- 🟦 위쪽 차트 막대 조립 ---
            const topWrapper = document.createElement('div');
            topWrapper.style.flex = '1';
            topWrapper.style.display = 'flex';
            topWrapper.style.flexDirection = 'column';
            topWrapper.style.alignItems = 'center';
            topWrapper.style.justifyContent = 'flex-end';
            topWrapper.style.zIndex = '1';

            const topVal = document.createElement('div');
            topVal.innerText = `${timeData[i]}`;
            topVal.style.fontSize = '12px';
            topVal.style.color = '#00bfff';
            topVal.style.fontWeight = 'bold';
            topVal.style.marginBottom = '4px';

            const topHeight = Math.max(5, (timeData[i] / maxTime) * 75); 

            const topBar = document.createElement('div');
            topBar.style.width = '24px'; // 💡 막대기가 뭉치지 않게 고정 너비 부여
            topBar.style.backgroundColor = '#00bfff';
            topBar.style.borderRadius = '3px 3px 0 0';
            topBar.style.height = `${topHeight}px`;
            topBar.style.minHeight = `${topHeight}px`;

            topWrapper.appendChild(topVal);
            topWrapper.appendChild(topBar);
            topChart.appendChild(topWrapper);


            // --- 🟩 아래쪽 차트 막대 조립 ---
            const botWrapper = document.createElement('div');
            botWrapper.style.flex = '1';
            botWrapper.style.display = 'flex';
            botWrapper.style.flexDirection = 'column';
            botWrapper.style.alignItems = 'center';
            botWrapper.style.justifyContent = 'flex-end';
            botWrapper.style.zIndex = '1';

            const botVal = document.createElement('div');
            botVal.innerText = `${ratioData[i]}`;
            botVal.style.fontSize = '12px';
            botVal.style.color = '#4ade80';
            botVal.style.fontWeight = 'bold';
            botVal.style.marginBottom = '4px';

            const botHeight = Math.max(5, (ratioData[i] / maxRatio) * 75);

            const botBar = document.createElement('div');
            botBar.style.width = '24px';
            botBar.style.backgroundColor = '#4ade80';
            botBar.style.borderRadius = '3px 3px 0 0';
            botBar.style.height = `${botHeight}px`;
            botBar.style.minHeight = `${botHeight}px`;

            const label = document.createElement('div');
            label.style.fontSize = '11px';
            label.style.color = '#a0c0d8';
            label.style.marginTop = '8px';
            label.style.position = 'absolute'; 
            label.style.bottom = '-20px';
            label.innerText = dateStr;

            botWrapper.appendChild(botVal);
            botWrapper.appendChild(botBar);
            botWrapper.appendChild(label);
            botChart.appendChild(botWrapper);
        });

        chartContainer.appendChild(topChart);
        chartContainer.appendChild(botChart);
    }

    // 리포트 오버레이 띄우기
    const overlay = document.getElementById('report-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';

    setTimeout(() => {
        overlay.classList.add('active');
    }, 10);
}

export function closeReportAndLogout() {
  const overlay = document.getElementById('report-overlay');
  if (overlay) overlay.classList.remove('active');

  localStorage.removeItem('lofi_user_id');
  reloadPlaylistForUser();

  if (typeof stopCamera === 'function') {
    stopCamera();
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
  document.querySelectorAll(`[data-phone-target="${id}"]`).forEach(el => {
    if (el !== btn) el.classList.toggle('on', !wasOpen);
  });
}

export function closePanel(id, btnId) {
  document.getElementById('panel-' + id).classList.remove('open');
  const b = document.getElementById(btnId);
  if (b) b.classList.remove('on');
  document.querySelectorAll(`[data-phone-target="${id}"]`).forEach(el => el.classList.remove('on'));
}

export function hideUI() {
  ['ui-layer','sidebar','pomo-drag','bottom-bar-drag','phone-controller'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) { el.style.opacity='0'; el.style.pointerEvents='none'; }
  });
  document.querySelectorAll('.panel').forEach(p=>{p.style.opacity='0'; p.style.pointerEvents='none';});
  document.getElementById('tap-restore').style.display='block';
}

export function restoreUI() {
  ['ui-layer','sidebar','pomo-drag','bottom-bar-drag','phone-controller'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) { el.style.opacity='1'; el.style.pointerEvents=''; }
  });
  document.querySelectorAll('.panel').forEach(p=>{p.style.opacity='1'; p.style.pointerEvents='';});
  document.getElementById('tap-restore').style.display='none';
}

export function setTimeFmt(fmt, el) {
  timeFmt = fmt;
  if (el?.parentElement) {
    el.parentElement.querySelectorAll('.tpill').forEach(p => p.classList.remove('on'));
    el.classList.add('on');
  }
  updateClock();
}

export function setTab(tab, el) {
  document.querySelectorAll('.stab').forEach(s => s.classList.remove('on'));
  el.classList.add('on');
  document.getElementById('stab-gen').style.display = tab === 'gen' ? 'block' : 'none';
  const focusTab = document.getElementById('stab-focus');
  if (focusTab) focusTab.style.display = tab === 'focus' ? 'block' : 'none';
  document.getElementById('stab-audio').style.display = tab === 'audio' ? 'block' : 'none';
  const debugTab = document.getElementById('stab-debug');
  if (debugTab) debugTab.style.display = tab === 'debug' ? 'block' : 'none';
}

function applyWidgetSide(side) {
  widgetSide = side === 'right' ? 'right' : 'left';
  document.body.classList.toggle('widget-right', widgetSide === 'right');
  document.body.classList.toggle('widget-left', widgetSide !== 'right');
  localStorage.setItem('lofi_widget_side', widgetSide);

  const left = document.getElementById('widget-side-left');
  const right = document.getElementById('widget-side-right');
  if (left) left.classList.toggle('on', widgetSide !== 'right');
  if (right) right.classList.toggle('on', widgetSide === 'right');
}

export function setWidgetSide(side, el) {
  applyWidgetSide(side);
  if (el?.parentElement) {
    el.parentElement.querySelectorAll('.tpill').forEach(p => p.classList.remove('on'));
    el.classList.add('on');
  }
}

export function openFocusSettings() {
  const setPanel = document.getElementById('panel-set');
  if (setPanel) setPanel.classList.add('open');
  document.querySelectorAll('[data-phone-target="set"]').forEach(el => el.classList.add('on'));
  const focusTabButton = [...document.querySelectorAll('.setting-tabs .stab')].find(el => el.textContent.trim() === '집중');
  if (focusTabButton) setTab('focus', focusTabButton);
}



// 네온 효과 및 Document PiP 모드

export let pipWindow = null;

export function setUIGlow(state) {
  const prevState = currentGlowState; // 💡 이전 상태 기억
  currentGlowState = state; 
  
  const screenBorder = document.getElementById('warning-border'); 
  if (screenBorder) {
    if (state === 'idle') {
      screenBorder.style.boxShadow = 'none';
    } else if (state === 'warn' || state === 'caution') {
      screenBorder.style.boxShadow = 'inset 0 0 50px rgba(251, 146, 60, 0.6)';
    } else if (state === 'alert') {
      screenBorder.style.boxShadow = 'inset 0 0 100px rgba(248, 113, 113, 0.9)';
      
      // 🚨 이전에 alert 상태가 아니었는데 새로 alert가 되었다면 사이렌 발사!
      if (prevState !== 'alert') {
        playAlertSound();
      }
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
              <button class="pip-btn" id="pip-play" style="font-size: 18px;">|&gt;</button>
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
    toggleText.innerHTML = `이미 계정이 있으신가요? <a href="#" onclick="toggleSignupMode()" style="color:#39c5bb; text-decoration:none; font-weight:bold;">로그인</a>`;
  } else {
    // 로그인 모드로 변신
    title.textContent = "로그인";
    pwConfirm.style.display = "none";
    submitBtn.textContent = "입장하기";
    submitBtn.onclick = checkLogin; // 버튼 누르면 로그인 함수 실행
    toggleText.innerHTML = `계정이 없으신가요? <a href="#" onclick="toggleSignupMode()" style="color:#39c5bb; text-decoration:none; font-weight:bold;">회원가입</a>`;
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

// ── 오디오 설정 및 경고음 상태 변수 ──
let warningVol = 0.5;
let warningEnabled = true;
const alertAudioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 자세 무너짐(Alert) 경고음 생성기
function playAlertSound() {
  if (!warningEnabled || warningVol <= 0) return;
  if (alertAudioCtx.state === 'suspended') alertAudioCtx.resume();

  try {
    const o = alertAudioCtx.createOscillator();
    const g = alertAudioCtx.createGain();
    
    o.type = 'sawtooth'; // 톱니파로 찌르는 듯한 날카로운 경고음
    o.frequency.setValueAtTime(400, alertAudioCtx.currentTime);
    o.frequency.exponentialRampToValueAtTime(800, alertAudioCtx.currentTime + 0.3); // 사이렌처럼 피치가 쭉 올라감

    g.gain.setValueAtTime(warningVol * 0.5, alertAudioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.01, alertAudioCtx.currentTime + 0.5); // 페이드아웃

    o.connect(g);
    g.connect(alertAudioCtx.destination);
    o.start();
    o.stop(alertAudioCtx.currentTime + 0.5);
  } catch(e) { console.warn(e); }
}

window.toggleTimerWidget = function() {
  const pomo = document.getElementById('pomo-drag');
  if (pomo) {
    pomo.classList.toggle('open');
  }
}; 

document.body.addEventListener('click', () => {
  if (typeof alertAudioCtx !== 'undefined' && alertAudioCtx.state === 'suspended') {
    alertAudioCtx.resume();
  }
  if (window.noiseCtx && window.noiseCtx.state === 'suspended') {
    window.noiseCtx.resume();
  }
}, { once: true });

// 기존 updatePhonePostureVisual 함수를 덮어씌워서 소리 재생 로직 추가!
window.updatePhonePostureVisual = function(state) {
  const normalized = state === 'caution' ? 'warn' : (state || 'idle');
  const widget = document.getElementById('phone-posture-widget');
  const controller = document.getElementById('phone-controller');
  
  const prevState = widget ? widget.dataset.state : 'idle';

  if (widget) widget.dataset.state = normalized;
  if (controller) controller.dataset.posture = normalized;

  if (normalized === 'alert') {
    document.getElementById('phone-posture-state').textContent = 'ALERT';
    // 🚨 이전 상태가 alert가 아니었는데 방금 alert가 되었다면 사이렌 발사!
    if (prevState !== 'alert' && typeof playAlertSound === 'function') {
      playAlertSound(); 
    }
  } else if (normalized === 'warn') {
    document.getElementById('phone-posture-state').textContent = 'WARNING';
  } else {
    document.getElementById('phone-posture-state').textContent = 'NORMAL';
  }
};


// ============================================================================
// 🎧 2. Web Audio API 기반 '백색소음' 생성기 (이력서에 적으신 그 기술!)
// ============================================================================
window.noiseCtx = null;
let noiseSource, noiseGain;
let isNoisePlaying = false;

window.toggleNoise = function() {
  if (!window.noiseCtx) {
    window.noiseCtx = new (window.AudioContext || window.webkitAudioContext)();
    const bufferSize = window.noiseCtx.sampleRate * 2; // 2초 길이의 AudioBuffer
    const buffer = window.noiseCtx.createBuffer(1, bufferSize, window.noiseCtx.sampleRate);
    const data = buffer.getChannelData(0);
    
    // 랜덤 샘플(화이트노이즈) 채우기
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    
    noiseSource = window.noiseCtx.createBufferSource();
    noiseSource.buffer = buffer;
    noiseSource.loop = true; // 무한 반복(loop)
    
    // Lowpass 필터를 적용해 귀가 편안한 '브라운/핑크 노이즈' 질감으로 변경
    const filter = window.noiseCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1000;
    
    noiseGain = window.noiseCtx.createGain();
    noiseGain.gain.value = 0.08; // 적당하고 편안한 볼륨
    
    noiseSource.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(window.noiseCtx.destination);
    noiseSource.start();
    isNoisePlaying = true;
  } else {
    // 이미 생성되어 있다면 일시정지 / 재생 상태만 토글
    if (window.noiseCtx.state === 'running') {
      window.noiseCtx.suspend();
      isNoisePlaying = false;
    } else if (window.noiseCtx.state === 'suspended') {
      window.noiseCtx.resume();
      isNoisePlaying = true;
    }
  }
  
  // 백색소음 앱 버튼에 민트색 하이라이트(on 클래스) 켜고 끄기
  const btn = document.querySelector('.app-btn[onclick*="toggleNoise"]');
  if (btn) btn.classList.toggle('on', isNoisePlaying);
};


// ============================================================================
// 🔙 3. 리포트 화면 '뒤로 가기' (로그아웃 안 함)
// ============================================================================
window.closeReportOnly = function() {
  const overlay = document.getElementById('report-overlay');
  if (overlay) {
    overlay.classList.remove('active');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 600); // 0.6초 뒤에 완전히 숨김 (애니메이션 대기)
  }
};

// ============================================================================
// ☁️ Firebase 클라우드 연동 (노트, To-Do, 캘린더 자동 동기화)
// ============================================================================

// 1. Firebase에서 내 데이터를 불러와서 화면에 세팅하는 함수
async function restoreAppData() {
  const email = localStorage.getItem('lofi_user_id');
  if (!email || email === 'admin') return;

  console.log("☁️ Firebase에서 유저 데이터를 불러오는 중...");
  const data = await loadUserData(email);
  
  if (data) {
    // 💡 HTML에 존재하는 정확한 ID들로 매핑
    const noteList = document.getElementById('note-list');
    const todoList = document.getElementById('todo-list'); 
    const calGrid = document.getElementById('cal-grid');             // 캘린더 날짜(마커) 영역
    const calLabelList = document.getElementById('cal-label-list');  // 캘린더 텍스트 일정 영역

    if (data.noteHTML && noteList) noteList.innerHTML = data.noteHTML;
    if (data.todoHTML && todoList) todoList.innerHTML = data.todoHTML;
    if (data.calGridHTML && calGrid) calGrid.innerHTML = data.calGridHTML;
    if (data.calLabelHTML && calLabelList) calLabelList.innerHTML = data.calLabelHTML;
    
    // 데이터 복구 후 폰 컨트롤러 텍스트 동기화
    if (typeof syncPhoneController === 'function') syncPhoneController();
  }
  
  // 복구가 완전히 끝난 후에야 '자동 저장 CCTV'를 켭니다. 
  startAutoSaveObserver();
}

async function syncDataToFirebase() {
  const email = localStorage.getItem('lofi_user_id');
  if (!email || email === 'admin') return;

  // 💡 정확한 ID에서 HTML을 추출하여 저장
  const dataToSave = {
    noteHTML: document.getElementById('note-list')?.innerHTML || '',
    todoHTML: document.getElementById('todo-list')?.innerHTML || '',
    calGridHTML: document.getElementById('cal-grid')?.innerHTML || '',
    calLabelHTML: document.getElementById('cal-label-list')?.innerHTML || '',
    updatedAt: new Date().toISOString()
  };

  await saveUserData(email, dataToSave);
}

// 3. 화면 변화 감지 CCTV (MutationObserver) 및 디바운싱(Debouncing) 로직
let autoSaveTimer = null;

function startAutoSaveObserver() {
  const targetIds = ['panel-note', 'panel-todo', 'panel-cal']; // 감시할 패널들

  const observer = new MutationObserver(() => {
    // 타이핑을 할 때마다 저장하면 Firebase 과금이 폭탄 맞을 수 있으므로, 
    // 변화가 멈추고 '2초'가 지나면 한 번만 싹 모아서 저장합니다. (디바운싱 기법)
    clearTimeout(autoSaveTimer);
    autoSaveTimer = setTimeout(() => {
      syncDataToFirebase();
    }, 2000);
  });

  // 각 패널들의 내부 HTML 변화를 샅샅이 감시하도록 설정
  targetIds.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      observer.observe(el, { childList: true, subtree: true, characterData: true });
    }
  });
  
  console.log("👀 백그라운드 자동 저장 시스템(CCTV) 가동 시작!");
}

// 4. 로그인 성공 시 데이터를 불러오도록 기존 함수에 살짝 끼워넣기
const originalRestoreSavedLogin = window.restoreSavedLogin || restoreSavedLogin;
window.restoreSavedLogin = function() {
  originalRestoreSavedLogin();
  restoreAppData(); // 앱 데이터 복구 추가
};

const originalCheckLogin = window.checkLogin || checkLogin;
window.checkLogin = async function() {
  await originalCheckLogin();
  restoreAppData(); // 앱 데이터 복구 추가
};

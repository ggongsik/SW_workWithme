// ============================================================================
// js/pomodoro.js
// 포모도로 타이머 (작업/휴식 시간, 반복 횟수, 알림음) 관련 로직 모음
// ============================================================================

// ── 1. 상태 변수 및 상수 ──
const CIRC = 2 * Math.PI * 88; // 둥근 진행바(svg ring)의 둘레 계산
let focusMin = 25;             // 기본 작업 시간 (분)
let breakMin = 5;              // 기본 휴식 시간 (분)
let repeatTotal = 3;           // 목표 반복 횟수
let repeatDone = 0;            // 현재 완료한 반복 횟수
let phase = 'focus';           // 현재 상태 ('focus' 또는 'break')
let pomoLeft = focusMin * 60;  // 남은 시간 (초 단위)
let pomoRunning = false;       // 타이머 동작 여부
let pomoTimer = null;          // setInterval 타이머 ID

// ── 2. 알림음 (Web Audio API) 세팅 ──
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 기본 삐- 소리 생성 함수 (내부 전용)
function beep(freq, dur, type = 'sine', vol = 0.3) {
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) {
    console.warn("AudioContext error:", e);
  }
}

// 1페이즈(작업/휴식)가 끝났을 때 나오는 알람 (내부 전용)
function playEndChime() {
  beep(880, 0.18, 'sine', 0.25);
  setTimeout(() => beep(1100, 0.18, 'sine', 0.22), 200);
  setTimeout(() => beep(1320, 0.35, 'sine', 0.2), 400);
}

// ── 3. 타이머 핵심 동작 함수 (내부 전용) ──

// 현재 페이즈의 총 시간(초)을 반환
function pomoTotal() { 
  return (phase === 'focus' ? focusMin : breakMin) * 60; 
}

// 화면의 둥근 테두리 게이지 및 색상 업데이트
function updateRing() {
  const t = pomoTotal();
  const pct = t > 0 ? (t - pomoLeft) / t : 0;
  const ringEl = document.getElementById('pomo-ring');
  
  if (ringEl) {
    ringEl.style.strokeDashoffset = (CIRC * pct).toFixed(2);
    ringEl.style.stroke = (phase === 'focus') ? '#39c5bb' : '#9af3e6';
  }
}

// 작업 <-> 휴식 전환
function switchPhase() {
  playEndChime();
  if (phase === 'focus') {
    repeatDone++;
    if (repeatDone >= repeatTotal) {
      // 모든 세트 완료 시 종료
      stopPomo();
      beep(660, 0.15); 
      setTimeout(() => beep(880, 0.15), 180); 
      setTimeout(() => beep(1100, 0.4), 360);
      return;
    }
    phase = 'break';
  } else { 
    phase = 'focus'; 
  }
  
  pomoLeft = pomoTotal(); 
  updateRing();
}

// 타이머 정지 (내부 전용)
function stopPomo() {
  clearInterval(pomoTimer); 
  pomoRunning = false; 
  pomoTimer = null;
  document.getElementById('pomo-play').textContent = '▶';
}

// 초기화 (내부 전용)
function resetPomo() {
  stopPomo(); 
  repeatDone = 0; 
  phase = 'focus';
  pomoLeft = focusMin * 60; 
  updateRing();
}

// 모듈 로딩 시 UI 링 게이지 1회 초기화
updateRing(); 


// ============================================================================
//  4. 외부로 내보내는 기능들 (export)
// HTML UI 버튼 클릭 시 main.js를 거쳐 실행되는 함수들입니다.
// ============================================================================

// 재생 / 일시정지 버튼 토글
export function togglePomo() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  if (!pomoRunning) {
    pomoRunning = true;
    document.getElementById('pomo-play').textContent = '⏸';
    pomoTimer = setInterval(() => { 
      if (pomoLeft > 0) {
        pomoLeft--;
        updateRing();
      } else {
        switchPhase();
      } 
    }, 1000);
  } else { 
    stopPomo(); 
  }
}

// 반복 횟수 증감 버튼(‹, ›) 클릭 시
export function adjRepeat(d) {
  repeatTotal = Math.max(1, Math.min(10, repeatTotal + d));
  document.getElementById('repeat-val').textContent = repeatTotal;
  if (!pomoRunning) resetPomo();
}

// 반복 횟수를 숫자로 직접 입력 후 포커스를 잃었을 때(onblur)
export function commitRepeat(el) {
  const v = parseInt(el.textContent) || 3;
  repeatTotal = Math.max(1, Math.min(10, v));
  el.textContent = repeatTotal;
  if (!pomoRunning) resetPomo();
}

// 입력 창에서 엔터(Enter)나 ESC 키를 눌렀을 때 처리
export function numOnly(e, el) {
  if (e.key === 'Enter') { 
    e.preventDefault(); 
    el.blur(); 
  }
  if (e.key === 'Escape') {
    el.blur();
  }
}

// 작업 시간(분) 입력 값 적용
export function commitFocus() {
  const inputVal = parseInt(document.getElementById('focus-inp').value) || 25;
  focusMin = Math.max(1, Math.min(90, inputVal));
  document.getElementById('focus-inp').value = focusMin;
  
  if (!pomoRunning) resetPomo();
}

// 휴식 시간(분) 입력 값 적용
export function commitBreak() {
  const inputVal = parseInt(document.getElementById('break-inp').value) || 5;
  breakMin = Math.max(1, Math.min(30, inputVal));
  document.getElementById('break-inp').value = breakMin;
  
  if (!pomoRunning && phase === 'break') {
    pomoLeft = breakMin * 60;
    updateRing();
  }
}

// ============================================================================
// js/pomodoro.js
// 포모도로 타이머 (작업/휴식 시간, 반복 횟수, 알림음) 관련 로직 모음
// ============================================================================
export let timerVolume = 0.5; // 기본값 50%
export function setTimerVolume(v) { timerVolume = v; }
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
let pomoSoundEnabled = localStorage.getItem('lofi_pomo_sound') !== 'off';

// ── 2. 알림음 (Web Audio API) 세팅 ──
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// 기본 삐- 소리 생성 함수 
function beep(freq, dur, type = 'sine', vol = 0.3) {
  if (timerVolume <= 0) return; // 볼륨이 0이면 아예 무음 처리
  try {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.connect(g);
    g.connect(audioCtx.destination);
    o.type = type;
    o.frequency.value = freq;
    
    // 💡 기본 소리(vol)에 사용자 설정 볼륨(timerVolume) 비율 곱하기
    const finalVol = vol * (timerVolume / 0.5); 
    
    g.gain.setValueAtTime(finalVol, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + dur);
    o.start();
    o.stop(audioCtx.currentTime + dur);
  } catch (e) {
    console.warn("AudioContext error:", e);
  }
}

// 1페이즈(작업/휴식)가 끝났을 때 나오는 알람 (내부 전용)
function playEndChime() {
  if (!pomoSoundEnabled) return;
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
  renderPomoStatus();
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  const min = Math.floor(safeSeconds / 60);
  const sec = safeSeconds % 60;
  return `${String(min).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function formatEndTime() {
  const end = new Date(Date.now() + Math.max(0, pomoLeft) * 1000);
  return `${String(end.getHours()).padStart(2, '0')}:${String(end.getMinutes()).padStart(2, '0')}`;
}

function setText(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function syncPomoInputs() {
  const focusInputs = ['focus-inp', 'focus-setting-inp'];
  const breakInputs = ['break-inp', 'break-setting-inp'];
  const repeatInputs = ['repeat-val', 'repeat-setting-inp'];

  focusInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = focusMin;
  });
  breakInputs.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = breakMin;
  });
  repeatInputs.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    if ('value' in el) el.value = repeatTotal;
    else el.textContent = repeatTotal;
  });
}

function renderPomoStatus() {
  const leftText = formatDuration(pomoLeft);
  const phaseText = phase === 'focus' ? '집중' : '휴식';
  const stateText = pomoRunning ? `${phaseText} 중` : `${phaseText} 대기`;
  const endPrefix = pomoRunning ? '종료' : '예상 종료';
  const endText = `${endPrefix} ${formatEndTime()}`;

  setText('phone-pomo-time', leftText);
  setText('phone-pomo-state', stateText);
  setText('phone-pomo-end', endText);
  setText('focus-settings-phase', stateText);
  setText('focus-settings-left', leftText);
  setText('focus-settings-end', endText);
  syncPomoInputs();
}

// 작업 <-> 휴식 전환
function switchPhase() {
  playEndChime();
  if (phase === 'focus') {
    repeatDone++;
    if (repeatDone >= repeatTotal) {
      // 모든 세트 완료 시 종료
      stopPomo();
      if (pomoSoundEnabled) {
        beep(660, 0.15);
        setTimeout(() => beep(880, 0.15), 180);
        setTimeout(() => beep(1100, 0.4), 360);
      }
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
  const play = document.getElementById('pomo-play');
  if (play) play.textContent = '|>';
  renderPomoStatus();
}

// 초기화 (내부 전용)
function resetPomo() {
  stopPomo(); 
  repeatDone = 0; 
  phase = 'focus';
  pomoLeft = focusMin * 60; 
  updateRing();
}

export function resetPomoTimer() {
  resetPomo();
}

// 모듈 로딩 시 UI 링 게이지 1회 초기화
updateRing(); 
renderPomoStatus();


// ============================================================================
//  4. 외부로 내보내는 기능들 (export)
// HTML UI 버튼 클릭 시 main.js를 거쳐 실행되는 함수들입니다.
// ============================================================================

// 재생 / 일시정지 버튼 토글
export function togglePomo() {
  if (audioCtx.state === 'suspended') audioCtx.resume();
  
  if (!pomoRunning) {
    pomoRunning = true;
    const play = document.getElementById('pomo-play');
    if (play) play.textContent = '||';
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
  else renderPomoStatus();
}

export function commitRepeatInput(inputId = 'repeat-setting-inp') {
  const input = document.getElementById(inputId);
  const v = parseInt(input?.value) || 3;
  repeatTotal = Math.max(1, Math.min(10, v));
  if (!pomoRunning) resetPomo();
  else renderPomoStatus();
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
export function commitFocus(inputId = 'focus-inp') {
  const inputVal = parseInt(document.getElementById(inputId)?.value) || 25;
  focusMin = Math.max(1, Math.min(90, inputVal));
  
  if (!pomoRunning) resetPomo();
  else renderPomoStatus();
}

// 휴식 시간(분) 입력 값 적용
export function commitBreak(inputId = 'break-inp') {
  const inputVal = parseInt(document.getElementById(inputId)?.value) || 5;
  breakMin = Math.max(1, Math.min(30, inputVal));
  
  if (!pomoRunning && phase === 'break') {
    pomoLeft = breakMin * 60;
    updateRing();
  }
  renderPomoStatus();
}

export function setPomoSound(enabled, el) {
  pomoSoundEnabled = !!enabled;
  localStorage.setItem('lofi_pomo_sound', pomoSoundEnabled ? 'on' : 'off');
  if (el?.parentElement) {
    el.parentElement.querySelectorAll('.tpill').forEach(pill => pill.classList.remove('on'));
    el.classList.add('on');
  }

  const on = document.getElementById('pomo-sound-on');
  const off = document.getElementById('pomo-sound-off');
  if (on) on.classList.toggle('on', pomoSoundEnabled);
  if (off) off.classList.toggle('on', !pomoSoundEnabled);
}

window.addEventListener('DOMContentLoaded', () => {
  renderPomoStatus();
  setPomoSound(pomoSoundEnabled);
});

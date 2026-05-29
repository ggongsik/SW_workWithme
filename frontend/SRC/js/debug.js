// ============================================================================
// js/debug.js
// Runtime debug overlay, manual posture state controls, and browser metrics.
// ============================================================================

const MAX_LOGS = 120;
const state = {
  enabled: localStorage.getItem('lofi_debug_enabled') === '1',
  forcedState: null,
  postureState: 'idle',
  rawPosture: 'idle',
  tracking: false,
  trackingStatus: 'idle',
  lastFrameAt: 0,
  lastSendAt: 0,
  lastReceiveAt: 0,
  framesSent: 0,
  wsState: 'closed',
  logs: [],
  fps: 0,
  heapUsedMB: null,
  heapLimitMB: null,
  deviceMemoryGB: navigator.deviceMemory || null,
  connection: navigator.connection?.effectiveType || null,
};

let frameCount = 0;
let lastFpsAt = performance.now();
let metricsTimer = null;

function $(id) {
  return document.getElementById(id);
}

function formatTime(ts = Date.now()) {
  return new Date(ts).toLocaleTimeString('ko-KR', { hour12: false });
}

function pushLog(kind, message, data) {
  const entry = { time: Date.now(), kind, message, data };
  state.logs.unshift(entry);
  if (state.logs.length > MAX_LOGS) state.logs.length = MAX_LOGS;
  renderLogs();
}

function stateLabel(value) {
  if (value === 'alert') return 'ALERT';
  if (value === 'warn') return 'WARNING';
  if (value === 'idle') return 'NORMAL';
  return String(value || '-').toUpperCase();
}

function stateClass(value) {
  if (value === 'alert') return 'alert';
  if (value === 'warn') return 'warn';
  if (value === 'idle') return 'idle';
  return '';
}

function refreshSummary() {
  const status = $('debug-tracking-status');
  const posture = $('debug-posture-state');
  const forced = $('debug-forced-state');
  const ws = $('debug-ws-state');
  const perf = $('debug-performance');

  if (status) {
    status.textContent = state.trackingStatus;
    status.dataset.state = state.trackingStatus === 'running' ? 'idle' : 'warn';
  }
  if (posture) {
    posture.textContent = stateLabel(state.postureState);
    posture.dataset.state = stateClass(state.postureState);
  }
  if (forced) {
    forced.textContent = state.forcedState ? stateLabel(state.forcedState) : 'OFF';
    forced.dataset.state = stateClass(state.forcedState);
  }
  if (ws) ws.textContent = state.wsState;
  if (perf) {
    const heap = state.heapUsedMB == null ? 'n/a' : `${state.heapUsedMB}/${state.heapLimitMB} MB`;
    const lastFrameAge = state.lastFrameAt ? `${Math.round((Date.now() - state.lastFrameAt) / 1000)}s ago` : 'none';
    const memory = state.deviceMemoryGB ? `${state.deviceMemoryGB} GB device` : 'n/a';
    const network = state.connection || 'n/a';
    perf.innerHTML = `
      <span>FPS: ${state.fps}</span>
      <span>Heap: ${heap}</span>
      <span>Memory: ${memory}</span>
      <span>DPR: ${window.devicePixelRatio || 1}</span>
      <span>Sent: ${state.framesSent}</span>
      <span>Last frame: ${lastFrameAge}</span>
      <span>Viewport: ${window.innerWidth}x${window.innerHeight}</span>
      <span>Network: ${network}</span>
    `;
  }
}

function renderLogs() {
  const list = $('debug-log-list');
  if (!list) return;
  list.textContent = '';
  for (const entry of state.logs.slice(0, 80)) {
    const row = document.createElement('div');
    row.className = `debug-log-row ${entry.kind}`;
    const payload = entry.data == null ? '' : ` ${JSON.stringify(entry.data)}`;
    row.textContent = `[${formatTime(entry.time)}] ${entry.kind}: ${entry.message}${payload}`;
    list.appendChild(row);
  }
}

function applyVisibility() {
  document.body.classList.toggle('debug-on', state.enabled);
  const toggle = $('debug-toggle');
  if (toggle) toggle.checked = state.enabled;
  const panel = $('debug-panel');
  if (panel) panel.hidden = !state.enabled;
  if (state.enabled && !metricsTimer) {
    metricsTimer = setInterval(sampleMetrics, 1000);
  } else if (!state.enabled && metricsTimer) {
    clearInterval(metricsTimer);
    metricsTimer = null;
  }
  refreshSummary();
}

function applyPoseState(nextState, source = 'debug') {
  state.postureState = nextState;
  if (window.change3DPose) window.change3DPose(nextState);
  if (window.setUIGlow) window.setUIGlow(nextState);
  pushLog('state', `${source} -> ${stateLabel(nextState)}`);
  refreshSummary();
}

function sampleMetrics() {
  const memory = performance.memory;
  state.connection = navigator.connection?.effectiveType || null;
  if (memory) {
    state.heapUsedMB = Math.round(memory.usedJSHeapSize / 1024 / 1024);
    state.heapLimitMB = Math.round(memory.jsHeapSizeLimit / 1024 / 1024);
  } else {
    state.heapUsedMB = null;
    state.heapLimitMB = null;
  }
  refreshSummary();
}

export function initDebugMode() {
  applyVisibility();
  document.addEventListener('visibilitychange', () => {
    pushLog('browser', document.hidden ? 'document hidden' : 'document visible');
  });
}

export function toggleDebugMode(enabled) {
  state.enabled = !!enabled;
  localStorage.setItem('lofi_debug_enabled', state.enabled ? '1' : '0');
  pushLog('debug', state.enabled ? 'enabled' : 'disabled');
  applyVisibility();
}

export function forceDebugState(nextState) {
  if (!['idle', 'warn', 'alert'].includes(nextState)) return;
  state.forcedState = nextState;
  applyPoseState(nextState, 'forced');
}

export function clearDebugState() {
  state.forcedState = null;
  applyPoseState(state.rawPosture || 'idle', 'auto restored');
}

export function getForcedDebugState() {
  return state.forcedState;
}

export function setDebugPostureState(nextState, detail = {}) {
  state.rawPosture = nextState;
  if (!state.forcedState) applyPoseState(nextState, 'auto');
  else refreshSummary();
  pushLog('posture', `server judged ${stateLabel(nextState)}`, detail);
}

export function setDebugTrackingStatus(status, detail = {}) {
  state.trackingStatus = status;
  state.tracking = status === 'running';
  pushLog('tracking', status, detail);
  refreshSummary();
}

export function noteDebugFrameSent(sizeBytes = 0) {
  state.lastSendAt = Date.now();
  state.framesSent += 1;
  pushLog('ws-out', `frame ${Math.round(sizeBytes / 1024)} KB`);
  refreshSummary();
}

export function noteDebugPoseResult(data) {
  state.lastReceiveAt = Date.now();
  pushLog('ws-in', data?.type || 'message', data);
}

export function noteDebugWebSocket(direction, message, data) {
  pushLog(direction, message, data);
}

export function setDebugWebSocketState(wsState) {
  state.wsState = wsState;
  pushLog('ws', wsState);
  refreshSummary();
}

export function noteDebugTrackingHeartbeat(kind, detail = {}) {
  state.lastFrameAt = Date.now();
  if (!['tick', 'landmarks', 'no_landmarks', 'waiting_landmarks', 'encoding_busy'].includes(kind)) {
    pushLog('tracking', kind, detail);
  }
  refreshSummary();
}

export function noteDebugRenderFrame() {
  frameCount += 1;
  const now = performance.now();
  const elapsed = now - lastFpsAt;
  if (elapsed >= 1000) {
    state.fps = Math.round((frameCount * 1000) / elapsed);
    frameCount = 0;
    lastFpsAt = now;
    refreshSummary();
  }
}

export function clearDebugLogs() {
  state.logs = [];
  renderLogs();
}

window.toggleDebugMode = toggleDebugMode;
window.forceDebugState = forceDebugState;
window.clearDebugState = clearDebugState;
window.clearDebugLogs = clearDebugLogs;

// ============================================================================
// js/noise.js
// Lightweight white-noise generator using a cached looping AudioBuffer.
// ============================================================================

let audioCtx = null;
let gainNode = null;
let sourceNode = null;
let noiseBuffer = null;
let isNoiseOn = false;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

function createNoiseBuffer(ctx) {
  if (noiseBuffer) return noiseBuffer;

  const durationSec = 2;
  const sampleCount = ctx.sampleRate * durationSec;
  const buffer = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
  const data = buffer.getChannelData(0);

  for (let i = 0; i < sampleCount; i++) {
    data[i] = Math.random() * 2 - 1;
  }

  noiseBuffer = buffer;
  return noiseBuffer;
}

function setNoiseUI(enabled) {
  const widget = document.getElementById('white-noise-widget');
  const state = document.getElementById('white-noise-state');
  const settingBtn = document.getElementById('white-noise-setting-btn');

  if (widget) widget.classList.toggle('on', enabled);
  if (state) state.textContent = enabled ? 'ON' : 'OFF';
  if (settingBtn) settingBtn.textContent = enabled ? '끄기' : '켜기';
}

function startWhiteNoise() {
  const ctx = getAudioContext();
  if (ctx.state === 'suspended') ctx.resume();

  if (!gainNode) {
    gainNode = ctx.createGain();
    gainNode.gain.value = 0.12;
    gainNode.connect(ctx.destination);
  }

  sourceNode = ctx.createBufferSource();
  sourceNode.buffer = createNoiseBuffer(ctx);
  sourceNode.loop = true;
  sourceNode.connect(gainNode);
  sourceNode.start();
  isNoiseOn = true;
  setNoiseUI(true);
}

function stopWhiteNoise() {
  if (sourceNode) {
    try {
      sourceNode.stop();
    } catch (error) {
      console.warn('White noise stop skipped:', error);
    }
    sourceNode.disconnect();
    sourceNode = null;
  }
  isNoiseOn = false;
  setNoiseUI(false);
}

export function toggleWhiteNoise() {
  if (isNoiseOn) {
    stopWhiteNoise();
  } else {
    startWhiteNoise();
  }
}

window.addEventListener('DOMContentLoaded', () => setNoiseUI(false));

// ============================================================================
// js/player.js
// 오디오 재생, 플레이리스트 관리, IndexedDB 데이터베이스 로직
// ============================================================================

import { escHtml } from './tools.js';

// ── 1. 상태 변수 및 초기화 ──
const audio = new Audio();
audio.volume = 0.8;

const tracks = [];
let isUpdatingProgress = false;
let curTrack = -1;
let shuffle = false;


// ── 2. IndexedDB 설정 (새로고침해도 음악 유지) ──
const dbName = "LofiMusicDB";
let db;
const request = indexedDB.open(dbName, 1);

request.onupgradeneeded = function(e) {
  db = e.target.result;
  if (!db.objectStoreNames.contains("tracks")) {
    db.createObjectStore("tracks", { keyPath: "id", autoIncrement: true });
  }
};

request.onsuccess = function(e) {
  db = e.target.result;
  loadSavedTracks();
};

function loadSavedTracks() {
  const tx = db.transaction("tracks", "readonly");
  const store = tx.objectStore("tracks");
  const req = store.getAll();
  
  req.onsuccess = function() {
    tracks.length = 0; 
    const savedFiles = req.result;
    savedFiles.forEach(item => {
      tracks.push({
        id: item.id,
        t: item.name,
        a: item.artist,
        url: URL.createObjectURL(item.fileBlob) 
      });
    });
    renderPlaylist(); 
  };
}


// ── 3. 플레이어 내부 로직 (내부 전용) ──
function loadTrack(i, autoplay = true) {
  if (!tracks.length) return;
  i = (i + tracks.length) % tracks.length;
  curTrack = i;
  const t = tracks[i];
  
  document.getElementById('player-title').textContent = t.t;
  document.getElementById('player-artist').textContent = t.a;
  
  if (t.url) {
    audio.src = t.url;
    if (autoplay) {
      audio.play().catch(()=>{});
      document.getElementById('play-btn').textContent = '⏸';
    }
  }
  renderPlaylist();
  updateProgressBar();
}

function updateProgressBar() {
  if (!audio.duration || isNaN(audio.duration)) return;
  const pct = Math.floor((audio.currentTime / audio.duration) * 1000) / 10;
  document.getElementById('player-bar').style.width = pct + '%';
}

function renderPlaylist() {
  const plBody = document.getElementById('pl-body');
  if (!plBody) return;

  if (!tracks.length) {
    plBody.innerHTML = '<div style="font-size:11px;color:#3d6070;text-align:center;padding:16px 0;">파일 또는 폴더를 추가하세요</div>';
    return;
  }
  
  plBody.innerHTML = tracks.map((t, i) => `
    <div class="pl-item${i === curTrack ? ' playing' : ''}" onclick="loadTrack(${i})">
      <span class="pl-num">${i === curTrack ? '▶' : i + 1}</span>
      <div class="pl-info">
        <div class="pl-name">${escHtml(t.t)}</div>
        <div class="pl-artist">${escHtml(t.a)}</div>
      </div>
      <button class="pl-del-btn" onclick="removeTrack(event,${i})" title="제거">✕</button>
    </div>
  `).join('');
}

// 오디오 이벤트 연결
audio.addEventListener('ended', () => nextTrack());
audio.addEventListener('timeupdate', () => {
  if (!isUpdatingProgress) {
    isUpdatingProgress = true;
    requestAnimationFrame(() => {
      updateProgressBar();
      isUpdatingProgress = false;
    });
  }
});

// 프로그레스 바 클릭 시 시간 이동
window.addEventListener('DOMContentLoaded', () => {
  const progressEl = document.getElementById('player-progress');
  if(progressEl) {
    progressEl.addEventListener('click', function(e) {
      if (!audio.duration || isNaN(audio.duration)) return;
      const rect = this.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    });
  }
});


// ============================================================================
// 🌟 4. 외부로 내보내는 기능들 (export)
// ============================================================================

export function togglePlay() {
  if (!tracks.length) return;
  if (curTrack < 0) { loadTrack(0); return; }
  
  if (audio.paused) {
    audio.play().catch(()=>{});
    document.getElementById('play-btn').textContent = '⏸';
  } else {
    audio.pause();
    document.getElementById('play-btn').textContent = '▶';
  }
}

export function prevTrack() {
  if (!tracks.length) return;
  loadTrack(shuffle ? Math.floor(Math.random() * tracks.length) : curTrack - 1);
}

export function nextTrack() {
  if (!tracks.length) return;
  loadTrack(shuffle ? Math.floor(Math.random() * tracks.length) : curTrack + 1);
}

export function toggleShuffle() {
  shuffle = !shuffle;
  document.getElementById('shuffle-btn').classList.toggle('active', shuffle);
}

export function removeTrack(e, i) {
  if(e) e.stopPropagation();
  
  const trackId = tracks[i].id;
  if (trackId !== undefined && db) {
    const tx = db.transaction("tracks", "readwrite");
    tx.objectStore("tracks").delete(trackId);
  }

  URL.revokeObjectURL(tracks[i].url);
  tracks.splice(i, 1);
  
  if (curTrack === i) {
    audio.pause();
    document.getElementById('play-btn').textContent = '▶';
    curTrack = -1;
    document.getElementById('player-title').textContent = '—';
    document.getElementById('player-artist').textContent = '파일을 추가하세요';
    if (tracks.length) loadTrack(0);
  } else if (curTrack > i) {
    curTrack--;
  }
  renderPlaylist();
}

export function addFiles(files) {
  if(!db) return;
  const audioExts = /\.(mp3|wav|flac|ogg|m4a|aac|opus|wma)$/i;
  const tx = db.transaction("tracks", "readwrite");
  const store = tx.objectStore("tracks");
  let added = 0;

  Array.from(files)
    .filter(f => audioExts.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(f => {
      const name = f.name.replace(/\.[^.]+$/, '');
      const artist = f.webkitRelativePath ? f.webkitRelativePath.split('/')[0] : '로컬 파일';
      
      const record = { name: name, artist: artist, fileBlob: f };
      const req = store.add(record);
      
      req.onsuccess = function(e) {
        tracks.push({
          id: e.target.result,
          t: name,
          a: artist,
          url: URL.createObjectURL(f)
        });
        added++;
        renderPlaylist();
        // 첫 번째 곡 추가 시 자동 재생
        if (curTrack < 0 && added === 1) loadTrack(0, false);
      };
    });
}
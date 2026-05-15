// ============================================================================
// js/player.js
// 오디오 재생, 플레이리스트 관리(드래그앤드롭 지원), IndexedDB 로직 + YouTube API
// ============================================================================

import { escHtml } from './tools.js';
import { pipWindow } from './ui.js';

// ── 1. 상태 변수 ──────────────────────────────────────────────────────────────
const audio = new Audio();
audio.volume = 0.8;
const tracks = [];
let isUpdatingProgress = false;
export let curTrack = -1;
let shuffle = false;
let activeSource = 'local';
let ytProgressInterval = null;


// ✨ 오디오 상태 동기화 (재생/정지 버튼 엇갈림 버그 완벽 해결)
audio.addEventListener('play', () => syncPlayButton(true));
audio.addEventListener('pause', () => syncPlayButton(false));

function syncPlayButton(isPlaying) {
  const symbol = isPlaying ? '⏸' : '▶';
  const mainBtn = document.getElementById('play-btn');
  if (mainBtn) mainBtn.textContent = symbol;
  if (pipWindow && !pipWindow.closed) {
    const pipBtn = pipWindow.document.getElementById('pip-play');
    if (pipBtn) pipBtn.textContent = symbol;
  }
}

// ── 2. YouTube IFrame API ─────────────────────────────────────────────────────
let ytPlayer = null;
let ytReady  = false;

window.onYouTubeIframeAPIReady = () => {
  ytPlayer = new YT.Player('yt-player-host', {
    height: '80', width:  '120',
    playerVars: { autoplay: 0, controls: 0, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, origin: window.location.origin },
    events: {
      onReady: () => { ytReady = true; },
      onStateChange: onYTStateChange,
    },
  });
};

const ytScript = document.createElement('script');
ytScript.src = "https://www.youtube.com/iframe_api";
document.head.appendChild(ytScript);

function onYTStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    if (!audio.paused) audio.pause();
    syncPlayButton(true);
    activeSource = 'youtube';
    startYTProgressLoop(); // 유튜브 재생 시 루프 시작
  } else if (event.data === YT.PlayerState.PAUSED || event.data === YT.PlayerState.ENDED) {
    if (event.data === YT.PlayerState.ENDED) {
      if (activeSource === 'youtube') activeSource = 'local';
      nextTrack();
    }
    clearInterval(ytProgressInterval); // 정지 시 루프 중단
    syncPlayButton(false);
  }
}

export function extractYouTubeId(url) {
  const m = url.match(/(?:v=|\/)([a-zA-Z0-9_-]{11})|youtu\.be\/([a-zA-Z0-9_-]{11})/);
  return m ? (m[1] || m[2]) : null;
}

export function loadYouTubeVideo(url) {
  const id = extractYouTubeId(url);
  if (!id || !ytPlayer || !ytReady) return;
  if (!audio.paused) audio.pause();

  activeSource = 'youtube';
  ytPlayer.loadVideoById({ videoId: id, suggestedQuality: 'small' });
  updateTitleUI("YouTube 스트리밍", "YouTube Music");
}

function startYTProgressLoop() {
  if (ytProgressInterval) clearInterval(ytProgressInterval);
  ytProgressInterval = setInterval(() => {
    if (activeSource === 'youtube' && ytPlayer && ytReady) {
      updateProgressBar();
    }
  }, 500); // 0.5초마다 갱신
}

// ── 3. IndexedDB (드래그 앤 드롭 재정렬 포함) ──────────────────────────────
const dbName = 'LofiMusicDB';
let db;
const request = indexedDB.open(dbName, 1);

request.onupgradeneeded = function(e) {
  db = e.target.result;
  if (!db.objectStoreNames.contains('tracks')) db.createObjectStore('tracks', { keyPath: 'id', autoIncrement: true });
};
request.onsuccess = function(e) {
  db = e.target.result;
  loadSavedTracks();
};

function loadSavedTracks() {
  const tx = db.transaction('tracks', 'readonly');
  const store = tx.objectStore('tracks');
  store.getAll().onsuccess = function(req) {
    tracks.length = 0;
    req.target.result.forEach(item => {
      if (item.type === 'youtube') {
        tracks.push({ id: item.id, t: item.name, a: item.artist, type: 'youtube', ytId: item.ytId });
      } else {
        // fileBlob을 같이 캐싱해둬야 드래그로 순서를 바꿀 때 DB에 다시 넣을 수 있습니다.
        tracks.push({ id: item.id, t: item.name, a: item.artist, url: URL.createObjectURL(item.fileBlob), type: item.type || 'local', fileBlob: item.fileBlob });
      }
    });
    renderPlaylist();
  };
}

// ✨ 드래그로 순서가 바뀌었을 때 DB를 통째로 갱신하는 함수
function rebuildDatabase() {
  if (!db) return;
  const tx = db.transaction('tracks', 'readwrite');
  const store = tx.objectStore('tracks');
  store.clear().onsuccess = () => {
    tracks.forEach(t => {
      const obj = { name: t.t, artist: t.a, type: t.type };
      if (t.type === 'youtube') obj.ytId = t.ytId;
      else obj.fileBlob = t.fileBlob; 
      store.add(obj).onsuccess = (e) => { t.id = e.target.result; }; // 새 ID 발급
    });
  };
}

// ── 4. 로컬/유튜브 플레이어 내부 로직 ───────────────────────────────────────
function updateTitleUI(title, artist) {
  const titleEl = document.getElementById('player-title');
  const infoEl = document.getElementById('player-info');

  if (titleEl && infoEl) {
    titleEl.classList.remove('scroll');
    titleEl.style.textOverflow = 'clip';
    titleEl.textContent = title;

    requestAnimationFrame(() => {
      if (titleEl.scrollWidth > infoEl.clientWidth) {
        // ✨ 마법의 핵심: 삐져나간 길이를 계산해서 음수(왼쪽 이동) 픽셀로 만듭니다.
        const dist = infoEl.clientWidth - titleEl.scrollWidth;
        
        // CSS 애니메이션에게 "이만큼만 이동해!" 라고 거리를 알려줍니다.
        titleEl.style.setProperty('--scroll-dist', dist + 'px');
        titleEl.classList.add('scroll');
      } else {
        titleEl.style.textOverflow = 'ellipsis'; 
      }
    });
  }
  
  const artistEl = document.getElementById('player-artist');
  if (artistEl) artistEl.textContent = artist;

  // ✨ PiP (미니 창) 모드에도 똑같은 원리 적용
  if (pipWindow && !pipWindow.closed) {
    const pt = pipWindow.document.getElementById('pip-song-title');
    const pa = pipWindow.document.getElementById('pip-song-artist');
    
    if (pt) {
      pt.classList.remove('scroll');
      pt.style.textOverflow = 'clip';
      pt.textContent = '🎵 ' + title;
      
      pipWindow.requestAnimationFrame(() => {
        if (pt.scrollWidth > pt.parentElement.clientWidth) {
          const pipDist = pt.parentElement.clientWidth - pt.scrollWidth;
          pt.style.setProperty('--scroll-dist', pipDist + 'px');
          pt.classList.add('scroll');
        } else {
          pt.style.textOverflow = 'ellipsis';
        }
      });
    }
    if (pa) pa.textContent = artist;
  }
}

function loadTrack(i, autoplay = true) {
  if (!tracks.length) return;
  i = (i + tracks.length) % tracks.length;
  curTrack = i;
  const t = tracks[i];

  updateTitleUI(t.t, t.a);

  if (t.type === 'youtube') {
    if (!audio.paused) audio.pause();
    activeSource = 'youtube';
    if (ytPlayer && ytReady) {
      ytPlayer.loadVideoById({ videoId: t.ytId, suggestedQuality: 'small' });
      if (!autoplay) ytPlayer.pauseVideo();
    }
  } else if (t.url) {
    if (ytPlayer && ytReady && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
    activeSource = 'local';
    audio.src = t.url;
    
    if (autoplay) {
      audio.play()
        .then(() => syncPlayButton(true))
        .catch(() => syncPlayButton(false));
    } else {
      syncPlayButton(false);
    }
  }

  renderPlaylist();
  updateProgressBar();
}

function updateProgressBar() {
  let pct = 0;

  if (activeSource === 'local') {
    if (!audio.duration || isNaN(audio.duration)) return;
    pct = (audio.currentTime / audio.duration) * 100;
  } else if (activeSource === 'youtube') {
    if (!ytPlayer || !ytReady || typeof ytPlayer.getDuration !== 'function') return;
    const duration = ytPlayer.getDuration();
    const currentTime = ytPlayer.getCurrentTime();
    if (duration > 0) {
      pct = (currentTime / duration) * 100;
    }
  }

  // 메인 UI 바 업데이트
  const mainBar = document.getElementById('player-bar');
  if (mainBar) mainBar.style.width = pct + '%';

  // PiP UI 바 업데이트
  if (pipWindow && !pipWindow.closed) {
    const pipBar = pipWindow.document.getElementById('pip-player-bar');
    if (pipBar) pipBar.style.width = pct + '%';
  }
}

function renderPlaylist() {
  const plBody = document.getElementById('pl-body');
  if (!plBody) return;

  if (!tracks.length) {
    plBody.innerHTML = '<div style="font-size:11px;color:#3d6070;text-align:center;padding:16px 0;">파일, 폴더 또는 유튜브 링크를 추가하세요</div>';
    return;
  }

  // ✨ 드래그 가능하도록 draggable="true" 와 고유 데이터(data-idx) 부여
  plBody.innerHTML = tracks.map((t, i) => `
    <div class="pl-item${i === curTrack ? ' playing' : ''}" data-idx="${i}" draggable="true">
      <span class="pl-num">${i === curTrack ? '▶' : i + 1}</span>
      <div class="pl-info">
        <div class="pl-name">${t.type === 'youtube' ? '📺 ' : ''}${escHtml(t.t)}</div>
        <div class="pl-artist">${escHtml(t.a)}</div>
      </div>
      <button class="pl-del-btn" title="제거">✕</button>
    </div>
  `).join('');
}

// ✨ 이벤트 위임(Event Delegation)을 통한 클릭 및 드래그 앤 드롭 구현
window.addEventListener('DOMContentLoaded', () => {
  const plBody = document.getElementById('pl-body');
  if (!plBody) return;

  // 클릭하여 재생 및 제거하기
  plBody.addEventListener('click', (e) => {
    const item = e.target.closest('.pl-item');
    if (!item) return;
    const idx = parseInt(item.dataset.idx);
    
    if (e.target.closest('.pl-del-btn')) {
      removeTrack(e, idx); // X 버튼 클릭 시
    } else {
      loadTrack(idx);      // 곡 영역 클릭 시
    }
  });

  // 드래그 앤 드롭 기능
  let draggedIdx = null;

  plBody.addEventListener('dragstart', (e) => {
    const item = e.target.closest('.pl-item');
    if (item) {
      draggedIdx = parseInt(item.dataset.idx);
      e.dataTransfer.effectAllowed = 'move';
      setTimeout(() => item.classList.add('dragging'), 0);
    }
  });

  plBody.addEventListener('dragover', (e) => {
    e.preventDefault(); // 필수: 드롭을 허용함
    const draggingItem = plBody.querySelector('.dragging');
    const targetItem = e.target.closest('.pl-item');
    if (targetItem && targetItem !== draggingItem) {
      const rect = targetItem.getBoundingClientRect();
      const offset = e.clientY - rect.top;
      // 마우스가 항목의 절반을 넘어가면 밑으로, 아니면 위로 밀어냄
      if (offset > rect.height / 2) targetItem.after(draggingItem);
      else targetItem.before(draggingItem);
    }
  });

  plBody.addEventListener('dragend', (e) => {
    const item = e.target.closest('.pl-item');
    if (item) item.classList.remove('dragging');

    // DOM에 배치된 순서대로 tracks 배열을 재정렬합니다.
    const newTracks = [];
    let newCurTrack = -1;
    const items = plBody.querySelectorAll('.pl-item');
    items.forEach((node, index) => {
      const oldIdx = parseInt(node.dataset.idx);
      newTracks.push(tracks[oldIdx]);
      if (oldIdx === curTrack) newCurTrack = index; // 현재 재생 중인 곡의 인덱스도 갱신
    });

    tracks.length = 0;
    tracks.push(...newTracks);
    curTrack = newCurTrack;

    rebuildDatabase(); // 재정렬된 배열을 통째로 DB에 저장
    renderPlaylist();  // 번호(인덱스) 재렌더링
  });

  // 오디오 진행 바 탐색
  const progressEl = document.getElementById('player-progress');
  if (progressEl) {
    progressEl.addEventListener('click', function(e) {
      if (activeSource === 'youtube' || !audio.duration) return;
      const rect = this.getBoundingClientRect();
      audio.currentTime = ((e.clientX - rect.left) / rect.width) * audio.duration;
    });
  }
});

audio.addEventListener('ended', () => nextTrack());
audio.addEventListener('timeupdate', () => {
  if (!isUpdatingProgress && activeSource === 'local') {
    isUpdatingProgress = true;
    requestAnimationFrame(() => {
      updateProgressBar();
      isUpdatingProgress = false;
    });
  }
});

// ── 5. 외부 export ────────────────────────────────────────────────────────────

export function togglePlay() {
  if (!tracks.length) return;
  if (curTrack < 0) { loadTrack(0); return; }

  if (tracks[curTrack].type === 'youtube') {
    if (ytPlayer && ytReady) {
      if (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
      else ytPlayer.playVideo();
    }
  } else {
    if (audio.paused) {
      activeSource = 'local';
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
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
  if (e) e.stopPropagation();
  const trackId = tracks[i].id;
  if (trackId !== undefined && db) {
    db.transaction('tracks', 'readwrite').objectStore('tracks').delete(trackId);
  }
  if (tracks[i].type !== 'youtube') URL.revokeObjectURL(tracks[i].url);
  tracks.splice(i, 1);

  if (curTrack === i) {
    audio.pause();
    if (ytPlayer && ytReady && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING) ytPlayer.pauseVideo();
    curTrack = -1;
    updateTitleUI("—", "파일을 추가하세요");
    if (tracks.length) loadTrack(0, false);
  } else if (curTrack > i) {
    curTrack--;
  }
  renderPlaylist();
}

export function addFiles(files) {
  if (!db) return;
  const audioExts = /\.(mp3|wav|flac|ogg|m4a|aac|opus|wma)$/i;
  const tx = db.transaction('tracks', 'readwrite');
  const store = tx.objectStore('tracks');
  let added = 0;

  Array.from(files)
    .filter(f => audioExts.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(f => {
      const name = f.name.replace(/\.[^.]+$/, '');
      const artist = f.webkitRelativePath ? f.webkitRelativePath.split('/')[0] : '로컬 파일';
      const req = store.add({ name, artist, fileBlob: f, type: 'local' });

      req.onsuccess = function(e) {
        tracks.push({ id: e.target.result, t: name, a: artist, url: URL.createObjectURL(f), type: 'local', fileBlob: f });
        added++;
        renderPlaylist();
        if (curTrack < 0 && added === 1) loadTrack(0, false);
      };
    });
}

export async function addYouTubeToPlaylist() {
  const urlInput = document.getElementById('main-yt-url');
  if (!urlInput) return;
  const url = urlInput.value.trim();
  const id = extractYouTubeId(url);
  if (!id) { alert("유효하지 않은 YouTube URL입니다."); return; }

  urlInput.value = "제목을 가져오는 중...";
  let title = "YouTube 스트리밍", artist = "YouTube";

  try {
    const res = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`);
    if (res.ok) {
      const data = await res.json();
      title = data.title;
      artist = data.author_name;
    }
  } catch (e) {}

  if (db) {
    const store = db.transaction('tracks', 'readwrite').objectStore('tracks');
    store.add({ name: title, artist: artist, type: 'youtube', ytId: id }).onsuccess = function(e) {
      tracks.push({ id: e.target.result, t: title, a: artist, type: 'youtube', ytId: id });
      renderPlaylist();
      urlInput.value = "";
      document.getElementById('yt-add-box').style.display = 'none';
      if (curTrack < 0) loadTrack(0);
    };
  }
}

export function refreshPlayerUI() {
  if (curTrack < 0 || !tracks[curTrack]) return;
  const t = tracks[curTrack];
  
  // 1. 제목 및 아티스트 업데이트 
  updateTitleUI(t.t, t.a);
  
  // 2. 재생 버튼 상태 강제 동기화
  let isPlaying = false;
  if (activeSource === 'local') {
    isPlaying = !audio.paused;
  } else if (activeSource === 'youtube' && ytPlayer && ytReady) {
    isPlaying = (ytPlayer.getPlayerState() === YT.PlayerState.PLAYING);
  }
  syncPlayButton(isPlaying);
}
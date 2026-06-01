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


// 오디오 상태 동기화
audio.addEventListener('play', () => syncPlayButton(true));
audio.addEventListener('pause', () => syncPlayButton(false));

function syncPlayButton(isPlaying) {
  const symbol = isPlaying ? '||' : '|>';
  const mainBtn = document.getElementById('play-btn');
  if (mainBtn) {
    mainBtn.textContent = symbol;
    mainBtn.classList.toggle('active', isPlaying);
  }
  const phoneBtn = document.getElementById('phone-play-btn');
  if (phoneBtn) {
    phoneBtn.textContent = symbol;
    phoneBtn.classList.toggle('active', isPlaying);
  }
  if (pipWindow && !pipWindow.closed) {
    const pipBtn = pipWindow.document.getElementById('pip-play');
    if (pipBtn) pipBtn.textContent = symbol;
  }
}

//YouTube IFrame API 
let ytPlayer = null;
let ytReady  = false;
let ytApiPromise = null;
let ytApiTimeout = null;
let ytPlayerReadyResolve = null;
let ytPlayerReadyReject = null;
let currentYouTubeVideoId = null;
let pendingYouTubeAutoplay = false;
let isYouTubeVideoEnabled = localStorage.getItem('lofi_youtube_video') !== 'off';

window.onYouTubeIframeAPIReady = () => {
  createYouTubePlayer();
};

function createYouTubePlayer() {
  if (ytPlayer) return;

  ytPlayer = new YT.Player('yt-player-host', {
    height: '146', width:  '260',
    host: 'https://www.youtube.com',
    playerVars: { autoplay: 0, controls: 0, modestbranding: 1, playsinline: 1, disablekb: 1, fs: 0, rel: 0, iv_load_policy: 3, enablejsapi: 1, origin: window.location.origin },
    events: {
      onReady: () => { 
        ytReady = true; 
        clearTimeout(ytApiTimeout);
        ytPlayerReadyResolve?.(ytPlayer);
        if (curTrack >= 0 && tracks[curTrack] && tracks[curTrack].type === 'youtube') {
          ytPlayer.cueVideoById({ videoId: tracks[curTrack].ytId, suggestedQuality: 'small' });
        }
      },
      onStateChange: onYTStateChange,
      onError: onYTError,
    },
  });
}

function ensureYouTubePlayer() {
  if (ytReady && ytPlayer) return Promise.resolve(ytPlayer);
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve, reject) => {
    ytPlayerReadyResolve = resolve;
    ytPlayerReadyReject = reject;
    ytApiTimeout = setTimeout(() => {
      ytApiPromise = null;
      reject(new Error('YouTube IFrame API 로딩 시간이 초과되었습니다.'));
    }, 9000);

    if (window.YT && typeof window.YT.Player === 'function') {
      createYouTubePlayer();
      return;
    }

    let ytScript = document.querySelector('script[data-youtube-iframe-api]');
    if (!ytScript) {
      ytScript = document.createElement('script');
      ytScript.src = 'https://www.youtube.com/iframe_api';
      ytScript.async = true;
      ytScript.dataset.youtubeIframeApi = 'true';
      ytScript.onerror = () => {
        clearTimeout(ytApiTimeout);
        ytApiPromise = null;
        ytScript.remove();
        ytPlayerReadyReject?.(new Error('YouTube IFrame API가 차단되었거나 로드되지 않았습니다.'));
      };
      document.head.appendChild(ytScript);
    }
  });

  return ytApiPromise;
}

function getYouTubeWatchUrl(videoId = currentYouTubeVideoId) {
  return videoId ? `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}` : 'https://www.youtube.com/';
}

function setYouTubeAssist(message, visible = true) {
  const assist = document.getElementById('youtube-player-assist');
  const messageEl = document.getElementById('youtube-player-message');
  if (messageEl) messageEl.textContent = message;
  if (assist) assist.classList.toggle('active', visible);
}

function showYouTubePlayerShell(title = 'YouTube') {
  const shell = document.getElementById('youtube-player-shell');
  const titleEl = document.getElementById('youtube-player-title');
  if (titleEl) titleEl.textContent = title;
  if (shell) shell.classList.add('active');
}

function hideYouTubePlayerShell() {
  const shell = document.getElementById('youtube-player-shell');
  if (shell) shell.classList.remove('active');
  setYouTubeAssist('', false);
}

function syncYouTubeVideoButton() {
  const btn = document.getElementById('yt-video-toggle-btn');
  if (!btn) return;
  btn.classList.toggle('active', isYouTubeVideoEnabled);
  btn.title = isYouTubeVideoEnabled ? '뮤직비디오 끄기' : '뮤직비디오 켜기';
}

function maybeShowYouTubePlayerShell(title = 'YouTube') {
  syncYouTubeVideoButton();
  if (isYouTubeVideoEnabled) {
    showYouTubePlayerShell(title);
  } else {
    hideYouTubePlayerShell();
  }
}

function setYouTubeVideoEnabled(enabled) {
  isYouTubeVideoEnabled = enabled;
  localStorage.setItem('lofi_youtube_video', enabled ? 'on' : 'off');
  syncYouTubeVideoButton();

  if (!enabled) {
    hideYouTubePlayerShell();
    return;
  }

  if (activeSource === 'youtube' && currentYouTubeVideoId) {
    const title = curTrack >= 0 && tracks[curTrack] ? tracks[curTrack].t : 'YouTube';
    showYouTubePlayerShell(title);
    setYouTubeAssist('', false);
  }
}

function retryYouTubePlayback() {
  if (!currentYouTubeVideoId) return;
  setYouTubeVideoEnabled(true);
  setYouTubeAssist('', false);
  showYouTubePlayerShell('YouTube 재생 중');
  ensureYouTubePlayer()
    .then((player) => {
      if (pendingYouTubeAutoplay) {
        player.loadVideoById({ videoId: currentYouTubeVideoId, suggestedQuality: 'small' });
      } else {
        player.cueVideoById({ videoId: currentYouTubeVideoId, suggestedQuality: 'small' });
      }
    })
    .catch(handleYouTubeUnavailable);
}

function openCurrentYouTube() {
  window.open(getYouTubeWatchUrl(), '_blank', 'noopener,noreferrer');
}

window.hideYouTubePlayer = () => setYouTubeVideoEnabled(false);
window.retryYouTubePlayback = retryYouTubePlayback;
window.openCurrentYouTube = openCurrentYouTube;

export function toggleYouTubeVideo() {
  setYouTubeVideoEnabled(!isYouTubeVideoEnabled);
}

function describeYouTubeError(code) {
  if (code === 2) return 'YouTube 영상 ID나 URL이 올바르지 않습니다. 링크를 다시 확인해주세요.';
  if (code === 5) return '브라우저의 HTML5 재생 환경에서 YouTube가 거절되었습니다. 브라우저 재생 권한/확장 프로그램을 확인한 뒤 다시 시도해주세요.';
  if (code === 100) return '이 영상은 삭제되었거나 비공개 상태라 재생할 수 없습니다.';
  if (code === 101 || code === 150) return '이 영상은 업로더가 외부 사이트 임베드 재생을 막아둔 상태입니다. 앱 안에서는 재생할 수 없고 YouTube에서 직접 열어야 합니다.';
  if (code === 153) return '브라우저가 YouTube 재생에 필요한 출처 정보를 보내지 못했습니다. 추적 방지/광고 차단 설정에서 YouTube를 허용한 뒤 다시 시도해주세요.';
  return `YouTube 재생 오류가 발생했습니다. 오류 코드: ${code}`;
}

function showYouTubePermissionPrompt(message) {
  showYouTubePlayerShell('YouTube 확인 필요');
  syncYouTubeVideoButton();
  setYouTubeAssist(`${message} 아래 버튼으로 다시 시도하거나 YouTube에서 직접 열 수 있습니다.`);
}

function onYTError(event) {
  console.warn('YouTube player error:', event.data);
  syncPlayButton(false);
  showYouTubePermissionPrompt(describeYouTubeError(event.data));
}

function handleYouTubeUnavailable(error) {
  console.warn('YouTube player unavailable:', error);
  syncPlayButton(false);
  showYouTubePermissionPrompt('YouTube 플레이어 스크립트가 차단되었거나 로드되지 않았습니다. Brave Shields/광고 차단/추적 방지에서 youtube.com을 허용해주세요.');
}

function onYTStateChange(event) {
  if (event.data === 1) {
    if (!audio.paused) audio.pause();
    syncPlayButton(true);
    activeSource = 'youtube';
    startYTProgressLoop(); // 유튜브 재생 시 루프 시작
  } else if (event.data === 2 || event.data === 0) {
    if (event.data === 0) {
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
  if (!id) return;
  if (!audio.paused) audio.pause();

  activeSource = 'youtube';
  currentYouTubeVideoId = id;
  pendingYouTubeAutoplay = true;
  maybeShowYouTubePlayerShell('YouTube 스트리밍');
  setYouTubeAssist('', false);
  updateTitleUI("YouTube 스트리밍", "YouTube Music");
  ensureYouTubePlayer()
    .then((player) => player.loadVideoById({ videoId: id, suggestedQuality: 'small' }))
    .catch(handleYouTubeUnavailable);
}

function startYTProgressLoop() {
  if (ytProgressInterval) clearInterval(ytProgressInterval);
  ytProgressInterval = setInterval(() => {
    if (activeSource === 'youtube' && ytPlayer && ytReady) {
      updateProgressBar();
    }
  }, 500); // 0.5초마다 갱신
}

// IndexedDB 
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
  const currentUserId = localStorage.getItem('lofi_user_id') || 'guest';

  store.getAll().onsuccess = function(req) {
    tracks.length = 0;
    req.target.result.forEach(item => {
      if (item.userId === currentUserId || (!item.userId && currentUserId === 'guest')) {
        if (item.type === 'youtube') {
          tracks.push({ id: item.id, t: item.name, a: item.artist, type: 'youtube', ytId: item.ytId });
        } else {
          tracks.push({ id: item.id, t: item.name, a: item.artist, url: URL.createObjectURL(item.fileBlob), type: item.type || 'local', fileBlob: item.fileBlob });
        }
      }
    });
    renderPlaylist();
  };
}

function rebuildDatabase() {
  if (!db) return;
  const tx = db.transaction('tracks', 'readwrite');
  const store = tx.objectStore('tracks');
  const currentUserId = localStorage.getItem('lofi_user_id') || 'guest';

  store.getAll().onsuccess = function(e) {
    e.target.result.forEach(item => {
      if (item.userId === currentUserId || (!item.userId && currentUserId === 'guest')) {
        store.delete(item.id);
      }
    });
    
    tracks.forEach(t => {
      const obj = { name: t.t, artist: t.a, type: t.type, userId: currentUserId };
      if (t.type === 'youtube') obj.ytId = t.ytId;
      else obj.fileBlob = t.fileBlob; 
      store.add(obj).onsuccess = (ev) => { t.id = ev.target.result; };
    });
  };
}

// 로컬/유튜브 플레이어 내부 로직
function updateTitleUI(title, artist) {
  const titleEl = document.getElementById('player-title');
  const infoEl = document.getElementById('player-info');

  if (titleEl && infoEl) {
    titleEl.classList.remove('scroll');
    titleEl.style.textOverflow = 'clip';
    titleEl.textContent = title;

    requestAnimationFrame(() => {
      if (titleEl.scrollWidth > infoEl.clientWidth) {
        const dist = infoEl.clientWidth - titleEl.scrollWidth;
        
        titleEl.style.setProperty('--scroll-dist', dist + 'px');
        titleEl.classList.add('scroll');
      } else {
        titleEl.style.textOverflow = 'ellipsis'; 
      }
    });
  }
  
  const artistEl = document.getElementById('player-artist');
  if (artistEl) artistEl.textContent = artist;

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
    currentYouTubeVideoId = t.ytId;
    pendingYouTubeAutoplay = autoplay;
    maybeShowYouTubePlayerShell(t.t);
    setYouTubeAssist('', false);

    ensureYouTubePlayer().then((player) => {
      if (!tracks[curTrack] || tracks[curTrack].ytId !== t.ytId) return;
      if (autoplay) {
        player.loadVideoById({ videoId: t.ytId, suggestedQuality: 'small' });
      } else {
        player.cueVideoById({ videoId: t.ytId, suggestedQuality: 'small' });
      }
    }).catch(handleYouTubeUnavailable);
    
    if (!autoplay) syncPlayButton(false);
    
  } else if (t.url) {
    if (ytPlayer && ytReady && typeof ytPlayer.getPlayerState === 'function') {
      if (ytPlayer.getPlayerState() === 1) ytPlayer.pauseVideo();
    }
    hideYouTubePlayerShell();
    
    activeSource = 'local';
    audio.src = t.url;
    
    if (autoplay) {
      audio.play().then(() => syncPlayButton(true)).catch(() => syncPlayButton(false));
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

window.addEventListener('DOMContentLoaded', () => {
  syncYouTubeVideoButton();
  const plBody = document.getElementById('pl-body');
  if (!plBody) return;

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
    e.preventDefault(); 
    const draggingItem = plBody.querySelector('.dragging');
    const targetItem = e.target.closest('.pl-item');
    if (targetItem && targetItem !== draggingItem) {
      const rect = targetItem.getBoundingClientRect();
      const offset = e.clientY - rect.top;
      if (offset > rect.height / 2) targetItem.after(draggingItem);
      else targetItem.before(draggingItem);
    }
  });

  plBody.addEventListener('dragend', (e) => {
    const item = e.target.closest('.pl-item');
    if (item) item.classList.remove('dragging');

    const newTracks = [];
    let newCurTrack = -1;
    const items = plBody.querySelectorAll('.pl-item');
    items.forEach((node, index) => {
      const oldIdx = parseInt(node.dataset.idx);
      newTracks.push(tracks[oldIdx]);
      if (oldIdx === curTrack) newCurTrack = index; 
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

// 외부 export 

export function togglePlay() {
  if (!tracks.length) return;
  if (curTrack < 0) { loadTrack(0); return; }

  if (tracks[curTrack].type === 'youtube') {
    currentYouTubeVideoId = tracks[curTrack].ytId;
    pendingYouTubeAutoplay = true;
    maybeShowYouTubePlayerShell(tracks[curTrack].t);
    setYouTubeAssist('', false);
    ensureYouTubePlayer().then((player) => {
      if (!tracks[curTrack] || tracks[curTrack].type !== 'youtube') return;
      const state = typeof player.getPlayerState === 'function' ? player.getPlayerState() : -1;
      
      // 1: 재생 중, 2: 일시 정지, 5: 장전됨(Cue), -1: 시작 전
      if (state === 1) {
        player.pauseVideo();
      } else if (state === 2) {
        player.playVideo();
      } else {
        // 대기 중(5)이거나 에러/시작 전(-1)이라면 무조건 영상을 새로 불러와서 '강제 재생'
        player.loadVideoById({ videoId: tracks[curTrack].ytId, suggestedQuality: 'small' });
      }
    }).catch(handleYouTubeUnavailable);
  } else {
    // 로컬 파일 재생 로직
    if (audio.paused) {
      activeSource = 'local';
      audio.play().then(() => syncPlayButton(true)).catch(() => syncPlayButton(false));
    } else {
      audio.pause();
      syncPlayButton(false);
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
    if (ytPlayer && ytReady && ytPlayer.getPlayerState() === 1) ytPlayer.pauseVideo();
    hideYouTubePlayerShell();
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
  const currentUserId = localStorage.getItem('lofi_user_id') || 'guest'; // ✨ 추가
  let added = 0;

  Array.from(files)
    .filter(f => audioExts.test(f.name))
    .sort((a, b) => a.name.localeCompare(b.name))
    .forEach(f => {
      const name = f.name.replace(/\.[^.]+$/, '');
      const artist = f.webkitRelativePath ? f.webkitRelativePath.split('/')[0] : '로컬 파일';
      const req = store.add({ name, artist, fileBlob: f, type: 'local', userId: currentUserId });

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
    const currentUserId = localStorage.getItem('lofi_user_id') || 'guest'; // ✨ 추가
    
    store.add({ name: title, artist: artist, type: 'youtube', ytId: id, userId: currentUserId }).onsuccess = function(e) {
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
  
  // 제목 및 아티스트 업데이트 
  updateTitleUI(t.t, t.a);
  
  // 재생 버튼 상태 강제 동기화
  let isPlaying = false;
  if (activeSource === 'local') {
    isPlaying = !audio.paused;
  } else if (activeSource === 'youtube' && ytPlayer && ytReady) {
    isPlaying = (ytPlayer.getPlayerState() === 1);
  }
  syncPlayButton(isPlaying);
}

export function reloadPlaylistForUser() {
  if (!db) return;
  
  // 기존 재생 중이던 음악 정지
  if (audio && !audio.paused) audio.pause();
  if (ytPlayer && ytReady && ytPlayer.getPlayerState() === 1) ytPlayer.pauseVideo();
  hideYouTubePlayerShell();
  
  // UI 초기화
  curTrack = -1;
  const titleEl = document.getElementById('player-title');
  if (titleEl) { titleEl.textContent = "—"; titleEl.classList.remove('scroll'); }
  const artistEl = document.getElementById('player-artist');
  if (artistEl) artistEl.textContent = "음악을 추가하세요";
  
  const playBtn = document.getElementById('play-btn');
  if (playBtn) playBtn.textContent = '|>';
  const phoneBtn = document.getElementById('phone-play-btn');
  if (phoneBtn) phoneBtn.textContent = '|>';

  // 내 DB만 다시 로드하기
  loadSavedTracks(); 
}

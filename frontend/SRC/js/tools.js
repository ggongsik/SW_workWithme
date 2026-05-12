// ============================================================================
// js/tools.js
// 사이드바 패널에 들어가는 노트, ToDo 리스트, 캘린더 기능을 관리합니다.
// ============================================================================

// ── 0. 공통 유틸리티 ──
// HTML 태그가 텍스트로 인식되도록 변환하여 보안(XSS 방지) 및 화면 깨짐을 막는 함수 (내부 전용)
export function escHtml(s) {
  if (!s) return "";
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}


// ============================================================================
// ── 1. 노트 (Note) 로직 ──
// ============================================================================
let notes = [{ title: '새로운 페이지', content: '' }];
let activeNote = 0;

// 노트 목록과 편집 영역을 화면에 다시 그리는 함수 (내부 전용)
function renderNotes() {
  const listEl = document.getElementById('note-list');
  const editArea = document.getElementById('note-edit-area');
  const titleInput = document.getElementById('note-title-input');
  const textarea = document.getElementById('note-textarea');

  if (!listEl || !editArea) return;

  listEl.innerHTML = notes.map((n, i) => `
    <div class="note-item${i === activeNote ? ' active' : ''}" onclick="selectNote(${i})">
      <span class="note-item-title">${escHtml(n.title) || '(제목 없음)'}</span>
      <div class="note-item-actions">
        <button class="note-icon-btn del" onclick="deleteNote(event,${i})">✕</button>
      </div>
    </div>
  `).join('');

  if (notes.length > 0) {
    editArea.style.display = 'block';
    titleInput.value = notes[activeNote].title;
    textarea.value = notes[activeNote].content;
  } else {
    editArea.style.display = 'none';
  }
}

// 특정 노트를 선택했을 때
export function selectNote(i) {
  activeNote = i;
  renderNotes();
}

// 현재 입력 중인 내용 저장
export function saveCurrentNote() {
  if (!notes.length) return;
  notes[activeNote].title = document.getElementById('note-title-input').value;
  notes[activeNote].content = document.getElementById('note-textarea').value;
  
  const items = document.querySelectorAll('#note-list .note-item');
  if (items[activeNote]) {
    items[activeNote].querySelector('.note-item-title').textContent = notes[activeNote].title || '(제목 없음)';
  }
}

// 새 노트 추가
export function addNoteFromInput() {
  const inp = document.getElementById('note-new-input');
  const title = inp.value.trim() || '새 페이지 ' + (notes.length + 1);
  notes.push({ title, content: '' });
  activeNote = notes.length - 1;
  inp.value = '';
  renderNotes();
  document.getElementById('note-title-input').focus();
}

// 노트 삭제
export function deleteNote(e, i) {
  e.stopPropagation();
  notes.splice(i, 1);
  if (activeNote >= notes.length) {
    activeNote = Math.max(0, notes.length - 1);
  }
  renderNotes();
}


// ============================================================================
// ── 2. ToDo 리스트 로직 ──
// ============================================================================
const todos = [];

// ToDo 리스트 화면 렌더링 (내부 전용)
function renderTodos() {
  const listEl = document.getElementById('todo-list');
  const countEl = document.getElementById('todo-count');
  if (!listEl || !countEl) return;

  const done = todos.filter(t => t.done).length;
  countEl.textContent = `${done} / ${todos.length} 완료`;

  listEl.innerHTML = todos.map((t, i) => `
    <div class="todo-item${t.done ? ' done' : ''}">
      <input type="checkbox" ${t.done ? 'checked' : ''} onclick="toggleTodo(${i})">
      <span>${escHtml(t.text)}</span>
      <button class="todo-del-btn" onclick="deleteTodo(${i})" title="삭제">✕</button>
    </div>
  `).join('');
}

// 할 일 추가
export function addTodo() {
  const inp = document.getElementById('todo-input');
  if (!inp.value.trim()) return;
  todos.push({ text: inp.value.trim(), done: false });
  inp.value = '';
  renderTodos();
}

// 체크박스 토글 (완료/미완료)
export function toggleTodo(i) {
  todos[i].done = !todos[i].done;
  renderTodos();
}

// 할 일 삭제
export function deleteTodo(i) {
  todos.splice(i, 1);
  renderTodos();
}


// ============================================================================
// ── 3. 캘린더 (Calendar) 로직 ──
// ============================================================================
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let calLabels = {}; // { 'YYYY-MM-DD': ['일정 1', '일정 2'] } 형식으로 저장
let calSelectedDate = null;

// 날짜를 YYYY-MM-DD 형식의 문자열 키로 변환 (내부 전용)
function calDateKey(y, m, d) {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 캘린더 화면 그리기 (내부 전용)
function renderCal() {
  const labelEl = document.getElementById('cal-label');
  const gridEl = document.getElementById('cal-grid');
  if (!labelEl || !gridEl) return;

  labelEl.textContent = `${calYear} / ${String(calMonth + 1).padStart(2, '0')}`;
  
  const today = new Date();
  const first = new Date(calYear, calMonth, 1).getDay();
  const days = new Date(calYear, calMonth + 1, 0).getDate();
  
  let html = ['일', '월', '화', '수', '목', '금', '토']
    .map(d => `<div class="cal-dow">${d}</div>`).join('');
    
  for (let i = 0; i < first; i++) {
    html += `<div class="cal-day empty">·</div>`;
  }
  
  for (let i = 1; i <= days; i++) {
    const isT = (i === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear());
    const key = calDateKey(calYear, calMonth, i);
    const hasL = calLabels[key] && calLabels[key].length > 0;
    const isSel = (calSelectedDate === key);
    
    html += `
      <div class="cal-day${isT ? ' today' : ''}${hasL ? ' has-label' : ''}${isSel ? ' today' : ''}" 
           style="${isSel ? 'background:rgba(0,100,180,0.3);' : ''}" 
           onclick="selectCalDay(${i})">
        ${i}
      </div>`;
  }
  
  gridEl.innerHTML = html;
  
  if (calSelectedDate) {
    renderCalLabelPanel();
  }
}

// 달 변경
export function changeMonth(d) {
  calMonth += d;
  if (calMonth > 11) {
    calMonth = 0;
    calYear++;
  }
  if (calMonth < 0) {
    calMonth = 11;
    calYear--;
  }
  renderCal();
}

// 특정 일자 클릭 시
export function selectCalDay(day) {
  const key = calDateKey(calYear, calMonth, day);
  calSelectedDate = key;
  renderCal();
  renderCalLabelPanel();
  
  document.getElementById('cal-label-panel').classList.add('open');
  document.getElementById('cal-label-input').focus();
}

// 일정 목록 패널 업데이트 (내부 전용)
function renderCalLabelPanel() {
  const key = calSelectedDate;
  if (!key) return;
  
  const [y, m, d] = key.split('-');
  document.getElementById('cal-selected-date').textContent = `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
  
  const labels = calLabels[key] || [];
  const listEl = document.getElementById('cal-label-list');
  
  if (labels.length === 0) {
    listEl.innerHTML = '<div style="font-size:11px;color:#3d6070;padding:2px 0;">등록된 일정이 없습니다</div>';
  } else {
    listEl.innerHTML = labels.map((l, i) => `
      <div class="cal-label-item">
        <div class="cal-label-dot"></div>
        <span>${escHtml(l)}</span>
        <button class="cal-label-del" onclick="deleteCalLabel('${key}',${i})">✕</button>
      </div>
    `).join('');
  }
}

// 일정 추가
export function addCalLabel() {
  const inp = document.getElementById('cal-label-input');
  if (!inp.value.trim() || !calSelectedDate) return;
  
  if (!calLabels[calSelectedDate]) {
    calLabels[calSelectedDate] = [];
  }
  
  calLabels[calSelectedDate].push(inp.value.trim());
  inp.value = '';
  
  renderCal();
  renderCalLabelPanel();
}

// 일정 삭제
export function deleteCalLabel(key, i) {
  calLabels[key].splice(i, 1);
  if (!calLabels[key].length) {
    delete calLabels[key];
  }
  renderCal();
  renderCalLabelPanel();
}

// ============================================================================
// ── 4. 모듈 초기화 실행 ──
// ============================================================================
// 이 파일이 로드(import)될 때, 빈 화면이 나오지 않도록 초기 렌더링을 1회 수행합니다.
renderNotes();
renderTodos();
renderCal();
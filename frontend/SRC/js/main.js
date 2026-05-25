
// js/main.js



import { initWebSocket } from './network.js';
import { openCalibration, closeCalibration, startCalibration, togglePostureCorrection } from './pose.js';
import { 
  checkLogin, logout, hideUI, restoreUI, togglePanel, closePanel, setTab, setTimeFmt, togglePiP, setUIGlow,closeReportAndLogout, isSignupMode, toggleSignupMode, handleSignup
} from './ui.js';
import { 
  adjRepeat, commitRepeat, numOnly, commitFocus, commitBreak, togglePomo 
} from './pomodoro.js';
import { togglePlay, prevTrack, nextTrack, toggleShuffle, removeTrack, addFiles, addYouTubeToPlaylist, refreshPlayerUI } from './player.js';
import { 
  addNoteFromInput, saveCurrentNote, selectNote, deleteNote, 
  addTodo, toggleTodo, deleteTodo, 
  changeMonth, selectCalDay, addCalLabel, deleteCalLabel 
} from './tools.js';
import { init3DScene } from './scene.js';


// ============================================================================
// 2. HTML 태그에 직접 적힌 함수들(onclick 등)이 모듈을 찾을 수 있도록 
// window (전역 객체)에 직접 연결해 줍니다.
// ============================================================================

// [로그인 & UI 제어]
window.checkLogin = checkLogin;
window.logout = logout;
window.hideUI = hideUI;
window.restoreUI = restoreUI;
window.togglePanel = togglePanel;
window.closePanel = closePanel;
window.setTab = setTab;
window.setTimeFmt = setTimeFmt;
window.togglePiP = togglePiP;
window.setUIGlow = setUIGlow;
window.closeReportAndLogout = closeReportAndLogout;
window.isSignupMode = isSignupMode;
window.toggleSignupMode = toggleSignupMode;
window.handleSignup = handleSignup;

// [포모도로 타이머]
window.adjRepeat = adjRepeat;
window.commitRepeat = commitRepeat;
window.numOnly = numOnly;
window.commitFocus = commitFocus;
window.commitBreak = commitBreak;
window.togglePomo = togglePomo;

// [오디오 플레이어]
window.prevTrack = prevTrack;
window.togglePlay = togglePlay;
window.nextTrack = nextTrack;
window.toggleShuffle = toggleShuffle;
window.addFiles = addFiles;
window.removeTrack = removeTrack;
window.addYouTubeToPlaylist = addYouTubeToPlaylist;
window.refreshPlayerUI = refreshPlayerUI;

// [노트]
window.addNoteFromInput = addNoteFromInput;
window.saveCurrentNote = saveCurrentNote;
window.selectNote = selectNote;
window.deleteNote = deleteNote;

// [ToDo 리스트]
window.addTodo = addTodo;
window.toggleTodo = toggleTodo;
window.deleteTodo = deleteTodo;

// [캘린더]
window.changeMonth = changeMonth;
window.selectCalDay = selectCalDay;
window.addCalLabel = addCalLabel;
window.deleteCalLabel = deleteCalLabel;

// [자세 캘리브레이션 (MediaPipe)]
window.openCalibration = openCalibration;
window.closeCalibration = closeCalibration;
window.startCalibration = startCalibration;
window.togglePostureCorrection = togglePostureCorrection;


// ============================================================================
// 3. 앱 초기화 (HTML이 다 로드된 후 최초 1회 실행될 세팅들)
// ============================================================================
window.addEventListener('DOMContentLoaded', () => {
  // 웹소켓 연결 시작
  initWebSocket();

  // 3D 배경 및 캐릭터 렌더링 시작
  init3DScene();

  console.log("Lofi Space App Initialized!");
});

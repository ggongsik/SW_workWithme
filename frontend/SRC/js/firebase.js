// js/firebase.js

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";



const firebaseConfig = {
    apiKey: "AIzaSyAeFeBlv4RaUVttxxpwntGwNdlb8YQcnUw",
    authDomain: "lofiproject-17ab9.firebaseapp.com",
    projectId: "lofiproject-17ab9",
    storageBucket: "lofiproject-17ab9.firebasestorage.app",
    messagingSenderId: "1034652779486",
    appId: "1:1034652779486:web:9d14a8dbe1c21b5a73134f",
    measurementId: "G-RLT6VV29PW"
  };

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
export const auth = getAuth(app); 

export async function registerUser(email, password) {
  return await createUserWithEmailAndPassword(auth, email, password);
}

export async function loginUser(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}

export async function getUserToken() {
  const user = auth.currentUser;
  if (user) {
    return await user.getIdToken(false); 
  }
  return null;
}

// ============================================================================
// 💾 Firestore 데이터베이스 자동 저장 & 불러오기
// ============================================================================

// 사용자 데이터 저장하기 (덮어쓰기)
export async function saveUserData(email, data) {
  try {
    const userRef = doc(db, "users", email);
    await setDoc(userRef, data, { merge: true }); // 기존 데이터에 병합(merge)
    console.log("☁️ Firebase에 데이터가 안전하게 저장되었습니다.");
  } catch (e) {
    console.error("데이터 저장 실패:", e);
  }
}

// 사용자 데이터 불러오기
export async function loadUserData(email) {
  try {
    const userRef = doc(db, "users", email);
    const docSnap = await getDoc(userRef);
    if (docSnap.exists()) {
      return docSnap.data();
    }
    return null;
  } catch (e) {
    console.error("데이터 불러오기 실패:", e);
    return null;
  }
}
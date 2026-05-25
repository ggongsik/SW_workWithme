// js/firebase.js

import { initializeApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword } from 'firebase/auth';

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
export const auth = getAuth(app); 

export async function registerUser(email, password) {
  return await createUserWithEmailAndPassword(auth, email, password);
}

export async function loginUser(email, password) {
  return await signInWithEmailAndPassword(auth, email, password);
}
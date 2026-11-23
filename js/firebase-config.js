import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

export const firebaseConfig = {
  apiKey: "AIzaSyB9bXuayNn4_-fOtpr-8opA1-pujtCbZXU",
  authDomain: "listme-101f2.firebaseapp.com",
  projectId: "listme-101f2",
  storageBucket: "listme-101f2.firebasestorage.app",
  messagingSenderId: "58511050788",
  appId: "1:58511050788:web:08c4c36c7d855f81f4f0b1"
};

export const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

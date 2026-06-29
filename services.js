/**
 * 파일명: services.js
 * 역할: Firebase 정식 인증 결합 처리, 데이터 마이그레이션 및 800ms 디바운스 실시간 원격 백업
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, 
    signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, 
    linkWithCredential, EmailAuthProvider, signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state } from './store.js';

let saveTimeout = null;

const defaultCfg = {
    apiKey: "AIzaSyA1234567890-SampleKeyOnly",
    authDomain: "prep-master-pro.firebaseapp.com",
    projectId: "prep-master-pro",
    storageBucket: "prep-master-pro.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:sampleappid"
};

const rawCfg = typeof __firebase_config !== 'undefined' && __firebase_config ? __firebase_config : null;
const firebaseConfig = rawCfg ? JSON.parse(rawCfg) : defaultCfg;

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
state.db = db;

export function migrateData(data) {
    if (data.phaseData && !data.phases) {
        let migrated = []; let idx = 1;
        for (let key in data.phaseData) { 
            migrated.push({ id: 'p_' + idx++, title: data.phaseData[key].title || key, desc: data.phaseData[key].desc || '', meals: data.phaseData[key].meals || [] }); 
        }
        data.phases = migrated;
    }
    return data;
}

export function saveToLocal() { 
    localStorage.setItem('prep_master_local_data', JSON.stringify({ 
        phases: state.phases, customSupps: state.customSupps, 
        userInfo: state.userInfo, workouts: state.workouts, templates: state.templates  
    })); 
}

export async function saveToCloud() {
    saveToLocal(); if (!state.userId || !state.db) return;
    try { 
        await setDoc(doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData'), { 
            phases: state.phases, customSupps: state.customSupps, 
            userInfo: state.userInfo, workouts: state.workouts, templates: state.templates  
        }, { merge: true }); 
    } catch(e) { console.error("Cloud DB Upload Error:", e); }
}

export function triggerSave(showToastCallback) {
    saveToLocal(); if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { saveToCloud(); if(showToastCallback) showToastCallback("저장 동기화 완료."); }, 800);
}

export async function loginWithGoogleBackend() {
    const provider = new GoogleAuthProvider();
    try {
        if (auth.currentUser && auth.currentUser.isAnonymous) {
            const result = await signInWithPopup(auth, provider);
            await linkWithCredential(auth.currentUser, GoogleAuthProvider.credentialFromResult(result));
            state.userInfo.isPermanent = true; state.userInfo.email = result.user.email; triggerSave();
            return { success: true, mode: "linked" };
        } else {
            const result = await signInWithPopup(auth, provider);
            state.userInfo.isPermanent = true; state.userInfo.email = result.user.email;
            return { success: true, mode: "login" };
        }
    } catch (error) { throw error; }
}

export async function registerWithEmailBackend(email, password) {
    try {
        if (auth.currentUser && auth.currentUser.isAnonymous) {
            const credential = EmailAuthProvider.credential(email, password);
            await linkWithCredential(auth.currentUser, credential);
            state.userInfo.isPermanent = true; state.userInfo.email = email; triggerSave();
            return { success: true, mode: "linked" };
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            state.userInfo.isPermanent = true; state.userInfo.email = userCredential.user.email;
            return { success: true, mode: "registered" };
        }
    } catch (error) { throw error; }
}

export async function loginWithEmailBackend(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        state.userInfo.isPermanent = true; state.userInfo.email = userCredential.user.email;
        return { success: true };
    } catch (error) { throw error; }
}

export async function logoutUserBackend() {
    try { await signOut(auth); localStorage.removeItem('prep_master_local_data'); location.reload(); } catch (error) {}
}

export function loadFromLocal() {
    const local = localStorage.getItem('prep_master_local_data');
    if (local) {
        try {
            let parsed = JSON.parse(local); parsed = migrateData(parsed);
            if (parsed.phases) state.phases = parsed.phases;
            if (parsed.customSupps) state.customSupps = parsed.customSupps;
            if (parsed.userInfo) state.userInfo = parsed.userInfo;
            if (parsed.workouts) state.workouts = parsed.workouts;   
            if (parsed.templates) state.templates = parsed.templates; 
            return true;
        } catch(e) { return false; }
    }
    return false;
}

export async function initializeFirebase(onInitComplete) {
    loadFromLocal(); 
    try {
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.userId = user.uid;
                if (!state.userInfo) state.userInfo = {};
                state.userInfo.isPermanent = !user.isAnonymous;
                if (!user.isAnonymous) state.userInfo.email = user.email || "정식 연동 회원";

                const snap = await getDoc(doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData'));
                if (snap.exists()) {
                    let data = snap.data(); data = migrateData(data);
                    if (data.phases) state.phases = data.phases; if (data.customSupps) state.customSupps = data.customSupps;
                    if (data.userInfo) state.userInfo = data.userInfo; if (data.workouts) state.workouts = data.workouts;   
                    if (data.templates) state.templates = data.templates; 
                    saveToLocal();
                } else { triggerSave(); }
                if(onInitComplete) onInitComplete(true);
            } else { signInAnonymously(auth).catch(() => { if(onInitComplete) onInitComplete(false); }); }
        });
    } catch (e) { if(onInitComplete) onInitComplete(false); }
}

export function exportDataJSON(showToastCallback) {
    const dataStr = JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo, workouts: state.workouts, templates: state.templates }, null, 2);
    const pad = n => n < 10 ? '0' + n : n; const now = new Date();
    const linkElement = document.createElement('a'); linkElement.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)); linkElement.setAttribute('download', `TotalPrep_MasterBackup_2026_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`); linkElement.click();
    if(showToastCallback) showToastCallback("통합 백업 파일이 저장되었습니다.");
}

export function importDataJSON(file, onSuccess, onError) {
    if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let data = JSON.parse(e.target.result); data = migrateData(data);
            if(data.phases) state.phases = data.phases; if(data.customSupps) state.customSupps = data.customSupps; 
            if(data.userInfo) state.userInfo = data.userInfo; if(data.workouts) state.workouts = data.workouts;   
            if(data.templates) state.templates = data.templates; 
            applyCustomSuppsToDB(); saveToLocal(); saveToCloud(); if(onSuccess) onSuccess();
        } catch(err) { if(onError) onError(); }
    };
    reader.readAsText(file);
}

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, GoogleAuthProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, linkWithCredential, EmailAuthProvider, signOut } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state } from './store.js';

let saveTimeout = null;

// 파이어베이스 프로젝트 구성 
const firebaseConfig = {
    apiKey: "AIzaSyA1234567890-SampleKeyOnly",
    authDomain: "prep-master-pro.firebaseapp.com",
    projectId: "prep-master-pro",
    storageBucket: "prep-master-pro.appspot.com",
    messagingSenderId: "1234567890",
    appId: "1:1234567890:web:sampleappid"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
state.db = db;

export function migrateData(data) {
    if (data.phaseData && !data.phases) {
        let migrated = []; let idx = 1;
        for (let key in data.phaseData) { migrated.push({ id: 'p_' + idx++, title: data.phaseData[key].title || key, desc: data.phaseData[key].desc || '', meals: data.phaseData[key].meals || [] }); }
        data.phases = migrated;
    }
    return data;
}

export function saveToLocal() { 
    localStorage.setItem('prep_master_local_data', JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo, workouts: state.workouts, templates: state.templates }));
}

export function triggerSave() {
    saveToLocal();
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (state.userId && state.db) {
            const userDocRef = doc(state.db, "users", state.userId);
            setDoc(userDocRef, { phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo, workouts: state.workouts, templates: state.templates, lastUpdated: new Date().toISOString() }, { merge: true })
            .catch(err => console.error("원격 동기화 실패:", err));
        }
    }, 800);
}

export async function loginWithGoogleBackend() {
    const provider = new GoogleAuthProvider();
    if (auth.currentUser && auth.currentUser.isAnonymous) {
        const result = await signInWithPopup(auth, provider);
        await linkWithCredential(auth.currentUser, GoogleAuthProvider.credentialFromResult(result));
        state.userInfo.isPermanent = true; state.userInfo.email = result.user.email; triggerSave(); return { success: true, mode: "linked" };
    } else { const result = await signInWithPopup(auth, provider); return { success: true, mode: "login" }; }
}

export async function registerWithEmailBackend(email, password) {
    if (auth.currentUser && auth.currentUser.isAnonymous) {
        await linkWithCredential(auth.currentUser, EmailAuthProvider.credential(email, password));
        state.userInfo.isPermanent = true; state.userInfo.email = email; triggerSave(); return { success: true, mode: "linked" };
    } else { await createUserWithEmailAndPassword(auth, email, password); return { success: true, mode: "registered" }; }
}

export async function loginWithEmailBackend(email, password) { await signInWithEmailAndPassword(auth, email, password); return { success: true }; }
export async function logoutUserBackend() { await signOut(auth); localStorage.removeItem('prep_master_local_data'); location.reload(); }

export function initializeFirebase(onReadyCallback) {
    const localRaw = localStorage.getItem('prep_master_local_data');
    if (localRaw) {
        try {
            let parsed = migrateData(JSON.parse(localRaw));
            if(parsed.phases) state.phases = parsed.phases; if(parsed.customSupps) state.customSupps = parsed.customSupps; if(parsed.userInfo) state.userInfo = parsed.userInfo; if(parsed.workouts) state.workouts = parsed.workouts; if(parsed.templates) state.templates = parsed.templates;
        } catch(e) { console.error("로컬 스토리지 무결성 오류:", e); }
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.userId = user.uid; if (!state.userInfo) state.userInfo = {};
            state.userInfo.isPermanent = !user.isAnonymous; if (!user.isAnonymous) state.userInfo.email = user.email || "정식 계정";

            try {
                const docSnap = await getDoc(doc(db, "users", user.uid));
                if (docSnap.exists()) {
                    let cloudData = migrateData(docSnap.data());
                    if(cloudData.phases) state.phases = cloudData.phases; if(cloudData.customSupps) state.customSupps = cloudData.customSupps; if(cloudData.userInfo) state.userInfo = cloudData.userInfo; if(cloudData.workouts) state.workouts = cloudData.workouts; if(cloudData.templates) state.templates = cloudData.templates;
                    saveToLocal();
                } else { triggerSave(); }
            } catch(err) { console.error("클라우드 다운로드 실패:", err); }
            if(onReadyCallback) onReadyCallback(true);
        } else { signInAnonymously(auth).catch(err => { if(onReadyCallback) onReadyCallback(false); }); }
    });
}

export function exportDataJSON(showToastCallback) {
    const dataStr = JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo, workouts: state.workouts, templates: state.templates }, null, 2); const pad = n => n < 10 ? '0' + n : n; const now = new Date();
    const linkElement = document.createElement('a'); linkElement.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)); linkElement.setAttribute('download', `TotalPrep_Backup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`); linkElement.click();
    if(showToastCallback) showToastCallback("통합 백업 파일 저장 완료.");
}

export function importDataJSON(file, onSuccess, onError) {
    if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let data = migrateData(JSON.parse(e.target.result));
            if(data.phases) state.phases = data.phases; if(data.customSupps) state.customSupps = data.customSupps; if(data.userInfo) state.userInfo = data.userInfo; if(data.workouts) state.workouts = data.workouts; if(data.templates) state.templates = data.templates;
            saveToLocal(); triggerSave(); if(onSuccess) onSuccess();
        } catch(err) { if(onError) onError(); }
    }; reader.readAsText(file);
}

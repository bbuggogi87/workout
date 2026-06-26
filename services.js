import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, applyCustomSuppsToDB } from './store.js';

let saveTimeout = null;

export async function initializeFirebase(onInitComplete) {
    try {
        const cfg = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : null;
        if (!cfg) { onInitComplete(false); return; }
        const app = initializeApp(cfg);
        const auth = getAuth(app);
        state.db = getFirestore(app);

        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.userId = user.uid;
                await loadFromCloud();
            }
            onInitComplete(true);
        });
    } catch (e) {
        onInitComplete(false);
    }
}

export async function loadFromCloud() {
    if (!state.userId || !state.db) return;
    const docRef = doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData');
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        const data = snap.data();
        if (data.phaseData) state.phaseData = data.phaseData;
        if (data.customSupps) state.customSupps = data.customSupps;
        if (data.userInfo) state.userInfo = data.userInfo;
    }
}

export async function saveToCloud() {
    if (!state.userId || !state.db) return;
    const docRef = doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData');
    await setDoc(docRef, { phaseData: state.phaseData, customSupps: state.customSupps, userInfo: state.userInfo }, { merge: true });
}

export function triggerSave(showToastCallback) {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveToCloud();
        if(showToastCallback) showToastCallback("클라우드 자동 동기화 완료.");
    }, 1000);
}

export function exportDataJSON(showToastCallback) {
    const dataStr = JSON.stringify({ phaseData: state.phaseData, customSupps: state.customSupps, userInfo: state.userInfo }, null, 2);
    const pad = n => n < 10 ? '0' + n : n; const now = new Date();
    const fileName = `Diet_현체중(${state.userInfo.weight})_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr));
    linkElement.setAttribute('download', fileName);
    linkElement.click();
    if(showToastCallback) showToastCallback("백업 파일이 저장되었습니다.");
}

export function importDataJSON(file, onSuccess, onError) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if(data.phaseData) state.phaseData = data.phaseData;
            if(data.customSupps) state.customSupps = data.customSupps;
            if(data.userInfo) state.userInfo = data.userInfo;
            applyCustomSuppsToDB();
            triggerSave();
            if(onSuccess) onSuccess();
        } catch(err) {
            if(onError) onError();
        }
    };
    reader.readAsText(file);
}
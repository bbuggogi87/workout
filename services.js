import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, applyCustomSuppsToDB } from './store.js';

let saveTimeout = null;

function saveToLocal() {
    localStorage.setItem('prep_master_local_data', JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo }));
}

function loadFromLocal() {
    const local = localStorage.getItem('prep_master_local_data');
    if (local) {
        try {
            const parsed = JSON.parse(local);
            if (parsed.phases) state.phases = parsed.phases;
            if (parsed.customSupps) state.customSupps = parsed.customSupps;
            if (parsed.userInfo) state.userInfo = parsed.userInfo;
        } catch(e) {}
    }
}

export async function initializeFirebase(onInitComplete) {
    loadFromLocal(); // 초기 구동 속도 향상을 위해 로컬 데이터 우선 렌더링
    
    try {
        const cfg = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : null;
        if (!cfg) { onInitComplete(false); return; } // 클라우드 설정이 없으면 즉각 로컬 모드
        
        const app = initializeApp(cfg);
        const auth = getAuth(app);
        state.db = getFirestore(app);

        await signInAnonymously(auth);
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.userId = user.uid;
                const docRef = doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData');
                const snap = await getDoc(docRef);
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.phaseData && !data.phases) { 
                        let migrated = []; let idx = 1;
                        for (let key in data.phaseData) { migrated.push({ id: 'p_' + idx++, title: data.phaseData[key].title || key, desc: data.phaseData[key].desc || '', meals: data.phaseData[key].meals || [] }); }
                        state.phases = migrated;
                    } else if (data.phases) { state.phases = data.phases; }
                    if (data.customSupps) state.customSupps = data.customSupps;
                    if (data.userInfo) state.userInfo = data.userInfo;
                    saveToLocal();
                }
            }
            onInitComplete(true);
        });
    } catch (e) {
        onInitComplete(false);
    }
}

export async function saveToCloud() {
    saveToLocal(); // 무조건 안전 백업
    if (!state.userId || !state.db) return;
    try {
        const docRef = doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData');
        await setDoc(docRef, { phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo }, { merge: true });
    } catch(e) {}
}

export function triggerSave(showToastCallback) {
    saveToLocal();
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        saveToCloud();
        if(showToastCallback) showToastCallback("저장 동기화 완료.");
    }, 1000);
}

export function exportDataJSON(showToastCallback) {
    const dataStr = JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo }, null, 2);
    const pad = n => n < 10 ? '0' + n : n; const now = new Date();
    const fileName = `Diet_현체중(${state.userInfo.weight})_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`;
    const linkElement = document.createElement('a'); linkElement.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)); linkElement.setAttribute('download', fileName); linkElement.click();
    if(showToastCallback) showToastCallback("백업 파일이 저장되었습니다.");
}

export function importDataJSON(file, onSuccess, onError) {
    if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if (data.phaseData && !data.phases) { 
                let migrated = []; let idx = 1;
                for (let key in data.phaseData) { migrated.push({ id: 'p_' + idx++, title: data.phaseData[key].title || key, desc: data.phaseData[key].desc || '', meals: data.phaseData[key].meals || [] }); }
                state.phases = migrated;
            } else if(data.phases) { state.phases = data.phases; }
            if(data.customSupps) state.customSupps = data.customSupps;
            if(data.userInfo) state.userInfo = data.userInfo;
            
            applyCustomSuppsToDB(); saveToLocal(); saveToCloud(); if(onSuccess) onSuccess();
        } catch(err) { if(onError) onError(); }
    };
    reader.readAsText(file);
}

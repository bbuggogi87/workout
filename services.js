import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, applyCustomSuppsToDB } from './store.js';

let saveTimeout = null;

// [핵심] 기존 DB 살리기: 구버전의 phaseData 객체를 신버전의 phases 배열로 완벽하게 자동 이관하는 함수
export function migrateData(data) {
    if (data.phaseData && !data.phases) {
        let migrated = []; let idx = 1;
        for (let key in data.phaseData) { migrated.push({ id: 'p_' + idx++, title: data.phaseData[key].title || key, desc: data.phaseData[key].desc || '', meals: data.phaseData[key].meals || [] }); }
        data.phases = migrated;
    }
    return data;
}

export function saveToLocal() { localStorage.setItem('prep_master_local_data', JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo })); }

export function loadFromLocal() {
    const local = localStorage.getItem('prep_master_local_data');
    if (local) {
        try {
            let parsed = JSON.parse(local);
            parsed = migrateData(parsed); // 로컬 저장소에서도 마이그레이션 적용 보장
            if (parsed.phases) state.phases = parsed.phases;
            if (parsed.customSupps) state.customSupps = parsed.customSupps;
            if (parsed.userInfo) state.userInfo = parsed.userInfo;
            return true;
        } catch(e) { return false; }
    }
    return false;
}

export async function initializeFirebase(onInitComplete) {
    loadFromLocal(); // 구동 지연 방지를 위해 즉시 화면 로드
    try {
        const cfg = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : null;
        if (!cfg) { onInitComplete(false); return; }
        
        const app = initializeApp(cfg); const auth = getAuth(app); state.db = getFirestore(app);
        await signInAnonymously(auth);

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.userId = user.uid;
                const snap = await getDoc(doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData'));
                if (snap.exists()) {
                    let data = snap.data();
                    data = migrateData(data); // 클라우드 DB에서도 완벽한 자동 이관 보장
                    if (data.phases) state.phases = data.phases;
                    if (data.customSupps) state.customSupps = data.customSupps;
                    if (data.userInfo) state.userInfo = data.userInfo;
                    saveToLocal();
                }
            }
            onInitComplete(true);
        });
    } catch (e) { onInitComplete(false); }
}

export async function saveToCloud() {
    saveToLocal(); if (!state.userId || !state.db) return;
    try { await setDoc(doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData'), { phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo }, { merge: true }); } catch(e) {}
}

export function triggerSave(showToastCallback) {
    saveToLocal(); if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { saveToCloud(); if(showToastCallback) showToastCallback("저장 동기화 완료."); }, 800);
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
            let data = JSON.parse(e.target.result);
            data = migrateData(data); // 파일 복원 시에도 자동 이관 보장
            if(data.phases) state.phases = data.phases;
            if(data.customSupps) state.customSupps = data.customSupps; if(data.userInfo) state.userInfo = data.userInfo;
            applyCustomSuppsToDB(); saveToLocal(); saveToCloud(); if(onSuccess) onSuccess();
        } catch(err) { if(onError) onError(); }
    };
    reader.readAsText(file);
}

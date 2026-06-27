import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, applyCustomSuppsToDB } from './store.js';

let saveTimeout = null;

export function migrateData(data) {
    if (data.phaseData && !data.phases) {
        let migrated = []; let idx = 1;
        for (let key in data.phaseData) { migrated.push({ id: 'p_' + idx++, title: data.phaseData[key].title || key, desc: data.phaseData[key].desc || '', meals: data.phaseData[key].meals || [] }); }
        data.phases = migrated;
    }
    return data;
}

// [확장 패치] 로컬 스토리지 저장 범위에 운동 및 템플릿 추가
export function saveToLocal() { 
    localStorage.setItem('prep_master_local_data', JSON.stringify({ 
        phases: state.phases, 
        customSupps: state.customSupps, 
        userInfo: state.userInfo,
        workouts: state.workouts,   // 신규 통합
        templates: state.templates  // 신규 통합
    })); 
}

// [확장 패치] 로컬 스토리지 불러오기 범위 확장
export function loadFromLocal() {
    const local = localStorage.getItem('prep_master_local_data');
    if (local) {
        try {
            let parsed = JSON.parse(local);
            parsed = migrateData(parsed);
            if (parsed.phases) state.phases = parsed.phases;
            if (parsed.customSupps) state.customSupps = parsed.customSupps;
            if (parsed.userInfo) state.userInfo = parsed.userInfo;
            if (parsed.workouts) state.workouts = parsed.workouts;   // 신규 통합
            if (parsed.templates) state.templates = parsed.templates; // 신규 통합
            return true;
        } catch(e) { return false; }
    }
    return false;
}

// [확장 패치] 클라우드 동기화 구동 시 운동 및 템플릿 일괄 로드
export async function initializeFirebase(onInitComplete) {
    loadFromLocal(); 
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
                    data = migrateData(data);
                    if (data.phases) state.phases = data.phases;
                    if (data.customSupps) state.customSupps = data.customSupps;
                    if (data.userInfo) state.userInfo = data.userInfo;
                    if (data.workouts) state.workouts = data.workouts;   // text 통합
                    if (data.templates) state.templates = data.templates; // text 통합
                    saveToLocal();
                }
            }
            onInitComplete(true);
        });
    } catch (e) { onInitComplete(false); }
}

// [확장 패치] 클라우드 NoSQL 원격 저장 통합 동기화
export async function saveToCloud() {
    saveToLocal(); if (!state.userId || !state.db) return;
    try { 
        await setDoc(doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData'), { 
            phases: state.phases, 
            customSupps: state.customSupps, 
            userInfo: state.userInfo,
            workouts: state.workouts,   // 통합 백업
            templates: state.templates  // 통합 백업
        }, { merge: true }); 
    } catch(e) {}
}

export function triggerSave(showToastCallback) {
    saveToLocal(); if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { saveToCloud(); if(showToastCallback) showToastCallback("저장 동기화 완료."); }, 800);
}

// [확장 패치] 전체 백업 구조 통합 내보내기
export function exportDataJSON(showToastCallback) {
    const dataStr = JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo, workouts: state.workouts, templates: state.templates }, null, 2);
    const pad = n => n < 10 ? '0' + n : n; const now = new Date();
    const fileName = `TotalPrep_Backup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`;
    const linkElement = document.createElement('a'); linkElement.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)); linkElement.setAttribute('download', fileName); linkElement.click();
    if(showToastCallback) showToastCallback("통합 백업 파일이 저장되었습니다.");
}

// [확장 패치] 파일 복원 시 식단과 운동 전체 일괄 복원 적용
export function importDataJSON(file, onSuccess, onError) {
    if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let data = JSON.parse(e.target.result);
            data = migrateData(data);
            if(data.phases) state.phases = data.phases;
            if(data.customSupps) state.customSupps = data.customSupps; 
            if(data.userInfo) state.userInfo = data.userInfo;
            if(data.workouts) state.workouts = data.workouts;   // 통합 복원
            if(data.templates) state.templates = data.templates; // 통합 복원
            applyCustomSuppsToDB(); saveToLocal(); saveToCloud(); if(onSuccess) onSuccess();
        } catch(err) { if(onError) onError(); }
    };
    reader.readAsText(file);
}

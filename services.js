/**
 * 파일명: services.js
 * 역할: 구글/이메일 정식 인증 결합, 데이터 유실 방지 마이그레이션 및 NoSQL Firestore 실시간 원격 백업 코어
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { 
    getAuth, 
    signInAnonymously, 
    onAuthStateChanged, 
    GoogleAuthProvider, 
    signInWithPopup, 
    createUserWithEmailAndPassword, 
    signInWithEmailAndPassword, 
    linkWithCredential, 
    EmailAuthProvider,
    signOut
} from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state } from './store.js';

let saveTimeout = null;

// 파이어베이스(Firebase) 프로젝트 고유 인프라 설정 규격
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
        for (let key in data.phaseData) { 
            migrated.push({ id: 'p_' + idx++, title: data.phaseData[key].title || key, desc: data.phaseData[key].desc || '', meals: data.phaseData[key].meals || [] }); 
        }
        data.phases = migrated;
    }
    return data;
}

export function saveToLocal() { 
    localStorage.setItem('prep_master_local_data', JSON.stringify({ 
        phases: state.phases, 
        customSupps: state.customSupps, 
        userInfo: state.userInfo,
        workouts: state.workouts,   
        templates: state.templates
    }));
}

export function triggerSave() {
    saveToLocal();
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (state.userId && state.db) {
            const userDocRef = doc(state.db, "users", state.userId);
            setDoc(userDocRef, {
                phases: state.phases,
                customSupps: state.customSupps,
                userInfo: state.userInfo,
                workouts: state.workouts,
                templates: state.templates,
                lastUpdated: new Date().toISOString()
            }, { merge: true })
            .then(() => { console.log("원격 클라우드 실시간 동기화 완료."); })
            .catch((err) => { console.error("원격 백업 실패:", err); });
        }
    }, 800);
}

// ==========================================
// 🔐 정식 인증 인터페이스 연동 파이드라인
// ==========================================

export async function loginWithGoogleBackend() {
    const provider = new GoogleAuthProvider();
    try {
        if (auth.currentUser && auth.currentUser.isAnonymous) {
            const result = await signInWithPopup(auth, provider);
            const credential = GoogleAuthProvider.credentialFromResult(result);
            await linkWithCredential(auth.currentUser, credential);
            state.userInfo.isPermanent = true;
            state.userInfo.email = result.user.email;
            triggerSave();
            return { success: true, mode: "linked" };
        } else {
            const result = await signInWithPopup(auth, provider);
            state.userInfo.isPermanent = true;
            state.userInfo.email = result.user.email;
            return { success: true, mode: "login" };
        }
    } catch (error) {
        console.error("Google 인증 에러:", error);
        throw error;
    }
}

export async function registerWithEmailBackend(email, password) {
    try {
        if (auth.currentUser && auth.currentUser.isAnonymous) {
            const credential = EmailAuthProvider.credential(email, password);
            await linkWithCredential(auth.currentUser, credential);
            state.userInfo.isPermanent = true;
            state.userInfo.email = email;
            triggerSave();
            return { success: true, mode: "linked" };
        } else {
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            state.userInfo.isPermanent = true;
            state.userInfo.email = userCredential.user.email;
            return { success: true, mode: "registered" };
        }
    } catch (error) {
        console.error("이메일 회원가입 에러:", error);
        throw error;
    }
}

export async function loginWithEmailBackend(email, password) {
    try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        state.userInfo.isPermanent = true;
        state.userInfo.email = userCredential.user.email;
        return { success: true };
    } catch (error) {
        console.error("이메일 로그인 에러:", error);
        throw error;
    }
}

export async function logoutUserBackend() {
    try {
        await signOut(auth);
        localStorage.removeItem('prep_master_local_data');
        location.reload();
    } catch (error) {
        console.error("로그아웃 실행 실패:", error);
    }
}

// ==========================================
// 🔄 상태 리스너 가동 엔진
// ==========================================
export function initializeFirebase(onReadyCallback) {
    const localRaw = localStorage.getItem('prep_master_local_data');
    if (localRaw) {
        try {
            let parsed = JSON.parse(localRaw);
            parsed = migrateData(parsed);
            if(parsed.phases) state.phases = parsed.phases;
            if(parsed.customSupps) state.customSupps = parsed.customSupps;
            if(parsed.userInfo) state.userInfo = parsed.userInfo;
            if(parsed.workouts) state.workouts = parsed.workouts;
            if(parsed.templates) state.templates = parsed.templates;
        } catch(e) { console.error("로컬 스토리지 데이터 마이그레이션 오류:", e); }
    }

    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.userId = user.uid;
            if (!state.userInfo) state.userInfo = {};
            state.userInfo.isPermanent = !user.isAnonymous;
            state.userInfo.email = user.email || (user.isAnonymous ? "임시 계정" : "Google 로그인 계정");

            try {
                const userDocRef = doc(db, "users", user.uid);
                const docSnap = await getDoc(userDocRef);
                if (docSnap.exists()) {
                    let cloudData = docSnap.data();
                    cloudData = migrateData(cloudData);
                    if(cloudData.phases) state.phases = cloudData.phases;
                    if(cloudData.customSupps) state.customSupps = cloudData.customSupps;
                    if(cloudData.userInfo) state.userInfo = cloudData.userInfo;
                    if(cloudData.workouts) state.workouts = cloudData.workouts;
                    if(cloudData.templates) state.templates = cloudData.templates;
                    saveToLocal();
                } else {
                    triggerSave();
                }
            } catch(err) { console.error("Firestore 원격 패치 실패:", err); }
            
            if(onReadyCallback) onReadyCallback(true);
        } else {
            signInAnonymously(auth)
                .then(() => { console.log("보안 임시 세션 발급 완료."); })
                .catch((err) => {
                    console.error("익명 로그인 인스턴스 실패:", err);
                    if(onReadyCallback) onReadyCallback(false);
                });
        }
    });
}

export function exportDataJSON(showToastCallback) {
    const dataStr = JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo, workouts: state.workouts, templates: state.templates }, null, 2);
    const pad = n => n < 10 ? '0' + n : n; const now = new Date();
    const fileName = `TotalPrep_MasterBackup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`;
    const linkElement = document.createElement('a'); linkElement.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)); linkElement.setAttribute('download', fileName); linkElement.click();
    if(showToastCallback) showToastCallback("통합 마스터 백업 파일 내보내기가 완료되었습니다.");
}

export function importDataJSON(file, onSuccess, onError) {
    if (!file) return; const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let data = JSON.parse(e.target.result); data = migrateData(data);
            if(data.phases) state.phases = data.phases; if(data.customSupps) state.customSupps = data.customSupps; 
            if(data.userInfo) state.userInfo = data.userInfo; if(data.workouts) state.workouts = data.workouts;   
            if(data.templates) state.templates = data.templates; saveToLocal(); triggerSave();
            if(onSuccess) onSuccess();
        } catch(err) { if(onError) onError(); }
    };
    reader.readAsText(file);
}

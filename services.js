/**
 * 파일명: services.js
 * 역할: 외부 인프라 통신, 파이어베이스 동기화, 백업/복원 제어 모듈
 */

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInWithCustomToken, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";
import { state, applyCustomSuppsToDB } from './store.js';

// 자동 저장을 제어하기 위한 타이머 변수
let saveTimeout = null;

/**
 * 파이어베이스 클라우드 데이터베이스 초기화 및 인증
 */
export async function initializeFirebase(onInitComplete) {
    try {
        const cfg = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : null;
        
        // 로컬 모드 처리
        if (!cfg) { 
            onInitComplete(false); 
            return; 
        }
        
        const app = initializeApp(cfg);
        const auth = getAuth(app);
        state.db = getFirestore(app);

        // 인증 토큰 확인
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
            onInitComplete(true); // 동기화 완료 후 콜백 실행
        });
    } catch (e) {
        console.error("Firebase 초기화 중 에러 발생:", e);
        onInitComplete(false);
    }
}

/**
 * 클라우드에서 유저 데이터 불러오기 (Load)
 */
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

/**
 * 클라우드에 현재 상태 저장하기 (Save) - 병합 저장(Merge)
 */
export async function saveToCloud() {
    if (!state.userId || !state.db) return;
    
    const docRef = doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData');
    await setDoc(docRef, { 
        phaseData: state.phaseData, 
        customSupps: state.customSupps, 
        userInfo: state.userInfo 
    }, { merge: true });
}

/**
 * 과도한 API(Application Programming Interface 응용 프로그램 프로그래밍 인터페이스) 호출을 막는 디바운싱 기반 자동 저장 트리거
 */
export function triggerSave(showToastCallback) {
    if (saveTimeout) clearTimeout(saveTimeout);
    
    saveTimeout = setTimeout(() => {
        saveToCloud();
        if(showToastCallback) showToastCallback("클라우드에 안전하게 자동 저장되었습니다.");
    }, 1000);
}

/**
 * 로컬 디바이스로 JSON(JavaScript Object Notation) 파일 내보내기 (백업)
 */
export function exportDataJSON(showToastCallback) {
    const dataStr = JSON.stringify({ 
        phaseData: state.phaseData, 
        customSupps: state.customSupps, 
        userInfo: state.userInfo 
    }, null, 2);
    
    // 날짜 및 시간 기반 파일명 생성 포맷팅
    const pad = n => n < 10 ? '0' + n : n; 
    const now = new Date();
    const fileName = `Diet_현체중(${state.userInfo.weight})_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}.json`;
    
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr));
    linkElement.setAttribute('download', fileName);
    linkElement.click();
    
    if(showToastCallback) showToastCallback("식단 백업 파일이 디바이스에 다운로드되었습니다.");
}

/**
 * 로컬 JSON(JavaScript Object Notation) 파일 읽어오기 (복원)
 */
export function importDataJSON(file, onSuccess, onError) {
    if (!file) return;
    const reader = new FileReader();
    
    reader.onload = function(e) {
        try {
            const data = JSON.parse(e.target.result);
            if(data.phaseData) state.phaseData = data.phaseData;
            if(data.customSupps) state.customSupps = data.customSupps;
            if(data.userInfo) state.userInfo = data.userInfo;
            
            applyCustomSuppsToDB(); // 보충제 DB 재구성
            triggerSave(); // 클라우드 동기화 
            if(onSuccess) onSuccess();
        } catch(err) {
            if(onError) onError();
        }
    };
    reader.readAsText(file);
}
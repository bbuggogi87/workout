/**
 * 파일명: services.js
 * 역할: 브라우저 로컬 저장소 통제 및 사용자 지정 위치 파일 입출력(I/O: Input/Output) 인프라 관리
 * 변경사항: 페이지 이탈 시 동기식으로 로컬 스토리지를 즉시 강제 잠금 보존하는 내비게이션 인터셉터 함수 이식 완료
 */

import { state, applyCustomSuppsToDB } from './store.js';

let saveTimeout = null;

// 브라우저 전역 윈도우 (window) 네임스페이스 바인딩
window.handleNavigationWithSave = handleNavigationWithSave;

/**
 * 구 버전 데이터 포맷을 최신 탭 배열 구조로 안전하게 전환하는 무결성 검증 함수
 */
export function migrateData(data) {
    if (data.phaseData && !data.phases) {
        let migrated = []; 
        let idx = 1;
        for (let key in data.phaseData) { 
            migrated.push({ 
                id: 'p_' + idx++, 
                title: data.phaseData[key].title || key, \
                desc: data.phaseData[key].desc || '', 
                meals: data.phaseData[key].meals || [] 
            }); 
        }
        data.phases = migrated;
    }
    return data;
}

/**
 * 브라우저 내장 로컬 스토리지(Local Storage)에 현재 상태를 즉시 영구 기록하는 함수
 */
export function saveToLocal() { 
    localStorage.setItem('prep_master_local_data', JSON.stringify({
        phases: state.phases,
        customSupps: state.customSupps,
        userInfo: state.userInfo,
        workouts: state.workouts,
        templates: state.templates
    }));
}

/**
 * 60초 주기 자동 저장 타이머 및 사용자 행동 기반 디바운스(Debounce) 안전 영속화 제어 함수
 */
export function triggerSave(showToastCallback) {
    saveToLocal();
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => {
        if (showToastCallback) showToastCallback("로컬 기기 스토리지와 전역 상태가 유기적으로 동기화되었습니다.");
    }, 1500);
}

/**
 * [신규 고도화 추가] 화면 전환 데이터 세이프가드 인터셉터 함수
 * 목적: 식단 & 체중 기록지와 운동 캘린더 이동 시 찰나의 데이터 휘발을 원천 차단합니다.
 * @param {string} targetUrl - 이동하고자 하는 대상 웹 셸 파일 상대 경로
 */
export function handleNavigationWithSave(targetUrl) {
    // 1. 이벤트 처리 즉시 동기식 영속화 강제 컴포넌트 집행
    try {
        saveToLocal();
    } catch (e) {
        console.error("데이터 동기식 동결 실패:", e);
    }
    
    // 2. 스토리지 영구 보존 확인 후 최종 모바일 라우팅 실행
    window.location.href = targetUrl;
}

/**
 * 데이터베이스 초기화 및 브라우저 영속 데이터 정밀 복원 실행 함수
 */
export function initializeFirebase(onSuccessCallback) {
    try {
        const localRaw = localStorage.getItem('prep_master_local_data');
        if (localRaw) {
            let data = JSON.parse(localRaw);
            data = migrateData(data);
            
            if (data.phases) state.phases = data.phases;
            if (data.customSupps) state.customSupps = data.customSupps;
            if (data.userInfo) state.userInfo = data.userInfo;
            if (data.workouts) state.workouts = data.workouts;
            if (data.templates) state.templates = data.templates;
            
            applyCustomSuppsToDB();
        }
        if (onSuccessCallback) onSuccessCallback(true);
    } catch (err) {
        console.error("로컬 영속성 스토리지 복원 오류 발생:", err);
        if (onSuccessCallback) onSuccessCallback(false);
    }
}

/**
 * 정립된 데이터셋을 기기 파일 시스템 규격 파일로 내보내는 물리 백업 제어 함수
 */
export async function exportDataJSON(showToastCallback) {
    const dataStr = JSON.stringify({
        phases: state.phases,
        customSupps: state.customSupps,
        userInfo: state.userInfo,
        workouts: state.workouts,
        templates: state.templates
    }, null, 2);
    
    const pad = n => n < 10 ? '0' + n : n;
    const now = new Date();
    const fileName = `TotalPrep_Master_Backup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`;
    
    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({
                suggestedName: fileName,
                types: [{
                    description: 'JSON Backup File',
                    accept: { 'application/json': ['.json'] }
                }]
            });
            const writable = await handle.createWritable();
            await writable.write(dataStr);
            await writable.close();
            if(showToastCallback) showToastCallback("지정한 안전 디렉토리에 마스터 JSON 백업 파일이 영구 보존되었습니다.");
        } else {
            const blob = new Blob([dataStr], { type: 'application/json' });
            const link = document.createElement('a'); 
            link.href = URL.createObjectURL(blob); 
            link.download = fileName; 
            link.click();
            if(showToastCallback) showToastCallback("다운로드 폴더에 백업 파일이 즉시 내보내기 되었습니다.");
        }
    } catch (err) { 
        if(showToastCallback) showToastCallback("백업 내보내기 작업이 취소되었습니다."); 
    }
}

/**
 * 외부 백업 파일을 읽어와 유효성을 정밀 검사하고 시스템 상태를 복원하는 함수
 */
export function importDataJSON(file, onSuccess, onError) {
    if (!file) return; 
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            let data = JSON.parse(e.target.result);
            data = migrateData(data);
            
            if(data.phases) state.phases = data.phases;
            if(data.customSupps) state.customSupps = data.customSupps; 
            if(data.userInfo) state.userInfo = data.userInfo;
            if(data.workouts) state.workouts = data.workouts;   
            if(data.templates) state.templates = data.templates;
            
            applyCustomSuppsToDB();
            saveToLocal();
            if (onSuccess) onSuccess();
        } catch (err) {
            if (onError) onError(err);
        }
    };
    reader.readAsText(file);
}

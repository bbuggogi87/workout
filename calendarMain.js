/**
 * 파일명: calendarMain.js (Workout Hub & Synth Audio Entry)
 * 역할: calendar.html 프레젠테이션 레이어와 calendar.js 핵심 제어부 레이어 결합
 */

import { state } from './store.js';
import { initializeSystemInfrastructure } from './services.js';
import { 
    initializeStaticCalendarCoreListeners, 
    initializeWorkoutListEvents,
    initializeStaticLibraryAndPopupListeners,
    initCalendarModule,
    loadSystemSettings,
    renderWorkoutList,
    runLibrarySearchFilter,
    startGlobalAlarm,
    clearDailyExercises,
    openSaveRoutineModal,
    confirmSaveRoutine,
    saveTemplatePopupEditorData,
    closeTemplatePopupEditor,
    triggerQuickInputFAB,
    closeQuickInputFABModal,
    saveQuickInputFABModal,
    triggerSettingExport
} from './calendar.js';

document.addEventListener('DOMContentLoaded', async () => {
    const loader = document.getElementById('global-loading-layer');
    
    try {
        // 1. 영속성 레이어 로드 및 분할 스키마 가드
        await initializeSystemInfrastructure();
        
        // 2. 캘린더 코어 정적 리스너 및 일자 스위칭 이벤트 위임 마운트
        initializeStaticCalendarCoreListeners(renderWorkoutList);
        
        // 3. 고정밀 트레이닝 세트 빌더 이벤트 위임 레이어 마운트
        initializeWorkoutListEvents();
        
        // 4. 초성 검색 마스터 사전 및 복원 팝업 에디터 리스너 마운트
        initializeStaticLibraryAndPopupListeners();
        if (typeof window.initializeRoutineEditorPopupEvents === 'function') {
            window.initializeRoutineEditorPopupEvents();
        }

        // 5. 정적 헤더 제어 컴포넌트 전용 유틸리티 리스너 취합 결합
        document.getElementById('library-search-input')?.addEventListener('input', runLibrarySearchFilter);
        document.getElementById('btn-manual-alarm-trigger')?.addEventListener('click', startGlobalAlarm);
        document.getElementById('btn-clear-daily-workout')?.addEventListener('click', clearDailyExercises);
        document.getElementById('btn-routine-backup-modal')?.addEventListener('click', openSaveRoutineModal);
        document.getElementById('btn-confirm-routine-save')?.addEventListener('click', confirmSaveRoutine);
        document.getElementById('btn-save-popup-editor')?.addEventListener('click', saveTemplatePopupEditorData);
        document.getElementById('btn-close-popup-editor')?.addEventListener('click', closeTemplatePopupEditor);
        document.getElementById('fab-quick-input-trigger')?.addEventListener('click', triggerQuickInputFAB);
        document.getElementById('btn-close-quick-modal')?.addEventListener('click', closeQuickInputFABModal);
        document.getElementById('btn-save-quick-modal')?.addEventListener('click', saveQuickInputFABModal);
        document.getElementById('btn-system-full-export')?.addEventListener('click', triggerSettingExport);

        // 6. 초기 가동 라이프사이클 런타임 빌드
        initCalendarModule();
        loadSystemSettings();
        renderWorkoutList();

        console.log("PREP MASTER PRO: 훈련 허브 및 가상 오디오 타이머 인터페이스 바인딩 성공.");
    } catch (error) {
        console.error("훈련 로그 런타임 가동 중 치명적 예외 발생:", error);
    } finally {
        if (loader) loader.classList.add('hidden');
    }
});
/**
 * 파일명: main.js (Diet & KPI Dashboard Entry)
 * 역할: index.html 프레젠테이션 레이어와 app.js 제어 아키텍처 바인딩 및 유효성 검증
 */

import { state, applyCustomSuppsToDB } from './store.js';
import { initializeSystemInfrastructure, triggerSave } from './services.js';
import { 
    loadPhase, 
    calculateMacros, 
    setMatrixFilter, 
    initializeStaticWeightRecordListeners, 
    exportWeightRecordsToCSV,
    runSmartCalc
} from './app.js';

document.addEventListener('DOMContentLoaded', async () => {
    // 1. 글로벌 로딩 레이어 가동
    const loader = document.getElementById('global-loading-layer');
    if (loader) { loader.classList.remove('hidden'); loader.classList.add('flex'); }

    try {
        // 2. 인프라 레이어 로컬 데이터 복원 및 동기화 수립
        const isRestored = await initializeSystemInfrastructure();
        
        // 3. 커스텀 보충제 매크로 1g 환산 사전 동적 주입 (방어적 연산)
        applyCustomSuppsToDB();

        // 4. 정적 레이아웃 리스너 및 이벤트 위임 활성화
        if (typeof window.initTimelineContainerEvents === 'function') {
            window.initTimelineContainerEvents();
        }
        initializeStaticWeightRecordListeners();

        // 5. 스마트 매크로 변환기 정적 체인지 리스너 강제 맵핑
        ['carb', 'pro', 'fat'].forEach(type => {
            document.getElementById(`calc-${type}-src`)?.addEventListener('change', () => runSmartCalc(type));
            document.getElementById(`calc-${type}-amt`)?.addEventListener('input', () => runSmartCalc(type));
        });

        // 6. 엑셀 CSV 파일 I/O 제어 내보내기 리스너 단방향 바인딩
        document.getElementById('btn-export-csv-trigger')?.addEventListener('click', async () => {
            await exportWeightRecordsToCSV();
        });

        // 7. 초기 뷰 프레젠테이션 활성화
        loadPhase(state.currentPhaseId || 'p_1');
        calculateMacros();
        setMatrixFilter(state.weightRecordFilter || 'all');

        console.log("PREP MASTER PRO: 식단 플래너 제어 레이어 연동 및 연동 안정성 검증 완료.");
    } catch (error) {
        console.error("시스템 엔트리 파이프라인 초기 가동 중 예외 은폐 금지 가드 걸림:", error);
    } finally {
        if (loader) { loader.classList.add('hidden'); loader.classList.remove('flex'); }
    }
});
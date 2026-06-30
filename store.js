/**
 * 파일명: store.js
 * 역할: 전역 상태 관리 및 단일 진실 공급원 (SSOT: Single Source of Truth) 데이터 허브
 * 변경사항: 20가지 종합 건강 지표 확장 스키마 명세 정의 및 대시보드 동적 필터 상태 속성 주입 완료
 */

import { FOOD_DB, FOOD_CATEGORIES, INITIAL_USER_INFO, INITIAL_CUSTOM_SUPPS, INITIAL_PHASES } from './constants.js'; //

// 전역 애플리케이션 상태 객체 정의
export const state = {
    userInfo: JSON.parse(JSON.stringify(INITIAL_USER_INFO)), //
    phases: JSON.parse(JSON.stringify(INITIAL_PHASES)), //
    currentPhaseId: 'p_1', //
    clipboardMeals: null, //
    editingMealState: null, //
    editingPhaseIsNew: false, //
    customSupps: JSON.parse(JSON.stringify(INITIAL_CUSTOM_SUPPS)), //
    foodDB: JSON.parse(JSON.stringify(FOOD_DB)), //
    foodCategories: JSON.parse(JSON.stringify(FOOD_CATEGORIES)), //
    pieChartInstance: null, //

    // 운동 일정 및 신체 계측 기록 상태 구조 (기존 기능 100% 유지)
    selectedDateStr: '', // 현재 선택된 날짜 키값 (형식: YYYY-MM-DD)
    
    /**
     * 날짜별 종합 데이터 저장소 (20가지 고정밀 지표 결합 스키마 확장)
     * 구조 예시:
     * workouts: {
     * 'YYYY-MM-DD': {
     * weight: 72.50,          // 공복 체중 (kg)
     * bf: 0,                  // 체지방률 (기존 레일 유지)
     * smm: 0,                 // 골격근량 (기존 레일 유지)
     * exercises: [],          // 운동 세트 기록 배열 (원형 보존)
     * * // [신규 확장 건강 지표 속성]
     * weightDelta: -0.3,      // 체중 변화량 (kg, 전날 대조 자동 역산)
     * sleepTime: 7.5,         // 수면시간 (시간)
     * condition: 7,           // 종합 컨디션 레벨 (1~10)
     * visualScore: 8,         // 공복 눈바디 점수 (1~10)
     * restingHR: 56,          // 안정기 공복 심박수 (bpm)
     * workoutPart: '하체',     // 수행 운동 부위
     * carbs: 250.5,           // 탄수화물 (g)
     * protein: 180.2,         // 단백질 (g)
     * fat: 45.3,              // 지방 (g)
     * totalKcal: 2130,        // 총 섭취 칼로리 (kcal)
     * macroRatio: '4:4:2',    // 실질 탄:단:지 백분율 비율 문자열
     * water: 3.5,             // 당일 수분 섭취량 (L)
     * anaerobic: 70,          // 근력 운동 시간 (분)
     * aerobic: 40,            // 유산소 운동 시간 (분)
     * bowel: 'O',             // 배변 활동 여부 (O / X)
     * specialNote: '정상식단', // 특이사항 퀵 태그 문자열
     * memo: '스쿼트 자극 최상' // 장문 메모 기술서
     * }
     * }
     */
    workouts: {}, //       
    templates: [],       // 개인 맞춤 분할 루틴 프리셋 저장 배열
    
    // [신규 추가] 체중 기록 대시보드용 동적 매트릭스 필터 상태 값 ('all', 'weight', 'macros', 'condition')
    weightRecordFilter: 'all'
};

/**
 * 사용자 정의 보충제 데이터를 마스터 데이터베이스에 1g 당 영양성분으로 환산하여 주입하는 함수
 */
export function applyCustomSuppsToDB() {
    state.foodCategories['보충제'] = []; //
    state.customSupps.forEach(supp => {
        if(supp.weight > 0) { //
            state.foodDB[supp.name] = { //
                c: supp.carbs / supp.weight, //
                p: supp.protein / supp.weight, //
                f: supp.fat / supp.weight, //
                k: supp.kcal / supp.weight //
            };
            state.foodCategories['보충제'].push(supp.name); //
        }
    });
}

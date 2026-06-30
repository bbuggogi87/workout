/**
 * 파일명: store.js
 * 역할: 전역 상태 관리 및 단일 진실 공급원 (SSOT: Single Source of Truth) 데이터 허브
 * 변경사항: 20가지 종합 건강 지표 확장 스키마 명세 정의 및 대시보드 동적 필터 상태 속성 주입 완료
 */

import { FOOD_DB, FOOD_CATEGORIES, INITIAL_USER_INFO, INITIAL_CUSTOM_SUPPS, INITIAL_PHASES } from './constants.js';

// 전역 상태 객체 정의
export const state = {
    userInfo: JSON.parse(JSON.stringify(INITIAL_USER_INFO)),
    phases: JSON.parse(JSON.stringify(INITIAL_PHASES)),
    currentPhaseId: 'p_1',
    clipboardMeals: null,
    editingMealState: null,
    editingPhaseIsNew: false,
    customSupps: JSON.parse(JSON.stringify(INITIAL_CUSTOM_SUPPS)),
    foodDB: JSON.parse(JSON.stringify(FOOD_DB)),
    foodCategories: JSON.parse(JSON.stringify(FOOD_CATEGORIES)),
    pieChartInstance: null,

    // 운동 일정 및 신체 계측 기록 상태 구조
    selectedDateStr: '', // 현재 선택된 날짜 키값 (형식: YYYY-MM-DD)
    
    /**
     * 날짜별 종합 데이터 저장소 (20가지 고정밀 지표 결합 스키마 확장)
     */
    workouts: {},       
    templates: [],       // 개인 맞춤 분할 루틴 프리셋 저장 배열
    
    // 체중 기록 대시보드용 동적 매트릭스 필터 상태 값 ('all', 'weight', 'macros', 'condition')
    weightRecordFilter: 'all'
};

/**
 * 사용자 정의 보충제 데이터를 마스터 데이터베이스에 1g 당 수치로 환산 주입하는 함수
 */
export function applyCustomSuppsToDB() {
    state.foodCategories['보충제'] = [];
    state.customSupps.forEach(supp => {
        if (supp.weight > 0) {
            state.foodDB[supp.name] = {
                c: supp.carbs / supp.weight,
                p: supp.protein / supp.weight,
                f: supp.fat / supp.weight,
                k: supp.kcal / supp.weight
            };
            state.foodCategories['보충제'].push(supp.name);
        }
    });
}
/**
 * 파일명: store.js
 * 역할: 전역 상태 관리 및 단일 진실 공급원 (SSOT: Single Source of Truth) 데이터 허브
 * 변경사항: 파이어베이스(Firebase) 원격 인증 및 데이터베이스(Database) 연동용 상태 속성(userId, db, appId) 제거 및 로컬 단독 상태 최적화
 */

import { FOOD_DB, FOOD_CATEGORIES, INITIAL_USER_INFO, INITIAL_CUSTOM_SUPPS, INITIAL_PHASES } from './constants.js';

// 전역 애플리케이션 상태 객체 정의
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

    // 운동 일정 및 신체 계측 기록 상태 구조 (기존 기능 100% 유지)
    selectedDateStr: '', // 현재 선택된 날짜 키값 (형식: YYYY-MM-DD)
    workouts: {},        // 날짜별 종합 데이터 저장소 (구조: { 'YYYY-MM-DD': { weight, bf, smm, exercises: [] } })
    templates: []        // 개인 맞춤 분할 루틴 프리셋(Preset) 저장 배열
};

/**
 * 사용자 정의 보충제 데이터를 마스터 데이터베이스에 1g 당 영양성분으로 환산하여 주입하는 함수
 */
export function applyCustomSuppsToDB() {
    state.foodCategories['보충제'] = [];
    state.customSupps.forEach(supp => {
        if(supp.weight > 0) {
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

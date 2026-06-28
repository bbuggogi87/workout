/**
 * 파일명: store.js
 * 역할: 식단 플래너 및 훈련 일지 전역 상태(State) 데이터 통합 제어 및 관리
 */

import { FOOD_DB, FOOD_CATEGORIES, INITIAL_USER_INFO, INITIAL_CUSTOM_SUPPS, INITIAL_PHASES } from './constants.js';

export const state = {
    // 전역 시스템 컨텍스트
    userInfo: JSON.parse(JSON.stringify(INITIAL_USER_INFO)),
    userId: null, 
    db: null, 
    appId: 'prep-master-pro',

    // 🥑 식단 플래너 데이터 노드
    phases: JSON.parse(JSON.stringify(INITIAL_PHASES)),
    currentPhaseId: 'p_1', 
    clipboardMeals: null, 
    editingMealState: null, 
    editingPhaseIsNew: false,
    customSupps: JSON.parse(JSON.stringify(INITIAL_CUSTOM_SUPPS)), 
    foodDB: JSON.parse(JSON.stringify(FOOD_DB)), 
    foodCategories: JSON.parse(JSON.stringify(FOOD_CATEGORIES)),
    pieChartInstance: null, 

    // 🏋️ 훈련 일지 캘린더 데이터 노드
    selectedDateStr: '', 
    workouts: {},        
    templates: []        
};

/**
 * 사용자 커스텀 보충제를 1g당 매크로 비율로 환산하여 마스터 푸드 DB에 주입하는 함수
 */
export function applyCustomSuppsToDB() {
    state.foodCategories['보충제'] = [];
    state.customSupps.forEach(supp => {
        if(supp.weight > 0 && supp.protein > 0) {
            const macroRatio = { c: 0, p: supp.protein / supp.weight, f: 0, k: (supp.protein * 4) / supp.weight };
            state.foodDB[supp.name] = macroRatio;
            state.foodCategories['보충제'].push(supp.name);
        }
    });
}

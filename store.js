/**
 * 파일명: store.js
 * 역할: 식단 플래너 및 훈련 일지 전역 상태(State) 데이터 통합 보관소
 */

import { FOOD_DB, FOOD_CATEGORIES, INITIAL_USER_INFO, INITIAL_CUSTOM_SUPPS, INITIAL_PHASES } from './constants.js';

export const state = {
    // 1. 유저 계정 및 시스템 메타 데이터
    userInfo: JSON.parse(JSON.stringify(INITIAL_USER_INFO)),
    userId: null, 
    db: null, 
    appId: 'prep-master-pro',

    // 2. 🥑 식단 플래너 전용 상태 구조
    phases: JSON.parse(JSON.stringify(INITIAL_PHASES)),
    currentPhaseId: 'p_1', 
    clipboardMeals: null, 
    editingMealState: null, 
    editingPhaseIsNew: false,
    customSupps: JSON.parse(JSON.stringify(INITIAL_CUSTOM_SUPPS)), 
    foodDB: JSON.parse(JSON.stringify(FOOD_DB)), 
    foodCategories: JSON.parse(JSON.stringify(FOOD_CATEGORIES)),
    pieChartInstance: null, 

    // 3. 🏋️ 훈련 일지 전용 상태 구조
    selectedDateStr: '', 
    workouts: {},        
    templates: []        
};

/**
 * 커스텀 보충제 등록 시 1g 당 매크로(Macro) 비율로 역산하여 마스터 데이터베이스에 병합합니다.
 */
export function applyCustomSuppsToDB() {
    state.foodCategories['보충제'] = [];
    state.customSupps.forEach(supp => {
        if (supp.weight > 0) {
            state.foodDB[supp.name] = { 
                c: (supp.carbs || 0) / supp.weight, 
                p: (supp.protein || 0) / supp.weight, 
                f: (supp.fat || 0) / supp.weight, 
                k: (supp.kcal || 0) / supp.weight 
            };
            state.foodCategories['보충제'].push(supp.name);
        }
    });
}

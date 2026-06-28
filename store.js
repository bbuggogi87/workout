import { FOOD_DB, FOOD_CATEGORIES, INITIAL_USER_INFO, INITIAL_CUSTOM_SUPPS, INITIAL_PHASES } from './constants.js';

export const state = {
    // 공통 정보
    userInfo: JSON.parse(JSON.stringify(INITIAL_USER_INFO)),
    userId: null, 
    db: null, 
    appId: 'prep-master-pro',

    // 식단 플래너 전용 데이터
    phases: JSON.parse(JSON.stringify(INITIAL_PHASES)),
    currentPhaseId: 'p_1', 
    clipboardMeals: null, 
    editingMealState: null, 
    editingPhaseIsNew: false,
    customSupps: JSON.parse(JSON.stringify(INITIAL_CUSTOM_SUPPS)), 
    foodDB: JSON.parse(JSON.stringify(FOOD_DB)), 
    foodCategories: JSON.parse(JSON.stringify(FOOD_CATEGORIES)),
    pieChartInstance: null, 

    // 운동 캘린더 전용 데이터
    selectedDateStr: '', 
    workouts: {},        
    templates: []        
};

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

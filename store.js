import { FOOD_DB, FOOD_CATEGORIES, INITIAL_USER_INFO, INITIAL_CUSTOM_SUPPS, INITIAL_PHASES } from './constants.js';

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
    userId: null, 
    db: null, 
    appId: 'prep-master-pro',

    // [신규 확장] 운동 일정 및 신체 계측 기록 상태 구조 추가
    selectedDateStr: '', // 현재 선택된 날짜 키값 (YYYY-MM-DD)
    workouts: {},        // 날짜별 종합 데이터 저장소 (구조: { 'YYYY-MM-DD': { weight, bf, smm, exercises: [] } })
    templates: []        // 개인 맞춤 분할 루틴 프리셋 저장 배열
};

export function applyCustomSuppsToDB() {
    state.foodCategories['보충제'] = [];
    state.customSupps.forEach(supp => {
        if(supp.weight > 0) {
            state.foodDB[supp.name] = { c: supp.carbs / supp.weight, p: supp.protein / supp.weight, f: supp.fat / supp.weight, k: supp.kcal / supp.weight };
            state.foodCategories['보충제'].push(supp.name);
        }
    });
}

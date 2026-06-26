import { FOOD_DB, FOOD_CATEGORIES, INITIAL_USER_INFO, INITIAL_CUSTOM_SUPPS, INITIAL_PHASES } from './constants.js';

export const state = {
    userInfo: JSON.parse(JSON.stringify(INITIAL_USER_INFO)),
    phases: JSON.parse(JSON.stringify(INITIAL_PHASES)),
    currentPhaseId: 'p_1',
    clipboardMeals: null, // 식단 세트 복사 저장소
    editingMealState: null, // 복제 및 편집 모달 제어용 상태
    customSupps: JSON.parse(JSON.stringify(INITIAL_CUSTOM_SUPPS)),
    foodDB: JSON.parse(JSON.stringify(FOOD_DB)),
    foodCategories: JSON.parse(JSON.stringify(FOOD_CATEGORIES)),
    pieChartInstance: null,
    userId: null,
    db: null,
    appId: typeof __app_id !== 'undefined' ? __app_id : 'prep-master-pro'
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

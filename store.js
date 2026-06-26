/**
 * 파일명: store.js
 * 역할: 전역 상태(State) 중앙 관리 저장소
 */

import { FOOD_DB, FOOD_CATEGORIES, INITIAL_USER_INFO, INITIAL_CUSTOM_SUPPS, INITIAL_PHASE_DATA } from './constants.js';

// 애플리케이션 전체에서 공유되는 상태 객체 (State Object)
export const state = {
    // 유저 프로필 및 상태
    userInfo: JSON.parse(JSON.stringify(INITIAL_USER_INFO)),
    
    // 시기별 식단 및 스케줄 상태
    phaseData: JSON.parse(JSON.stringify(INITIAL_PHASE_DATA)),
    currentPhase: 'D-4',
    
    // 커스텀 보충제 상태
    customSupps: JSON.parse(JSON.stringify(INITIAL_CUSTOM_SUPPS)),
    
    // 런타임 데이터베이스(Database) (사용자가 추가한 보충제가 동적으로 병합됨)
    foodDB: JSON.parse(JSON.stringify(FOOD_DB)),
    foodCategories: JSON.parse(JSON.stringify(FOOD_CATEGORIES)),
    
    // 차트 및 식별자 인스턴스 (Instance)
    pieChartInstance: null,
    userId: null,
    db: null,
    appId: typeof __app_id !== 'undefined' ? __app_id : 'prep-master-pro'
};

/**
 * 사용자가 등록한 커스텀 보충제 데이터를 런타임 음식 데이터베이스(Database)에 적용하는 함수
 */
export function applyCustomSuppsToDB() {
    // 기존 보충제 카테고리 초기화
    state.foodCategories['보충제'] = [];
    
    state.customSupps.forEach(supp => {
        if(supp.weight > 0) {
            // 1g 단위로 환산하여 데이터베이스(Database)에 주입
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
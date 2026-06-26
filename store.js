window.PrepStore = {
    state: {
        userInfo: JSON.parse(JSON.stringify(window.PREP_CONSTANTS.INITIAL_USER_INFO)),
        phases: JSON.parse(JSON.stringify(window.PREP_CONSTANTS.INITIAL_PHASES)),
        currentPhaseId: 'p_1',
        clipboardMeals: null,
        editingMealState: null,
        customSupps: JSON.parse(JSON.stringify(window.PREP_CONSTANTS.INITIAL_CUSTOM_SUPPS)),
        foodDB: JSON.parse(JSON.stringify(window.PREP_CONSTANTS.FOOD_DB)),
        foodCategories: JSON.parse(JSON.stringify(window.PREP_CONSTANTS.FOOD_CATEGORIES)),
        pieChartInstance: null,
        userId: null,
        db: null,
        appId: 'prep-master-pro'
    },
    
    applyCustomSuppsToDB: function() {
        this.state.foodCategories['보충제'] = [];
        this.state.customSupps.forEach(supp => {
            if(supp.weight > 0) {
                this.state.foodDB[supp.name] = { 
                    c: supp.carbs / supp.weight, 
                    p: supp.protein / supp.weight, 
                    f: supp.fat / supp.weight, 
                    k: supp.kcal / supp.weight 
                };
                this.state.foodCategories['보충제'].push(supp.name);
            }
        });
    }
};

(function() {
    const FOOD_DB = {
        '백미':{c:0.28,p:0.027,f:0.003,k:1.3}, '현미밥':{c:0.32,p:0.03,f:0.01,k:1.5}, '감자':{c:0.20,p:0.02,f:0.001,k:0.86}, '고구마':{c:0.31,p:0.015,f:0.002,k:1.3}, '찐단호박':{c:0.10,p:0.01,f:0.0,k:0.45}, '오트밀':{c:0.66,p:0.13,f:0.06,k:3.8}, '바나나':{c:0.23,p:0.01,f:0.0,k:0.89}, '사과':{c:0.14,p:0.0,f:0.0,k:0.52}, '파스타(건면)':{c:0.75,p:0.13,f:0.01,k:3.7}, '베이글':{c:0.50,p:0.10,f:0.01,k:2.5}, '식빵':{c:0.49,p:0.09,f:0.04,k:2.7},
        '닭가슴살':{c:0.0,p:0.23,f:0.012,k:1.1}, '닭다리살(껍질X)':{c:0.0,p:0.19,f:0.08,k:1.5}, '돼지안심':{c:0.0,p:0.26,f:0.03,k:1.4}, '소고기부채살':{c:0.0,p:0.21,f:0.11,k:1.9}, '소고기우둔살':{c:0.0,p:0.22,f:0.04,k:1.3}, '연어':{c:0.0,p:0.20,f:0.13,k:2.0}, '틸라피아':{c:0.0,p:0.20,f:0.017,k:0.98}, '오징어':{c:0.03,p:0.16,f:0.01,k:0.9}, '전란':{c:0.007,p:0.125,f:0.095,k:1.43}, '난백액':{c:0.01,p:0.10,f:0.0,k:0.45},
        '아몬드':{c:0.216,p:0.211,f:0.499,k:5.79}, '호두':{c:0.13,p:0.15,f:0.65,k:6.5}, '피넛버터(무당)':{c:0.20,p:0.25,f:0.50,k:5.9}, '아보카도':{c:0.08,p:0.02,f:0.15,k:1.6}, '올리브오일':{c:0.0,p:0.0,f:1.0,k:8.8}, '계란노른자':{c:0.03,p:0.16,f:0.27,k:3.2},
        '브로콜리':{c:0.07,p:0.03,f:0.0,k:0.34}, '아스파라거스':{c:0.04,p:0.02,f:0.0,k:0.20}, '양배추':{c:0.06,p:0.01,f:0.0,k:0.25}, '방울토마토':{c:0.04,p:0.01,f:0.0,k:0.18}, '야채(혼합)':{c:0.03,p:0.01,f:0.0,k:0.2}, '블루베리':{c:0.14,p:0.007,f:0.003,k:0.57}
    };
    const FOOD_CATEGORIES = {
        '탄수화물':['백미','현미밥','고구마','감자','찐단호박','오트밀','바나나','사과','파스타(건면)','베이글','식빵'],
        '단백질':['닭가슴살','닭다리살(껍질X)','돼지안심','소고기부채살','소고기우둔살','연어','틸라피아','오징어','전란','난백액'],
        '지방':['아몬드','호두','피넛버터(무당)','아보카도','올리브오일','계란노른자'],
        '야채':['브로콜리','아스파라거스','양배추','방울토마토','야채(혼합)','블루베리'],
        '보충제':[]
    };
    const INITIAL_USER_INFO = { targetBF: '4.0', height: 173, weight: 72.5, targetDate: '2026-07-18' };
    const INITIAL_CUSTOM_SUPPS = [ { id: 1, name: '단백질 보충제', weight: 30, kcal: 120, carbs: 3, protein: 24, fat: 1.5 } ];
    const INITIAL_PHASES = [
        { 
            id: 'p_1', title: '기본 베이스 식단', desc: '식단, 영양제, 훈련 일정을 자유롭게 배치하고 섭취 메모를 남겨보세요.', 
            meals: [
                { id: 'm1', time: '12:00', label: '식사 1 (첫 식사)', color: 'sky', explain: '', supps: '[보충제 패키지 A]\n• 멀티비타민 2캡슐', items: [{name:'백미', amount:130}, {name:'닭가슴살', amount:150}], isWorkout: false, isCollapsed: false },
                { id: 'm2', time: '17:00', label: '식사 2 (훈련 전)', color: 'amber', explain: '', supps: '', items: [{name:'감자', amount:115}, {name:'닭가슴살', amount:150}], isWorkout: false, isCollapsed: false }
            ] 
        },
        { id: 'p_2', title: '수분 조절 & 밴딩', desc: '수분 조절 및 밴딩 상세 일정 관리 탭', meals: [] }
    ];

    const state = {
        userInfo: JSON.parse(JSON.stringify(INITIAL_USER_INFO)),
        phases: JSON.parse(JSON.stringify(INITIAL_PHASES)),
        currentPhaseId: 'p_1', clipboardMeals: null, editingMealState: null, editingPhaseIsNew: false,
        customSupps: JSON.parse(JSON.stringify(INITIAL_CUSTOM_SUPPS)), foodDB: JSON.parse(JSON.stringify(FOOD_DB)), foodCategories: JSON.parse(JSON.stringify(FOOD_CATEGORIES)),
        pieChartInstance: null, userId: null, db: null, appId: 'prep-master-pro'
    };

    function applyCustomSuppsToDB() {
        state.foodCategories['보충제'] = [];
        state.customSupps.forEach(supp => {
            if(supp.weight > 0) {
                state.foodDB[supp.name] = { c: supp.carbs / supp.weight, p: supp.protein / supp.weight, f: supp.fat / supp.weight, k: supp.kcal / supp.weight };
                state.foodCategories['보충제'].push(supp.name);
            }
        });
    }

    const Services = {
        saveTimeout: null, docRefFn: null, setDocFn: null,
        saveToLocal: function() { localStorage.setItem('prep_master_local_data', JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo })); },
        loadFromLocal: function() {
            const local = localStorage.getItem('prep_master_local_data');
            if (local) { try { const parsed = JSON.parse(local); if (parsed.phases) state.phases = parsed.phases; if (parsed.customSupps) state.customSupps = parsed.customSupps; if (parsed.userInfo) state.userInfo = parsed.userInfo; } catch(e) {} }
        },
        initFirebase: async function(onComplete) {
            this.loadFromLocal();
            try {
                const cfg = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : null;
                if (!cfg) { onComplete(false); return; }
                const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js");
                const { getAuth, signInAnonymously, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
                const { getFirestore, doc, getDoc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");

                const app = initializeApp(cfg); const auth = getAuth(app); state.db = getFirestore(app);
                Services.docRefFn = doc; Services.setDocFn = setDoc; await signInAnonymously(auth);

                onAuthStateChanged(auth, async (user) => {
                    if (user) {
                        state.userId = user.uid;
                        const dRef = doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData');
                        const snap = await getDoc(dRef);
                        if (snap.exists()) {
                            const data = snap.data();
                            if (data.phaseData && !data.phases) { let migrated = []; let idx = 1; for (let key in data.phaseData) { migrated.push({ id: 'p_' + idx++, title: data.phaseData[key].title || key, desc: data.phaseData[key].desc || '', meals: data.phaseData[key].meals || [] }); } state.phases = migrated; } 
                            else if (data.phases) { state.phases = data.phases; }
                            if (data.customSupps) state.customSupps = data.customSupps; if (data.userInfo) state.userInfo = data.userInfo;
                            Services.saveToLocal();
                        }
                    }
                    onComplete(true);
                });
            } catch (e) { onComplete(false); }
        },
        async saveToCloud() {
            this.saveToLocal();
            if (!state.userId || !state.db || !Services.setDocFn) return;
            try { const dRef = Services.docRefFn(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData'); await Services.setDocFn(dRef, { phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo }, { merge: true }); } catch(e) {}
        },
        triggerSave: function(cb) { this.saveToLocal(); if (this.saveTimeout) clearTimeout(this.saveTimeout); this.saveTimeout = setTimeout(() => { this.saveToCloud(); if(cb) cb("저장 완료."); }, 800); }
    };

    const App = {
        showToast: function(msg) { const t = document.getElementById('toast'); document.getElementById('toast-text').innerText = msg; t.className = "fixed bottom-5 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl"; setTimeout(() => { t.className = "fixed bottom-5 right-5 z-50 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 2500); },
        finishInit: function() { 
            document.getElementById('prof-weight-display').innerText = state.userInfo.weight + 'kg'; document.getElementById('prof-bf-display').innerText = state.userInfo.targetBF + '%'; document.getElementById('prof-height-display').innerText = state.userInfo.height + 'cm';
            if(state.userInfo.targetDate) { document.getElementById('badge-target-date').innerText = `Target Date: ${state.userInfo.targetDate.substring(5).replace('-','.')}`; }
            applyCustomSuppsToDB(); this.initCalcDropdowns(); if(state.phases.length > 0) this.loadPhase(state.phases[0].id); this.runSmartCalc('carb'); this.runSmartCalc('pro'); this.runSmartCalc('fat');
        },
        renderPhaseTabs: function() {
            const container = document.getElementById('phase-tabs-container'); container.innerHTML = '';
            state.phases.forEach(p => {
                const isActive = (p.id === state.currentPhaseId);
                const btnClass = isActive ? "px-5 py-3 rounded-lg text-base font-bold phase-btn-active shrink-0 transition-colors" : "px-5 py-3 rounded-lg text-base font-bold text-slate-400 hover:bg-slate-800 shrink-0 transition-colors";
                container.innerHTML += `<button onclick="window.loadPhase('${p.id}')" class="${btnClass}">${p.title}</button>`;
            });
        },
        adjAmt: function(mIdx, iIdx, delta) {
            const cp = state.phases.find(p => p.id === state.currentPhaseId);
            let current = parseFloat(cp.meals[mIdx].items[iIdx].amount) || 0;
            let next = current + delta; if(next < 0) next = 0;
            cp.meals[mIdx].items[iIdx].amount = next;
            Services.triggerSave(); this.calculateMacros(); this.loadPhase(state.currentPhaseId);
        },
        loadPhase: function(phaseId) { 
            if(!state.phases.find(p => p.id === phaseId) && state.phases.length > 0) phaseId = state.phases[0].id;
            state.currentPhaseId = phaseId; this.renderPhaseTabs();
            const cp = state.phases.find(p => p.id === phaseId); if(!cp) return;
            document.getElementById('phase-description').innerText = cp.desc;
            const container = document.getElementById('timeline-container'); container.innerHTML = '';
            
            cp.meals.forEach((meal, mIdx) => {
                let itemsHtml = ''; if(!meal.items) meal.items = [];
                meal.items.forEach((item, iIdx) => {
                    let opts = `<optgroup label="탄수화물">` + state.foodCategories['탄수화물'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
                    opts += `<optgroup label="단백질">` + state.foodCategories['단백질'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
                    opts += `<optgroup label="지방">` + state.foodCategories['지방'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
                    opts += `<optgroup label="야채">` + state.foodCategories['야채'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
                    opts += `<optgroup label="보충제">` + state.foodCategories['보충제'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
                    
                    // [개선 완료] 입력칸 커스텀 증감 버튼 추가 및 정렬
                    itemsHtml += `
                    <div class="flex items-center justify-between p-3 bg-slate-900/60 rounded-xl border border-slate-800 mb-2 gap-2">
                        <select onchange="window.updateItemName(${mIdx}, ${iIdx}, event.target.value)" class="bg-slate-800 text-slate-200 text-sm px-2 py-2 rounded-lg outline-none flex-1 min-w-[90px] max-w-[140px]">${opts}</select>
                        <div class="flex items-center gap-1.5 sm:gap-2">
                            <div class="flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5">
                                <button onclick="window.adjAmt(${mIdx}, ${iIdx}, -10)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors text-lg font-bold">−</button>
                                <input type="number" oninput="window.updateItemAmount(${mIdx}, ${iIdx}, event.target.value)" class="w-10 sm:w-14 bg-transparent text-white text-center text-base font-bold outline-none" value="${item.amount || 0}">
                                <button onclick="window.adjAmt(${mIdx}, ${iIdx}, 10)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors text-lg font-bold">＋</button>
                            </div>
                            <span class="text-sm text-slate-400 font-bold w-2 text-center">g</span>
                            <button onclick="window.deleteItem(${mIdx}, ${iIdx})" class="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg ml-0.5 transition-colors text-lg font-black">✕</button>
                        </div>
                    </div>`;
                });

                // [개선 완료] 스마트폰 반응형 시간/라벨 상하 배치 및 드래그 핸들 크기 확대 추적
                container.innerHTML += `
                <div class="relative transition-all duration-300 mb-6">
                    <div class="drag-handle absolute -left-[35px] sm:-left-[64px] top-3 w-8 h-8 sm:w-10 sm:h-10 bg-${meal.color}-500 rounded-full border-[3px] sm:border-4 border-slate-950 timeline-line-glow cursor-move flex items-center justify-center shadow-lg active:scale-110 transition-transform z-10" title="드래그하여 순서 변경">
                        <span class="text-white text-xs sm:text-sm font-black select-none pointer-events-none">↕</span>
                    </div>
                    <div class="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800">
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer gap-4 sm:gap-0" onclick="window.toggleCollapse(${mIdx})">
                            <div class="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-4 w-full sm:w-auto" onclick="event.stopPropagation()">
                                <input type="text" onchange="window.updateMealField(${mIdx}, 'label', event.target.value)" value="${meal.label}" class="px-0 sm:px-2 py-1 text-sm sm:text-sm font-black uppercase bg-transparent sm:bg-${meal.color}-500/10 text-${meal.color}-400 sm:border border-${meal.color}-500/20 rounded-md outline-none w-full sm:w-[150px] mb-1 sm:mb-0">
                                <input type="time" onchange="window.updateMealField(${mIdx}, 'time', event.target.value)" value="${meal.time}" class="bg-transparent text-white font-black text-3xl sm:text-2xl outline-none shrink-0 p-0 tracking-tighter cursor-pointer">
                            </div>
                            <div class="flex gap-2 items-center self-end sm:self-auto shrink-0 mt-2 sm:mt-0" onclick="event.stopPropagation()">
                                <button onclick="window.openEditMealModal(${mIdx}, true)" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded border border-slate-700 transition-colors">📋 복제</button>
                                <button onclick="window.openEditMealModal(${mIdx}, false)" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors">⚙️ 수정</button>
                                <button onclick="window.deleteMeal(${mIdx})" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded border border-slate-700 transition-colors">🗑️ 삭제</button>
                                <button onclick="window.toggleCollapse(${mIdx})" class="text-lg px-2 py-1 ml-1 text-slate-400 hover:text-white transition-colors">${meal.isCollapsed ? '🔽' : '🔼'}</button>
                            </div>
                        </div>
                        <div class="transition-all duration-300 overflow-hidden ${meal.isCollapsed ? 'max-h-0 opacity-0 m-0' : 'max-h-[3000px] opacity-100 mt-5'}">
                            <input type="text" onchange="window.updateMealField(${mIdx}, 'explain', event.target.value)" value="${meal.explain || ''}" placeholder="스케줄 메모 (예: 오후 메인 본 운동 세션)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm sm:text-base text-white font-bold outline-none focus:border-sky-500 mb-3">
                            <textarea onchange="window.updateMealField(${mIdx}, 'supps', event.target.value)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm sm:text-base text-slate-200 outline-none focus:border-sky-500 mb-3 min-h-[100px] custom-scrollbar" placeholder="보충제 섭취 프로토콜 및 상세 코칭 메모">${meal.supps || ''}</textarea>
                            ${itemsHtml}
                            <button onclick="window.addItem(${mIdx})" class="w-full py-3 border border-dashed border-slate-700 text-sm sm:text-base text-slate-400 hover:text-sky-400 font-bold mt-2 rounded-xl transition-colors">+ 식품 및 보충제 추가</button>
                        </div>
                    </div>
                </div>`;
            });
            this.calculateMacros();

            if (typeof Sortable !== 'undefined') {
                if (window.timelineSortable) { window.timelineSortable.destroy(); }
                window.timelineSortable = new Sortable(document.getElementById('timeline-container'), {
                    handle: '.drag-handle', animation: 200, ghostClass: 'opacity-40', delay: 100, delayOnTouchOnly: true, forceFallback: true, fallbackClass: 'opacity-90',
                    onEnd: function (evt) {
                        const oldIdx = evt.oldIndex; const newIdx = evt.newIndex; if (oldIdx === newIdx) return;
                        const phase = state.phases.find(p => p.id === state.currentPhaseId);
                        const movedItem = phase.meals.splice(oldIdx, 1)[0]; phase.meals.splice(newIdx, 0, movedItem);
                        Services.triggerSave(); setTimeout(() => App.loadPhase(state.currentPhaseId), 10);
                    }
                });
            }
        },

        openPhaseModal: function(isNew = false) { state.editingPhaseIsNew = isNew; if (isNew) { document.getElementById('phase-title').value = ''; document.getElementById('phase-desc').value = ''; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); document.getElementById('phase-title').value = cp.title; document.getElementById('phase-desc').value = cp.desc; } document.getElementById('phase-modal').classList.remove('hidden'); document.getElementById('phase-modal').classList.add('flex'); },
        closePhaseModal: function() { document.getElementById('phase-modal').classList.add('hidden'); document.getElementById('phase-modal').classList.remove('flex'); },
        savePhaseModal: function() { const title = document.getElementById('phase-title').value || '새 탭'; const desc = document.getElementById('phase-desc').value || ''; if (state.editingPhaseIsNew) { const newId = 'p_' + Date.now(); state.phases.push({ id: newId, title: title, desc: desc, meals: [] }); state.currentPhaseId = newId; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.title = title; cp.desc = desc; } this.closePhaseModal(); Services.triggerSave(this.showToast); this.loadPhase(state.currentPhaseId); this.showToast("탭 저장 완료."); },
        deletePhase: function() { if(state.phases.length <= 1) { this.showToast("최소 1개의 탭은 유지해야 합니다."); return; } if(confirm("탭 전체를 삭제하시겠습니까?")) { state.phases = state.phases.filter(p => p.id !== state.currentPhaseId); Services.triggerSave(this.showToast); this.loadPhase(state.phases[0].id); this.showToast("탭 삭제됨."); } },
        copyPhase: function() { const cp = state.phases.find(p => p.id === state.currentPhaseId); state.clipboardMeals = JSON.parse(JSON.stringify(cp.meals)); this.showToast("식단 세트가 복사되었습니다."); },
        pastePhase: function() { if (!state.clipboardMeals || state.clipboardMeals.length === 0) { this.showToast("복사된 세트가 없습니다."); return; } if(confirm("⚠️ 현재 탭의 내용이 덮어쓰기 됩니다. 진행할까요?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals = state.clipboardMeals.map(m => { let cloned = JSON.parse(JSON.stringify(m)); cloned.id = 'm' + Date.now() + Math.floor(Math.random() * 1000); return cloned; }); Services.triggerSave(this.showToast); this.loadPhase(state.currentPhaseId); this.showToast("덮어쓰기 완료."); } },

        openEditMealModal: function(mIdx, isDuplicate) { let meal; if (mIdx !== null) meal = state.phases.find(p => p.id === state.currentPhaseId).meals[mIdx]; else meal = { time: '12:00', label: '새 일정', color: 'sky', explain: '', supps: '', items: [] }; state.editingMealState = { mIdx: mIdx, isDuplicate: isDuplicate, originalItems: meal.items || [] }; document.getElementById('edit-meal-title').innerText = (isDuplicate) ? "📋 일정 복제" : (mIdx === null ? "➕ 새 일정 추가" : "⚙️ 일정 수정"); document.getElementById('edit-meal-time').value = meal.time; document.getElementById('edit-meal-label').value = meal.label; document.getElementById('edit-meal-color').value = meal.color; document.getElementById('edit-meal-explain').value = meal.explain || ''; document.getElementById('edit-meal-supps').value = meal.supps || ''; document.getElementById('edit-meal-modal').classList.remove('hidden'); document.getElementById('edit-meal-modal').classList.add('flex'); },
        closeEditMealModal: function() { document.getElementById('edit-meal-modal').classList.add('hidden'); document.getElementById('edit-meal-modal').classList.remove('flex'); },
        saveEditMealModal: function() { const time = document.getElementById('edit-meal-time').value; const label = document.getElementById('edit-meal-label').value || '일정'; const color = document.getElementById('edit-meal-color').value; const explain = document.getElementById('edit-meal-explain').value; const supps = document.getElementById('edit-meal-supps').value; const cp = state.phases.find(p => p.id === state.currentPhaseId); if (state.editingMealState.mIdx === null || state.editingMealState.isDuplicate) { const newObj = { id: 'm'+Date.now(), time: time, label: label, color: color, explain: explain, supps: supps, items: JSON.parse(JSON.stringify(state.editingMealState.originalItems)), isCollapsed: false }; if(state.editingMealState.isDuplicate) { cp.meals.splice(state.editingMealState.mIdx + 1, 0, newObj); this.showToast("복제되었습니다."); } else { cp.meals.push(newObj); this.showToast("추가되었습니다."); } } else { const meal = cp.meals[state.editingMealState.mIdx]; meal.time = time; meal.label = label; meal.color = color; meal.explain = explain; meal.supps = supps; this.showToast("수정 완료."); } Services.triggerSave(this.showToast); this.closeEditMealModal(); this.loadPhase(state.currentPhaseId); },

        cycleColor: function(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); const colors = ['sky', 'emerald', 'amber', 'rose', 'violet', 'slate']; const current = cp.meals[mIdx].color || 'sky'; cp.meals[mIdx].color = colors[(colors.indexOf(current) + 1) % colors.length]; Services.triggerSave(); this.loadPhase(state.currentPhaseId); },
        toggleCollapse: function(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].isCollapsed = !cp.meals[mIdx].isCollapsed; this.loadPhase(state.currentPhaseId); },
        updateMealField: function(mIdx, field, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx][field] = val; Services.triggerSave(); this.loadPhase(state.currentPhaseId); },
        updateItemName: function(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].name = val; Services.triggerSave(); this.calculateMacros(); },
        updateItemAmount: function(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].amount = parseFloat(val)||0; Services.triggerSave(); this.calculateMacros(); },
        deleteItem: function(mIdx, iIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.splice(iIdx, 1); Services.triggerSave(); this.loadPhase(state.currentPhaseId); },
        addItem: function(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.push({name:'백미', amount:100}); Services.triggerSave(); this.loadPhase(state.currentPhaseId); },
        deleteMeal: function(mIdx) { if(confirm("이 일정을 삭제하시겠습니까?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals.splice(mIdx, 1); Services.triggerSave(); this.loadPhase(state.currentPhaseId); } },

        calculateMacros: function() {
            let tC=0, tP=0, tF=0, tK=0; let cSrc={}, pSrc={}, fSrc={}; const cp = state.phases.find(p => p.id === state.currentPhaseId);
            if(cp) { cp.meals.forEach(m => { if(m.items) { m.items.forEach(i => { const db = state.foodDB[i.name]; if(db) { let amt = i.amount || 0; let c=db.c*amt, p=db.p*amt, f=db.f*amt; tC+=c; tP+=p; tF+=f; tK+=db.k*amt; if(c>0) cSrc[i.name] = (cSrc[i.name]||0) + c; if(p>0) pSrc[i.name] = (pSrc[i.name]||0) + p; if(f>0) fSrc[i.name] = (fSrc[i.name]||0) + f; }});} }); }
            let cKcal = tC * 4, pKcal = tP * 4, fKcal = tF * 9; let totCalc = cKcal + pKcal + fKcal;
            let cPct = totCalc > 0 ? Math.round((cKcal / totCalc) * 100) : 0; let pPct = totCalc > 0 ? Math.round((pKcal / totCalc) * 100) : 0; let fPct = totCalc > 0 ? Math.round((fKcal / totCalc) * 100) : 0;
            
            document.getElementById('dash-kcal').innerText = Math.round(tK).toLocaleString(); 
            document.getElementById('dash-carbs').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-amber-500">${tC.toFixed(1)}g</span> <span class="text-sm sm:text-base text-amber-400/80 font-bold ml-1">(${cPct}%)</span>`;
            document.getElementById('dash-protein').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-emerald-400">${tP.toFixed(1)}g</span> <span class="text-sm sm:text-base text-emerald-400/80 font-bold ml-1">(${pPct}%)</span>`;
            document.getElementById('dash-fat').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-sky-400">${tF.toFixed(1)}g</span> <span class="text-sm sm:text-base text-sky-400/80 font-bold ml-1">(${fPct}%)</span>`;
            document.getElementById('sticky-kcal').innerText = Math.round(tK).toLocaleString(); document.getElementById('sticky-carbs').innerHTML = `${tC.toFixed(1)}g <span class="text-[10px] font-bold">(${cPct}%)</span>`; document.getElementById('sticky-protein').innerHTML = `${tP.toFixed(1)}g <span class="text-[10px] font-bold">(${pPct}%)</span>`; document.getElementById('sticky-fat').innerHTML = `${tF.toFixed(1)}g <span class="text-[10px] font-bold">(${fPct}%)</span>`;
            
            if (!state.pieChartInstance && !document.getElementById('tab-analysis').classList.contains('hidden')) { 
                state.pieChartInstance = new Chart(document.getElementById('chart-pie-macros').getContext('2d'), { type: 'doughnut', data: { labels: ['탄수화물', '단백질', '지방'], datasets: [{ data: [tC, tP, tF], backgroundColor: ['#F59E0B', '#10B981', '#0EA5E9'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 14 } } } } } }); 
            } else if (state.pieChartInstance) { state.pieChartInstance.data.datasets[0].data = [tC, tP, tF]; state.pieChartInstance.update(); }
            this.renderAnalysisDetails(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc);
        },

        renderAnalysisDetails: function(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc) {
            document.getElementById('src-total-c').innerText = `${tC.toFixed(1)}g (${cPct}%)`; document.getElementById('src-total-p').innerText = `${tP.toFixed(1)}g (${pPct}%)`; document.getElementById('src-total-f').innerText = `${tF.toFixed(1)}g (${fPct}%)`;
            const renderList = (srcObj, total, elId, colorCls) => { let html = ''; let sorted = Object.entries(srcObj).sort((a,b)=>b[1]-a[1]); sorted.forEach(([name, amt]) => { let pct = total > 0 ? Math.round((amt/total)*100) : 0; html += `<div class="mb-3"><div class="flex justify-between text-xs text-slate-300 mb-1"><span>${name}</span><span>${amt.toFixed(1)}g (${pct}%)</span></div><div class="w-full bg-slate-800 rounded-full h-2"><div class="bg-${colorCls} h-2 rounded-full" style="width: ${pct}%"></div></div></div>`; }); document.getElementById(elId).innerHTML = html; };
            renderList(cSrc, tC, 'src-list-c', 'amber-500'); renderList(pSrc, tP, 'src-list-p', 'emerald-500'); renderList(fSrc, tF, 'src-list-f', 'sky-500');
        },

        initCalcDropdowns: function() {
            const cDrop = document.getElementById('calc-carb-src'); const pDrop = document.getElementById('calc-pro-src'); const fDrop = document.getElementById('calc-fat-src');
            cDrop.innerHTML = ''; pDrop.innerHTML = ''; fDrop.innerHTML = ''; 
            state.foodCategories['탄수화물'].forEach(f => cDrop.innerHTML += `<option value="${f}">${f}</option>`); state.foodCategories['단백질'].forEach(f => pDrop.innerHTML += `<option value="${f}">${f}</option>`); state.foodCategories['지방'].forEach(f => { if(state.foodDB[f].f > 0.1) fDrop.innerHTML += `<option value="${f}">${f}</option>`; });
            cDrop.value = '백미'; pDrop.value = '닭가슴살'; fDrop.value = '아몬드';
        },

        runSmartCalc: function(type) {
            let src = document.getElementById(`calc-${type}-src`).value; let amt = parseFloat(document.getElementById(`calc-${type}-amt`).value) || 0; let targetMacro = 0; let resHtml = '';
            if(type === 'carb') { targetMacro = amt * state.foodDB[src].c; state.foodCategories['탄수화물'].forEach(f => { if(f !== src && state.foodDB[f].c > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].c)}g</span></div>`; } }); } 
            else if(type === 'pro') { targetMacro = amt * state.foodDB[src].p; state.foodCategories['단백질'].forEach(f => { if(f !== src && state.foodDB[f].p > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].p)}g</span></div>`; } }); } 
            else if(type === 'fat') { targetMacro = amt * state.foodDB[src].f; state.foodCategories['지방'].forEach(f => { if(f !== src && state.foodDB[f].f > 0.1) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].f)}g</span></div>`; } }); }
            document.getElementById(`calc-${type}-res`).innerHTML = resHtml;
        },

        switchMainTab: function(tabId) { 
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden')); document.getElementById(tabId).classList.remove('hidden'); 
            const tabs = ['tab-timeline', 'tab-calculator', 'tab-analysis'];
            tabs.forEach(t => { document.getElementById('btn-' + t).className = (t === tabId) ? "px-5 py-3 rounded-xl text-base font-bold active-tab shrink-0" : "px-5 py-3 rounded-xl text-base font-bold border border-slate-800 text-slate-400 hover:text-white shrink-0"; });
            if(tabId === 'tab-analysis') this.calculateMacros();
        },

        openProfileModal: function() { document.getElementById('mod-weight-user').value=state.userInfo.weight; document.getElementById('mod-height').value=state.userInfo.height; document.getElementById('mod-bf').value=state.userInfo.targetBF; document.getElementById('mod-date').value=state.userInfo.targetDate; document.getElementById('profile-modal').classList.remove('hidden'); document.getElementById('profile-modal').classList.add('flex'); },
        closeProfileModal: function() { document.getElementById('profile-modal').classList.add('hidden'); document.getElementById('profile-modal').classList.remove('flex'); },
        saveProfileModal: function() { state.userInfo = { weight: parseFloat(document.getElementById('mod-weight-user').value)||72.5, height: parseFloat(document.getElementById('mod-height').value)||173, targetBF: parseFloat(document.getElementById('mod-bf').value)||4.0, targetDate: document.getElementById('mod-date').value }; this.closeProfileModal(); Services.triggerSave(this.showToast); this.finishInit(); this.showToast("프로필 저장 완료."); },

        // [개선 완료] 보충제 DB 삭제버튼 위치 개선 (Flex Row 활용)
        renderCustomSupps: function() {
            const container = document.getElementById('custom-supp-list'); container.innerHTML = '';
            state.customSupps.forEach((supp, idx) => {
                container.innerHTML += `
                <div class="bg-slate-900 border border-slate-700 p-4 sm:p-5 rounded-xl flex flex-col gap-4">
                    <div class="flex items-center gap-3">
                        <input type="text" id="supp-name-${idx}" value="${supp.name}" placeholder="보충제 명칭" class="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-bold focus:border-sky-500 outline-none text-base">
                        <button onclick="window.removeCustomSupp(${idx})" class="w-12 h-12 flex justify-center items-center bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-colors shrink-0" title="삭제"><span class="text-xl font-black">✕</span></button>
                    </div>
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div class="flex items-center justify-between"><span class="text-slate-400">중량(g)</span><input type="number" id="supp-wt-${idx}" value="${supp.weight}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                        <div class="flex items-center justify-between"><span class="text-slate-400">Kcal</span><input type="number" id="supp-k-${idx}" value="${supp.kcal}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                        <div class="flex items-center justify-between"><span class="text-amber-500">탄(g)</span><input type="number" step="0.1" id="supp-c-${idx}" value="${supp.carbs}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                        <div class="flex items-center justify-between"><span class="text-emerald-500">단(g)</span><input type="number" step="0.1" id="supp-p-${idx}" value="${supp.protein}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                        <div class="flex items-center justify-between"><span class="text-sky-500">지(g)</span><input type="number" step="0.1" id="supp-f-${idx}" value="${supp.fat}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                    </div>
                </div>`;
            });
        },
        openMacroModal: function() { this.renderCustomSupps(); document.getElementById('macro-modal').classList.remove('hidden'); document.getElementById('macro-modal').classList.add('flex'); },
        closeMacroModal: function() { document.getElementById('macro-modal').classList.add('hidden'); document.getElementById('macro-modal').classList.remove('flex'); },
        addCustomSuppForm: function() { state.customSupps.push({ id: Date.now(), name: '새 보충제', weight: 30, kcal: 120, carbs: 3, protein: 20, fat: 1.5 }); this.renderCustomSupps(); },
        removeCustomSupp: function(idx) { state.customSupps.splice(idx, 1); this.renderCustomSupps(); },
        saveMacroModal: function() { 
            let updatedSupps = [];
            for(let i=0; i<state.customSupps.length; i++) {
                let n = document.getElementById(`supp-name-${i}`).value || '보충제'+i;
                updatedSupps.push({ id: state.customSupps[i].id, name: n, weight: parseFloat(document.getElementById(`supp-wt-${i}`).value)||30, kcal: parseFloat(document.getElementById(`supp-k-${i}`).value)||0, carbs: parseFloat(document.getElementById(`supp-c-${i}`).value)||0, protein: parseFloat(document.getElementById(`supp-p-${i}`).value)||0, fat: parseFloat(document.getElementById(`supp-f-${i}`).value)||0 });
            }
            state.customSupps = updatedSupps; applyCustomSuppsToDB(); this.closeMacroModal(); Services.triggerSave(this.showToast); this.loadPhase(state.currentPhaseId); this.showToast("보충제 DB 저장 완료."); 
        }
    };

    // 5. HTML 버튼 이벤트와 기능을 연결하는 글로벌 매핑 (에러 원천 차단)
    window.switchMainTab = (id) => App.switchMainTab(id); window.loadPhase = (id) => App.loadPhase(id); window.cycleColor = (idx) => App.cycleColor(idx); window.toggleCollapse = (idx) => App.toggleCollapse(idx);
    window.updateMealField = (idx, f, v) => App.updateMealField(idx, f, v); window.updateItemName = (m, i, v) => App.updateItemName(m, i, v); window.updateItemAmount = (m, i, v) => App.updateItemAmount(m, i, v); window.adjAmt = (m, i, d) => App.adjAmt(m, i, d);
    window.addItem = (m) => App.addItem(m); window.deleteItem = (m, i) => App.deleteItem(m, i); window.deleteMeal = (m) => App.deleteMeal(m); window.openPhaseModal = (n) => App.openPhaseModal(n); window.closePhaseModal = () => App.closePhaseModal(); window.savePhaseModal = () => App.savePhaseModal();
    window.deletePhase = () => App.deletePhase(); window.copyPhase = () => App.copyPhase(); window.pastePhase = () => App.pastePhase(); window.openEditMealModal = (m, d) => App.openEditMealModal(m, d); window.closeEditMealModal = () => App.closeEditMealModal(); window.saveEditMealModal = () => App.saveEditMealModal();
    window.openProfileModal = () => App.openProfileModal(); window.closeProfileModal = () => App.closeProfileModal(); window.saveProfileModal = () => App.saveProfileModal(); window.openMacroModal = () => App.openMacroModal(); window.closeMacroModal = () => App.closeMacroModal(); window.saveMacroModal = () => App.saveMacroModal(); window.addCustomSuppForm = () => App.addCustomSuppForm(); window.removeCustomSupp = (idx) => App.removeCustomSupp(idx); window.runSmartCalc = (t) => App.runSmartCalc(t);
    window.exportData = () => Services.exportDataJSON(App.showToast); window.importData = (e) => Services.importDataJSON(e.target.files[0], () => { App.finishInit(); App.showToast("복원 성공."); }, () => App.showToast("오류 파일."));

    window.addEventListener('scroll', function() {
        const stickyBar = document.getElementById('sticky-macro-bar');
        if (window.scrollY > 350) { stickyBar.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none'); stickyBar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto'); } 
        else { stickyBar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto'); stickyBar.classList.add('-translate-y-full', 'opacity-0', 'pointer-events-none'); }
    });

    window.onload = () => {
        Services.initFirebase((success) => {
            const el = document.getElementById('cloud-status');
            if(success) el.innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> 클라우드 연결됨';
            else el.innerHTML = '<span class="w-1.5 h-1.5 bg-sky-500 rounded-full"></span> 로컬 스토리지 모드';
            App.finishInit();
        });
    };

})(); // 즉시 실행 함수(IIFE) 끝


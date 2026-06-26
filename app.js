import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// 1. 마스터 정적 데이터베이스
const FOOD_DB = {
    '백미':{c:0.28,p:0.027,f:0.003,k:1.3}, '현미밥':{c:0.32,p:0.03,f:0.01,k:1.5}, '감자':{c:0.20,p:0.02,f:0.001,k:0.86}, '고구마':{c:0.31,p:0.015,f:0.002,k:1.3}, '찐단호박':{c:0.10,p:0.01,f:0.0,k:0.45}, '오트밀':{c:0.66,p:0.13,f:0.06,k:3.8}, '바나나':{c:0.23,p:0.01,f:0.0,k:0.89}, '사과':{c:0.14,p:0.0,f:0.0,k:0.52}, '파스타(건면)':{c:0.75,p:0.13,f:0.01,k:3.7}, '베이글':{c:0.50,p:0.10,f:0.01,k:2.5}, '식빵':{c:0.49,p:0.09,f:0.04,k:2.7},
    '닭가슴살':{c:0.0,p:0.23,f:0.012,k:1.1}, '닭다리살(껍질X)':{c:0.0,p:0.19,f:0.08,k:1.5}, '돼지안심':{c:0.0,p:0.26,f:0.03,k:1.4}, '소고기부채살':{c:0.0,p:0.21,f:0.11,k:1.9}, '소고기우둔살':{c:0.0,p:0.22,f:0.04,k:1.3}, '연어':{c:0.0,p:0.20,f:0.13,k:2.0}, '틸라피아':{c:0.0,p:0.20,f:0.017,k:0.98}, '오징어':{c:0.03,p:0.16,f:0.01,k:0.9}, '전란':{c:0.007,p:0.125,f:0.095,k:1.43}, '난백액':{c:0.01,p:0.10,f:0.0,k:0.45},
    '아몬드':{c:0.216,p:0.211,f:0.499,k:5.79}, '호두':{c:0.13,p:0.15,f:0.65,k:6.5}, '피넛버터(무당)':{c:0.20,p:0.25,f:0.50,k:5.9}, '아보카도':{c:0.08,p:0.02,f:0.15,k:1.6}, '올리브오일':{c:0.0,p:0.0,f:1.0,k:8.8}, '계란노른자':{c:0.03,p:0.16,f:0.27,k:3.2},
    '브로콜리':{c:0.07,p:0.03,f:0.0,k:0.34}, '아스파라거스':{c:0.04,p:0.02,f:0.0,k:0.20}, '양배추':{c:0.06,p:0.01,f:0.0,k:0.25}, '방울토마토':{c:0.04,p:0.01,f:0.0,k:0.18}, '야채(혼합)':{c:0.03,p:0.01,f:0.0,k:0.2}, '블루베리':{c:0.14,p:0.007,f:0.003,k:0.57}
};
const FOOD_CATEGORIES = {
    '탄수화물':['백미','현미밥','고구마','감자','찐단호박','오트밀','바나나','사과','파스타(건면)','베이글','식빵'],
    '단백질':['닭가슴살','닭다리살(껍질X)','돼지안심','소고기부채살','소고기우둔살','연어','틸라피아','오징어','전란','난백액'],
    '지방':['아몬드','호두','피넛버터(무당)', '아보카도','올리브오일','계란노른자'],
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
    { id: 'p_2', title: '수분 조절 & 밴딩', desc: '수분 조절 및 밴딩 상세 일정 관리 탭', meals: [] }, 
    { id: 'p_3', title: 'D-Day 카보로딩', desc: '대회 당일 최상의 컨디션을 위한 카보로딩 로직', meals: [] }
];

// 2. 전역 애플리케이션 상태 관리 객체
const state = {
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
    appId: 'prep-master-pro'
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

// 3. 내부 저장소 및 원격 클라우드 제어 함수
function saveToLocal() {
    localStorage.setItem('prep_master_local_data', JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo }));
}
function loadFromLocal() {
    const local = localStorage.getItem('prep_master_local_data');
    if (local) {
        try {
            const parsed = JSON.parse(local);
            if (parsed.phases) state.phases = parsed.phases;
            if (parsed.customSupps) state.customSupps = parsed.customSupps;
            if (parsed.userInfo) state.userInfo = parsed.userInfo;
            return true;
        } catch(e) { return false; }
    }
    return false;
}

async function initializeFirebase(onInitComplete) {
    loadFromLocal();
    try {
        const cfg = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : null;
        if (!cfg) { onInitComplete(false); return; }
        const app = initializeApp(cfg); const auth = getAuth(app); state.db = getFirestore(app);
        await signInAnonymously(auth);
        onAuthStateChanged(auth, async (user) => {
            if (user) {
                state.userId = user.uid;
                const snap = await getDoc(doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData'));
                if (snap.exists()) {
                    const data = snap.data();
                    if (data.phases) state.phases = data.phases;
                    if (data.customSupps) state.customSupps = data.customSupps;
                    if (data.userInfo) state.userInfo = data.userInfo;
                    saveToLocal();
                }
            }
            onInitComplete(true);
        });
    } catch (e) { onInitComplete(false); }
}

async function saveToCloud() {
    saveToLocal();
    if (!state.userId || !state.db) return;
    try { await setDoc(doc(state.db, 'artifacts', state.appId, 'users', state.userId, 'prepData', 'userData'), { phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo }, { merge: true }); } catch(e) {}
}

function triggerSave(showToastCallback) {
    saveToLocal(); if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => { saveToCloud(); if(showToastCallback) showToastCallback("로컬 및 클라우드 동기화 완료."); }, 800);
}
let saveTimeout = null;

// 4. 핵심 비즈니스 연산 및 인터페이스 제어 엔진
export function showToast(msg) { 
    const t = document.getElementById('toast'); document.getElementById('toast-text').innerText = msg; 
    t.className = "fixed bottom-5 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl"; 
    setTimeout(() => { t.className = "fixed bottom-5 right-5 z-50 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 2500); 
}

export function finishInit() { 
    document.getElementById('prof-weight-display').innerText = state.userInfo.weight + 'kg'; 
    document.getElementById('prof-bf-display').innerText = state.userInfo.targetBF + '%';
    document.getElementById('prof-height-display').innerText = state.userInfo.height + 'cm';
    if(state.userInfo.targetDate) { document.getElementById('badge-target-date').innerText = `Target Date: ${state.userInfo.targetDate.substring(5).replace('-','.')}`; }
    applyCustomSuppsToDB(); initCalcDropdowns();
    if(state.phases.length > 0) loadPhase(state.phases[0].id); 
    runSmartCalc('carb'); runSmartCalc('pro'); runSmartCalc('fat');
}

export function renderPhaseTabs() {
    const container = document.getElementById('phase-tabs-container'); container.innerHTML = '';
    state.phases.forEach(p => {
        const isActive = (p.id === state.currentPhaseId);
        const btnClass = isActive ? "px-5 py-3 rounded-lg text-base font-bold phase-btn-active shrink-0 transition-colors" : "px-5 py-3 rounded-lg text-base font-bold text-slate-400 hover:bg-slate-800 shrink-0 transition-colors";
        container.innerHTML += `<button onclick="window.loadPhase('${p.id}')" class="${btnClass}">${p.title}</button>`;
    });
}

export function loadPhase(phaseId) { 
    if(!state.phases.find(p => p.id === phaseId) && state.phases.length > 0) phaseId = state.phases[0].id;
    state.currentPhaseId = phaseId; renderPhaseTabs();
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
            
            itemsHtml += `
            <div class="flex items-center justify-between p-3 bg-slate-900/60 rounded-xl border border-slate-800 mb-2">
                <select onchange="window.updateItemName(${mIdx}, ${iIdx}, event.target.value)" class="bg-slate-800 text-slate-200 text-sm px-3 py-2 rounded-lg outline-none w-[140px] sm:w-[160px]">${opts}</select>
                <div class="flex items-center gap-2">
                    <input type="number" oninput="window.updateItemAmount(${mIdx}, ${iIdx}, event.target.value)" class="w-16 sm:w-20 bg-slate-950 text-white text-right text-base px-3 py-2 rounded-lg focus:border-sky-500 outline-none" value="${item.amount || 0}">
                    <span class="text-sm text-slate-400 font-bold">g</span>
                    <button onclick="window.deleteItem(${mIdx}, ${iIdx})" class="text-slate-600 hover:text-rose-400 ml-2 px-2 text-lg">✕</button>
                </div>
            </div>`;
        });

        // [개선 완료] 모바일 가시성을 고려하여 flex-col 구조 배치 (라벨이 항상 시간 위에 오도록 강제 구성)
        // [개선 완료] 드래그 핸들 동그라미 크기를 w-9 h-9로 확대하고 터치 미스 완전 방지 마진 조치
        container.innerHTML += `
        <div class="relative transition-all duration-300 mb-6">
            <div onclick="event.stopPropagation(); window.cycleColor(${mIdx})" class="drag-handle absolute -left-[39px] sm:-left-[64px] top-2 w-9 h-9 bg-${meal.color}-500 rounded-full border-4 border-slate-950 timeline-line-glow cursor-move flex items-center justify-center shadow-2xl active:scale-110 transition-transform" title="드래그하여 순서 변경 / 클릭하여 색상 변경">
                <span class="text-white text-sm font-black select-none pointer-events-none">↕</span>
            </div>
            <div class="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer gap-4 sm:gap-0" onclick="window.toggleCollapse(${mIdx})">
                    <div class="flex flex-col gap-1.5 w-full sm:w-auto" onclick="event.stopPropagation()">
                        <input type="text" onchange="window.updateMealField(${mIdx}, 'label', event.target.value)" value="${meal.label}" class="px-2 py-1 text-base sm:text-sm font-black uppercase bg-${meal.color}-500/10 text-${meal.color}-400 border border-${meal.color}-500/20 rounded-md outline-none w-full sm:w-[180px]">
                        <div class="relative w-max">
                            <input type="time" onchange="window.updateMealField(${mIdx}, 'time', event.target.value)" value="${meal.time}" class="bg-transparent text-${meal.color}-400 font-black text-2xl sm:text-2xl outline-none p-0 tracking-tighter cursor-pointer">
                        </div>
                    </div>
                    <div class="flex gap-2 items-center self-end sm:self-auto shrink-0" onclick="event.stopPropagation()">
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
    calculateMacros();

    // [개선 완료] forceFallback 기능을 활성화하여 모바일 터치 이동 시 동그라미가 손가락을 정밀 추적하도록 설정
    if (typeof Sortable !== 'undefined') {
        if (window.timelineSortable) { window.timelineSortable.destroy(); }
        window.timelineSortable = new Sortable(document.getElementById('timeline-container'), {
            handle: '.drag-handle', animation: 200, ghostClass: 'opacity-30', 
            forceFallback: true, fallbackClass: 'opacity-90', fallbackOnBody: true, swapThreshold: 0.65,
            onEnd: function (evt) {
                const oldIdx = evt.oldIndex; const newIdx = evt.newIndex; if (oldIdx === newIdx) return;
                const phase = state.phases.find(p => p.id === state.currentPhaseId);
                const movedItem = phase.meals.splice(oldIdx, 1)[0];
                phase.meals.splice(newIdx, 0, movedItem);
                triggerSave(showToast);
                setTimeout(() => loadPhase(state.currentPhaseId), 10);
            }
        });
    }
}

export function openPhaseModal(isNew = false) { state.editingPhaseIsNew = isNew; if (isNew) { document.getElementById('phase-title').value = ''; document.getElementById('phase-desc').value = ''; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); document.getElementById('phase-title').value = cp.title; document.getElementById('phase-desc').value = cp.desc; } document.getElementById('phase-modal').classList.remove('hidden'); document.getElementById('phase-modal').classList.add('flex'); }
export function closePhaseModal() { document.getElementById('phase-modal').classList.add('hidden'); document.getElementById('phase-modal').classList.remove('flex'); }
export function savePhaseModal() { const title = document.getElementById('phase-title').value || '새로운 식단 탭'; const desc = document.getElementById('phase-desc').value || ''; if (state.editingPhaseIsNew) { const newId = 'p_' + Date.now(); state.phases.push({ id: newId, title: title, desc: desc, meals: [] }); state.currentPhaseId = newId; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.title = title; cp.desc = desc; } closePhaseModal(); triggerSave(showToast); loadPhase(state.currentPhaseId); showToast("탭 정보가 저장되었습니다."); }
export function deletePhase() { if(state.phases.length <= 1) { showToast("최소 1개의 탭은 존재해야 합니다."); return; } if(confirm("현재 식단 탭을 삭제하시겠습니까? 내부의 모든 스케줄이 삭제됩니다.")) { state.phases = state.phases.filter(p => p.id !== state.currentPhaseId); triggerSave(showToast); loadPhase(state.phases[0].id); showToast("식단 탭이 삭제되었습니다."); } }
export function copyPhase() { const cp = state.phases.find(p => p.id === state.currentPhaseId); state.clipboardMeals = JSON.parse(JSON.stringify(cp.meals)); showToast("현재 식단 세트가 클립보드에 복사되었습니다."); }
export function pastePhase() { if (!state.clipboardMeals || state.clipboardMeals.length === 0) { showToast("복사된 식단 세트가 없습니다."); return; } if(confirm("⚠️ 붙여넣기를 진행하면 현재 탭의 기존 식단이 모두 지워집니다.\n정말 덮어쓰시겠습니까?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals = state.clipboardMeals.map(m => { let cloned = JSON.parse(JSON.stringify(m)); cloned.id = 'm' + Date.now() + Math.floor(Math.random() * 1000); return cloned; }); triggerSave(showToast); loadPhase(state.currentPhaseId); showToast("식단 세트가 성공적으로 덮어쓰기 되었습니다."); } }

export function openEditMealModal(mIdx, isDuplicate) { let meal; if (mIdx !== null) meal = state.phases.find(p => p.id === state.currentPhaseId).meals[mIdx]; else meal = { time: '12:00', label: '새 일정', color: 'sky', explain: '', supps: '', items: [] }; state.editingMealState = { mIdx: mIdx, isDuplicate: isDuplicate, originalItems: meal.items || [] }; document.getElementById('edit-meal-title').innerText = (isDuplicate) ? "📋 일정 복제" : (mIdx === null ? "➕ 새 일정 추가" : "⚙️ 일정 수정"); document.getElementById('edit-meal-time').value = meal.time; document.getElementById('edit-meal-label').value = meal.label; document.getElementById('edit-meal-color').value = meal.color; document.getElementById('edit-meal-explain').value = meal.explain || ''; document.getElementById('edit-meal-supps').value = meal.supps || ''; document.getElementById('edit-meal-modal').classList.remove('hidden'); document.getElementById('edit-meal-modal').classList.add('flex'); }
export function closeEditMealModal() { document.getElementById('edit-meal-modal').classList.add('hidden'); document.getElementById('edit-meal-modal').classList.remove('flex'); }
export function saveEditMealModal() { const time = document.getElementById('edit-meal-time').value; const label = document.getElementById('edit-meal-label').value || '일정'; const color = document.getElementById('edit-meal-color').value; const explain = document.getElementById('edit-meal-explain').value; const supps = document.getElementById('edit-meal-supps').value; const cp = state.phases.find(p => p.id === state.currentPhaseId); if (state.editingMealState.mIdx === null || state.editingMealState.isDuplicate) { const newObj = { id: 'm'+Date.now(), time: time, label: label, color: color, explain: explain, supps: supps, items: JSON.parse(JSON.stringify(state.editingMealState.originalItems)), isCollapsed: false }; if(state.editingMealState.isDuplicate) { cp.meals.splice(state.editingMealState.mIdx + 1, 0, newObj); showToast("일정이 수정되어 원본 아래에 복제되었습니다."); } else { cp.meals.push(newObj); showToast("새 일정이 추가되었습니다."); } } else { const meal = cp.meals[state.editingMealState.mIdx]; meal.time = time; meal.label = label; meal.color = color; meal.explain = explain; meal.supps = supps; showToast("일정이 수정되었습니다."); } triggerSave(showToast); closeEditMealModal(); loadPhase(state.currentPhaseId); }

export function cycleColor(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); const colors = ['sky', 'emerald', 'amber', 'rose', 'violet', 'slate']; const current = cp.meals[mIdx].color || 'sky'; cp.meals[mIdx].color = colors[(colors.indexOf(current) + 1) % colors.length]; triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function toggleCollapse(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].isCollapsed = !cp.meals[mIdx].isCollapsed; loadPhase(state.currentPhaseId); }
export function updateMealField(mIdx, field, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx][field] = val; triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function updateItemName(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].name = val; triggerSave(showToast); calculateMacros(); }
export function updateItemAmount(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].amount = parseFloat(val)||0; triggerSave(showToast); calculateMacros(); }
export function deleteItem(mIdx, iIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.splice(iIdx, 1); triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function addItem(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.push({name:'백미', amount:100}); triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function deleteMeal(mIdx) { if(confirm("이 일정을 삭제하시겠습니까?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals.splice(mIdx, 1); triggerSave(showToast); loadPhase(state.currentPhaseId); } }

export function calculateMacros() {
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
    renderAnalysisDetails(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc);
}

export function renderAnalysisDetails(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc) {
    document.getElementById('src-total-c').innerText = `${tC.toFixed(1)}g (${cPct}%)`; document.getElementById('src-total-p').innerText = `${tP.toFixed(1)}g (${pPct}%)`; document.getElementById('src-total-f').innerText = `${tF.toFixed(1)}g (${fPct}%)`;
    const renderList = (srcObj, total, elId, colorCls) => { let html = ''; let sorted = Object.entries(srcObj).sort((a,b)=>b[1]-a[1]); sorted.forEach(([name, amt]) => { let pct = total > 0 ? Math.round((amt/total)*100) : 0; html += `<div class="mb-3"><div class="flex justify-between text-xs text-slate-300 mb-1"><span>${name}</span><span>${amt.toFixed(1)}g (${pct}%)</span></div><div class="w-full bg-slate-800 rounded-full h-2"><div class="bg-${colorCls} h-2 rounded-full" style="width: ${pct}%"></div></div></div>`; }); document.getElementById(elId).innerHTML = html; };
    renderList(cSrc, tC, 'src-list-c', 'amber-500'); renderList(pSrc, tP, 'src-list-p', 'emerald-500'); renderList(fSrc, tF, 'src-list-f', 'sky-500');
}

export function initCalcDropdowns() {
    const cDrop = document.getElementById('calc-carb-src'); const pDrop = document.getElementById('calc-pro-src'); const fDrop = document.getElementById('calc-fat-src');
    cDrop.innerHTML = ''; pDrop.innerHTML = ''; fDrop.innerHTML = ''; 
    state.foodCategories['탄수화물'].forEach(f => cDrop.innerHTML += `<option value="${f}">${f}</option>`); state.foodCategories['단백질'].forEach(f => pDrop.innerHTML += `<option value="${f}">${f}</option>`); state.foodCategories['지방'].forEach(f => { if(state.foodDB[f].f > 0.1) fDrop.innerHTML += `<option value="${f}">${f}</option>`; });
    cDrop.value = '백미'; pDrop.value = '닭가슴살'; fDrop.value = '아몬드';
}

export function runSmartCalc(type) {
    let src = document.getElementById(`calc-${type}-src`).value; let amt = parseFloat(document.getElementById(`calc-${type}-amt`).value) || 0; let targetMacro = 0; let resHtml = '';
    if(type === 'carb') { targetMacro = amt * state.foodDB[src].c; state.foodCategories['탄수화물'].forEach(f => { if(f !== src && state.foodDB[f].c > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].c)}g</span></div>`; } }); } 
    else if(type === 'pro') { targetMacro = amt * state.foodDB[src].p; state.foodCategories['단백질'].forEach(f => { if(f !== src && state.foodDB[f].p > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].p)}g</span></div>`; } }); } 
    else if(type === 'fat') { targetMacro = amt * state.foodDB[src].f; state.foodCategories['지방'].forEach(f => { if(f !== src && state.foodDB[f].f > 0.1) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].f)}g</span></div>`; } }); }
    document.getElementById(`calc-${type}-res`).innerHTML = resHtml;
}

export function switchMainTab(tabId) { 
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden')); document.getElementById(tabId).classList.remove('hidden'); 
    const tabs = ['tab-timeline', 'tab-calculator', 'tab-analysis'];
    tabs.forEach(t => { document.getElementById('btn-' + t).className = (t === tabId) ? "px-5 py-3 rounded-xl text-base font-bold active-tab shrink-0" : "px-5 py-3 rounded-xl text-base font-bold border border-slate-800 text-slate-400 hover:text-white shrink-0"; });
    if(tabId === 'tab-analysis') calculateMacros();
}

// -------------------------------------------------------------
// HTML 인터페이스(UI) 버튼 연동을 위한 전역 window 객체 매핑
// -------------------------------------------------------------
window.switchMainTab = switchMainTab; window.loadPhase = loadPhase; window.cycleColor = cycleColor; window.toggleCollapse = toggleCollapse; window.updateMealField = updateMealField; window.updateItemName = updateItemName; window.updateItemAmount = updateItemAmount; window.addItem = addItem; window.deleteItem = deleteItem; window.deleteMeal = deleteMeal; 
window.openPhaseModal = openPhaseModal; window.closePhaseModal = closePhaseModal; window.savePhaseModal = savePhaseModal; window.deletePhase = deletePhase; window.copyPhase = copyPhase; window.pastePhase = pastePhase;
window.openEditMealModal = openEditMealModal; window.closeEditMealModal = closeEditMealModal; window.saveEditMealModal = saveEditMealModal;
window.openProfileModal = openProfileModal; window.closeProfileModal = closeProfileModal; window.saveProfileModal = saveProfileModal; 
window.openMacroModal = openMacroModal; window.closeMacroModal = closeMacroModal; window.saveMacroModal = saveMacroModal; window.addCustomSuppForm = addCustomSuppForm; window.removeCustomSupp = removeCustomSupp; window.runSmartCalc = runSmartCalc;
window.exportData = () => exportDataJSON(showToast); window.importData = (e) => importDataJSON(e.target.files[0], () => { finishInit(); showToast("동기화 복원 성공."); }, () => showToast("비정상 백업 파일입니다."));

// 스크롤 UI 제어 및 파이어베이스 구동
window.addEventListener('scroll', function() {
    const stickyBar = document.getElementById('sticky-macro-bar');
    if (window.scrollY > 350) { stickyBar.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none'); stickyBar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto'); } 
    else { stickyBar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto'); stickyBar.classList.add('-translate-y-full', 'opacity-0', 'pointer-events-none'); }
});

initializeFirebase((success) => {
    const statusEl = document.getElementById('cloud-status');
    if(success) statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> 클라우드 연결됨';
    else statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-sky-500 rounded-full"></span> 로컬 스토리지 모드';
    finishInit();
});


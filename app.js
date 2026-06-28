/**
 * 파일명: app.js
 * 역할: 식단 플래너 & 훈련 일지 SPA 통합 컨트롤러 및 이벤트 바인딩
 */

import { state, applyCustomSuppsToDB } from './store.js';
import { initializeFirebase, triggerSave, exportDataJSON, importDataJSON, loginWithGoogleBackend, registerWithEmailBackend, loginWithEmailBackend, logoutUserBackend } from './services.js';
import { WORKOUT_DB, AVAILABLE_PLATES, BAR_WEIGHT } from './workoutConstants.js';

let chartBalance = null; let chartVolume = null; let chartWeight = null;
let viewYear = 2026; let viewMonth = 5; 
let restTimerInterval = null; let alarmAudioInterval = null;
let libraryActivePart = '가슴'; let libraryActiveType = '전체'; 
let undoBuffer = null; let currentTimerSeconds = 0; let currentAlarmSound = '1';
window.isUserInteracting = false; let sessionPRTracker = { max1RM: {}, maxVolume: {} };

// ==========================================
// 공통 UI / 토스트 / 네비게이션 제어
// ==========================================
export function showToast(msg) { 
    const t = document.getElementById('toast'); document.getElementById('toast-text').innerText = msg; 
    t.className = "fixed bottom-24 right-5 z-[150] transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl"; 
    setTimeout(() => { t.className = "fixed bottom-24 right-5 z-[150] transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 2500); 
}

window.switchMainView = (viewId) => {
    document.querySelectorAll('.app-view').forEach(el => { el.classList.remove('block'); el.classList.add('hidden'); });
    document.getElementById('view-' + viewId).classList.remove('hidden'); document.getElementById('view-' + viewId).classList.add('block');
    
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active-nav-btn'));
    document.getElementById('tab-' + viewId).classList.add('active-nav-btn');
    
    const titles = { 'diet': 'NUTRITION <span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">PLANNER</span>', 'workout': 'WORKOUT <span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">TRACKER</span>', 'stats': 'ANALYTICS & <span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">SETTINGS</span>' };
    document.getElementById('main-header-title').innerHTML = titles[viewId] || 'PREP MASTER PRO';
    
    if(viewId === 'stats') renderWorkoutAnalysisCharts();
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// ==========================================
// 🛡️ 통합 인증 및 데이터 보호 로직
// ==========================================
async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        try { const isPersisted = await navigator.storage.persisted(); if (!isPersisted) await navigator.storage.persist(); } 
        catch(e) {}
    }
}
function updateAccountStatusUI() {
    const badge = document.getElementById('account-status-badge');
    const bG = document.getElementById('btn-google-auth'); const bE = document.getElementById('btn-email-auth'); const bL = document.getElementById('btn-logout-auth');
    if(!badge) return;
    if(state.userInfo && state.userInfo.isPermanent) {
        badge.className = "px-3 py-1 text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full";
        badge.innerText = `🔐 영구 보존 세션 (${state.userInfo.email})`;
        bG.classList.add('hidden'); bE.classList.add('hidden'); bL.classList.remove('hidden');
    } else {
        badge.className = "px-3 py-1 text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-full";
        badge.innerText = "⚠️ 임시 세션 (데이터 유실 위험)";
        bG.classList.remove('hidden'); bE.classList.remove('hidden'); bL.classList.add('hidden');
    }
}

window.triggerGoogleLogin = async () => {
    try { const res = await loginWithGoogleBackend(); if(res.mode === "linked") showToast("기존 익명 데이터가 구글 계정으로 이관되었습니다."); else showToast("구글 계정 연동 완료."); updateAccountStatusUI(); finishInit(); } 
    catch(err) { showToast("구글 로그인 취소: 모바일 브라우저 도메인을 확인하세요."); }
};
window.openEmailAuthModal = () => { document.getElementById('auth-email-input').value = ''; document.getElementById('auth-password-input').value = ''; document.getElementById('email-auth-modal').classList.remove('hidden'); document.getElementById('email-auth-modal').classList.add('flex'); };
window.closeEmailAuthModal = () => { document.getElementById('email-auth-modal').classList.add('hidden'); document.getElementById('email-auth-modal').classList.remove('flex'); };
window.submitEmailRegister = async () => {
    const e = document.getElementById('auth-email-input').value.trim(); const p = document.getElementById('auth-password-input').value.trim();
    if(!e || p.length < 6) { showToast("이메일과 6자리 패스워드가 필요합니다."); return; }
    try { await registerWithEmailBackend(e, p); showToast("계정 생성 및 데이터 이관 완료."); window.closeEmailAuthModal(); updateAccountStatusUI(); finishInit(); } catch(err) { showToast("가입 실패. 다시 확인하세요."); }
};
window.submitEmailLogin = async () => {
    const e = document.getElementById('auth-email-input').value.trim(); const p = document.getElementById('auth-password-input').value.trim();
    if(!e || !p) return;
    try { await loginWithEmailBackend(e, p); showToast("로그인 성공. 동기화 중..."); window.closeEmailAuthModal(); updateAccountStatusUI(); finishInit(); } catch(err) { showToast("로그인 실패."); }
};
window.triggerLogout = async () => { if(confirm("로컬 캐시가 삭제됩니다. 안전하게 로그아웃 하시겠습니까?")) await logoutUserBackend(); };

// ==========================================
// 🥑 식단 플래너 전용 로직
// ==========================================
export function finishInit() { 
    // 프로필 정보 양방향 동기화
    document.getElementById('prof-weight-display').innerText = state.userInfo.weight; document.getElementById('prof-bf-display').innerText = state.userInfo.targetBF + '%';
    if(state.userInfo.targetDate) document.getElementById('badge-target-date').innerText = state.userInfo.targetDate.substring(5).replace('-','/');
    
    // 식단 부팅
    applyCustomSuppsToDB(); renderPhaseNav();
    if(state.phases.length > 0) loadPhase(state.currentPhaseId || state.phases[0].id); 
    
    // 일지 부팅
    calculateWorkoutDDay();
    const today = new Date(); viewYear = today.getFullYear(); viewMonth = today.getMonth();
    selectWorkoutDate(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
}

function renderPhaseNav() {
    const c = document.getElementById('phase-nav-container'); c.innerHTML = '';
    state.phases.forEach(p => {
        const b = document.createElement('button'); b.innerText = p.title; b.className = `px-4 py-2 text-xs font-bold text-slate-400 bg-[#090D16] border border-slate-800 rounded-full whitespace-nowrap transition-colors flex-shrink-0 min-w-max ${p.id === state.currentPhaseId ? 'active-nav-btn !border-amber-500 !bg-amber-500/10' : 'hover:bg-slate-800/40'}`;
        b.onclick = () => loadPhase(p.id); c.appendChild(b);
    });
    const addB = document.createElement('button'); addB.innerText = '+ 페이즈 추가'; addB.className = "px-4 py-2 text-xs font-bold text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-full whitespace-nowrap transition-colors hover:bg-amber-500/20 flex-shrink-0 min-w-max";
    addB.onclick = () => { const id = 'p_'+Date.now(); state.phases.push({id: id, title: '새 페이즈', desc: '', meals: []}); state.currentPhaseId = id; triggerSave(); renderPhaseNav(); loadPhase(id); }; c.appendChild(addB);
}

function loadPhase(phaseId) {
    state.currentPhaseId = phaseId; renderPhaseNav();
    const phase = state.phases.find(p => p.id === phaseId); if(!phase) return;
    document.getElementById('summary-phase-title').innerText = `${phase.title} 분석`;
    renderMeals();
}

function renderMeals() {
    const phase = state.phases.find(p => p.id === state.currentPhaseId); const c = document.getElementById('meal-cards-container'); c.innerHTML = '';
    if(!phase) return;
    let phaseC = 0, phaseP = 0, phaseF = 0, phaseKcal = 0;
    let srcC = {}, srcP = {}, srcF = {}; // 출처 누적 객체

    phase.meals.forEach((meal, mealIdx) => {
        let mC = 0, mP = 0, mF = 0, mKcal = 0; let itemsHtml = '';
        if(!meal.isWorkout) {
            meal.items.forEach((item, itemIdx) => {
                const ratio = state.foodDB[item.name]; if(!ratio) return;
                const iC = item.amount * ratio.c; const iP = item.amount * ratio.p; const iF = item.amount * ratio.f; const iKcal = item.amount * ratio.k;
                mC += iC; mP += iP; mF += iF; mKcal += iKcal;
                
                srcC[item.name] = (srcC[item.name]||0) + iC; srcP[item.name] = (srcP[item.name]||0) + iP; srcF[item.name] = (srcF[item.name]||0) + iF;
                itemsHtml += `<div class="flex items-center justify-between text-xs py-1"><div class="flex items-center gap-2"><span class="text-slate-400 font-bold w-4 text-center cursor-pointer hover:text-rose-400" onclick="window.removeFoodItem(${mealIdx}, ${itemIdx})">✕</span><span class="font-bold text-slate-200">${item.name}</span></div><div class="flex items-center gap-1.5"><button onclick="window.adjFoodAmount(${mealIdx}, ${itemIdx}, -10)" class="w-5 h-5 bg-slate-800 rounded text-slate-400 font-black hover:bg-slate-700">-</button><span class="w-10 text-right font-black text-amber-400">${item.amount}g</span><button onclick="window.adjFoodAmount(${mealIdx}, ${itemIdx}, 10)" class="w-5 h-5 bg-slate-800 rounded text-slate-400 font-black hover:bg-slate-700">+</button></div></div>`;
            });
        }
        phaseC += mC; phaseP += mP; phaseF += mF; phaseKcal += mKcal;
        
        let cColor = meal.color || 'slate'; const colorMap = { 'amber':'border-amber-500/50 bg-amber-500/5 text-amber-400', 'emerald':'border-emerald-500/50 bg-emerald-500/5 text-emerald-400', 'sky':'border-sky-500/50 bg-sky-500/5 text-sky-400', 'rose':'border-rose-500/50 bg-rose-500/5 text-rose-400', 'violet':'border-violet-500/50 bg-violet-500/5 text-violet-400', 'slate':'border-slate-500/50 bg-slate-500/5 text-slate-400' };
        let tagClass = colorMap[cColor] || colorMap['slate'];

        const card = document.createElement('div'); card.className = "meal-card-handle glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800 shadow-xl space-y-3 cursor-default";
        card.innerHTML = `
            <div class="flex justify-between items-start border-b border-slate-800/80 pb-2">
                <div class="flex items-center gap-2"><span class="text-slate-500 hover:text-white cursor-move text-base font-bold px-1 select-none">☰</span><div><div class="flex items-center gap-1.5 mb-0.5"><span class="px-2 py-0.5 text-[9px] font-black uppercase rounded border ${tagClass}">${meal.time}</span></div><h3 class="text-sm font-black text-white">${meal.label}</h3></div></div>
                <div class="flex gap-1.5"><button onclick="window.openEditMealModal(${mealIdx})" class="px-2 py-1 bg-slate-800 text-slate-300 rounded text-[10px] font-bold border border-slate-700 hover:bg-slate-700">편집</button><button onclick="window.deleteMeal(${mealIdx})" class="px-2 py-1 bg-rose-950/30 text-rose-400 rounded text-[10px] font-bold border border-rose-900/30 hover:bg-rose-900/50">삭제</button></div>
            </div>
            ${meal.explain ? `<p class="text-[11px] text-slate-400 font-bold whitespace-pre-line">${meal.explain}</p>` : ''}
            ${meal.supps ? `<div class="bg-slate-900/60 border border-slate-800 rounded-lg p-2.5"><p class="text-[9px] font-black text-sky-500 mb-0.5">💊 Supplements</p><p class="text-[11px] text-slate-300 font-bold whitespace-pre-line">${meal.supps}</p></div>` : ''}
            ${meal.isWorkout ? `<div class="bg-rose-950/20 border border-rose-900/30 rounded-lg p-3 text-center"><p class="text-xs font-black text-rose-400">🔥 훈련 스케줄</p></div>` : `
                <div class="bg-slate-950/50 border border-slate-800/80 rounded-xl p-3">
                    <div class="flex justify-between items-center mb-2"><p class="text-[9px] font-black text-amber-500 uppercase">Foods</p><span class="text-[11px] font-black text-white">${mKcal.toFixed(0)} kcal</span></div>
                    <div class="space-y-1">${itemsHtml}</div>
                </div>
            `}
        `; c.appendChild(card);
    });

    const addCard = document.createElement('div'); addCard.className = "glass-panel p-3 rounded-2xl border border-dashed border-slate-700 flex justify-center items-center hover:bg-slate-800/40 transition-colors cursor-pointer";
    addCard.innerHTML = `<span class="text-xs font-bold text-amber-500">+ 일정 추가</span>`; addCard.onclick = () => window.openEditMealModal(-1); c.appendChild(addCard);

    if(typeof Sortable !== 'undefined') {
        if(window.mealSortable) window.mealSortable.destroy();
        window.mealSortable = new Sortable(c, { handle: '.cursor-move', animation: 150, onEnd: function (evt) { const oldI = evt.oldIndex; const newI = evt.newIndex; if(oldI === newI || newI >= phase.meals.length) return; const moved = phase.meals.splice(oldI, 1)[0]; phase.meals.splice(newI, 0, moved); triggerSave(); renderMeals(); } });
    }
    updateSummary(phaseC, phaseP, phaseF, phaseKcal);
    renderSrcBreakdown(phaseC, phaseP, phaseF, srcC, srcP, srcF);
}

function updateSummary(c, p, f, kcal) {
    document.getElementById('total-c').innerText = c.toFixed(1) + 'g'; document.getElementById('total-p').innerText = p.toFixed(1) + 'g'; document.getElementById('total-f').innerText = f.toFixed(1) + 'g'; 
    document.getElementById('total-kcal').innerHTML = `${kcal.toFixed(0)}`; document.getElementById('compact-kcal').innerText = `${kcal.toFixed(0)} kcal`;
    document.getElementById('compact-c').innerText = c.toFixed(0); document.getElementById('compact-p').innerText = p.toFixed(0); document.getElementById('compact-f').innerText = f.toFixed(0);
    
    let tC = parseFloat(document.getElementById('calc-c-target').value) || 300; let tP = parseFloat(document.getElementById('calc-p-target').value) || 160; let tF = parseFloat(document.getElementById('calc-f-target').value) || 50;
    document.getElementById('bar-c').style.width = Math.min(100, (c/tC)*100) + '%'; document.getElementById('bar-p').style.width = Math.min(100, (p/tP)*100) + '%'; document.getElementById('bar-f').style.width = Math.min(100, (f/tF)*100) + '%';
    
    if(state.pieChartInstance) state.pieChartInstance.destroy();
    const ctx = document.getElementById('chart-pie-macros').getContext('2d');
    const totalMac = (c*4)+(p*4)+(f*9); const pC = totalMac>0?((c*4)/totalMac*100).toFixed(1):0; const pP = totalMac>0?((p*4)/totalMac*100).toFixed(1):0; const pF = totalMac>0?((f*9)/totalMac*100).toFixed(1):0;
    state.pieChartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: [`탄수화물 ${pC}%`, `단백질 ${pP}%`, `지방 ${pF}%`], datasets: [{ data: [c*4, p*4, f*9], backgroundColor: ['#F59E0B', '#10B981', '#0EA5E9'], borderWidth: 0, hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'right', labels: { color: '#F8FAFC', font: { size: 10, family: 'Pretendard' }, boxWidth: 10 } } } } });
}

// [복원] 영양소 출처 분석 로직
function renderSrcBreakdown(totC, totP, totalF, srcC, srcP, srcF) {
    const renderList = (domId, srcObj, total, colorHex) => {
        const dom = document.getElementById(domId); dom.innerHTML = '';
        const sorted = Object.entries(srcObj).filter(x => x[1] > 0.5).sort((a,b) => b[1] - a[1]);
        sorted.forEach(([name, val]) => {
            const perc = total > 0 ? ((val/total)*100).toFixed(1) : 0;
            dom.innerHTML += `<div class="flex items-center justify-between text-[11px] mb-1"><span class="text-slate-300 font-bold truncate pr-2">${name}</span><div class="flex items-center gap-2"><span class="text-white font-black">${val.toFixed(1)}g</span><span class="text-slate-500 w-8 text-right">${perc}%</span></div></div>`;
        });
    };
    document.getElementById('src-total-c').innerText = `${totC.toFixed(1)}g`; renderList('src-list-c', srcC, totC, '#F59E0B');
    document.getElementById('src-total-p').innerText = `${totP.toFixed(1)}g`; renderList('src-list-p', srcP, totP, '#10B981');
    document.getElementById('src-total-f').innerText = `${totalF.toFixed(1)}g`; renderList('src-list-f', srcF, totalF, '#0EA5E9');
}

// 식단 이벤트 바인딩
window.adjFoodAmount = (mealIdx, itemIdx, delta) => { const phase = state.phases.find(p => p.id === state.currentPhaseId); phase.meals[mealIdx].items[itemIdx].amount += delta; if(phase.meals[mealIdx].items[itemIdx].amount < 0) phase.meals[mealIdx].items[itemIdx].amount = 0; triggerSave(); renderMeals(); };
window.removeFoodItem = (mealIdx, itemIdx) => { const phase = state.phases.find(p => p.id === state.currentPhaseId); phase.meals[mealIdx].items.splice(itemIdx, 1); triggerSave(); renderMeals(); };
window.deleteMeal = (mealIdx) => { if(confirm("삭제하시겠습니까?")) { const phase = state.phases.find(p => p.id === state.currentPhaseId); phase.meals.splice(mealIdx, 1); triggerSave(); renderMeals(); } };

window.openEditMealModal = (mealIdx) => {
    const phase = state.phases.find(p => p.id === state.currentPhaseId); document.getElementById('edit-meal-modal').classList.remove('hidden'); document.getElementById('edit-meal-modal').classList.add('flex');
    if(mealIdx === -1) { state.editingMealState = { label: '새 일정', time: '12:00', color: 'slate', explain: '', supps: '', isWorkout: false, items: [] }; document.getElementById('edit-meal-title').innerText = "새 식사 추가"; } 
    else { state.editingMealState = JSON.parse(JSON.stringify(phase.meals[mealIdx])); state.editingMealState._originalIdx = mealIdx; document.getElementById('edit-meal-title').innerText = "식사 편집"; }
    document.getElementById('edit-meal-label').value = state.editingMealState.label; document.getElementById('edit-meal-time').value = state.editingMealState.time; document.getElementById('edit-meal-color').value = state.editingMealState.color || 'slate'; document.getElementById('edit-meal-explain').value = state.editingMealState.explain || ''; document.getElementById('edit-meal-supps').value = state.editingMealState.supps || ''; document.getElementById('edit-meal-isworkout').checked = state.editingMealState.isWorkout || false;
    renderEditMealItems();
};
window.closeEditMealModal = () => { document.getElementById('edit-meal-modal').classList.add('hidden'); document.getElementById('edit-meal-modal').classList.remove('flex'); state.editingMealState = null; };
window.saveEditMealModal = () => {
    state.editingMealState.label = document.getElementById('edit-meal-label').value || '이름 없음'; state.editingMealState.time = document.getElementById('edit-meal-time').value || '00:00'; state.editingMealState.color = document.getElementById('edit-meal-color').value; state.editingMealState.explain = document.getElementById('edit-meal-explain').value; state.editingMealState.supps = document.getElementById('edit-meal-supps').value; state.editingMealState.isWorkout = document.getElementById('edit-meal-isworkout').checked;
    Array.from(document.getElementById('edit-meal-items-container').children).forEach((row, i) => { const s = row.querySelector('.food-select'); const a = row.querySelector('.food-amount'); if(s && a && state.editingMealState.items[i]) { state.editingMealState.items[i].name = s.value; state.editingMealState.items[i].amount = parseInt(a.value) || 0; } });
    const phase = state.phases.find(p => p.id === state.currentPhaseId); if(state.editingMealState._originalIdx !== undefined) phase.meals[state.editingMealState._originalIdx] = state.editingMealState; else phase.meals.push(state.editingMealState);
    delete state.editingMealState._originalIdx; triggerSave(); window.closeEditMealModal(); renderMeals();
};

function renderEditMealItems() {
    const c = document.getElementById('edit-meal-items-container'); c.innerHTML = '';
    state.editingMealState.items.forEach((item, idx) => {
        const row = document.createElement('div'); row.className = "flex gap-1.5 items-center";
        let opts = ''; Object.keys(state.foodCategories).forEach(cat => { opts += `<optgroup label="${cat}">`; state.foodCategories[cat].forEach(f => { opts += `<option value="${f}" ${f===item.name?'selected':''}>${f}</option>`; }); opts += `</optgroup>`; });
        row.innerHTML = `<select class="food-select flex-1 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-white outline-none">${opts}</select><div class="flex items-center gap-1 w-20 bg-slate-900 border border-slate-700 rounded px-1.5 py-1"><input type="number" class="food-amount w-full bg-transparent text-white text-right text-[10px] font-bold outline-none" value="${item.amount}"><span class="text-[9px] text-slate-500">g</span></div><button onclick="window.removeFoodRowFromModal(${idx})" class="text-slate-500 hover:text-rose-400 font-black px-1 text-[10px]">✕</button>`; c.appendChild(row);
    });
}
window.addFoodRowToModal = () => { state.editingMealState.items.push({name: '백미', amount: 100}); renderEditMealItems(); }; window.removeFoodRowFromModal = (idx) => { state.editingMealState.items.splice(idx, 1); renderEditMealItems(); };

window.openProfileModal = () => { document.getElementById('modal-prof-weight').value = state.userInfo.weight; document.getElementById('modal-prof-bf').value = state.userInfo.targetBF; document.getElementById('modal-prof-height').value = state.userInfo.height; document.getElementById('modal-prof-date').value = state.userInfo.targetDate; document.getElementById('profile-modal').classList.remove('hidden'); document.getElementById('profile-modal').classList.add('flex'); };
window.closeProfileModal = () => { document.getElementById('profile-modal').classList.add('hidden'); document.getElementById('profile-modal').classList.remove('flex'); };
window.saveProfileModal = () => { state.userInfo.weight = parseFloat(document.getElementById('modal-prof-weight').value)||70; state.userInfo.targetBF = parseFloat(document.getElementById('modal-prof-bf').value)||10; state.userInfo.height = parseFloat(document.getElementById('modal-prof-height').value)||175; state.userInfo.targetDate = document.getElementById('modal-prof-date').value; triggerSave(); finishInit(); window.closeProfileModal(); showToast("프로필 업데이트 완료."); };

window.openMacroModal = () => { document.getElementById('calc-bmr').value = state.userInfo.bmr; document.getElementById('calc-c-target').value = state.userInfo.macros.c; document.getElementById('calc-p-target').value = state.userInfo.macros.p; document.getElementById('calc-f-target').value = state.userInfo.macros.f; document.getElementById('macro-modal').classList.remove('hidden'); document.getElementById('macro-modal').classList.add('flex'); renderCustomSuppsList(); window.runSmartCalc('all'); };
window.closeMacroModal = () => { document.getElementById('macro-modal').classList.add('hidden'); document.getElementById('macro-modal').classList.remove('flex'); };
window.saveMacroModal = () => { state.userInfo.bmr = parseInt(document.getElementById('calc-bmr').value)||1800; state.userInfo.macros.c = parseInt(document.getElementById('calc-c-target').value)||300; state.userInfo.macros.p = parseInt(document.getElementById('calc-p-target').value)||160; state.userInfo.macros.f = parseInt(document.getElementById('calc-f-target').value)||50; triggerSave(); finishInit(); window.closeMacroModal(); showToast("매크로 설정 적용 완료."); };
window.runSmartCalc = (type) => {
    if(type==='all') { const bmr = parseInt(document.getElementById('calc-bmr').value)||0; const act = parseFloat(document.getElementById('calc-activity').value)||1.55; document.getElementById('calc-tdee-result').innerText = Math.round(bmr * act) + " kcal"; }
    else if(type==='carb') { const v = parseInt(document.getElementById('calc-c-target').value)||0; document.getElementById('calc-c-kcal').innerText = (v*4)+" kcal"; }
    else if(type==='pro') { const v = parseInt(document.getElementById('calc-p-target').value)||0; document.getElementById('calc-p-kcal').innerText = (v*4)+" kcal"; }
    else if(type==='fat') { const v = parseInt(document.getElementById('calc-f-target').value)||0; document.getElementById('calc-f-kcal').innerText = (v*9)+" kcal"; }
};

function renderCustomSuppsList() { const c = document.getElementById('supp-list-container'); c.innerHTML = ''; state.customSupps.forEach((supp, i) => { const div = document.createElement('div'); div.className = "flex justify-between items-center bg-slate-900 border border-slate-700 p-1.5 rounded text-[10px]"; div.innerHTML = `<span class="text-slate-300 font-bold">${supp.name} <span class="text-slate-500">(${supp.weight}g 당 단백질 ${supp.protein}g)</span></span><button onclick="window.removeCustomSupp(${i})" class="text-rose-400 font-black px-2">✕</button>`; c.appendChild(div); }); }
window.addCustomSuppForm = () => { const n = document.getElementById('supp-new-name').value; const w = parseFloat(document.getElementById('supp-new-weight').value); const p = parseFloat(document.getElementById('supp-new-pro').value); if(!n || !w || !p) return; state.customSupps.push({name:n, weight:w, protein:p}); document.getElementById('supp-new-name').value = ''; document.getElementById('supp-new-weight').value = ''; document.getElementById('supp-new-pro').value = ''; triggerSave(); applyCustomSuppsToDB(); renderCustomSuppsList(); };
window.removeCustomSupp = (idx) => { state.customSupps.splice(idx, 1); triggerSave(); applyCustomSuppsToDB(); renderCustomSuppsList(); };

// ==========================================
// 🏋️ 훈련 일지 캘린더 전용 로직
// ==========================================
function getWorkoutData() { let data = state.workouts[state.selectedDateStr]; if (!data) { data = { weight: 0, bf: 0, smm: 0, exercises: [] }; state.workouts[state.selectedDateStr] = data; } if (!data.exercises) data.exercises = []; return data; }

function calculateWorkoutDDay() {
    const target = new Date(state.userInfo.targetDate || '2026-07-18'); const today = new Date();
    const diffDays = Math.ceil((new Date(target.getFullYear(), target.getMonth(), target.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / (1000 * 60 * 60 * 24));
    const badgeEl = document.getElementById('badge-dday'); if (badgeEl) badgeEl.textContent = diffDays > 0 ? `D-${diffDays}일` : (diffDays === 0 ? `D-Day` : `D+${Math.abs(diffDays)}`);
}

function renderCalendarGrid() {
    const gridEl = document.getElementById('calendar-grid'); if(!gridEl) return; gridEl.innerHTML = '';
    document.getElementById('calendar-month-year').textContent = `${viewYear}년 ${String(viewMonth + 1).padStart(2, '0')}월`;
    const firstDay = new Date(viewYear, viewMonth, 1).getDay(); const lastDate = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) { gridEl.appendChild(document.createElement('div')); }
    for (let day = 1; day <= lastDate; day++) {
        const dayBtn = document.createElement('button'); const normalizedDateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; dayBtn.textContent = day; dayBtn.className = "p-2 sm:p-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex flex-col items-center justify-center min-h-[45px] relative border border-transparent hover:border-slate-700 select-none";
        const td = state.workouts[normalizedDateStr]; if (td && ((td.exercises && td.exercises.length > 0) || (td.weight > 0 || td.bf > 0 || td.smm > 0))) { const dot = document.createElement('span'); dot.className = "w-1 h-1 bg-amber-500 rounded-full absolute bottom-1"; dayBtn.appendChild(dot); }
        if (normalizedDateStr === state.selectedDateStr) dayBtn.className += " active-day font-black text-slate-950"; else { dayBtn.className += " bg-slate-800/40 text-slate-300"; const dayOfWeek = new Date(viewYear, viewMonth, day).getDay(); if (dayOfWeek === 0) dayBtn.className += " text-rose-400"; if (dayOfWeek === 6) dayBtn.className += " text-sky-400"; }
        dayBtn.onclick = () => selectWorkoutDate(normalizedDateStr); gridEl.appendChild(dayBtn);
    }
}

window.moveMonth = (dir) => { viewMonth += dir; if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; } else if (viewMonth > 11) { viewMonth = 0; viewYear += 1; } renderCalendarGrid(); };
window.selectWorkoutDate = (dateStr) => {
    state.selectedDateStr = dateStr; const parts = dateStr.split('-'); document.getElementById('label-selected-date').textContent = `${parts[1]}/${parts[2]}`;
    const data = getWorkoutData(); document.getElementById('input-daily-weight').value = data.weight > 0 ? data.weight : ''; document.getElementById('input-daily-bf').value = data.bf > 0 ? data.bf : ''; document.getElementById('input-daily-smm').value = data.smm > 0 ? data.smm : '';
    renderCalendarGrid(); renderWorkoutList();
};

function renderWorkoutList() {
    const container = document.getElementById('workout-list-container'); if(!container) return; container.innerHTML = ''; const data = getWorkoutData();
    if (data.exercises.length === 0) { container.innerHTML = `<p class="text-[11px] text-slate-500 text-center py-10">등록된 운동이 없습니다.</p>`; document.getElementById('label-total-volume').innerText = "총 볼륨: 0 kg"; return; }

    let dailyTotalVolume = 0;
    data.exercises.forEach((ex, exIdx) => {
        let max1RM = 0; let exVolume = 0; let setsHtml = ''; const currentRestTime = ex.restTime || state.userInfo?.defaultRestTime || 90;
        ex.sets.forEach((set, setIdx) => {
            if (set.done) { dailyTotalVolume += (set.weight * set.reps); exVolume += (set.weight * set.reps); }
            const est1RM = set.weight * (1 + (set.reps / 30)); if (est1RM > max1RM) max1RM = est1RM;
            setsHtml += `
            <div class="flex items-center justify-between gap-1 p-1.5 bg-slate-950/60 rounded border border-slate-800/80 text-[10px] sm:text-xs">
                <span class="font-black text-amber-500 w-3 text-center">${setIdx + 1}</span>
                <select onchange="window.changeSetField(${exIdx}, ${setIdx}, 'type', event.target.value)" class="bg-slate-900 border border-slate-700 rounded px-1 text-slate-300 outline-none"><option value="일반" ${set.type==='일반'?'selected':''}>일반</option><option value="탑" ${set.type==='탑'?'selected':''}>탑</option><option value="백오프" ${set.type==='백오프'?'selected':''}>백오프</option><option value="드롭" ${set.type==='드롭'?'selected':''}>드롭</option></select>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner"><button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', -2.5)" class="w-5 h-5 text-slate-400 font-bold hover:text-white select-none">−</button><input type="number" step="0.1" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'weight', event.target.value)" class="w-8 bg-transparent text-center font-bold text-white outline-none" value="${set.weight}"><button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', 2.5)" class="w-5 h-5 text-slate-400 font-bold hover:text-white select-none">＋</button></div>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner"><button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', -1)" class="w-5 h-5 text-slate-400 font-bold hover:text-white select-none">−</button><input type="number" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'reps', event.target.value)" class="w-6 bg-transparent text-center font-bold text-white outline-none" value="${set.reps}"><button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', 1)" class="w-5 h-5 text-slate-400 font-bold hover:text-white select-none">＋</button></div>
                <input type="checkbox" ${set.done?'checked':''} onchange="window.toggleSetComplete(${exIdx}, ${setIdx}, event.target.checked)" class="w-4 h-4 accent-amber-500 cursor-pointer ml-1"><button onclick="window.deleteSet(${exIdx}, ${setIdx})" class="text-slate-500 hover:text-rose-400 font-black px-1">✕</button>
            </div>`;
        });

        const card = document.createElement('div'); card.className = "bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 space-y-2";
        card.innerHTML = `
            <div class="flex justify-between items-start border-b border-slate-800/60 pb-1.5">
                <div class="flex items-center gap-1.5"><div class="workout-drag-handle text-slate-500 hover:text-white cursor-move text-sm font-bold px-1 select-none">☰</div>
                    <div><div class="flex flex-wrap gap-1 mb-0.5"><span class="px-1.5 py-0.5 text-[8px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">${ex.part}</span></div>
                    <div class="relative group cursor-help w-[130px] sm:w-[200px]" title="${ex.name}"><h3 class="text-xs font-black text-white truncate">${ex.name}</h3></div></div>
                </div>
                <div class="flex flex-col items-end gap-1"><span onclick="window.openRestTimerModal(${exIdx})" class="text-[9px] font-bold bg-slate-800 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-1.5 py-0.5 rounded cursor-pointer">⏱️ ${currentRestTime}s</span><button onclick="window.deleteExercise(${exIdx})" class="text-[9px] text-slate-500 hover:text-rose-400">삭제</button></div>
            </div>
            <div class="space-y-1">${setsHtml}</div>
            <button onclick="window.addSet(${exIdx})" class="w-full py-1 border border-dashed border-slate-700 text-[10px] text-slate-400 hover:text-amber-400 font-bold rounded-lg bg-slate-950/20">+ 세트 추가</button>
        `; container.appendChild(card);
    });
    document.getElementById('label-total-volume').innerText = `총 볼륨: ${dailyTotalVolume.toLocaleString()} kg`;

    if (typeof Sortable !== 'undefined') {
        if (window.workoutSortable) window.workoutSortable.destroy();
        window.workoutSortable = new Sortable(container, { handle: '.workout-drag-handle', animation: 150, delay: 150, delayOnTouchOnly: true, onEnd: function (evt) { const o = evt.oldIndex; const n = evt.newIndex; if (o === n) return; const dData = getWorkoutData(); const moved = dData.exercises.splice(o, 1)[0]; dData.exercises.splice(n, 0, moved); triggerSave(); setTimeout(() => renderWorkoutList(), 10); } });
    }
}

window.addSet = (exIdx) => { const data = getWorkoutData(); const ex = data.exercises[exIdx]; let weight = 40, reps = 10; if (ex.sets.length > 0) { const lastSet = ex.sets[ex.sets.length - 1]; weight = lastSet.weight; reps = lastSet.reps; } ex.sets.push({ type: '일반', weight: weight, reps: reps, memo: '', done: false }); triggerSave(); renderWorkoutList(); };
window.deleteSet = (exIdx, setIdx) => { const data = getWorkoutData(); const ex = data.exercises[exIdx]; undoBuffer = { type: 'set', exIdx: exIdx, setIdx: setIdx, data: JSON.parse(JSON.stringify(ex.sets[setIdx])) }; ex.sets.splice(setIdx, 1); triggerSave(); renderWorkoutList(); document.getElementById('btn-undo').classList.remove('hidden'); showToast("기록 삭제됨."); };
window.adjSetVal = (exIdx, setIdx, field, delta) => { const data = getWorkoutData(); const set = data.exercises[exIdx].sets[setIdx]; let val = (parseFloat(set[field]) || 0) + delta; if (val < 0) val = 0; set[field] = val; triggerSave(); renderWorkoutList(); };
window.changeSetField = (exIdx, setIdx, field, val) => { const data = getWorkoutData(); const set = data.exercises[exIdx].sets[setIdx]; if (field === 'weight' || field === 'reps') set[field] = parseFloat(val) || 0; else set[field] = val; triggerSave(); };
window.toggleSetComplete = (exIdx, setIdx, isChecked) => { const data = getWorkoutData(); data.exercises[exIdx].sets[setIdx].done = isChecked; triggerSave(); renderWorkoutList(); if (isChecked) { const customRestTime = data.exercises[exIdx].restTime || state.userInfo?.defaultRestTime || 90; const customSound = data.exercises[exIdx].alarmSound || state.userInfo?.defaultAlarmSound || '1'; startTimerLogic(customRestTime, customSound); } };
window.deleteExercise = (exIdx) => { if(confirm("종목을 삭제할까요?")) { const data = getWorkoutData(); data.exercises.splice(exIdx, 1); triggerSave(); renderWorkoutList(); } };
document.getElementById('btn-undo').onclick = () => { if (undoBuffer && undoBuffer.type === 'set') { const data = getWorkoutData(); data.exercises[undoBuffer.exIdx].sets.splice(undoBuffer.setIdx, 0, undoBuffer.data); undoBuffer = null; triggerSave(); renderWorkoutList(); document.getElementById('btn-undo').classList.add('hidden'); showToast("원상복구 되었습니다."); } };

window.runPlateCalculate = () => {
    const totalWeight = parseFloat(document.getElementById('plate-calc-target').value) || 0; const resultBox = document.getElementById('plate-calc-result'); if (totalWeight <= BAR_WEIGHT) { resultBox.innerHTML = `<span class="text-rose-400">표준 바 중량(${BAR_WEIGHT}kg) 초과 요망</span>`; return; }
    let netWeight = (totalWeight - BAR_WEIGHT) / 2; const platesCount = {}; AVAILABLE_PLATES.forEach(plate => { if (netWeight >= plate) { const qty = Math.floor(netWeight / plate); platesCount[plate] = qty; netWeight -= plate * qty; } });
    const resultsText = Object.entries(platesCount).map(([w, qty]) => `${w}kg x ${qty}개`).join(', '); resultBox.innerHTML = resultsText ? `각 <span class="text-white font-black">[ ${resultsText} ]</span>` : `조합 불가`;
};

// ==========================================
// 📚 일지 종목 사전 모달 (계층형 필터)
// ==========================================
function getHangulChosung(str) { const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"]; let result = ""; for (let i = 0; i < str.length; i++) { const code = str.charCodeAt(i) - 44032; if (code >= 0 && code <= 11172) result += cho[Math.floor(code / 588)]; else result += str.charAt(i); } return result; }
window.openLibraryModal = () => { document.getElementById('library-modal').classList.remove('hidden'); document.getElementById('library-modal').classList.add('flex'); window.runLibrarySearchFilter(); };
window.closeLibraryModal = () => { document.getElementById('library-modal').classList.add('hidden'); document.getElementById('library-modal').classList.remove('flex'); };
window.resetLibraryFilters = () => { document.getElementById('library-search-input').value = ''; libraryActivePart = '가슴'; libraryActiveType = '전체'; window.runLibrarySearchFilter(); };

window.runLibrarySearchFilter = () => {
    const rawInput = document.getElementById('library-search-input').value.trim().toLowerCase(); const input = rawInput.replace(/\s+/g, ''); const grid = document.getElementById('library-master-card-grid'); grid.innerHTML = ''; const filterBar = document.getElementById('library-filter-part-bar'); const typeBar = document.getElementById('library-filter-type-bar');
    if (filterBar.children.length === 0) {
        const parts = ['전체', ...Object.keys(WORKOUT_DB)];
        parts.forEach(p => { const pill = document.createElement('button'); pill.innerText = p; pill.className = `px-2.5 py-1 text-[10px] font-black rounded-full transition-colors flex-shrink-0 min-w-max ${p === libraryActivePart ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`; pill.onclick = () => { libraryActivePart = p; libraryActiveType = '전체'; window.runLibrarySearchFilter(); }; filterBar.appendChild(pill); });
    } else { Array.from(filterBar.children).forEach(btn => { btn.className = `px-2.5 py-1 text-[10px] font-black rounded-full flex-shrink-0 min-w-max ${btn.innerText === libraryActivePart ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`; }); }

    if (typeBar) {
        typeBar.innerHTML = ''; if (libraryActivePart === '전체') { typeBar.classList.add('hidden'); } else {
            typeBar.classList.remove('hidden'); const types = ['전체', ...Object.keys(WORKOUT_DB[libraryActivePart])];
            types.forEach(t => { const pill = document.createElement('button'); pill.innerText = t; pill.className = `px-2 py-0.5 text-[9px] font-bold rounded-lg flex-shrink-0 min-w-max ${t === libraryActiveType ? 'bg-amber-500/20 text-amber-400 border border-amber-500/40' : 'bg-slate-900 text-slate-500 border border-slate-800/80 hover:text-slate-300'}`; pill.onclick = () => { libraryActiveType = t; window.runLibrarySearchFilter(); }; typeBar.appendChild(pill); });
        }
    }

    const frequencyMap = {}; Object.values(state.workouts).forEach(dateObj => { if (dateObj.exercises) { dateObj.exercises.forEach(ex => { frequencyMap[ex.name] = (frequencyMap[ex.name] || 0) + 1; }); } });
    let matchedExercises = [];
    Object.entries(WORKOUT_DB).forEach(([part, types]) => { if (libraryActivePart !== '전체' && part !== libraryActivePart) return; Object.entries(types).forEach(([type, names]) => { if (libraryActiveType !== '전체' && type !== libraryActiveType) return; names.forEach(name => { const cleanName = name.toLowerCase().replace(/\s+/g, ''); const chosung = getHangulChosung(name).toLowerCase().replace(/\s+/g, ''); if (input && !(cleanName.includes(input) || chosung.includes(input))) return; matchedExercises.push({ part, type, name, freq: frequencyMap[name] || 0 }); }); }); });

    const favoriteExercises = matchedExercises.filter(ex => ex.freq > 0).sort((a, b) => b.freq - a.freq).slice(0, 3);
    if (favoriteExercises.length > 0) {
        const favHeader = document.createElement('div'); favHeader.className = "col-span-1 sm:col-span-2 text-[10px] font-black text-amber-400 uppercase tracking-wider mt-1 select-none"; favHeader.innerHTML = `⭐ 추천`; grid.appendChild(favHeader);
        favoriteExercises.forEach(ex => {
            const card = document.createElement('div'); card.className = "p-2.5 bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/30 rounded-xl flex justify-between items-center shadow-md self-start";
            card.innerHTML = `<div class="truncate mr-2 w-full"><span class="text-[8px] font-black uppercase bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded mr-1">${ex.freq}회</span><span class="text-[9px] font-bold text-slate-500">${ex.part}</span><h4 class="text-xs font-black text-amber-400 truncate mt-0.5">${ex.name}</h4></div><button onclick="window.injectLibraryToToday('${ex.part}', '${ex.type}', '${ex.name}')" class="px-2.5 py-1.5 bg-amber-500 text-slate-950 text-[10px] font-black rounded-lg shrink-0">추가</button>`; grid.appendChild(card);
        });
        const divider = document.createElement('div'); divider.className = "col-span-1 sm:col-span-2 border-t border-slate-800/80 my-1"; grid.appendChild(divider);
    }
    if (matchedExercises.length === 0) { grid.innerHTML = `<p class="text-[10px] text-slate-500 py-4 text-center col-span-1 sm:col-span-2">결과 없음</p>`; return; }
    matchedExercises.forEach(ex => {
        const card = document.createElement('div'); card.className = "p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center self-start";
        card.innerHTML = `<div class="truncate mr-2 w-full"><span class="text-[9px] font-bold text-slate-500 truncate">${ex.part}</span><h4 class="text-xs font-black text-slate-200 truncate mt-0.5">${ex.name}</h4></div><button onclick="window.injectLibraryToToday('${ex.part}', '${ex.type}', '${ex.name}')" class="px-2.5 py-1.5 bg-slate-800 text-[10px] font-bold rounded-lg shrink-0">추가</button>`; grid.appendChild(card);
    });
};
window.injectLibraryToToday = (part, type, name) => {
    const data = getWorkoutData(); if (!data.exercises.some(e => e.name === name)) { const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1'; data.exercises.push({ part: part, type: type, name: name, restTime: dRest, alarmSound: dSound, sets: [] }); triggerSave(); renderWorkoutList(); showToast(`[${name}] 연동 완료`); } else { showToast("이미 추가됨."); }
};

window.triggerQuickInputFAB = () => { const m = document.getElementById('quick-input-modal'); const s = document.getElementById('quick-select-ex-name'); s.innerHTML = ''; Object.values(WORKOUT_DB).forEach(types => Object.values(types).forEach(names => names.forEach(n => s.innerHTML += `<option value="${n}">${n}</option>`))); m.classList.remove('hidden'); m.classList.add('flex'); };
window.closeQuickInputFABModal = () => { document.getElementById('quick-input-modal').classList.add('hidden'); document.getElementById('quick-input-modal').classList.remove('flex'); };
window.saveQuickInputFABModal = () => {
    const name = document.getElementById('quick-select-ex-name').value; const w = parseFloat(document.getElementById('quick-input-weight').value) || 0; const r = parseInt(document.getElementById('quick-input-reps').value) || 0; const data = getWorkoutData(); let targetEx = data.exercises.find(e => e.name === name);
    if (!targetEx) { let fPart = '기타', fType = '기타'; Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } })); const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1'; targetEx = { part: fPart, type: fType, name: name, restTime: dRest, alarmSound: dSound, sets: [] }; data.exercises.push(targetEx); }
    targetEx.sets.push({ type: '일반', weight: w, reps: r, memo: 'FAB 기록', done: true }); triggerSave(); window.closeQuickInputFABModal(); renderWorkoutList(); showToast("등록 완료.");
};

window.openRestTimerModal = (exIdx) => { const data = getWorkoutData(); const ex = data.exercises[exIdx]; document.getElementById('rest-timer-ex-idx').value = exIdx; document.getElementById('rest-timer-sec-input').value = ex.restTime || state.userInfo?.defaultRestTime || 90; document.getElementById('rest-timer-modal').classList.remove('hidden'); document.getElementById('rest-timer-modal').classList.add('flex'); };
window.closeRestTimerModal = () => { document.getElementById('rest-timer-modal').classList.add('hidden'); document.getElementById('rest-timer-modal').classList.remove('flex'); };
window.adjRestTimerSetting = (delta) => { const input = document.getElementById('rest-timer-sec-input'); let val = parseInt(input.value) || 0; val += delta; if(val < 0) val = 0; input.value = val; };
window.saveRestTimerModal = () => { const exIdx = parseInt(document.getElementById('rest-timer-ex-idx').value); const sec = parseInt(document.getElementById('rest-timer-sec-input').value) || 90; const data = getWorkoutData(); data.exercises[exIdx].restTime = sec; triggerSave(); window.closeRestTimerModal(); renderWorkoutList(); showToast("타이머 반영."); };

// ==========================================
// 📊 전역 통계 차트 렌더링 모듈
// ==========================================
function renderWorkoutAnalysisCharts() {
    const cvsBalance = document.getElementById('chart-workout-analysis'); const cvsVolume = document.getElementById('chart-volume-trend'); const cvsWeight = document.getElementById('chart-weight-trend'); if(!cvsBalance) return;
    const partsCount = { '가슴': 0, '등': 0, '어깨': 0, '팔': 0, '하체': 0, '복근': 0, '기타': 0 }; let best1RMVal = 0; let best1RMEx = '-'; const exFreq = {};
    Object.values(state.workouts).forEach(dateObj => { if (dateObj.exercises) { dateObj.exercises.forEach(ex => { let pKey = '기타'; if (ex.part.includes('가슴')) pKey = '가슴'; else if (ex.part.includes('등')) pKey = '등'; else if (ex.part.includes('어깨')) pKey = '어깨'; else if (ex.part.includes('팔')) pKey = '팔'; else if (ex.part.includes('하체')) pKey = '하체'; else if (ex.part.includes('복근')) pKey = '복근'; partsCount[pKey] += ex.sets ? ex.sets.length : 0; exFreq[ex.name] = (exFreq[ex.name] || 0) + 1; ex.sets.forEach(s => { if(s.done) { const est1RM = s.weight * (1 + (s.reps / 30)); if(est1RM > best1RMVal) { best1RMVal = est1RM; best1RMEx = ex.name; } } }); });} });
    let maxFreq = 0; let favEx = '-'; Object.entries(exFreq).forEach(([name, count]) => { if(count > maxFreq) { maxFreq = count; favEx = name; } });
    document.getElementById('stat-favorite-ex').innerText = favEx !== '-' ? favEx : '기록 부족'; document.getElementById('stat-best-1rm').innerText = best1RMEx !== '-' ? `${best1RMEx} (${best1RMVal.toFixed(1)}kg)` : '기록 부족';
    const activeDates = Object.keys(state.workouts).filter(d => (state.workouts[d].exercises && state.workouts[d].exercises.length > 0) || state.workouts[d].weight > 0).sort(); const last7Days = activeDates.slice(-7); const labels = last7Days.map(d => d.slice(5).replace('-','/')); const volData = []; const weightData = [];
    last7Days.forEach(d => { const obj = state.workouts[d]; let dayVol = 0; if(obj.exercises) obj.exercises.forEach(e => e.sets.forEach(s => { if(s.done) dayVol += s.weight * s.reps; })); volData.push(dayVol); weightData.push(obj.weight || null); });

    setTimeout(() => {
        if(chartBalance) chartBalance.destroy(); chartBalance = new Chart(cvsBalance.getContext('2d'), { type: 'radar', data: { labels: Object.keys(partsCount), datasets: [{ data: Object.values(partsCount), backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B', borderWidth: 2, pointBackgroundColor: '#F59E0B' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { grid: { color: 'rgba(255,255,255,0.05)' }, angleLines: { color: 'rgba(255,255,255,0.05)' }, pointLabels: { color: '#94A3B8', font: {size: 10} }, ticks: { display: false } } } });
        if(chartVolume) chartVolume.destroy(); chartVolume = new Chart(cvsVolume.getContext('2d'), { type: 'bar', data: { labels: labels, datasets: [{ label: '총 볼륨(kg)', data: volData, backgroundColor: '#F59E0B', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: {size: 9} } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: {size: 9} } } } } });
        if(chartWeight) chartWeight.destroy(); chartWeight = new Chart(cvsWeight.getContext('2d'), { type: 'line', data: { labels: labels, datasets: [{ label: '체중(kg)', data: weightData, borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.1)', fill: true, tension: 0.3, pointBackgroundColor: '#0EA5E9', spanGaps: true }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: {size: 9} } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: {size: 9} } } } } });
    }, 50);
}

// 스크롤 이벤트: 식단 콤팩트 스티키 헤더 전환
window.addEventListener('scroll', function() {
    const stickyBar = document.getElementById('sticky-macro-bar');
    if(!stickyBar || document.getElementById('view-diet').classList.contains('hidden')) return;
    if (window.scrollY > 300) { stickyBar.classList.add('compact-sticky'); } else { stickyBar.classList.remove('compact-sticky'); }
});

// 백업 기능 통합 바인딩
window.exportData = () => exportDataJSON(showToast); window.importData = (e) => importDataJSON(e.target.files[0], () => { finishInit(); showToast("데이터 동기화/복원 성공."); }, () => showToast("비정상 백업 파일 형식입니다."));
window.exportWorkoutToCSV = () => { let csv = "\uFEFF일자,부위,종목명,세트,중량,반복,완료\n"; Object.entries(state.workouts).forEach(([d,o]) => { if(o.exercises) o.exercises.forEach(e => e.sets.forEach((s,i) => { csv += `${d},${e.part},${e.name},${i+1},${s.weight},${s.reps},${s.done?'Y':'N'}\n`; })); }); const l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})); l.setAttribute("download","Workout_Log.csv"); document.body.appendChild(l); l.click(); document.body.removeChild(l); };
window.triggerClearAllWorkoutData = () => { if(confirm("모든 일지와 식단을 영구 삭제합니까?")) { state.workouts={}; state.phases=[]; triggerSave(); location.reload(); }};

// ==========================================
// 🚀 앱 부팅 통합 코어
// ==========================================
initializeFirebase((success) => {
    requestPersistentStorage();
    const statusEl = document.getElementById('cloud-status');
    if (statusEl) { if (success) statusEl.innerHTML = '<span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> 정상 연동'; else statusEl.innerHTML = '<span class="w-2 h-2 bg-sky-500 rounded-full"></span> 로컬 모드'; }
    updateAccountStatusUI(); finishInit();
});

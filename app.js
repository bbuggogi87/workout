import { state, applyCustomSuppsToDB } from './store.js';
import { initializeFirebase, triggerSave, exportDataJSON, importDataJSON, loginWithGoogleBackend, registerWithEmailBackend, loginWithEmailBackend, logoutUserBackend } from './services.js';

export function showToast(msg) { 
    const t = document.getElementById('toast'); document.getElementById('toast-text').innerText = msg; 
    t.className = "fixed bottom-5 right-5 z-[150] transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl"; 
    setTimeout(() => { t.className = "fixed bottom-5 right-5 z-[150] transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 2500); 
}

// ==========================================
// 🛡️ 영구 저장소 권한 및 정식 인증 UI 제어
// ==========================================
async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        try { const isPersisted = await navigator.storage.persisted(); if (!isPersisted) await navigator.storage.persist(); } 
        catch(e) { console.warn("영구 저장소 차단:", e); }
    }
}

function updateAccountStatusUI() {
    const badge = document.getElementById('account-status-badge');
    const btnGoogle = document.getElementById('btn-google-auth'); const btnEmail = document.getElementById('btn-email-auth'); const btnLogout = document.getElementById('btn-logout-auth');
    if(!badge) return;
    if(state.userInfo && state.userInfo.isPermanent) {
        badge.className = "px-3 py-1 text-[11px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full";
        badge.innerText = `🔐 영구 보존 세션 (${state.userInfo.email})`;
        btnGoogle.classList.add('hidden'); btnEmail.classList.add('hidden'); btnLogout.classList.remove('hidden');
    } else {
        badge.className = "px-3 py-1 text-[11px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-full";
        badge.innerText = "⚠️ 임시 세션 (데이터 유실 위험)";
        btnGoogle.classList.remove('hidden'); btnEmail.classList.remove('hidden'); btnLogout.classList.add('hidden');
    }
}

window.triggerGoogleLogin = async () => {
    try {
        const res = await loginWithGoogleBackend();
        if(res.mode === "linked") showToast("익명 데이터가 성공적으로 구글 계정으로 이관되었습니다.");
        else showToast("구글 계정 동기화 완료.");
        updateAccountStatusUI(); finishInit();
    } catch(err) { showToast("구글 로그인 취소."); }
};
window.openEmailAuthModal = () => { document.getElementById('auth-email-input').value = ''; document.getElementById('auth-password-input').value = ''; document.getElementById('email-auth-modal').classList.remove('hidden'); document.getElementById('email-auth-modal').classList.add('flex'); };
window.closeEmailAuthModal = () => { document.getElementById('email-auth-modal').classList.add('hidden'); document.getElementById('email-auth-modal').classList.remove('flex'); };
window.submitEmailRegister = async () => {
    const e = document.getElementById('auth-email-input').value.trim(); const p = document.getElementById('auth-password-input').value.trim();
    if(!e || p.length < 6) { showToast("이메일과 6자리 패스워드가 필요합니다."); return; }
    try { await registerWithEmailBackend(e, p); showToast("정식 계정 연동 및 이관 완료."); window.closeEmailAuthModal(); updateAccountStatusUI(); finishInit(); } catch(err) { showToast("가입 실패. 규격을 확인하세요."); }
};
window.submitEmailLogin = async () => {
    const e = document.getElementById('auth-email-input').value.trim(); const p = document.getElementById('auth-password-input').value.trim();
    if(!e || !p) { showToast("정보를 입력하세요."); return; }
    try { await loginWithEmailBackend(e, p); showToast("로그인 성공. 데이터 갱신 중."); window.closeEmailAuthModal(); updateAccountStatusUI(); finishInit(); } catch(err) { showToast("로그인 실패."); }
};
window.triggerLogout = async () => { if(confirm("로컬 캐시가 정리됩니다. 로그아웃 할까요?")) { await logoutUserBackend(); } };

// ==========================================
// 기존 식단 플래너 앱 로직
// ==========================================
export function finishInit() { 
    document.getElementById('prof-weight-display').innerText = state.userInfo.weight + 'kg'; 
    document.getElementById('prof-bf-display').innerText = state.userInfo.targetBF + '%';
    document.getElementById('prof-height-display').innerText = state.userInfo.height + 'cm';
    if(state.userInfo.targetDate) { document.getElementById('badge-target-date').innerText = `Target Date: ${state.userInfo.targetDate.substring(5).replace('-','.')}`; }
    applyCustomSuppsToDB(); initCalcDropdowns(); renderPhaseNav();
    if(state.phases.length > 0) loadPhase(state.currentPhaseId || state.phases[0].id); 
    runSmartCalc('carb'); runSmartCalc('pro'); runSmartCalc('fat');
}

function renderPhaseNav() {
    const c = document.getElementById('phase-nav-container'); c.innerHTML = '';
    state.phases.forEach(p => {
        const b = document.createElement('button'); b.innerText = p.title; b.className = `nav-button px-5 py-3 text-sm font-bold text-slate-400 bg-[#090D16] border border-slate-800 rounded-full whitespace-nowrap transition-colors flex-shrink-0 min-w-max ${p.id === state.currentPhaseId ? 'active' : 'hover:bg-slate-800/40'}`;
        b.onclick = () => loadPhase(p.id); c.appendChild(b);
    });
    const addB = document.createElement('button'); addB.innerText = '+ 페이즈 추가'; addB.className = "px-5 py-3 text-sm font-bold text-amber-500 bg-amber-500/10 border border-amber-500/30 rounded-full whitespace-nowrap transition-colors hover:bg-amber-500/20 flex-shrink-0 min-w-max";
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
    phase.meals.forEach((meal, mealIdx) => {
        let mC = 0, mP = 0, mF = 0, mKcal = 0;
        let itemsHtml = '';
        if(!meal.isWorkout) {
            meal.items.forEach((item, itemIdx) => {
                const ratio = state.foodDB[item.name]; if(!ratio) return;
                const iC = item.amount * ratio.c; const iP = item.amount * ratio.p; const iF = item.amount * ratio.f; const iKcal = item.amount * ratio.k;
                mC += iC; mP += iP; mF += iF; mKcal += iKcal;
                itemsHtml += `<div class="flex items-center justify-between text-xs py-1"><div class="flex items-center gap-2"><span class="text-slate-400 font-bold w-4 text-center cursor-pointer hover:text-rose-400" onclick="window.removeFoodItem(${mealIdx}, ${itemIdx})">✕</span><span class="font-bold text-slate-200">${item.name}</span></div><div class="flex items-center gap-1.5"><button onclick="window.adjFoodAmount(${mealIdx}, ${itemIdx}, -10)" class="w-5 h-5 bg-slate-800 rounded text-slate-400 font-black hover:bg-slate-700">-</button><span class="w-10 text-right font-black text-amber-400">${item.amount}g</span><button onclick="window.adjFoodAmount(${mealIdx}, ${itemIdx}, 10)" class="w-5 h-5 bg-slate-800 rounded text-slate-400 font-black hover:bg-slate-700">+</button></div></div>`;
            });
        }
        phaseC += mC; phaseP += mP; phaseF += mF; phaseKcal += mKcal;
        
        let cColor = meal.color || 'slate'; const colorMap = { 'amber':'border-amber-500/50 bg-amber-500/5 text-amber-400', 'emerald':'border-emerald-500/50 bg-emerald-500/5 text-emerald-400', 'sky':'border-sky-500/50 bg-sky-500/5 text-sky-400', 'rose':'border-rose-500/50 bg-rose-500/5 text-rose-400', 'violet':'border-violet-500/50 bg-violet-500/5 text-violet-400', 'slate':'border-slate-500/50 bg-slate-500/5 text-slate-400' };
        let tagClass = colorMap[cColor] || colorMap['slate'];

        const card = document.createElement('div');
        card.className = "meal-card-handle glass-panel p-5 sm:p-6 rounded-2xl border border-slate-800 shadow-xl space-y-4 cursor-default";
        card.innerHTML = `
            <div class="flex justify-between items-start border-b border-slate-800/80 pb-3">
                <div class="flex items-center gap-3"><span class="text-slate-500 hover:text-white cursor-move text-lg font-bold px-1 select-none">☰</span><div><div class="flex items-center gap-2 mb-1"><span class="px-2 py-0.5 text-[10px] font-black uppercase rounded border ${tagClass}">${meal.time}</span></div><h3 class="text-base font-black text-white">${meal.label}</h3></div></div>
                <div class="flex gap-1.5"><button onclick="window.openEditMealModal(${mealIdx})" class="px-2 py-1 bg-slate-800 text-slate-300 rounded text-xs font-bold border border-slate-700 hover:bg-slate-700">편집</button><button onclick="window.deleteMeal(${mealIdx})" class="px-2 py-1 bg-rose-950/30 text-rose-400 rounded text-xs font-bold border border-rose-900/30 hover:bg-rose-900/50">삭제</button></div>
            </div>
            ${meal.explain ? `<p class="text-xs text-slate-400 font-bold whitespace-pre-line">${meal.explain}</p>` : ''}
            ${meal.supps ? `<div class="bg-slate-900/60 border border-slate-800 rounded-lg p-3"><p class="text-[10px] font-black text-sky-500 mb-1">💊 Supplement Stack</p><p class="text-xs text-slate-300 font-bold whitespace-pre-line">${meal.supps}</p></div>` : ''}
            ${meal.isWorkout ? `<div class="bg-rose-950/20 border border-rose-900/30 rounded-lg p-4 text-center"><p class="text-sm font-black text-rose-400">🔥 훈련 스케줄 (식품 미할당)</p></div>` : `
                <div class="bg-slate-950/50 border border-slate-800/80 rounded-xl p-4">
                    <div class="flex justify-between items-center mb-3"><p class="text-[10px] font-black text-amber-500 uppercase tracking-wider">Foods</p><span class="text-xs font-black text-white">${mKcal.toFixed(0)} kcal</span></div>
                    <div class="space-y-1">${itemsHtml}</div>
                </div>
            `}
        `;
        c.appendChild(card);
    });

    const addCard = document.createElement('div'); addCard.className = "glass-panel p-4 rounded-2xl border border-dashed border-slate-700 flex justify-center items-center hover:bg-slate-800/40 transition-colors cursor-pointer";
    addCard.innerHTML = `<span class="text-sm font-bold text-amber-500">+ 새로운 식사/일정 추가</span>`; addCard.onclick = () => window.openEditMealModal(-1); c.appendChild(addCard);

    if(typeof Sortable !== 'undefined') {
        if(window.mealSortable) window.mealSortable.destroy();
        window.mealSortable = new Sortable(c, { handle: '.cursor-move', animation: 150, onEnd: function (evt) { const oldI = evt.oldIndex; const newI = evt.newIndex; if(oldI === newI || newI >= phase.meals.length) return; const moved = phase.meals.splice(oldI, 1)[0]; phase.meals.splice(newI, 0, moved); triggerSave(); renderMeals(); } });
    }
    updateSummary(phaseC, phaseP, phaseF, phaseKcal);
}

function updateSummary(c, p, f, kcal) {
    document.getElementById('total-c').innerText = c.toFixed(1) + 'g'; document.getElementById('total-p').innerText = p.toFixed(1) + 'g'; document.getElementById('total-f').innerText = f.toFixed(1) + 'g'; document.getElementById('total-kcal').innerHTML = `${kcal.toFixed(0)} <span class="text-sm">kcal</span>`;
    let tC = parseFloat(document.getElementById('calc-c-target').value) || 300; let tP = parseFloat(document.getElementById('calc-p-target').value) || 160; let tF = parseFloat(document.getElementById('calc-f-target').value) || 50;
    document.getElementById('bar-c').style.width = Math.min(100, (c/tC)*100) + '%'; document.getElementById('bar-p').style.width = Math.min(100, (p/tP)*100) + '%'; document.getElementById('bar-f').style.width = Math.min(100, (f/tF)*100) + '%';
    
    if(state.pieChartInstance) state.pieChartInstance.destroy();
    const ctx = document.getElementById('chart-pie-macros').getContext('2d');
    const totalMac = (c*4)+(p*4)+(f*9); const pC = totalMac>0?((c*4)/totalMac*100).toFixed(1):0; const pP = totalMac>0?((p*4)/totalMac*100).toFixed(1):0; const pF = totalMac>0?((f*9)/totalMac*100).toFixed(1):0;
    state.pieChartInstance = new Chart(ctx, { type: 'doughnut', data: { labels: [`탄수화물 ${pC}%`, `단백질 ${pP}%`, `지방 ${pF}%`], datasets: [{ data: [c*4, p*4, f*9], backgroundColor: ['#F59E0B', '#10B981', '#0EA5E9'], borderWidth: 0, hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { position: 'right', labels: { color: '#F8FAFC', font: { size: 10, family: 'Pretendard' }, boxWidth: 10 } } } } });
}

window.adjFoodAmount = (mealIdx, itemIdx, delta) => { const phase = state.phases.find(p => p.id === state.currentPhaseId); phase.meals[mealIdx].items[itemIdx].amount += delta; if(phase.meals[mealIdx].items[itemIdx].amount < 0) phase.meals[mealIdx].items[itemIdx].amount = 0; triggerSave(); renderMeals(); };
window.removeFoodItem = (mealIdx, itemIdx) => { const phase = state.phases.find(p => p.id === state.currentPhaseId); phase.meals[mealIdx].items.splice(itemIdx, 1); triggerSave(); renderMeals(); };
window.deleteMeal = (mealIdx) => { if(confirm("삭제하시겠습니까?")) { const phase = state.phases.find(p => p.id === state.currentPhaseId); phase.meals.splice(mealIdx, 1); triggerSave(); renderMeals(); } };

window.openEditMealModal = (mealIdx) => {
    const phase = state.phases.find(p => p.id === state.currentPhaseId); document.getElementById('edit-meal-modal').classList.remove('hidden'); document.getElementById('edit-meal-modal').classList.add('flex');
    if(mealIdx === -1) {
        state.editingMealState = { label: '새 일정', time: '12:00', color: 'slate', explain: '', supps: '', isWorkout: false, items: [] }; document.getElementById('edit-meal-title').innerText = "새 식사/일정 추가";
    } else {
        state.editingMealState = JSON.parse(JSON.stringify(phase.meals[mealIdx])); state.editingMealState._originalIdx = mealIdx; document.getElementById('edit-meal-title').innerText = "식사 편집";
    }
    document.getElementById('edit-meal-label').value = state.editingMealState.label; document.getElementById('edit-meal-time').value = state.editingMealState.time; document.getElementById('edit-meal-color').value = state.editingMealState.color || 'slate'; document.getElementById('edit-meal-explain').value = state.editingMealState.explain || ''; document.getElementById('edit-meal-supps').value = state.editingMealState.supps || ''; document.getElementById('edit-meal-isworkout').checked = state.editingMealState.isWorkout || false;
    renderEditMealItems();
};
window.closeEditMealModal = () => { document.getElementById('edit-meal-modal').classList.add('hidden'); document.getElementById('edit-meal-modal').classList.remove('flex'); state.editingMealState = null; };
window.saveEditMealModal = () => {
    state.editingMealState.label = document.getElementById('edit-meal-label').value || '이름 없음'; state.editingMealState.time = document.getElementById('edit-meal-time').value || '00:00'; state.editingMealState.color = document.getElementById('edit-meal-color').value; state.editingMealState.explain = document.getElementById('edit-meal-explain').value; state.editingMealState.supps = document.getElementById('edit-meal-supps').value; state.editingMealState.isWorkout = document.getElementById('edit-meal-isworkout').checked;
    Array.from(document.getElementById('edit-meal-items-container').children).forEach((row, i) => { const s = row.querySelector('.food-select'); const a = row.querySelector('.food-amount'); if(s && a && state.editingMealState.items[i]) { state.editingMealState.items[i].name = s.value; state.editingMealState.items[i].amount = parseInt(a.value) || 0; } });
    const phase = state.phases.find(p => p.id === state.currentPhaseId);
    if(state.editingMealState._originalIdx !== undefined) phase.meals[state.editingMealState._originalIdx] = state.editingMealState; else phase.meals.push(state.editingMealState);
    delete state.editingMealState._originalIdx; triggerSave(); window.closeEditMealModal(); renderMeals();
};

function renderEditMealItems() {
    const c = document.getElementById('edit-meal-items-container'); c.innerHTML = '';
    state.editingMealState.items.forEach((item, idx) => {
        const row = document.createElement('div'); row.className = "flex gap-2 items-center";
        let opts = ''; Object.keys(state.foodCategories).forEach(cat => { opts += `<optgroup label="${cat}">`; state.foodCategories[cat].forEach(f => { opts += `<option value="${f}" ${f===item.name?'selected':''}>${f}</option>`; }); opts += `</optgroup>`; });
        row.innerHTML = `<select class="food-select flex-1 bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white outline-none">${opts}</select><div class="flex items-center gap-1 w-24 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"><input type="number" class="food-amount w-full bg-transparent text-white text-right text-xs font-bold outline-none" value="${item.amount}"><span class="text-[10px] text-slate-500">g</span></div><button onclick="window.removeFoodRowFromModal(${idx})" class="text-slate-500 hover:text-rose-400 font-black px-1 text-xs">✕</button>`; c.appendChild(row);
    });
}
window.addFoodRowToModal = () => { state.editingMealState.items.push({name: '백미', amount: 100}); renderEditMealItems(); };
window.removeFoodRowFromModal = (idx) => { state.editingMealState.items.splice(idx, 1); renderEditMealItems(); };

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
    const c = parseInt(document.getElementById('calc-c-target').value)||0; const p = parseInt(document.getElementById('calc-p-target').value)||0; const f = parseInt(document.getElementById('calc-f-target').value)||0;
    const total = (c*4)+(p*4)+(f*9); document.getElementById('calc-total-kcal').innerText = total + " kcal";
};

function renderCustomSuppsList() {
    const c = document.getElementById('supp-list-container'); c.innerHTML = '';
    state.customSupps.forEach((supp, i) => { const div = document.createElement('div'); div.className = "flex justify-between items-center bg-slate-900 border border-slate-700 p-2 rounded-lg text-xs"; div.innerHTML = `<span class="text-slate-300 font-bold">${supp.name} <span class="text-[10px] text-slate-500 ml-1">(${supp.weight}g 당 단백질 ${supp.protein}g)</span></span><button onclick="window.removeCustomSupp(${i})" class="text-rose-400 font-black px-2 hover:text-rose-500">삭제</button>`; c.appendChild(div); });
}
window.addCustomSuppForm = () => { const n = document.getElementById('supp-new-name').value; const w = parseFloat(document.getElementById('supp-new-weight').value); const p = parseFloat(document.getElementById('supp-new-pro').value); if(!n || !w || !p) { showToast("값을 모두 입력하세요."); return; } state.customSupps.push({name:n, weight:w, protein:p}); document.getElementById('supp-new-name').value = ''; document.getElementById('supp-new-weight').value = ''; document.getElementById('supp-new-pro').value = ''; triggerSave(); applyCustomSuppsToDB(); renderCustomSuppsList(); };
window.removeCustomSupp = (idx) => { state.customSupps.splice(idx, 1); triggerSave(); applyCustomSuppsToDB(); renderCustomSuppsList(); };
function initCalcDropdowns() {}

window.exportData = () => exportDataJSON(showToast); window.importData = (e) => importDataJSON(e.target.files[0], () => { finishInit(); showToast("동기화 복원 성공."); }, () => showToast("비정상 백업 파일입니다."));

window.addEventListener('scroll', function() {
    const stickyBar = document.getElementById('sticky-macro-bar');
    if (window.scrollY > 350) { stickyBar.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none'); stickyBar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto'); } 
    else { stickyBar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto'); stickyBar.classList.add('-translate-y-full', 'opacity-0', 'pointer-events-none'); }
});

initializeFirebase((success) => {
    requestPersistentStorage();
    const statusEl = document.getElementById('cloud-status');
    if (statusEl) { if (success) statusEl.innerHTML = '<span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> 정상 연동'; else statusEl.innerHTML = '<span class="w-2 h-2 bg-sky-500 rounded-full"></span> 로컬 모드'; }
    updateAccountStatusUI(); finishInit();
});

import { state, applyCustomSuppsToDB } from './store.js';
import { initializeFirebase, triggerSave, exportDataJSON, importDataJSON } from './services.js';

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

        // 스마트폰 최적화: 시계 입력창의 너비(min-width) 확보 및 SortableJS 전용 drag-handle 설정
        container.innerHTML += `
        <div class="relative transition-all duration-300 mb-6">
            <div class="drag-handle absolute -left-[35px] sm:-left-[58px] top-3 w-6 h-6 bg-${meal.color}-500 rounded-full border-4 border-slate-950 timeline-line-glow cursor-move flex items-center justify-center shadow-lg"><span class="text-white/70 text-[10px] font-black select-none pointer-events-none">↕</span></div>
            <div class="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer gap-3 sm:gap-0" onclick="window.toggleCollapse(${mIdx})">
                    <div class="flex items-center gap-2 sm:gap-4 w-full sm:w-auto" onclick="event.stopPropagation()">
                        <div onclick="window.cycleColor(${mIdx})" class="w-4 h-4 rounded-full bg-${meal.color}-500 cursor-pointer shrink-0" title="색상 변경"></div>
                        <input type="time" onchange="window.updateMealField(${mIdx}, 'time', event.target.value)" value="${meal.time}" class="bg-transparent text-${meal.color}-400 font-black text-xl sm:text-2xl outline-none shrink-0 p-0 tracking-tighter">
                        <input type="text" onchange="window.updateMealField(${mIdx}, 'label', event.target.value)" value="${meal.label}" class="px-2 py-1 text-xs sm:text-sm font-bold uppercase bg-${meal.color}-500/10 text-${meal.color}-400 border border-${meal.color}-500/20 rounded-md outline-none flex-1 min-w-[80px] max-w-[180px]">
                    </div>
                    <div class="flex gap-2 items-center self-end sm:self-auto shrink-0" onclick="event.stopPropagation()">
                        <button onclick="window.openEditMealModal(${mIdx}, true)" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded border border-slate-700 transition-colors">📋 복제</button>
                        <button onclick="window.openEditMealModal(${mIdx}, false)" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors">⚙️ 수정</button>
                        <button onclick="window.deleteMeal(${mIdx})" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded border border-slate-700 transition-colors">🗑️ 삭제</button>
                        <button onclick="window.toggleCollapse(${mIdx})" class="text-lg px-2 py-1 ml-1 text-slate-400 hover:text-white transition-colors">${meal.isCollapsed ? '🔽' : '🔼'}</button>
                    </div>
                </div>
                <div class="transition-all duration-300 overflow-hidden ${meal.isCollapsed ? 'max-h-0 opacity-0 m-0' : 'max-h-[3000px] opacity-100 mt-5'}">
                    <input type="text" onchange="window.updateMealField(${mIdx}, 'explain', event.target.value)" value="${meal.explain || ''}" placeholder="스케줄 메모" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm sm:text-base text-white font-bold outline-none focus:border-sky-500 mb-3">
                    <textarea onchange="window.updateMealField(${mIdx}, 'supps', event.target.value)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm sm:text-base text-slate-200 outline-none focus:border-sky-500 mb-3 min-h-[100px] custom-scrollbar" placeholder="보충제 프로토콜">${meal.supps || ''}</textarea>
                    ${itemsHtml}
                    <button onclick="window.addItem(${mIdx})" class="w-full py-3 border border-dashed border-slate-700 text-sm sm:text-base text-slate-400 hover:text-sky-400 font-bold mt-2 rounded-xl transition-colors">+ 식품 및 보충제 추가</button>
                </div>
            </div>
        </div>`;
    });
    calculateMacros();

    // SortableJS를 이용한 직관적 순서 변경 시스템 가동
    if (typeof Sortable !== 'undefined') {
        if (window.timelineSortable) { window.timelineSortable.destroy(); }
        window.timelineSortable = new Sortable(document.getElementById('timeline-container'), {
            handle: '.drag-handle', animation: 200, ghostClass: 'opacity-40', delay: 150, delayOnTouchOnly: true,
            onEnd: function (evt) {
                const oldIdx = evt.oldIndex; const newIdx = evt.newIndex; if (oldIdx === newIdx) return;
                const phase = state.phases.find(p => p.id === state.currentPhaseId);
                const movedItem = phase.meals.splice(oldIdx, 1)[0];
                phase.meals.splice(newIdx, 0, movedItem);
                triggerSave(showToast);
            }
        });
    }
}

// === 모달(Modal) 기능 제어 및 로직 연산 ===
export function openPhaseModal(isNew = false) { state.editingPhaseIsNew = isNew; if (isNew) { document.getElementById('phase-title').value = ''; document.getElementById('phase-desc').value = ''; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); document.getElementById('phase-title').value = cp.title; document.getElementById('phase-desc').value = cp.desc; } document.getElementById('phase-modal').classList.remove('hidden'); document.getElementById('phase-modal').classList.add('flex'); }
export function closePhaseModal() { document.getElementById('phase-modal').classList.add('hidden'); document.getElementById('phase-modal').classList.remove('flex'); }
export function savePhaseModal() { const title = document.getElementById('phase-title').value || '새 탭'; const desc = document.getElementById('phase-desc').value || ''; if (state.editingPhaseIsNew) { const newId = 'p_' + Date.now(); state.phases.push({ id: newId, title: title, desc: desc, meals: [] }); state.currentPhaseId = newId; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.title = title; cp.desc = desc; } closePhaseModal(); triggerSave(showToast); loadPhase(state.currentPhaseId); showToast("탭 저장 완료."); }
export function deletePhase() { if(state.phases.length <= 1) { showToast("최소 1개의 탭은 유지해야 합니다."); return; } if(confirm("탭 전체 데이터를 삭제하시겠습니까?")) { state.phases = state.phases.filter(p => p.id !== state.currentPhaseId); triggerSave(showToast); loadPhase(state.phases[0].id); showToast("탭 삭제됨."); } }
export function copyPhase() { const cp = state.phases.find(p => p.id === state.currentPhaseId); state.clipboardMeals = JSON.parse(JSON.stringify(cp.meals)); showToast("식단 세트 복사 완료."); }
export function pastePhase() { if (!state.clipboardMeals || state.clipboardMeals.length === 0) { showToast("복사된 데이터가 없습니다."); return; } if(confirm("⚠️ 현재 탭의 내용이 모두 덮어쓰기 됩니다. 진행할까요?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals = state.clipboardMeals.map(m => { let cloned = JSON.parse(JSON.stringify(m)); cloned.id = 'm' + Date.now() + Math.floor(Math.random() * 1000); return cloned; }); triggerSave(showToast); loadPhase(state.currentPhaseId); showToast("덮어쓰기 완료."); } }

export function openEditMealModal(mIdx, isDuplicate) { let meal; if (mIdx !== null) meal = state.phases.find(p => p.id === state.currentPhaseId).meals[mIdx]; else meal = { time: '12:00', label: '새 일정', color: 'sky', explain: '', supps: '', items: [] }; state.editingMealState = { mIdx: mIdx, isDuplicate: isDuplicate, originalItems: meal.items || [] }; document.getElementById('edit-meal-title').innerText = (isDuplicate) ? "📋 일정 복제" : (mIdx === null ? "➕ 새 일정 추가" : "⚙️ 일정 수정"); document.getElementById('edit-meal-time').value = meal.time; document.getElementById('edit-meal-label').value = meal.label; document.getElementById('edit-meal-color').value = meal.color; document.getElementById('edit-meal-explain').value = meal.explain || ''; document.getElementById('edit-meal-supps').value = meal.supps || ''; document.getElementById('edit-meal-modal').classList.remove('hidden'); document.getElementById('edit-meal-modal').classList.add('flex'); }
export function closeEditMealModal() { document.getElementById('edit-meal-modal').classList.add('hidden'); document.getElementById('edit-meal-modal').classList.remove('flex'); }
export function saveEditMealModal() { const time = document.getElementById('edit-meal-time').value; const label = document.getElementById('edit-meal-label').value || '일정'; const color = document.getElementById('edit-meal-color').value; const explain = document.getElementById('edit-meal-explain').value; const supps = document.getElementById('edit-meal-supps').value; const cp = state.phases.find(p => p.id === state.currentPhaseId); if (state.editingMealState.mIdx === null || state.editingMealState.isDuplicate) { const newObj = { id: 'm'+Date.now(), time: time, label: label, color: color, explain: explain, supps: supps, items: JSON.parse(JSON.stringify(state.editingMealState.originalItems)), isCollapsed: false }; if(state.editingMealState.isDuplicate) { cp.meals.splice(state.editingMealState.mIdx + 1, 0, newObj); showToast("원본 아래에 복제되었습니다."); } else { cp.meals.push(newObj); showToast("새 일정이 추가되었습니다."); } } else { const meal = cp.meals[state.editingMealState.mIdx]; meal.time = time; meal.label = label; meal.color = color; meal.explain = explain; meal.supps = supps; showToast("수정 완료."); } triggerSave(showToast); closeEditMealModal(); loadPhase(state.currentPhaseId); }

export function cycleColor(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); const colors = ['sky', 'emerald', 'amber', 'rose', 'violet', 'slate']; const current = cp.meals[mIdx].color || 'sky'; cp.meals[mIdx].color = colors[(colors.indexOf(current) + 1) % colors.length]; triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function toggleCollapse(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].isCollapsed = !cp.meals[mIdx].isCollapsed; loadPhase(state.currentPhaseId); }
export function updateMealField(mIdx, field, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx][field] = val; triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function updateItemName(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].name = val; triggerSave(showToast); calculateMacros(); }
export function updateItemAmount(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].amount = parseFloat(val)||0; triggerSave(showToast); calculateMacros(); }
export function deleteItem(mIdx, iIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.splice(iIdx, 1); triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function addItem(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.push({name:'백미', amount:100}); triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function deleteMeal(mIdx) { if(confirm("이 일정을 완전히 삭제하시겠습니까?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals.splice(mIdx, 1); triggerSave(showToast); loadPhase(state.currentPhaseId); } }

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

export function openProfileModal() { document.getElementById('mod-weight-user').value=state.userInfo.weight; document.getElementById('mod-height').value=state.userInfo.height; document.getElementById('mod-bf').value=state.userInfo.targetBF; document.getElementById('mod-date').value=state.userInfo.targetDate; document.getElementById('profile-modal').classList.remove('hidden'); document.getElementById('profile-modal').classList.add('flex'); }
export function closeProfileModal() { document.getElementById('profile-modal').classList.add('hidden'); document.getElementById('profile-modal').classList.remove('flex'); }
export function saveProfileModal() { state.userInfo = { weight: parseFloat(document.getElementById('mod-weight-user').value)||72.5, height: parseFloat(document.getElementById('mod-height').value)||173, targetBF: parseFloat(document.getElementById('mod-bf').value)||4.0, targetDate: document.getElementById('mod-date').value }; closeProfileModal(); triggerSave(showToast); finishInit(); showToast("프로필 저장 완료."); }

export function renderCustomSupps() {
    const container = document.getElementById('custom-supp-list'); container.innerHTML = '';
    state.customSupps.forEach((supp, idx) => {
        container.innerHTML += `
        <div class="bg-slate-900 border border-slate-700 p-5 rounded-xl relative">
            <button onclick="window.removeCustomSupp(${idx})" class="absolute top-3 right-3 text-rose-500 text-sm font-bold hover:text-rose-400">✕ 삭제</button>
            <input type="text" id="supp-name-${idx}" value="${supp.name}" placeholder="보충제 명칭" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-bold mb-4 focus:border-sky-500 outline-none text-base">
            <div class="grid grid-cols-2 gap-3 text-sm">
                <div class="flex items-center justify-between"><span class="text-slate-400">기준 중량(g)</span><input type="number" id="supp-wt-${idx}" value="${supp.weight}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                <div class="flex items-center justify-between"><span class="text-slate-400">총 Kcal</span><input type="number" id="supp-k-${idx}" value="${supp.kcal}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                <div class="flex items-center justify-between"><span class="text-amber-500">탄(g)</span><input type="number" step="0.1" id="supp-c-${idx}" value="${supp.carbs}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                <div class="flex items-center justify-between"><span class="text-emerald-500">단(g)</span><input type="number" step="0.1" id="supp-p-${idx}" value="${supp.protein}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                <div class="flex items-center justify-between"><span class="text-sky-500">지(g)</span><input type="number" step="0.1" id="supp-f-${idx}" value="${supp.fat}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
            </div>
        </div>`;
    });
}
export function openMacroModal() { renderCustomSupps(); document.getElementById('macro-modal').classList.remove('hidden'); document.getElementById('macro-modal').classList.add('flex'); }
export function closeMacroModal() { document.getElementById('macro-modal').classList.add('hidden'); document.getElementById('macro-modal').classList.remove('flex'); }
export function addCustomSuppForm() { state.customSupps.push({ id: Date.now(), name: '새 보충제', weight: 30, kcal: 120, carbs: 3, protein: 20, fat: 1.5 }); renderCustomSupps(); }
export function removeCustomSupp(idx) { state.customSupps.splice(idx, 1); renderCustomSupps(); }
export function saveMacroModal() { 
    let updatedSupps = [];
    for(let i=0; i<state.customSupps.length; i++) {
        let n = document.getElementById(`supp-name-${i}`).value || '보충제'+i;
        updatedSupps.push({ id: state.customSupps[i].id, name: n, weight: parseFloat(document.getElementById(`supp-wt-${i}`).value)||30, kcal: parseFloat(document.getElementById(`supp-k-${i}`).value)||0, carbs: parseFloat(document.getElementById(`supp-c-${i}`).value)||0, protein: parseFloat(document.getElementById(`supp-p-${i}`).value)||0, fat: parseFloat(document.getElementById(`supp-f-${i}`).value)||0 });
    }
    state.customSupps = updatedSupps; applyCustomSuppsToDB(); closeMacroModal(); triggerSave(showToast); loadPhase(state.currentPhaseId); showToast("보충제 DB 저장 완료."); 
}

// -------------------------------------------------------------
// [핵심 해결 영역] HTML 이벤트 인식 보장을 위한 전역 window 객체 매핑
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


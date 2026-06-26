/**
 * 파일명: app.js (Part 1)
 * 역할: 비즈니스 로직, 매크로 계산 엔진, 타임라인 렌더링
 */

import { state, applyCustomSuppsToDB } from './store.js';
import { initializeFirebase, triggerSave, exportDataJSON, importDataJSON } from './services.js';

// --- [1. 유틸리티 및 초기화 함수] ---

export function showToast(msg) { 
    const t = document.getElementById('toast'); 
    document.getElementById('toast-text').innerText = msg; 
    t.className = "fixed bottom-5 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl"; 
    setTimeout(() => { 
        t.className = "fixed bottom-5 right-5 z-50 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; 
    }, 2500); 
}

export function finishInit() { 
    document.getElementById('prof-weight-display').innerText = state.userInfo.weight + 'kg'; 
    document.getElementById('prof-bf-display').innerText = state.userInfo.targetBF + '%';
    if(state.userInfo.targetDate) { 
        document.getElementById('badge-target-date').innerText = `Target Date: ${state.userInfo.targetDate.substring(5).replace('-','.')}`; 
    }
    
    applyCustomSuppsToDB();
    initCalcDropdowns();
    loadPhase('D-4'); 
    runSmartCalc('carb'); runSmartCalc('pro'); runSmartCalc('fat');
}

// --- [2. 타임라인 및 식단 렌더링 로직] ---

export function cycleColor(mIdx) {
    const colors = ['sky', 'emerald', 'amber', 'rose', 'violet', 'slate'];
    const current = state.phaseData[state.currentPhase].meals[mIdx].color || 'sky';
    const next = colors[(colors.indexOf(current) + 1) % colors.length];
    state.phaseData[state.currentPhase].meals[mIdx].color = next;
    triggerSave(showToast); loadPhase(state.currentPhase);
}

export function toggleCollapse(mIdx) {
    let meal = state.phaseData[state.currentPhase].meals[mIdx];
    meal.isCollapsed = !meal.isCollapsed;
    loadPhase(state.currentPhase);
}

export function loadPhase(phaseKey) { 
    state.currentPhase = phaseKey; 
    ['D-4', 'D-1', 'D-DAY'].forEach(key => { 
        document.getElementById('btn-phase-' + key).className = (key === phaseKey) ? "px-5 py-3 rounded-lg text-base font-bold phase-btn-active shrink-0" : "px-5 py-3 rounded-lg text-base font-bold text-slate-400 hover:bg-slate-800 shrink-0"; 
    });
    document.getElementById('phase-description').innerText = state.phaseData[phaseKey].desc;

    const container = document.getElementById('timeline-container'); container.innerHTML = '';
    state.phaseData[phaseKey].meals.forEach((meal, mIdx) => {
        let itemsHtml = '';
        if(!meal.items) meal.items = [];

        meal.items.forEach((item, iIdx) => {
            let opts = `<optgroup label="탄수화물">` + state.foodCategories['탄수화물'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            opts += `<optgroup label="단백질">` + state.foodCategories['단백질'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            opts += `<optgroup label="지방">` + state.foodCategories['지방'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            opts += `<optgroup label="야채">` + state.foodCategories['야채'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            opts += `<optgroup label="보충제">` + state.foodCategories['보충제'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            
            itemsHtml += `
            <div class="flex items-center justify-between p-3 bg-slate-900/60 rounded-xl border border-slate-800 mb-2">
                <select data-meal="${mIdx}" data-item="${iIdx}" onchange="window.updateItemName(event)" class="bg-slate-800 text-slate-200 text-sm px-3 py-2 rounded-lg outline-none w-[140px] sm:w-[160px]">${opts}</select>
                <div class="flex items-center gap-2">
                    <input type="number" data-meal="${mIdx}" data-item="${iIdx}" oninput="window.updateItemAmount(event)" class="w-16 sm:w-20 bg-slate-950 text-white text-right text-base px-3 py-2 rounded-lg focus:border-sky-500 outline-none" value="${item.amount || 0}">
                    <span class="text-sm text-slate-400 font-bold">g</span>
                    <button onclick="window.deleteItem(${mIdx}, ${iIdx})" class="text-slate-600 hover:text-rose-400 ml-2 px-2 text-lg">✕</button>
                </div>
            </div>`;
        });

        container.innerHTML += `
        <div class="relative transition-all duration-300 mb-6">
            <div onclick="event.stopPropagation(); window.cycleColor(${mIdx})" class="absolute -left-[35px] sm:-left-[58px] top-3 w-5 h-5 bg-${meal.color}-500 rounded-full border-4 border-slate-950 timeline-line-glow" title="색상 변경"></div>
            <div class="glass-panel p-5 rounded-2xl border border-slate-800">
                <div class="flex justify-between items-center cursor-pointer" onclick="window.toggleCollapse(${mIdx})">
                    <div class="flex items-center gap-2 sm:gap-4" onclick="event.stopPropagation()">
                        <input type="time" onchange="window.updateMealField(${mIdx}, 'time', event.target.value)" value="${meal.time}" class="bg-transparent text-${meal.color}-400 font-black text-xl sm:text-2xl outline-none w-32 min-w-[120px] p-0 tracking-tighter">
                        <input type="text" onchange="window.updateMealField(${mIdx}, 'label', event.target.value)" value="${meal.label}" class="px-2 py-1 text-sm sm:text-base font-bold uppercase bg-${meal.color}-500/10 text-${meal.color}-400 border border-${meal.color}-500/20 rounded-md outline-none w-[130px] sm:w-auto">
                    </div>
                    <div class="flex gap-2 items-center" onclick="event.stopPropagation()">
                        <button onclick="window.duplicateMeal(${mIdx})" class="text-sm text-slate-500 hover:text-sky-400 transition-colors p-1" title="복제">📋</button>
                        <button onclick="window.deleteMeal(${mIdx})" class="text-sm text-slate-500 hover:text-rose-400 transition-colors p-1" title="삭제">🗑️</button>
                        <button onclick="window.toggleCollapse(${mIdx})" class="text-slate-400 hover:text-white ml-2 p-1 text-sm sm:text-base">${meal.isCollapsed ? '🔽' : '🔼'}</button>
                    </div>
                </div>
                <div class="transition-all duration-300 overflow-hidden ${meal.isCollapsed ? 'max-h-0 opacity-0 m-0' : 'max-h-[3000px] opacity-100 mt-5'}">
                    <input type="text" onchange="window.updateMealField(${mIdx}, 'explain', event.target.value)" value="${meal.explain || ''}" placeholder="스케줄 메모 (예: 오후 메인 본 운동 세션)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-lg text-white font-bold outline-none focus:border-sky-500 mb-3">
                    <textarea onchange="window.updateMealField(${mIdx}, 'supps', event.target.value)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-base sm:text-lg text-slate-200 outline-none focus:border-sky-500 mb-3 min-h-[120px] custom-scrollbar" placeholder="보충제 섭취 프로토콜 및 상세 코칭 메모">${meal.supps || ''}</textarea>
                    ${itemsHtml}
                    <button onclick="window.addItem(${mIdx})" class="w-full py-3 border border-dashed border-slate-700 text-base text-slate-400 hover:text-sky-400 font-bold mt-2 rounded-xl transition-colors">+ 식품 및 보충제 추가</button>
                </div>
            </div>
        </div>`;
    });
    calculateMacros();
}

// --- [3. 식단 조작 CRUD 및 매크로 연산] ---

export function duplicateMeal(mIdx) {
    let original = state.phaseData[state.currentPhase].meals[mIdx];
    let clone = JSON.parse(JSON.stringify(original));
    clone.id = 'm' + Date.now();
    state.phaseData[state.currentPhase].meals.push(clone);
    state.phaseData[state.currentPhase].meals.sort((a,b) => a.time.localeCompare(b.time));
    triggerSave(showToast); loadPhase(state.currentPhase); showToast("일정이 복제되었습니다.");
}

export function updateMealField(mIdx, field, val) { state.phaseData[state.currentPhase].meals[mIdx][field] = val; if(field==='time') state.phaseData[state.currentPhase].meals.sort((a,b) => a.time.localeCompare(b.time)); triggerSave(showToast); loadPhase(state.currentPhase); }
export function updateItemName(e) { state.phaseData[state.currentPhase].meals[e.target.dataset.meal].items[e.target.dataset.item].name = e.target.value; triggerSave(showToast); calculateMacros(); }
export function updateItemAmount(e) { state.phaseData[state.currentPhase].meals[e.target.dataset.meal].items[e.target.dataset.item].amount = parseFloat(e.target.value)||0; triggerSave(showToast); calculateMacros(); }
export function deleteItem(mIdx, iIdx) { state.phaseData[state.currentPhase].meals[mIdx].items.splice(iIdx, 1); triggerSave(showToast); loadPhase(state.currentPhase); }
export function addItem(mIdx) { state.phaseData[state.currentPhase].meals[mIdx].items.push({name:'백미', amount:100}); triggerSave(showToast); loadPhase(state.currentPhase); }
export function deleteMeal(mIdx) { if(confirm("이 일정을 삭제하시겠습니까?")) { state.phaseData[state.currentPhase].meals.splice(mIdx, 1); triggerSave(showToast); loadPhase(state.currentPhase); } }

export function calculateMacros() {
    let tC=0, tP=0, tF=0, tK=0;
    let cSrc={}, pSrc={}, fSrc={};

    state.phaseData[state.currentPhase].meals.forEach(m => {
        if(m.items) {
            m.items.forEach(i => {
                const db = state.foodDB[i.name];
                if(db) { 
                    let amt = i.amount || 0;
                    let c=db.c*amt, p=db.p*amt, f=db.f*amt;
                    tC+=c; tP+=p; tF+=f; tK+=db.k*amt; 
                    if(c>0) cSrc[i.name] = (cSrc[i.name]||0) + c;
                    if(p>0) pSrc[i.name] = (pSrc[i.name]||0) + p;
                    if(f>0) fSrc[i.name] = (fSrc[i.name]||0) + f;
                }
            });
        }
    });
    
    let cKcal = tC * 4, pKcal = tP * 4, fKcal = tF * 9;
    let totCalc = cKcal + pKcal + fKcal;
    let cPct = totCalc > 0 ? Math.round((cKcal / totCalc) * 100) : 0;
    let pPct = totCalc > 0 ? Math.round((pKcal / totCalc) * 100) : 0;
    let fPct = totCalc > 0 ? Math.round((fKcal / totCalc) * 100) : 0;

    document.getElementById('dash-kcal').innerText = Math.round(tK).toLocaleString(); 
    document.getElementById('dash-carbs').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-amber-500">${tC.toFixed(1)}g</span> <span class="text-sm sm:text-base text-amber-400/80 font-bold ml-1">(${cPct}%)</span>`;
    document.getElementById('dash-protein').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-emerald-400">${tP.toFixed(1)}g</span> <span class="text-sm sm:text-base text-emerald-400/80 font-bold ml-1">(${pPct}%)</span>`;
    document.getElementById('dash-fat').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-sky-400">${tF.toFixed(1)}g</span> <span class="text-sm sm:text-base text-sky-400/80 font-bold ml-1">(${fPct}%)</span>`;
    
    document.getElementById('sticky-kcal').innerText = Math.round(tK).toLocaleString(); 
    document.getElementById('sticky-carbs').innerHTML = `${tC.toFixed(1)}g <span class="text-xs font-bold">(${cPct}%)</span>`; 
    document.getElementById('sticky-protein').innerHTML = `${tP.toFixed(1)}g <span class="text-xs font-bold">(${pPct}%)</span>`; 
    document.getElementById('sticky-fat').innerHTML = `${tF.toFixed(1)}g <span class="text-xs font-bold">(${fPct}%)</span>`;
    
    if (!state.pieChartInstance) { 
        state.pieChartInstance = new Chart(document.getElementById('chart-pie-macros').getContext('2d'), { 
            type: 'doughnut', 
            data: { labels: ['탄수화물', '단백질', '지방'], datasets: [{ data: [tC, tP, tF], backgroundColor: ['#F59E0B', '#10B981', '#0EA5E9'], borderWidth: 0 }] }, 
            options: { 
                responsive: true, maintainAspectRatio: false, cutout: '72%', 
                plugins: { 
                    legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 14 } } },
                    tooltip: {
                        titleFont: { size: 14 }, bodyFont: { size: 16, weight: 'bold' }, padding: 12,
                        callbacks: {
                            label: function(context) {
                                let label = context.label || '';
                                let val = context.raw || 0;
                                let kcal = (label === '지방') ? val * 9 : val * 4;
                                let totalK = (context.chart.data.datasets[0].data[0]*4) + (context.chart.data.datasets[0].data[1]*4) + (context.chart.data.datasets[0].data[2]*9);
                                let pct = totalK > 0 ? Math.round((kcal/totalK)*100) : 0;
                                return `${label}: ${val.toFixed(1)}g (${pct}%)`;
                            }
                        }
                    }
                } 
            } 
        }); 
    } 
    else { state.pieChartInstance.data.datasets[0].data = [tC, tP, tF]; state.pieChartInstance.update(); }

    renderAnalysisDetails(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc);
}

export function renderAnalysisDetails(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc) {
    document.getElementById('src-total-c').innerText = `${tC.toFixed(1)}g (${cPct}%)`; 
    document.getElementById('src-total-p').innerText = `${tP.toFixed(1)}g (${pPct}%)`; 
    document.getElementById('src-total-f').innerText = `${tF.toFixed(1)}g (${fPct}%)`;
    
    const renderList = (srcObj, total, elId, colorCls) => {
        let html = '';
        let sorted = Object.entries(srcObj).sort((a,b)=>b[1]-a[1]);
        sorted.forEach(([name, amt]) => {
            let pct = total > 0 ? Math.round((amt/total)*100) : 0;
            html += `<div class="mb-3"><div class="flex justify-between text-xs text-slate-300 mb-1"><span>${name}</span><span>${amt.toFixed(1)}g (${pct}%)</span></div><div class="w-full bg-slate-800 rounded-full h-2"><div class="bg-${colorCls} h-2 rounded-full" style="width: ${pct}%"></div></div></div>`;
        });
        document.getElementById(elId).innerHTML = html;
    };
    renderList(cSrc, tC, 'src-list-c', 'amber-500'); 
    renderList(pSrc, tP, 'src-list-p', 'emerald-500'); 
    renderList(fSrc, tF, 'src-list-f', 'sky-500');
}

// --- [4. 스마트 계산기 로직] ---

export function initCalcDropdowns() {
    const cDrop = document.getElementById('calc-carb-src'); const pDrop = document.getElementById('calc-pro-src'); const fDrop = document.getElementById('calc-fat-src');
    cDrop.innerHTML = ''; pDrop.innerHTML = ''; fDrop.innerHTML = ''; 
    state.foodCategories['탄수화물'].forEach(f => cDrop.innerHTML += `<option value="${f}">${f}</option>`);
    state.foodCategories['단백질'].forEach(f => pDrop.innerHTML += `<option value="${f}">${f}</option>`);
    state.foodCategories['지방'].forEach(f => { if(state.foodDB[f].f > 0.1) fDrop.innerHTML += `<option value="${f}">${f}</option>`; });
    cDrop.value = '백미'; pDrop.value = '닭가슴살'; fDrop.value = '아몬드';
}

export function runSmartCalc(type) {
    let src = document.getElementById(`calc-${type}-src`).value; 
    let amt = parseFloat(document.getElementById(`calc-${type}-amt`).value) || 0;
    let targetMacro = 0; let resHtml = '';
    
    if(type === 'carb') {
        targetMacro = amt * state.foodDB[src].c;
        state.foodCategories['탄수화물'].forEach(f => { if(f !== src && state.foodDB[f].c > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].c)}g</span></div>`; } });
    } else if(type === 'pro') {
        targetMacro = amt * state.foodDB[src].p;
        state.foodCategories['단백질'].forEach(f => { if(f !== src && state.foodDB[f].p > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].p)}g</span></div>`; } });
    } else if(type === 'fat') {
        targetMacro = amt * state.foodDB[src].f;
        state.foodCategories['지방'].forEach(f => { if(f !== src && state.foodDB[f].f > 0.1) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].f)}g</span></div>`; } });
    }
    document.getElementById(`calc-${type}-res`).innerHTML = resHtml;
}

// --- [5. UI 제어 및 모달 시스템] ---

export function switchMainTab(tabId) { 
    document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden')); 
    document.getElementById(tabId).classList.remove('hidden'); 
    const tabs = ['tab-timeline', 'tab-calculator', 'tab-analysis'];
    tabs.forEach(t => { 
        document.getElementById('btn-' + t).className = (t === tabId) ? "px-5 py-3 rounded-xl text-base font-bold active-tab shrink-0" : "px-5 py-3 rounded-xl text-base font-bold border border-slate-800 text-slate-400 hover:text-white shrink-0"; 
    });
}

// 일정 추가 모달
export function openAddMealModal() { document.getElementById('add-meal-modal').classList.remove('hidden'); document.getElementById('add-meal-modal').classList.add('flex'); }
export function closeAddMealModal() { document.getElementById('add-meal-modal').classList.add('hidden'); document.getElementById('add-meal-modal').classList.remove('flex'); }
export function confirmAddMeal() {
    const time = document.getElementById('new-meal-time').value;
    const type = document.getElementById('new-meal-type').value; 
    const label = document.getElementById('new-meal-label').value || (type==='workout'?'새 훈련':(type==='supp'?'새 영양제':'새 식사')); 
    const color = document.getElementById('new-meal-color').value;
    const newObj = { id: 'm'+Date.now(), time: time, label: label, color: color, explain: '', items: [], isCollapsed: false };
    state.phaseData[state.currentPhase].meals.push(newObj); 
    state.phaseData[state.currentPhase].meals.sort((a,b) => a.time.localeCompare(b.time));
    triggerSave(showToast); closeAddMealModal(); loadPhase(state.currentPhase);
}

// 프로필 모달
export function openProfileModal() { 
    document.getElementById('mod-weight-user').value = state.userInfo.weight; 
    document.getElementById('mod-height').value = state.userInfo.height; 
    document.getElementById('mod-bf').value = state.userInfo.targetBF; 
    document.getElementById('mod-date').value = state.userInfo.targetDate; 
    document.getElementById('profile-modal').classList.remove('hidden'); document.getElementById('profile-modal').classList.add('flex'); 
}
export function closeProfileModal() { document.getElementById('profile-modal').classList.add('hidden'); document.getElementById('profile-modal').classList.remove('flex'); }
export function saveProfileModal() { 
    state.userInfo = { 
        weight: parseFloat(document.getElementById('mod-weight-user').value)||72.5, 
        height: parseFloat(document.getElementById('mod-height').value)||173, 
        targetBF: parseFloat(document.getElementById('mod-bf').value)||4.0, 
        targetDate: document.getElementById('mod-date').value 
    }; 
    closeProfileModal(); triggerSave(showToast); showToast("프로필이 저장되었습니다."); finishInit(); 
}

// 커스텀 보충제 DB 모달
export function renderCustomSupps() {
    const container = document.getElementById('custom-supp-list'); container.innerHTML = '';
    state.customSupps.forEach((supp, idx) => {
        container.innerHTML += `
        <div class="bg-slate-900 border border-slate-700 p-5 rounded-xl relative">
            <button onclick="window.removeCustomSupp(${idx})" class="absolute top-3 right-3 text-rose-500 text-sm font-bold hover:text-rose-400">✕ 삭제</button>
            <input type="text" id="supp-name-${idx}" value="${supp.name}" placeholder="보충제 명칭 (예: 단백질 보충제)" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-bold mb-4 focus:border-sky-500 outline-none text-base">
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
        updatedSupps.push({
            id: state.customSupps[i].id, name: n,
            weight: parseFloat(document.getElementById(`supp-wt-${i}`).value)||30,
            kcal: parseFloat(document.getElementById(`supp-k-${i}`).value)||0,
            carbs: parseFloat(document.getElementById(`supp-c-${i}`).value)||0,
            protein: parseFloat(document.getElementById(`supp-p-${i}`).value)||0,
            fat: parseFloat(document.getElementById(`supp-f-${i}`).value)||0
        });
    }
    state.customSupps = updatedSupps;
    applyCustomSuppsToDB(); closeMacroModal(); triggerSave(showToast); 
    loadPhase(state.currentPhase); showToast("보충제 DB가 업데이트되었습니다."); 
}

// 스크롤 이벤트 및 스티키 헤더 제어
window.addEventListener('scroll', function() {
    const stickyBar = document.getElementById('sticky-macro-bar');
    if (window.scrollY > 350) { 
        stickyBar.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none'); 
        stickyBar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto'); 
    } else { 
        stickyBar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto'); 
        stickyBar.classList.add('-translate-y-full', 'opacity-0', 'pointer-events-none'); 
    }
});

// --- [6. Window 객체 전역 이벤트 바인딩 (ES6 모듈 필수 사항)] ---

window.showToast = showToast;
window.switchMainTab = switchMainTab;
window.loadPhase = loadPhase;
window.cycleColor = cycleColor;
window.toggleCollapse = toggleCollapse;
window.duplicateMeal = duplicateMeal;
window.deleteMeal = deleteMeal;
window.updateMealField = updateMealField;
window.updateItemName = updateItemName;
window.updateItemAmount = updateItemAmount;
window.addItem = addItem;
window.deleteItem = deleteItem;

window.openAddMealModal = openAddMealModal;
window.closeAddMealModal = closeAddMealModal;
window.confirmAddMeal = confirmAddMeal;

window.openProfileModal = openProfileModal;
window.closeProfileModal = closeProfileModal;
window.saveProfileModal = saveProfileModal;

window.openMacroModal = openMacroModal;
window.closeMacroModal = closeMacroModal;
window.saveMacroModal = saveMacroModal;
window.addCustomSuppForm = addCustomSuppForm;
window.removeCustomSupp = removeCustomSupp;

window.runSmartCalc = runSmartCalc;
window.exportData = () => exportDataJSON(showToast);
window.importData = (e) => importDataJSON(e.target.files[0], () => { finishInit(); showToast("데이터가 복원되었습니다."); }, () => showToast("올바르지 않은 백업 파일입니다."));

// --- [7. 앱 부트스트랩 (Bootstrap) 초기화 실행] ---

initializeFirebase((success) => {
    if(success) document.getElementById('cloud-status').innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> 클라우드 연결됨';
    finishInit();
});

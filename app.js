/**
 * 파일명: app.js
 * 역할: 식단, 훈련 SPA 통합 제어, DOM 파이프라인 핸들링, 차트 연산 및 모듈 통제
 */

import { state, applyCustomSuppsToDB } from './store.js';
import { 
    initializeFirebase, triggerSave, exportDataJSON, importDataJSON, 
    loginWithGoogleBackend, registerWithEmailBackend, loginWithEmailBackend, logoutUserBackend 
} from './services.js';
import { WORKOUT_DB, AVAILABLE_PLATES, BAR_WEIGHT } from './workoutConstants.js';

let chartPieInstance = null;
let chartBalance = null; 
let chartVolume = null;

// [버그 방어 패치] 엄격 모드(Strict Mode) 호환성 및 암묵적 전역 변수 선언 에러 방어
let viewYear = new Date().getFullYear(); 
let viewMonth = new Date().getMonth(); 
let restTimerInterval = null; 
let alarmAudioInterval = null;
let libraryActivePart = '가슴'; 
let libraryActiveType = '전체'; 
let undoBuffer = null; 
let currentTimerSeconds = 0; 
let currentAlarmSound = '1';

window.isUserInteracting = false; 
let sessionPRTracker = { max1RM: {}, maxVolume: {} };

// [버그 방어 패치] 기기별 타임존 파싱 에러를 방어하는 로컬 자정 처리 전용 함수
function getLocalYYYYMMDD(dateObj = new Date()) {
    const tzOffset = dateObj.getTimezoneOffset() * 60000;
    return new Date(dateObj.getTime() - tzOffset).toISOString().split('T')[0];
}

// ==========================================
// 📱 전역 UI 뷰포트 전환 및 공통 알림
// ==========================================
export function showToast(msg) { 
    const t = document.getElementById('toast'); if(!t) return;
    document.getElementById('toast-text').innerText = msg; 
    t.className = "fixed bottom-24 right-5 z-[150] transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl"; 
    setTimeout(() => { t.className = "fixed bottom-24 right-5 z-[150] transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 2500); 
}

window.switchMainView = (viewId) => {
    document.querySelectorAll('.app-view').forEach(el => { el.classList.remove('block'); el.classList.add('hidden'); });
    const tv = document.getElementById('view-' + viewId); if(tv) { tv.classList.remove('hidden'); tv.classList.add('block'); }
    
    document.querySelectorAll('.nav-tab-btn').forEach(btn => btn.classList.remove('active-nav-btn'));
    const tt = document.getElementById('tab-' + viewId); if(tt) tt.classList.add('active-nav-btn');
    
    const titles = { 
        'diet': 'NUTRITION <span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">PLANNER</span>', 
        'workout': 'WORKOUT <span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">TRACKER</span>', 
        'stats': 'ANALYTICS & <span class="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-rose-400">SETTINGS</span>' 
    };
    const ht = document.getElementById('main-header-title'); if(ht) ht.innerHTML = titles[viewId] || 'PREP MASTER PRO';
    
    if(viewId === 'stats') { window.switchSettingsSubTab('sub-charts'); }
    if(viewId === 'diet') { window.runSmartCalc('all'); }
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.switchSettingsSubTab = (subId) => {
    const pCharts = document.getElementById('sub-pane-charts'); const pCalc = document.getElementById('sub-pane-calc');
    if(pCharts) pCharts.classList.add('hidden'); if(pCalc) pCalc.classList.add('hidden');
    const ts = document.getElementById(subId); if(ts) ts.classList.remove('hidden');
    
    const bCharts = document.getElementById('btn-sub-charts'); const bCalc = document.getElementById('btn-sub-calculator');
    if(bCharts) bCharts.className = "px-4 py-2 rounded-lg text-xs font-bold " + (subId === 'sub-pane-charts' ? 'phase-btn-active text-sky-400' : 'text-slate-400 hover:bg-slate-800');
    if(bCalc) bCalc.className = "px-4 py-2 rounded-lg text-xs font-bold " + (subId === 'sub-pane-calc' ? 'phase-btn-active text-sky-400' : 'text-slate-400 hover:bg-slate-800');
    
    if(subId === 'sub-pane-charts') renderWorkoutAnalysisCharts();
};

// ==========================================
// 🛡️ 영구 스토리지 보존 및 정식 가입 브릿지
// ==========================================
async function requestPersistentStorage() {
    if (navigator.storage && navigator.storage.persist) {
        try { const isPersisted = await navigator.storage.persisted(); if (!isPersisted) await navigator.storage.persist(); } catch(e) {}
    }
}

function updateAccountStatusUI() {
    const badge = document.getElementById('account-status-badge');
    const bG = document.getElementById('btn-google-auth'); const bE = document.getElementById('btn-email-auth'); const bL = document.getElementById('btn-logout-auth');
    if(!badge) return;
    if(state.userInfo && state.userInfo.isPermanent) {
        badge.className = "px-3 py-1 text-[10px] font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-full";
        badge.innerText = `🔐 영구 보존 세션 (${state.userInfo.email})`;
        if(bG) bG.classList.add('hidden'); if(bE) bE.classList.add('hidden'); if(bL) bL.classList.remove('hidden');
    } else {
        badge.className = "px-3 py-1 text-[10px] font-bold uppercase bg-rose-500/10 text-rose-400 border border-rose-500/30 rounded-full";
        badge.innerText = "⚠️ 임시 세션 (캐시 삭제 시 데이터 유실)";
        if(bG) bG.classList.remove('hidden'); if(bE) bE.classList.remove('hidden'); if(bL) bL.classList.add('hidden');
    }
}

window.triggerGoogleLogin = async () => {
    try { 
        const res = await loginWithGoogleBackend(); 
        if(res.mode === "linked") showToast("기존 익명 데이터가 구글 계정으로 이관되었습니다."); 
        else showToast("구글 정식 로그인 성공."); 
        updateAccountStatusUI(); finishInit(); 
    } catch(err) { showToast("구글 로그인 취소 또는 브라우저 팝업이 차단되었습니다."); }
};
window.openEmailAuthModal = () => { document.getElementById('auth-email-input').value = ''; document.getElementById('auth-password-input').value = ''; const m = document.getElementById('email-auth-modal'); if(m){ m.classList.remove('hidden'); m.classList.add('flex');} };
window.closeEmailAuthModal = () => { const m = document.getElementById('email-auth-modal'); if(m){ m.classList.add('hidden'); m.classList.remove('flex');} };
window.submitEmailRegister = async () => {
    const e = document.getElementById('auth-email-input').value.trim(); const p = document.getElementById('auth-password-input').value.trim();
    if(!e || p.length < 6) { showToast("이메일 형식 확인 및 6자리 이상 비밀번호가 필요합니다."); return; }
    try { await registerWithEmailBackend(e, p); showToast("이메일 계정 연동 및 데이터 마이그레이션 완료."); window.closeEmailAuthModal(); updateAccountStatusUI(); finishInit(); } catch(err) { showToast("회원 가입 실패."); }
};
window.submitEmailLogin = async () => {
    const e = document.getElementById('auth-email-input').value.trim(); const p = document.getElementById('auth-password-input').value.trim();
    if(!e || !p) return;
    try { await loginWithEmailBackend(e, p); showToast("로그인 성공. 동기화 데이터를 불러옵니다."); window.closeEmailAuthModal(); updateAccountStatusUI(); finishInit(); } catch(err) { showToast("자격 증명 확인이 필요합니다."); }
};
window.triggerLogout = async () => { if(confirm("로그아웃 하시겠습니까? 로컬 데이터 복사본이 파기됩니다.")) await logoutUserBackend(); };

// ==========================================
// 🥑 식단 플래너 컨트롤 로직 부문
// ==========================================
export function finishInit() { 
    const pWeight = document.getElementById('prof-weight-display');
    const pBf = document.getElementById('prof-bf-display');
    if(pWeight) pWeight.innerText = (state.userInfo.weight || '--') + "kg"; 
    if(pBf) pBf.innerText = (state.userInfo.targetBF || '--') + '%';
    const badgeDate = document.getElementById('badge-target-date');
    if(state.userInfo.targetDate && badgeDate) badgeDate.innerText = state.userInfo.targetDate.substring(5).replace('-','/');
    
    applyCustomSuppsToDB(); window.initCalcDropdowns(); renderPhaseTabs();
    if(state.phases.length > 0) window.loadPhase(state.currentPhaseId || state.phases[0].id);
    loadSystemSettings();
}

export function renderPhaseTabs() {
    const container = document.getElementById('phase-tabs-container'); if(!container) return; container.innerHTML = '';
    state.phases.forEach(p => {
        const isActive = (p.id === state.currentPhaseId);
        const btnClass = isActive ? "px-4 py-2 rounded-lg text-xs font-bold phase-btn-active shrink-0 transition-colors" : "px-4 py-2 rounded-lg text-xs font-bold text-slate-400 hover:bg-slate-800 shrink-0 transition-colors";
        const btn = document.createElement('button'); btn.className = btnClass; btn.innerText = p.title; btn.onclick = () => window.loadPhase(p.id); container.appendChild(btn);
    });
}

window.adjAmt = (mIdx, iIdx, delta) => {
    const cp = state.phases.find(p => p.id === state.currentPhaseId);
    let current = parseFloat(cp.meals[mIdx].items[iIdx].amount) || 0;
    let next = current + delta; if(next < 0) next = 0;
    cp.meals[mIdx].items[iIdx].amount = next; triggerSave(); renderMeals();
};

window.loadPhase = (phaseId) => { 
    if(!state.phases.find(p => p.id === phaseId) && state.phases.length > 0) phaseId = state.phases[0].id;
    state.currentPhaseId = phaseId; renderPhaseTabs();
    const cp = state.phases.find(p => p.id === phaseId); if(!cp) return;
    const desc = document.getElementById('phase-description'); if(desc) desc.innerText = cp.desc || '';
    const summaryTitle = document.getElementById('summary-phase-title'); if(summaryTitle) summaryTitle.innerText = `${cp.title} 분석`;
    renderMeals();
};

function renderMeals() {
    const phase = state.phases.find(p => p.id === state.currentPhaseId); const c = document.getElementById('timeline-container'); if(!c) return; c.innerHTML = '';
    if(!phase) return;
    let phaseC = 0, phaseP = 0, phaseF = 0, phaseKcal = 0; let srcC = {}, srcP = {}, srcF = {};

    phase.meals.forEach((meal, mIdx) => {
        let mC = 0, mP = 0, mF = 0, mKcal = 0; let itemsHtml = '';
        if(!meal.items) meal.items = [];
        meal.items.forEach((item, iIdx) => {
            const ratio = state.foodDB[item.name]; if(!ratio) return;
            const iC = item.amount * ratio.c; const iP = item.amount * ratio.p; const iF = item.amount * ratio.f; const iKcal = item.amount * ratio.k;
            mC += iC; mP += iP; mF += iF; mKcal += iKcal;
            
            srcC[item.name] = (srcC[item.name]||0) + iC; srcP[item.name] = (srcP[item.name]||0) + iP; srcF[item.name] = (srcF[item.name]||0) + iF;

            let opts = `<optgroup label="탄수화물">` + state.foodCategories['탄수화물'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            opts += `<optgroup label="단백질">` + state.foodCategories['단백질'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            opts += `<optgroup label="지방">` + state.foodCategories['지방'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
            if (state.foodCategories['보충제']) { opts += `<optgroup label="보충제">` + state.foodCategories['보충제'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`; }
            
            itemsHtml += `
            <div class="flex items-center justify-between p-2 bg-slate-900/60 rounded-xl border border-slate-800 mb-1.5 gap-1.5">
                <select onchange="window.updateItemName(${mIdx}, ${iIdx}, event.target.value)" class="bg-slate-800 text-slate-200 text-xs px-1.5 py-1.5 rounded outline-none flex-1 min-w-[70px] max-w-[120px]">${opts}</select>
                <div class="flex items-center gap-1 shrink-0">
                    <div class="flex items-center bg-slate-950 border border-slate-700 rounded p-0.5">
                        <button onclick="window.adjAmt(${mIdx}, ${iIdx}, -10)" class="w-6 h-6 flex items-center justify-center text-slate-400 text-sm font-bold select-none">−</button>
                        <input type="number" inputmode="decimal" oninput="window.updateItemAmount(${mIdx}, ${iIdx}, event.target.value)" class="w-9 bg-transparent text-white text-center text-xs font-bold outline-none" value="${item.amount || 0}">
                        <button onclick="window.adjAmt(${mIdx}, ${iIdx}, 10)" class="w-6 h-6 flex items-center justify-center text-slate-400 text-sm font-bold select-none">＋</button>
                    </div>
                    <span class="text-[10px] text-slate-500 font-bold">g</span>
                    <button onclick="window.deleteItem(${mIdx}, ${iIdx})" class="text-slate-500 hover:text-rose-400 font-black px-1 text-xs">✕</button>
                </div>
            </div>`;
        });

        phaseC += mC; phaseP += mP; phaseF += mF; phaseKcal += mKcal;
        let themeColor = meal.color || 'sky';

        const node = document.createElement('div'); node.className = "flex items-stretch mb-4 meal-node-block";
        node.innerHTML = `
            <div class="relative flex flex-col items-center mr-3 w-8 shrink-0">
                <div class="absolute top-8 bottom-[-20px] w-0.5 bg-slate-800/80 z-0"></div>
                <div onclick="event.stopPropagation(); window.cycleColor(${mIdx})" class="drag-handle relative z-10 w-8 h-8 bg-${themeColor}-500 rounded-full border-2 border-[#090D16] flex items-center justify-center cursor-move active:scale-110 transition-transform">
                    <span class="text-white text-xs font-black select-none pointer-events-none">↕</span>
                </div>
            </div>
            <div class="glass-panel flex-1 p-3 sm:p-4 rounded-xl border border-slate-800 w-full overflow-hidden">
                <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer gap-2" onclick="window.toggleCollapse(${mIdx})">
                    <div class="flex flex-wrap items-center gap-2 w-full sm:w-auto" onclick="event.stopPropagation()">
                        <input type="time" onchange="window.updateMealField(${mIdx}, 'time', event.target.value)" value="${meal.time || '12:00'}" class="bg-transparent text-white font-black text-xl tracking-tighter cursor-pointer p-0">
                        <input type="text" onchange="window.updateMealField(${mIdx}, 'label', event.target.value)" value="${meal.label || '식사'}" class="px-2 py-0.5 text-xs font-black uppercase bg-${themeColor}-500/10 text-${themeColor}-400 border border-${themeColor}-500/20 rounded outline-none w-28 sm:w-[130px]">
                    </div>
                    <div class="flex gap-1.5 items-center self-end sm:self-auto shrink-0" onclick="event.stopPropagation()">
                        <button onclick="window.openEditMealModal(${mIdx}, true)" class="text-[10px] px-2 py-1 bg-slate-800 text-sky-300 rounded border border-slate-700">복제</button>
                        <button onclick="window.openEditMealModal(${mIdx}, false)" class="text-[10px] px-2 py-1 bg-slate-800 text-slate-300 rounded border border-slate-700">설정</button>
                        <button onclick="window.deleteMeal(${mIdx})" class="text-[10px] px-2 py-1 bg-slate-800 text-rose-400 rounded border border-slate-700">삭제</button>
                    </div>
                </div>
                <div class="transition-all duration-200 overflow-hidden ${meal.isCollapsed ? 'max-h-0 opacity-0' : 'max-h-[2500px] opacity-100 mt-3'}">
                    <input type="text" onchange="window.updateMealField(${mIdx}, 'explain', event.target.value)" value="${meal.explain || ''}" placeholder="스케줄 가이드 메모" class="w-full bg-slate-900/50 border border-slate-700 rounded-md px-3 py-2 text-xs text-white outline-none focus:border-sky-500 mb-2 font-semibold">
                    <textarea onchange="window.updateMealField(${mIdx}, 'supps', event.target.value)" class="w-full bg-slate-900/50 border border-slate-700 rounded-md px-3 py-2 text-xs text-slate-300 outline-none focus:border-sky-500 mb-2 min-h-[60px] custom-scrollbar" placeholder="보충제 프로토콜 섭취 가이드">${meal.supps || ''}</textarea>
                    ${meal.isWorkout ? `<div class="bg-rose-950/20 border border-rose-900/30 rounded-lg p-3 text-center mb-1"><p class="text-xs font-black text-rose-400">🔥 웨이트 및 유산소 동화 창 세션</p></div>` : itemsHtml}
                    <button onclick="window.addItem(${mIdx})" class="w-full py-2 border border-dashed border-slate-700 text-xs text-slate-400 hover:text-sky-400 font-bold mt-1 rounded-lg">+ 영양 데이터베이스 추가</button>
                </div>
            </div>
        `; c.appendChild(node);
    });

    if (typeof Sortable !== 'undefined' && phase.meals.length > 0) {
        if (window.timelineSortable) window.timelineSortable.destroy();
        window.timelineSortable = new Sortable(document.getElementById('timeline-container'), {
            handle: '.drag-handle', animation: 200, ghostClass: 'opacity-10', delay: 150, delayOnTouchOnly: true,
            onEnd: function (evt) {
                const o = evt.oldIndex; const n = evt.newIndex; if (o === n) return;
                const moved = phase.meals.splice(o, 1)[0]; phase.meals.splice(n, 0, moved);
                triggerSave(); setTimeout(() => window.loadPhase(state.currentPhaseId), 10);
            }
        });
    }
    updateSummary(phaseC, phaseP, phaseF, phaseKcal);
    renderSrcBreakdown(phaseC, phaseP, phaseF, srcC, srcP, srcF);
}

function updateSummary(c, p, f, kcal) {
    const dKcal = document.getElementById('dash-kcal'); const dCarbs = document.getElementById('dash-carbs'); const dProtein = document.getElementById('dash-protein'); const dFat = document.getElementById('dash-fat');
    if (dKcal) dKcal.innerText = Math.round(kcal).toLocaleString(); if (dCarbs) dCarbs.innerText = c.toFixed(1) + 'g'; if (dProtein) dProtein.innerText = p.toFixed(1) + 'g'; if (dFat) dFat.innerText = f.toFixed(1) + 'g';

    const sKcal = document.getElementById('sticky-kcal'); const sCarbs = document.getElementById('sticky-carbs'); const sProtein = document.getElementById('sticky-protein'); const sFat = document.getElementById('sticky-fat');
    if (sKcal) sKcal.innerText = Math.round(kcal).toLocaleString() + " kcal"; if (sCarbs) sCarbs.innerText = c.toFixed(0) + 'g'; if (sProtein) sProtein.innerText = p.toFixed(0) + 'g'; if (sFat) sFat.innerText = f.toFixed(0) + 'g';

    let tC = parseFloat(document.getElementById('calc-c-target')?.value) || 300; let tP = parseFloat(document.getElementById('calc-p-target')?.value) || 160; let tF = parseFloat(document.getElementById('calc-f-target')?.value) || 50;
    const barC = document.getElementById('bar-c'); const barP = document.getElementById('bar-p'); const barF = document.getElementById('bar-f');
    if (barC) barC.style.width = Math.min(100, (c/tC)*100) + '%'; if (barP) barP.style.width = Math.min(100, (p/tP)*100) + '%'; if (barF) barF.style.width = Math.min(100, (f/tF)*100) + '%';

    if (chartPieInstance) chartPieInstance.destroy();
    const ctx = document.getElementById('chart-pie-macros');
    if (ctx) {
        chartPieInstance = new Chart(ctx.getContext('2d'), { 
            type: 'doughnut', data: { labels: ['탄수화물', '단백질', '지방'], datasets: [{ data: [c*4, p*4, f*9], backgroundColor: ['#F59E0B', '#10B981', '#0EA5E9'], borderWidth: 0 }] }, 
            options: { responsive: true, maintainAspectRatio: false, cutout: '75%', plugins: { legend: { display: false } } } 
        });
    }
}

function renderSrcBreakdown(totC, totP, totalF, srcC, srcP, srcF) {
    const renderList = (domId, srcObj, total) => {
        const dom = document.getElementById(domId); if (!dom) return; dom.innerHTML = '';
        const sorted = Object.entries(srcObj).filter(x => x[1] > 0.1).sort((a,b) => b[1] - a[1]);
        if (sorted.length === 0) { dom.innerHTML = `<p class="text-[10px] text-slate-600">등록 배정 데이터 없음</p>`; return; }
        sorted.forEach(([name, val]) => {
            const perc = total > 0 ? ((val/total)*100).toFixed(1) : 0;
            dom.innerHTML += `<div class="flex items-center justify-between text-[11px] mb-0.5"><span class="text-slate-400 font-bold truncate max-w-[120px]">${name}</span><div class="flex items-center gap-1.5"><span class="text-white font-black">${val.toFixed(1)}g</span><span class="text-slate-600 text-right w-8">${perc}%</span></div></div>`;
        });
    };
    const sC = document.getElementById('src-total-c'); if (sC) sC.innerText = `${totC.toFixed(1)}g`; renderList('src-list-c', srcC, totC);
    const sP = document.getElementById('src-total-p'); if (sP) sP.innerText = `${totP.toFixed(1)}g`; renderList('src-list-p', srcP, totP);
    const sF = document.getElementById('src-total-f'); if (sF) sF.innerText = `${totalF.toFixed(1)}g`; renderList('src-list-f', srcF, totalF);
}

window.openPhaseModal = (isNew = false) => { state.editingPhaseIsNew = isNew; if (isNew) { document.getElementById('phase-title').value = ''; document.getElementById('phase-desc').value = ''; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); document.getElementById('phase-title').value = cp.title; document.getElementById('phase-desc').value = cp.desc || ''; } const m = document.getElementById('phase-modal'); if(m){ m.classList.remove('hidden'); m.classList.add('flex'); } };
window.closePhaseModal = () => { const m = document.getElementById('phase-modal'); if(m){ m.classList.add('hidden'); m.classList.remove('flex'); } };
window.savePhaseModal = () => { const title = document.getElementById('phase-title').value || '새 탭'; const desc = document.getElementById('phase-desc').value || ''; if (state.editingPhaseIsNew) { const newId = 'p_' + Date.now(); state.phases.push({ id: newId, title: title, desc: desc, meals: [] }); state.currentPhaseId = newId; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.title = title; cp.desc = desc; } window.closePhaseModal(); triggerSave(showToast); window.loadPhase(state.currentPhaseId); };
window.deletePhase = () => { if (state.phases.length <= 1) return; if (confirm("현재 식단 관리 탭을 영구 삭제할까요?")) { state.phases = state.phases.filter(p => p.id !== state.currentPhaseId); triggerSave(showToast); window.loadPhase(state.phases[0].id); } };
window.copyPhase = () => { const cp = state.phases.find(p => p.id === state.currentPhaseId); state.clipboardMeals = JSON.parse(JSON.stringify(cp.meals)); showToast("식단 프로토콜 복사 완료."); };
window.pastePhase = () => { if (!state.clipboardMeals) return; if (confirm("기존 기록이 대체됩니다. 진행할까요?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals = state.clipboardMeals.map(m => { let cl = JSON.parse(JSON.stringify(m)); cl.id = 'm' + Date.now() + Math.floor(Math.random()*100); return cl; }); triggerSave(showToast); window.loadPhase(state.currentPhaseId); } };
window.openEditMealModal = (mIdx, isDuplicate) => { let meal; if (mIdx !== null) meal = state.phases.find(p => p.id === state.currentPhaseId).meals[mIdx]; else meal = { time: '12:00', label: '새 일정', color: 'sky', explain: '', supps: '', items: [] }; state.editingMealState = { mIdx, isDuplicate, originalItems: meal.items || [] }; document.getElementById('edit-meal-title').innerText = isDuplicate ? "📋 일정 복제 수립" : "⚙️ 일정 구성 설정"; document.getElementById('edit-meal-time').value = meal.time || '12:00'; document.getElementById('edit-meal-label').value = meal.label || '식사'; document.getElementById('edit-meal-color').value = meal.color || 'sky'; document.getElementById('edit-meal-explain').value = meal.explain || ''; document.getElementById('edit-meal-supps').value = meal.supps || ''; document.getElementById('edit-meal-isworkout').checked = meal.isWorkout || false; const modal = document.getElementById('edit-meal-modal'); if(modal){ modal.classList.remove('hidden'); modal.classList.add('flex'); } window.renderEditMealItems(); };
window.closeEditMealModal = () => { const modal = document.getElementById('edit-meal-modal'); if(modal){ modal.classList.add('hidden'); modal.classList.remove('flex'); } };
window.saveEditMealModal = () => { const cp = state.phases.find(p => p.id === state.currentPhaseId); const time = document.getElementById('edit-meal-time').value; const label = document.getElementById('edit-meal-label').value || '일정'; const color = document.getElementById('edit-meal-color').value; const explain = document.getElementById('edit-meal-explain').value; const supps = document.getElementById('edit-meal-supps').value; const isW = document.getElementById('edit-meal-isworkout').checked; if (state.editingMealState.mIdx === null || state.editingMealState.isDuplicate) { const newObj = { id: 'm'+Date.now(), time, label, color, explain, supps, isWorkout: isW, items: JSON.parse(JSON.stringify(state.editingMealState.originalItems)), isCollapsed: false }; if (state.editingMealState.isDuplicate) cp.meals.splice(state.editingMealState.mIdx + 1, 0, newObj); else cp.meals.push(newObj); } else { const m = cp.meals[state.editingMealState.mIdx]; m.time = time; m.label = label; m.color = color; m.explain = explain; m.supps = supps; m.isWorkout = isW; } triggerSave(showToast); window.closeEditMealModal(); renderMeals(); };
window.cycleColor = (mIdx) => { const cp = state.phases.find(p => p.id === state.currentPhaseId); const cList = ['sky', 'emerald', 'amber', 'rose', 'violet', 'slate']; cp.meals[mIdx].color = cList[(cList.indexOf(cp.meals[mIdx].color || 'sky') + 1) % cList.length]; triggerSave(); renderMeals(); };
window.toggleCollapse = (mIdx) => { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].isCollapsed = !cp.meals[mIdx].isCollapsed; renderMeals(); };
window.updateMealField = (mIdx, field, val) => { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx][field] = val; triggerSave(); };
window.updateItemName = (mIdx, iIdx, val) => { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].name = val; triggerSave(); renderMeals(); };
window.updateItemAmount = (mIdx, iIdx, val) => { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].amount = parseFloat(val)||0; triggerSave(); renderMeals(); };
window.deleteItem = (mIdx, iIdx) => { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.splice(iIdx, 1); triggerSave(); renderMeals(); };
window.addItem = (mIdx) => { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.push({name:'백미', amount:100}); triggerSave(); renderMeals(); };
window.deleteMeal = (mIdx) => { if (confirm("해당 식단 일정을 삭제할까요?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals.splice(mIdx, 1); triggerSave(); renderMeals(); } };

window.renderEditMealItems = () => {
    const c = document.getElementById('edit-meal-items-container'); if(!c) return; c.innerHTML = '';
    state.editingMealState.items.forEach((item, idx) => {
        const row = document.createElement('div'); row.className = "flex gap-1.5 items-center";
        let opts = ''; Object.keys(state.foodCategories).forEach(cat => { opts += `<optgroup label="${cat}">`; state.foodCategories[cat].forEach(f => { opts += `<option value="${f}" ${f===item.name?'selected':''}>${f}</option>`; }); opts += `</optgroup>`; });
        row.innerHTML = `<select class="food-select flex-1 bg-slate-900 border border-slate-700 rounded p-1.5 text-[10px] text-white outline-none">${opts}</select><div class="flex items-center gap-1 w-20 bg-slate-900 border border-slate-700 rounded px-1.5 py-1"><input type="number" inputmode="decimal" class="food-amount w-full bg-transparent text-white text-right text-[10px] font-bold outline-none" value="${item.amount}"><span class="text-[9px] text-slate-500">g</span></div><button onclick="window.removeFoodRowFromModal(${idx})" class="text-slate-500 hover:text-rose-400 font-black px-1 text-[10px]">✕</button>`; c.appendChild(row);
    });
};
window.addFoodRowToModal = () => { state.editingMealState.items.push({name: '백미', amount: 100}); window.renderEditMealItems(); }; window.removeFoodRowFromModal = (idx) => { state.editingMealState.items.splice(idx, 1); window.renderEditMealItems(); };

// ==========================================
// 🏋️ 훈련 일지 및 타이머 도메인 코어 프로세스
// ==========================================
function getWorkoutData() { let data = state.workouts[state.selectedDateStr]; if (!data) { data = { weight: 0, bf: 0, smm: 0, exercises: [] }; state.workouts[state.selectedDateStr] = data; } if (!data.exercises) data.exercises = []; return data; }

function renderCalendarGrid() {
    const gridEl = document.getElementById('calendar-grid'); if (!gridEl) return; gridEl.innerHTML = '';
    document.getElementById('calendar-month-year').textContent = `${viewYear}년 ${String(viewMonth + 1).padStart(2, '0')}월`;
    const firstDay = new Date(viewYear, viewMonth, 1).getDay(); const lastDate = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) { gridEl.appendChild(document.createElement('div')); }
    for (let day = 1; day <= lastDate; day++) {
        const dayBtn = document.createElement('button'); const normalizedDateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`; dayBtn.textContent = day; dayBtn.className = "p-2 sm:p-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex flex-col items-center justify-center min-h-[46px] relative border border-transparent hover:border-slate-700 select-none";
        const td = state.workouts[normalizedDateStr]; if (td && ((td.exercises && td.exercises.length > 0) || (td.weight > 0 || td.bf > 0 || td.smm > 0))) { const dot = document.createElement('span'); dot.className = "w-1 h-1 bg-amber-500 rounded-full absolute bottom-1"; dayBtn.appendChild(dot); }
        if (normalizedDateStr === state.selectedDateStr) dayBtn.className += " active-day font-black text-slate-950"; else { dayBtn.className += " bg-slate-800/40 text-slate-300"; const dayOfWeek = new Date(viewYear, viewMonth, day).getDay(); if (dayOfWeek === 0) dayBtn.className += " text-rose-400"; if (dayOfWeek === 6) dayBtn.className += " text-sky-400"; }
        dayBtn.onclick = () => window.selectWorkoutDate(normalizedDateStr); gridEl.appendChild(dayBtn);
    }
}

function renderWorkoutList() {
    const container = document.getElementById('workout-list-container'); if (!container) return; container.innerHTML = ''; const data = getWorkoutData();
    if (data.exercises.length === 0) { container.innerHTML = `<p class="text-[11px] text-slate-500 text-center py-10">등록된 운동 종목지 카드가 비어있습니다.</p>`; document.getElementById('label-total-volume').innerText = "총 볼륨: 0 kg"; return; }

    let dailyTotalVolume = 0;
    data.exercises.forEach((ex, exIdx) => {
        let max1RM = 0; let exVolume = 0; let setsHtml = ''; const currentRestTime = ex.restTime || state.userInfo?.defaultRestTime || 90;
        ex.sets.forEach((set, setIdx) => {
            if (set.done) { dailyTotalVolume += (set.weight * set.reps); exVolume += (set.weight * set.reps); }
            const est1RM = set.weight * (1 + (set.reps / 30)); if (est1RM > max1RM) max1RM = est1RM;
            setsHtml += `
            <div class="flex items-center justify-between gap-1 p-1.5 bg-slate-950/60 rounded border border-slate-800 text-[11px] sm:text-xs">
                <span class="font-black text-amber-500 w-3 text-center">${setIdx + 1}</span>
                <select onchange="window.changeSetField(${exIdx}, ${setIdx}, 'type', event.target.value)" class="bg-slate-900 border border-slate-700 rounded text-[11px] text-slate-300 outline-none"><option value="일반" ${set.type==='일반'?'selected':''}>일반</option><option value="탑" ${set.type==='탑'?'selected':''}>탑</option><option value="백오프" ${set.type==='백오프'?'selected':''}>백오프</option><option value="드롭" ${set.type==='드롭'?'selected':''}>드롭</option></select>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0"><button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', -2.5)" class="w-5 h-5 text-slate-400 font-bold select-none">−</button><input type="number" inputmode="decimal" step="0.1" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'weight', event.target.value)" class="w-8 bg-transparent text-center font-bold text-white outline-none" value="${set.weight}"><button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', 2.5)" class="w-5 h-5 text-slate-400 font-bold select-none">＋</button></div>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0"><button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', -1)" class="w-5 h-5 text-slate-400 font-bold select-none">−</button><input type="number" inputmode="decimal" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'reps', event.target.value)" class="w-6 bg-transparent text-center font-bold text-white outline-none" value="${set.reps}"><button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', 1)" class="w-5 h-5 text-slate-400 font-bold select-none">＋</button></div>
                <input type="checkbox" ${set.done?'checked':''} onchange="window.toggleSetComplete(${exIdx}, ${setIdx}, event.target.checked)" class="w-4 h-4 accent-amber-500 cursor-pointer ml-1"><button onclick="window.deleteSet(${exIdx}, ${setIdx})" class="text-slate-500 hover:text-rose-400 font-black px-1">✕</button>
            </div>`;
        });

        let historyMax1RM = 0; let historyMaxVolume = 0;
        Object.entries(state.workouts).forEach(([dateStr, dayData]) => {
            if (dateStr === state.selectedDateStr) return; if (!dayData.exercises) return;
            dayData.exercises.forEach(historicalEx => {
                if (historicalEx.name !== ex.name) return; let dayExVolume = 0;
                if (historicalEx.sets) { historicalEx.sets.forEach(s => { if (s.done) { const est1RM = s.weight * (1 + (s.reps / 30)); if (est1RM > historyMax1RM) historyMax1RM = est1RM; dayExVolume += s.weight * s.reps; } }); }
                if (dayExVolume > historyMaxVolume) historyMaxVolume = dayExVolume;
            });
        });

        const isPR1RM = (historyMax1RM > 0 && max1RM > historyMax1RM); const isPRVolume = (historyMaxVolume > 0 && exVolume > historyMaxVolume); const prKey = `${state.selectedDateStr}_${ex.name}`;
        if (isPR1RM && (!sessionPRTracker.max1RM[prKey] || max1RM > sessionPRTracker.max1RM[prKey])) { sessionPRTracker.max1RM[prKey] = max1RM; if (window.isUserInteracting) { showToast(`🏆 최고 기록 경신! [${ex.name}] 1RM 돌파: ${max1RM.toFixed(1)}kg`); } }
        if (isPRVolume && (!sessionPRTracker.maxVolume[prKey] || exVolume > sessionPRTracker.maxVolume[prKey])) { sessionPRTracker.maxVolume[prKey] = exVolume; if (window.isUserInteracting) { showToast(`🔥 최고 볼륨 경신! [${ex.name}] 볼륨 돌파: ${exVolume.toLocaleString()}kg`); } }

        const card = document.createElement('div');
        if (isPR1RM || isPRVolume) card.className = "bg-gradient-to-b from-[#221706] to-[#0F172A] border-2 border-amber-500 rounded-xl p-3 space-y-2 shadow-[0_4px_20px_rgba(245,158,11,0.2)] animate-fade-in";
        else card.className = "bg-slate-900/80 border border-slate-800/80 rounded-xl p-3 space-y-2";
        const prBadge = (isPR1RM || isPRVolume) ? `<span class="px-1.5 py-0.5 text-[8px] font-black uppercase bg-gradient-to-r from-amber-500 to-yellow-400 text-slate-950 rounded">🏆 PR</span>` : '';

        card.innerHTML = `
            <div class="flex justify-between items-start border-b border-slate-800/60 pb-1.5">
                <div class="flex items-center gap-1.5"><div class="workout-drag-handle text-slate-500 hover:text-white cursor-move text-base font-bold select-none px-1">☰</div>
                    <div><div class="flex flex-wrap gap-1 mb-0.5"><span class="px-1.5 py-0.5 text-[8px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded">${ex.part}</span>${prBadge}</div>
                    <div class="relative group cursor-help w-[120px] sm:w-[220px]" title="${ex.name}"><h3 class="text-xs font-black text-white truncate">${ex.name}</h3><div class="absolute hidden group-hover:block z-50 bg-slate-950 text-slate-200 text-[10px] font-bold p-2 rounded border border-slate-700 shadow-xl -top-8 left-0 pointer-events-none whitespace-normal break-all">${ex.name}</div></div></div>
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

window.moveMonth = (dir) => { viewMonth += dir; if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; } else if (viewMonth > 11) { viewMonth = 0; viewYear += 1; } renderCalendarGrid(); };
window.selectWorkoutDate = (dateStr) => {
    state.selectedDateStr = dateStr; const parts = dateStr.split('-'); document.getElementById('label-selected-date').textContent = `${parts[1]}/${parts[2]}`;
    const data = getWorkoutData(); document.getElementById('input-daily-weight').value = data.weight > 0 ? data.weight : ''; document.getElementById('input-daily-bf').value = data.bf > 0 ? data.bf : ''; document.getElementById('input-daily-smm').value = data.smm > 0 ? data.smm : '';
    renderCalendarGrid(); renderWorkoutList();
};
window.addSet = (exIdx) => { const data = getWorkoutData(); const ex = data.exercises[exIdx]; let weight = 40, reps = 10; if (ex.sets.length > 0) { const lastSet = ex.sets[ex.sets.length - 1]; weight = lastSet.weight; reps = lastSet.reps; } ex.sets.push({ type: '일반', weight, reps, memo: '', done: false }); triggerSave(); renderWorkoutList(); };
window.deleteSet = (exIdx, setIdx) => { const data = getWorkoutData(); const ex = data.exercises[exIdx]; undoBuffer = { type: 'set', exIdx, setIdx, data: JSON.parse(JSON.stringify(ex.sets[setIdx])) }; ex.sets.splice(setIdx, 1); triggerSave(); renderWorkoutList(); document.getElementById('btn-undo').classList.remove('hidden'); showToast("기록 삭제됨."); };
window.adjSetVal = (exIdx, setIdx, field, delta) => { const data = getWorkoutData(); const set = data.exercises[exIdx].sets[setIdx]; let val = (parseFloat(set[field]) || 0) + delta; if (val < 0) val = 0; set[field] = val; triggerSave(); renderWorkoutList(); };
window.changeSetField = (exIdx, setIdx, field, val) => { const data = getWorkoutData(); const set = data.exercises[exIdx].sets[setIdx]; if (field === 'weight' || field === 'reps') set[field] = parseFloat(val) || 0; else set[field] = val; triggerSave(); };
window.toggleSetComplete = (exIdx, setIdx, isChecked) => { const data = getWorkoutData(); data.exercises[exIdx].sets[setIdx].done = isChecked; triggerSave(); renderWorkoutList(); if (isChecked) { const customRestTime = data.exercises[exIdx].restTime || state.userInfo?.defaultRestTime || 90; const customSound = data.exercises[exIdx].alarmSound || state.userInfo?.defaultAlarmSound || '1'; startTimerLogic(customRestTime, customSound); } };
window.deleteExercise = (exIdx) => { if (confirm("종목을 삭제할까요?")) { const data = getWorkoutData(); data.exercises.splice(exIdx, 1); triggerSave(); renderWorkoutList(); } };

// 오디오 합성 엔진
function playAudioTone(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)(); const now = ctx.currentTime;
        if (type === '2') { 
            const notes = [659.25, 880, 1046.50]; notes.forEach((freq, i) => { const osc = ctx.createOscillator(); const g = ctx.createGain(); osc.connect(g); g.connect(ctx.destination); osc.type = 'sine'; osc.frequency.value = freq; g.gain.setValueAtTime(0, now + i*0.15); g.gain.linearRampToValueAtTime(0.4, now + i*0.15 + 0.02); g.gain.exponentialRampToValueAtTime(0.001, now + i*0.15 + 0.15); osc.start(now + i*0.15); osc.stop(now + i*0.15 + 0.15); });
        } else if (type === '3') {
            const notes = [523.25, 783.99]; notes.forEach((freq, i) => { const osc = ctx.createOscillator(); const g = ctx.createGain(); osc.connect(g); g.connect(ctx.destination); osc.type = 'triangle'; osc.frequency.value = freq; g.gain.setValueAtTime(0, now + i*0.2); g.gain.linearRampToValueAtTime(0.3, now + i*0.2 + 0.05); g.gain.exponentialRampToValueAtTime(0.001, now + i*0.2 + 0.3); osc.start(now + i*0.2); osc.stop(now + i*0.2 + 0.3); });
        } else { 
            const osc = ctx.createOscillator(); const g = ctx.createGain(); osc.connect(g); g.connect(ctx.destination); osc.type = 'sine'; osc.frequency.value = 880; g.gain.setValueAtTime(0.3, now); osc.start(now); osc.stop(now + 0.3);
        }
    } catch(e) {}
}

function startTimerLogic(seconds, soundType) {
    if (restTimerInterval) clearInterval(restTimerInterval); if (alarmAudioInterval) clearInterval(alarmAudioInterval);
    currentTimerSeconds = seconds; currentAlarmSound = soundType || '1';
    const bar = document.getElementById('timer-floating-bar'); const display = document.getElementById('timer-countdown-display');
    document.getElementById('timer-controls-default').classList.remove('hidden'); document.getElementById('timer-controls-extend').classList.add('hidden');
    if(bar) bar.className = "fixed bottom-20 left-0 w-full z-[70] transform translate-y-0 opacity-100 transition-all duration-500 pointer-events-auto shadow-[0_-10px_40px_rgba(245,158,11,0.2)]";
    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; display.textContent = formatTime(currentTimerSeconds);
    restTimerInterval = setInterval(() => { currentTimerSeconds--; if (currentTimerSeconds <= 0) { clearInterval(restTimerInterval); display.textContent = "00:00"; triggerAlarmRing(currentAlarmSound); } else { display.textContent = formatTime(currentTimerSeconds); } }, 1000);
}

function triggerAlarmRing(soundType) {
    document.getElementById('timer-controls-default').classList.add('hidden'); document.getElementById('timer-controls-extend').classList.remove('hidden'); document.getElementById('timer-controls-extend').classList.add('flex'); document.getElementById('timer-pulse-dot').classList.remove('bg-rose-500'); document.getElementById('timer-pulse-dot').classList.add('bg-amber-500');
    playAudioTone(soundType); let userInterval = state.userInfo?.alarmInterval || 1000; alarmAudioInterval = setInterval(() => { playAudioTone(soundType); }, userInterval);
}

window.stopRestTimer = () => { if (restTimerInterval) clearInterval(restTimerInterval); if (alarmAudioInterval) clearInterval(alarmAudioInterval); const bar = document.getElementById('timer-floating-bar'); if(bar) bar.className = "fixed bottom-20 left-0 w-full z-[70] transform translate-y-full opacity-0 transition-all duration-500 pointer-events-none"; };
window.extendRestTimer = (sec) => { if (alarmAudioInterval) clearInterval(alarmAudioInterval); document.getElementById('timer-controls-default').classList.remove('hidden'); document.getElementById('timer-controls-extend').classList.add('hidden'); document.getElementById('timer-controls-extend').classList.remove('flex'); document.getElementById('timer-pulse-dot').classList.add('bg-rose-500'); document.getElementById('timer-pulse-dot').classList.remove('bg-amber-500'); startTimerLogic(currentTimerSeconds + sec, currentAlarmSound); };

// ==========================================
// 📚 계층형 필터 종목 사전 및 템플릿 제어
// ==========================================
function getHangulChosung(str) { const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"]; let result = ""; for (let i = 0; i < str.length; i++) { const code = str.charCodeAt(i) - 44032; if (code >= 0 && code <= 11172) result += cho[Math.floor(code / 588)]; else result += str.charAt(i); } return result; }
window.openLibraryModal = () => { const m = document.getElementById('library-modal'); if(m){ m.classList.remove('hidden'); m.classList.add('flex'); } window.runLibrarySearchFilter(); };
window.closeLibraryModal = () => { const m = document.getElementById('library-modal'); if(m){ m.classList.add('hidden'); m.classList.remove('flex'); } };
window.resetLibraryFilters = () => { document.getElementById('library-search-input').value = ''; libraryActivePart = '가슴'; libraryActiveType = '전체'; window.runLibrarySearchFilter(); };

window.runLibrarySearchFilter = () => {
    const rawInput = document.getElementById('library-search-input').value.trim().toLowerCase(); const input = rawInput.replace(/\s+/g, ''); const grid = document.getElementById('library-master-card-grid'); grid.innerHTML = ''; const filterBar = document.getElementById('library-filter-part-bar'); const typeBar = document.getElementById('library-filter-type-bar');
    if (filterBar.children.length === 0) {
        const parts = ['전체', ...Object.keys(WORKOUT_DB)];
        parts.forEach(p => { const pill = document.createElement('button'); pill.innerText = p; pill.className = `px-2.5 py-1 text-[10px] font-black rounded-full whitespace-nowrap transition-colors flex-shrink-0 min-w-max ${p === libraryActivePart ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`; pill.onclick = () => { libraryActivePart = p; libraryActiveType = '전체'; window.runLibrarySearchFilter(); }; filterBar.appendChild(pill); });
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
        const favHeader = document.createElement('div'); favHeader.className = "col-span-1 sm:col-span-2 text-[10px] font-black text-amber-400 uppercase tracking-wider mt-1 select-none"; favHeader.innerHTML = `⭐ 다빈도 선호 추천 종목`; grid.appendChild(favHeader);
        favoriteExercises.forEach(ex => {
            const card = document.createElement('div'); card.className = "p-2.5 bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/30 rounded-xl flex justify-between items-center shadow-md self-start";
            card.innerHTML = `<div class="truncate mr-2 w-full relative group cursor-help" title="${ex.name}"><span class="text-[8px] font-black uppercase bg-amber-500/20 text-amber-400 px-1 py-0.5 rounded mr-1">${ex.freq}회</span><span class="text-[9px] font-bold text-slate-500">${ex.part}</span><h4 class="text-xs font-black text-amber-400 truncate mt-0.5">${ex.name}</h4><div class="absolute hidden group-hover:block z-50 bg-slate-950 text-slate-200 text-[10px] font-bold p-2 rounded border border-slate-700 shadow-xl -top-8 left-0 pointer-events-none">${ex.name}</div></div><button onclick="window.injectLibraryToToday('${ex.part}', '${ex.type}', '${ex.name}')" class="px-2.5 py-1.5 bg-amber-500 text-slate-950 text-[10px] font-black rounded-lg shrink-0">추가</button>`; grid.appendChild(card);
        });
        const divider = document.createElement('div'); divider.className = "col-span-1 sm:col-span-2 border-t border-slate-800/80 my-1"; grid.appendChild(divider);
    }
    if (matchedExercises.length === 0) { grid.innerHTML = `<p class="text-[10px] text-slate-500 py-4 text-center col-span-1 sm:col-span-2">결과 없음</p>`; return; }
    matchedExercises.forEach(ex => {
        const card = document.createElement('div'); card.className = "p-2.5 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center self-start";
        card.innerHTML = `<div class="truncate mr-2 w-full relative group cursor-help" title="${ex.name}"><span class="text-[9px] font-bold text-slate-500 truncate">${ex.part}</span><h4 class="text-xs font-black text-slate-200 truncate mt-0.5">${ex.name}</h4><div class="absolute hidden group-hover:block z-50 bg-slate-950 text-slate-200 text-[10px] font-bold p-2 rounded border border-slate-700 shadow-xl -top-8 left-0 pointer-events-none">${ex.name}</div></div><button onclick="window.injectLibraryToToday('${ex.part}', '${ex.type}', '${ex.name}')" class="px-2.5 py-1.5 bg-slate-800 text-[10px] font-bold rounded-lg shrink-0">추가</button>`; grid.appendChild(card);
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

window.openTemplateManager = () => { document.getElementById('template-modal').classList.remove('hidden'); document.getElementById('template-modal').classList.add('flex'); renderTemplateList(); };
window.closeTemplateManager = () => { document.getElementById('template-modal').classList.add('hidden'); document.getElementById('template-modal').classList.remove('flex'); };
function renderTemplateList() {
    const box = document.getElementById('template-list-box'); if(!box) return; box.innerHTML = ''; if (!state.templates || state.templates.length === 0) { box.innerHTML = `<p class="text-[11px] text-slate-500 text-center py-6">저장된 루틴 프리셋이 없습니다.</p>`; return; }
    state.templates.forEach((tmpl) => {
        const div = document.createElement('div'); div.className = "flex items-center justify-between p-2 bg-slate-950 border border-slate-800 rounded-xl text-[11px] mb-1"; div.innerHTML = `<span onclick="window.applyTemplate(${tmpl.id})" class="text-slate-200 font-bold hover:text-amber-400 cursor-pointer flex-1 truncate">${tmpl.title} (${tmpl.exercises.length}종목)</span><button onclick="window.deleteTemplate(${tmpl.id})" class="text-rose-400 hover:text-rose-500 font-bold ml-2">삭제</button>`; box.appendChild(div);
    });
}
window.openSaveRoutineModal = () => { const data = getWorkoutData(); if (data.exercises.length === 0) { showToast("저장할 운동지 카드가 비어있습니다."); return; } document.getElementById('save-routine-name-input').value = ''; document.getElementById('save-routine-modal').classList.remove('hidden'); document.getElementById('save-routine-modal').classList.add('flex'); };
window.closeSaveRoutineModal = () => { document.getElementById('save-routine-modal').classList.add('hidden'); document.getElementById('save-routine-modal').classList.remove('flex'); };
window.confirmSaveRoutine = () => {
    const data = getWorkoutData(); const title = document.getElementById('save-routine-name-input').value.trim() || '내 맞춤 프리셋'; const cleanedExercises = data.exercises.map(ex => ({ part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime, alarmSound: ex.alarmSound, sets: ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, memo: s.memo, done: false })) }));
    if (!state.templates) state.templates = []; state.templates.push({ id: Date.now(), title: title, exercises: cleanedExercises }); triggerSave(); window.closeSaveRoutineModal(); showToast("분할 프리셋 저장 완료.");
};
window.applyTemplate = (tmplId) => { if (!confirm("기존 당일 일지 기록이 대체됩니다. 진행할까요?")) return; const tmpl = state.templates.find(t => t.id === tmplId); if (!tmpl) return; const data = getWorkoutData(); data.exercises = JSON.parse(JSON.stringify(tmpl.exercises)); triggerSave(); window.closeTemplateManager(); renderWorkoutList(); showToast("프리셋 마운트 성공."); };
window.deleteTemplate = (tmplId) => { if (confirm("해당 프리셋을 삭제할까요?")) { state.templates = state.templates.filter(t => t.id !== tmplId); triggerSave(); renderTemplateList(); } };

// ==========================================
// 📊 데이터 시각화, 환경설정, 데이터 추출부
// ==========================================
function renderWorkoutAnalysisCharts() {
    const cvsBalance = document.getElementById('chart-workout-analysis'); const cvsVolume = document.getElementById('chart-volume-trend'); if(!cvsBalance) return;
    const partsCount = { '가슴': 0, '등': 0, '어깨': 0, '팔': 0, '하체': 0, '복근': 0, '기타': 0 }; let best1RMVal = 0; let best1RMEx = '-'; const exFreq = {};

    Object.values(state.workouts).forEach(dateObj => { if (dateObj.exercises) { dateObj.exercises.forEach(ex => { let pKey = '기타'; if (ex.part.includes('가슴')) pKey = '가슴'; else if (ex.part.includes('등')) pKey = '등'; else if (ex.part.includes('어깨')) pKey = '어깨'; else if (ex.part.includes('팔')) pKey = '팔'; else if (ex.part.includes('하체')) pKey = '하체'; else if (ex.part.includes('복근')) pKey = '복근'; partsCount[pKey] += ex.sets ? ex.sets.length : 0; exFreq[ex.name] = (exFreq[ex.name] || 0) + 1; ex.sets.forEach(s => { if(s.done) { const est1RM = s.weight * (1 + (s.reps / 30)); if(est1RM > best1RMVal) { best1RMVal = est1RM; best1RMEx = ex.name; } } }); });} });
    let maxFreq = 0; let favEx = '-'; Object.entries(exFreq).forEach(([name, count]) => { if(count > maxFreq) { maxFreq = count; favEx = name; } });
    document.getElementById('stat-favorite-ex').innerText = favEx !== '-' ? favEx : '기록 부족'; document.getElementById('stat-best-1rm').innerText = best1RMEx !== '-' ? `${best1RMEx} (${best1RMVal.toFixed(1)}kg)` : '기록 부족';
    const activeDates = Object.keys(state.workouts).filter(d => (state.workouts[d].exercises && state.workouts[d].exercises.length > 0) || state.workouts[d].weight > 0).sort(); const last7Days = activeDates.slice(-7); const labels = last7Days.map(d => d.slice(5).replace('-','/')); const volData = [];
    last7Days.forEach(d => { const obj = state.workouts[d]; let dayVol = 0; if(obj.exercises) obj.exercises.forEach(e => e.sets.forEach(s => { if(s.done) dayVol += s.weight * s.reps; })); volData.push(dayVol); });

    setTimeout(() => {
        if(chartBalance) chartBalance.destroy(); chartBalance = new Chart(cvsBalance.getContext('2d'), { type: 'radar', data: { labels: Object.keys(partsCount), datasets: [{ data: Object.values(partsCount), backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B', borderWidth: 2, pointBackgroundColor: '#F59E0B' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { grid: { color: 'rgba(255,255,255,0.05)' }, angleLines: { color: 'rgba(255,255,255,0.05)' }, pointLabels: { color: '#94A3B8', font: {size: 10} }, ticks: { display: false } } } });
        if(chartVolume) chartVolume.destroy(); chartVolume = new Chart(cvsVolume.getContext('2d'), { type: 'bar', data: { labels: labels, datasets: [{ label: '총 볼륨(kg)', data: volData, backgroundColor: '#F59E0B', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: {size: 9} } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: {size: 9} } } } } });
    }, 50);
}

export function saveSystemSettings() {
    const alarmInt = document.getElementById('alarm-interval-select'); const alarmSound = document.getElementById('alarm-sound-select'); const restEl = document.getElementById('setting-default-rest');
    if(!state.userInfo) state.userInfo = {};
    if(restEl) state.userInfo.defaultRestTime = parseInt(restEl.value) || 90;
    if(alarmSound) state.userInfo.defaultAlarmSound = alarmSound.value || '1';
    if(alarmInt) state.userInfo.alarmInterval = parseInt(alarmInt.value) || 1000;
    triggerSave(); loadSystemSettings(); showToast("전역 환경 설정이 보정되었습니다.");
}

function loadSystemSettings() {
    const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1'; const dInt = state.userInfo?.alarmInterval || 1000;
    const restEl = document.getElementById('setting-default-rest'); const alarmIntEl = document.getElementById('alarm-interval-select'); const alarmSoundEl = document.getElementById('alarm-sound-select');
    if(restEl) restEl.value = dRest; if(alarmIntEl) alarmIntEl.value = dInt; if(alarmSoundEl) alarmSoundEl.value = dSound;
}

window.exportData = () => exportDataJSON(showToast); 
window.importData = (e) => importDataJSON(e.target.files[0], () => { finishInit(); showToast("원격 동기화 복원 완료"); }, () => showToast("정상적인 json 구성 요소가 아닙니다."));
window.exportWorkoutToCSV = () => { let csv = "\uFEFF일자,부위,종목명,세트,중량,반복,완료\n"; Object.entries(state.workouts).forEach(([d,o]) => { if(o.exercises) o.exercises.forEach(e => e.sets.forEach((s,i) => { csv += `${d},${e.part},${e.name},${i+1},${s.weight},${s.reps},${s.done?'Y':'N'}\n`; })); }); const l = document.createElement("a"); l.href = URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8;'})); l.setAttribute("download","Workout_Log_Report.csv"); document.body.appendChild(l); l.click(); document.body.removeChild(l); };
window.triggerClearAllWorkoutData = () => { if(confirm("초기화 시 로컬 및 서버의 모든 데이터가 소멸합니다. 진행할까요?")) { state.workouts={}; state.phases=[]; triggerSave(); location.reload(); }};

// 클립보드 기반 SNS 텍스트 공유 리포트 기능 추가
window.copyReportToClipboard = () => {
    let report = `[PREP MASTER] ${state.selectedDateStr} 요약\n\n`;
    
    // 식단 요약
    const phase = state.phases.find(p => p.id === state.currentPhaseId);
    if(phase) {
        let pC = 0, pP = 0, pF = 0, pKcal = 0;
        phase.meals.forEach(m => {
            if(!m.isWorkout && m.items) {
                m.items.forEach(i => {
                    const r = state.foodDB[i.name]; if(!r) return;
                    pC += i.amount * r.c; pP += i.amount * r.p; pF += i.amount * r.f; pKcal += i.amount * r.k;
                });
            }
        });
        report += `🥑 [식단 매크로]\n• 탄수화물: ${pC.toFixed(0)}g\n• 단백질: ${pP.toFixed(0)}g\n• 지방: ${pF.toFixed(0)}g\n• 총 칼로리: ${pKcal.toFixed(0)}kcal\n\n`;
    }
    
    // 훈련 요약
    const wData = getWorkoutData();
    if(wData.exercises.length > 0) {
        let tVol = 0;
        report += `🏋️ [훈련 일지]\n`;
        wData.exercises.forEach(ex => {
            let eVol = 0;
            ex.sets.forEach(s => { if(s.done) eVol += (s.weight * s.reps); });
            tVol += eVol;
            report += `• ${ex.name}: ${eVol.toLocaleString()}kg\n`;
        });
        report += `• 당일 총 볼륨: ${tVol.toLocaleString()}kg\n`;
    }
    
    if(navigator.clipboard && window.isSecureContext) {
        navigator.clipboard.writeText(report).then(() => showToast("📋 오늘 일지 요약이 클립보드에 복사되었습니다."));
    } else { showToast("브라우저 환경에서 클립보드 권한이 지원되지 않습니다."); }
};

// 동적 입력 지표 이벤트 바인딩
function initMetricsChangeEvents() {
    const updateMetricsData = () => { const dStr = state.selectedDateStr; if (!dStr) return; state.workouts[dStr].weight = parseFloat(document.getElementById('input-daily-weight').value) || 0; state.workouts[dStr].bf = parseFloat(document.getElementById('input-daily-bf').value) || 0; state.workouts[dStr].smm = parseFloat(document.getElementById('input-daily-smm').value) || 0; triggerSave(); renderCalendarGrid(); };
    document.getElementById('input-daily-weight').oninput = updateMetricsData; document.getElementById('input-daily-bf').oninput = updateMetricsData; document.getElementById('input-daily-smm').oninput = updateMetricsData;
}

// 모바일 웹 뷰포트 최적화 스티키 헤더 전환 트랜지션 리스너
window.addEventListener('scroll', function() {
    const stickyBar = document.getElementById('sticky-macro-bar');
    if(!stickyBar || document.getElementById('view-diet').classList.contains('hidden')) return;
    if (window.scrollY > 260) { stickyBar.classList.add('compact-sticky'); } else { stickyBar.classList.remove('compact-sticky'); }
});

// ==========================================
// 🚀 앱 초기 통합 부팅 프로세스
// ==========================================
document.getElementById('btn-undo').onclick = () => { if (undoBuffer && undoBuffer.type === 'set') { const data = getWorkoutData(); data.exercises[undoBuffer.exIdx].sets.splice(undoBuffer.setIdx, 0, undoBuffer.data); undoBuffer = null; triggerSave(); renderWorkoutList(); document.getElementById('btn-undo').className = "hidden"; showToast("삭제된 기록이 복원되었습니다."); } };

initializeFirebase((success) => {
    requestPersistentStorage();
    const statusEl = document.getElementById('cloud-status');
    if (statusEl) { if (success) statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> 정상 연동'; else statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-sky-500 rounded-full"></span> 로컬 모드'; }
    updateAccountStatusUI(); 
    
    // 자정(Midnight) 시간대 로컬 날짜 오류 완벽 방어 처리
    calculateWorkoutDDay();
    const todayStr = getLocalYYYYMMDD();
    viewYear = parseInt(todayStr.split('-')[0]); viewMonth = parseInt(todayStr.split('-')[1]) - 1;
    selectWorkoutDate(todayStr);
    
    finishInit();
    initMetricsChangeEvents();
    
    setTimeout(() => { window.isUserInteracting = true; }, 1000);
});

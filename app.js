/**
 * 파일명: app.js
 * 역할: 식단 & 체중 기록지 도메인 총괄 통제 및 혼합 차트/엑셀 입출력 오케스트레이터 컨트롤러
 * 변경사항: 프로필 목표 연동 복구, 체중 변화량(Δ) 전역 바인딩 및 20대 지표 대시보드 무결성 통합 완료
 */

import { state, applyCustomSuppsToDB } from './store.js';
import { initializeFirebase, triggerSave, exportDataJSON, importDataJSON, saveToLocal } from './services.js';

// ==========================================
// 브라우저 전역 네임스페이스 함수 윈도우 바인딩
// ==========================================
window.showToast = showToast;
window.switchMainTab = switchMainTab; 
window.loadPhase = loadPhase; 
window.cycleColor = cycleColor; 
window.toggleCollapse = toggleCollapse; 
window.updateMealField = updateMealField; 
window.updateItemName = updateItemName; 
window.updateItemAmount = updateItemAmount; 
window.adjAmt = adjAmt; 
window.addItem = addItem; 
window.deleteItem = deleteItem; 
window.deleteMeal = deleteMeal; 
window.openPhaseModal = openPhaseModal; 
window.closePhaseModal = closePhaseModal; 
window.savePhaseModal = savePhaseModal; 
window.deletePhase = deletePhase; 
window.copyPhase = copyPhase; 
window.pastePhase = pastePhase;
window.openEditMealModal = openEditMealModal; 
window.closeEditMealModal = closeEditMealModal; 
window.saveEditMealModal = saveEditMealModal;
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
window.importData = (e) => importDataJSON(e.target.files[0], () => { finishInit(); showToast("동기화 복원 성공."); }, () => showToast("비정상 백업 파일입니다."));

// [체중 기록 신규 모듈 윈도우 스코프 매핑]
window.switchTab = switchTab;
window.openRecordModal = openRecordModal;
window.closeRecordModal = closeRecordModal;
window.handleRecordDateChange = handleRecordDateChange;
window.setBowelField = setBowelField;
window.toggleQuickNoteChip = toggleQuickNoteChip;
window.pullDietaryMacrosFromPlanner = pullDietaryMacrosFromPlanner;
window.saveWeightRecordData = saveWeightRecordData;
window.deleteWeightRecordData = deleteWeightRecordData;
window.toggleAccordionCard = toggleAccordionCard;
window.setMatrixFilter = setMatrixFilter;
window.updateWeightTrendChart = updateWeightTrendChart;
window.exportWeightRecordsToCSV = exportWeightRecordsToCSV;
window.importWeightRecordsFromCSV = importWeightRecordsFromCSV;
window.recalculateAllWeightDeltas = recalculateAllWeightDeltas; // [오류 수정] 캘린더 연동용 전역 바인딩 복구

let saveTimeout = null;
let mixChartInstance = null;
let selectedBowelValue = '';

export function showToast(msg) { 
    const t = document.getElementById('toast'); 
    if(!t) return;
    document.getElementById('toast-text').innerText = msg; 
    t.className = "fixed bottom-24 right-5 z-[250] transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl"; 
    setTimeout(() => { 
        t.className = "fixed bottom-24 right-5 z-[250] transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; 
    }, 2500); 
}

// ==========================================
// [오류 수정 완료] 시스템 초기화 및 프로필 연동 함수
// ==========================================
export function finishInit() { 
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    if (!state.selectedDateStr) state.selectedDateStr = todayStr;

    // 프로필 정보 동적 렌더링 복구
    const weightDisplay = document.getElementById('prof-weight-display');
    if (weightDisplay) weightDisplay.innerText = state.userInfo.weight + 'kg'; 
    
    const bfDisplay = document.getElementById('prof-bf-display');
    if(bfDisplay) bfDisplay.innerText = state.userInfo.targetBF + '%';
    
    const heightDisplay = document.getElementById('prof-height-display');
    if(heightDisplay) heightDisplay.innerText = state.userInfo.height + 'cm';
    
    if(state.userInfo.targetDate) { 
        const dBadge = document.getElementById('badge-target-date');
        if(dBadge) {
            const tDate = new Date(state.userInfo.targetDate);
            const diff = Math.ceil((tDate - now) / (1000 * 60 * 60 * 24));
            const dDayStr = diff >= 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
            dBadge.innerText = dDayStr;
        }
    }

    // 오늘 실측 체중이 있다면 프로필 위젯 체중 덮어쓰기 연동
    if (state.workouts[todayStr] && state.workouts[todayStr].weight > 0) {
        if (weightDisplay) weightDisplay.innerText = state.workouts[todayStr].weight.toFixed(2) + 'kg';
    }

    applyCustomSuppsToDB(); 
    initCalcDropdowns(); 
    
    if(state.phases.length > 0) {
        loadPhase(state.phases[0].id); 
    }
    
    runSmartCalc('carb'); 
    runSmartCalc('pro'); 
    runSmartCalc('fat'); 

    // 60초 주기 스토리지 백그라운드 강제 자동 저장 타이머 가동
    setInterval(() => { saveToLocal(); }, 60000); 

    initWeightRecordModuleGards();
}

// ==========================================
// 체중 기록 대시보드 렌더링 및 모달 제어
// ==========================================
export function switchTab(tabId) {
    document.querySelectorAll('.tab-pane').forEach(el => { el.classList.add('hidden'); el.classList.remove('block'); });
    const targetPane = document.getElementById('pane-tab-' + (tabId === 'weight' ? 'weight-record' : tabId));
    if (targetPane) { targetPane.classList.remove('hidden'); targetPane.classList.add('block'); }

    const tabs = ['planner', 'converter', 'analytics', 'weight'];
    tabs.forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        if (btn) btn.className = (t === tabId) ? "flex-1 py-3.5 text-center text-xs font-black transition-colors active-tab" : "flex-1 py-3.5 text-center text-xs font-bold text-slate-400 transition-colors hover:text-slate-200";
    });

    if (tabId === 'weight') {
        renderWeightRecordList();
        setMatrixFilter(state.weightRecordFilter || 'all');
    } else if (tabId === 'analytics') {
        calculateMacros();
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

export function renderWeightRecordList() {
    const container = document.getElementById('weight-records-timeline-container');
    if (!container) return; container.innerHTML = '';

    const sortedDates = Object.keys(state.workouts).filter(date => state.workouts[date].weight > 0).sort((a, b) => new Date(b) - new Date(a));

    if (sortedDates.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 text-center py-10">기록된 신체 지표가 없습니다. 우측 상단 버튼을 통해 당일 지표를 기록하십시오.</p>`;
        updateKpiSnapshotCards(); return;
    }

    sortedDates.forEach((dateStr) => {
        const data = state.workouts[dateStr];
        const dayOfWeek = data.dayOfWeek || '';
        const delta = data.weightDelta || 0;
        const deltaText = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
        const deltaClass = delta > 0 ? 'text-rose-500' : delta < 0 ? 'text-sky-500' : 'text-slate-400';
        
        const isWarning = (data.specialNote && (data.specialNote.includes('외식') || data.specialNote.includes('음주') || data.specialNote.includes('치팅')));
        const borderStyle = isWarning ? 'border-rose-500/40 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-slate-800/80';

        const card = document.createElement('div');
        card.className = `glass-panel border ${borderStyle} rounded-xl overflow-hidden transition-all duration-300`;
        card.id = `accordion-card-${dateStr}`;
        card.innerHTML = `
            <div onclick="window.toggleAccordionCard('${dateStr}')" class="p-3.5 flex justify-between items-center cursor-pointer hover:bg-slate-900/40 transition-colors select-none">
                <div class="flex items-center gap-2.5 min-w-0">
                    <div class="text-center shrink-0">
                        <span class="text-[10px] text-slate-500 font-bold block uppercase">${dayOfWeek}</span>
                        <span class="text-xs font-black text-slate-300 tracking-tight">${dateStr.slice(5)}</span>
                    </div>
                    <div class="w-px h-6 bg-slate-800"></div>
                    <div class="truncate">
                        <span id="txt-scale-weight-${dateStr}" class="text-sm font-black text-white mr-1.5">${data.weight.toFixed(2)}kg</span>
                        <span id="txt-scale-delta-${dateStr}" class="text-xs font-bold ${deltaClass}">${deltaText}kg</span>
                    </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                    <span class="px-1.5 py-0.5 text-[9px] font-black uppercase bg-slate-950 border border-slate-800 text-slate-400 rounded-md">${data.workoutPart || '휴식'}</span>
                    <span id="txt-scale-bowel-${dateStr}" class="text-xs font-bold text-amber-500">${data.bowel === 'O' ? '💩' : '🖨️'}</span>
                    <span class="text-slate-500 font-bold text-xs transition-transform duration-300" id="arrow-${dateStr}">▼</span>
                </div>
            </div>
            <div id="details-${dateStr}" class="hidden border-t border-slate-800/60 bg-slate-950/40 p-3.5 space-y-3 text-[11px]">
                <div class="grid grid-cols-2 gap-2 text-slate-300">
                    <div><span class="text-slate-500 font-medium">공복 눈바디:</span> <span class="font-black text-amber-400">${data.visualScore || '--'} 점</span></div>
                    <div><span class="text-slate-500 font-medium">공복 심박수:</span> <span class="font-black text-rose-400">${data.restingHR || '--'} bpm</span></div>
                    <div><span class="text-slate-500 font-medium">총 수면시간:</span> <span class="font-bold text-slate-200">${data.sleepTime || '--'} 시간</span></div>
                    <div><span class="text-slate-500 font-medium">컨디션 지표:</span> <span class="font-bold text-sky-400">${data.condition || '--'} / 10</span></div>
                    <div><span class="text-slate-500 font-medium">근력 훈련시간:</span> <span class="font-medium text-slate-200">${data.anaerobic || '0'} 분</span></div>
                    <div><span class="text-slate-500 font-medium">유산소 시간:</span> <span class="font-medium text-slate-200">${data.aerobic || '0'} 분</span></div>
                    <div class="col-span-2"><span class="text-slate-500 font-medium">당일 수분섭취:</span> <span class="font-bold text-blue-400">${data.water || '0'} L</span></div>
                </div>
                <div class="p-2.5 bg-slate-900/80 rounded-xl border border-slate-800/80 space-y-1.5">
                    <div class="flex justify-between items-center text-[10px] font-bold">
                        <span class="text-emerald-400">🍽️ 실측 매크로 섭취 총합</span>
                        <span class="text-slate-400 font-mono">비율 [ ${data.macroRatio || '0:0:0'} ]</span>
                    </div>
                    <div class="grid grid-cols-4 gap-1 text-center font-mono text-[10px] text-slate-300">
                        <div class="bg-slate-950 p-1 rounded">탄 ${data.carbs || 0}g</div>
                        <div class="bg-slate-950 p-1 rounded">단 ${data.protein || 0}g</div>
                        <div class="bg-slate-950 p-1 rounded">지 ${data.fat || 0}g</div>
                        <div class="bg-slate-950 p-1 rounded text-amber-400 font-bold">${data.totalKcal || 0}kcal</div>
                    </div>
                </div>
                ${data.specialNote ? `<div class="text-slate-300"><span class="text-purple-400 font-bold">⚠️ 특이사항:</span> <span class="font-medium">${data.specialNote}</span></div>` : ''}
                ${data.memo ? `<div class="text-slate-400 bg-slate-950/60 p-2 rounded-lg border border-slate-900 break-all"><span class="text-slate-500 font-bold block mb-0.5">📝 메모 기술서</span>${data.memo}</div>` : ''}
                <div class="flex gap-2 justify-end pt-1">
                    <button onclick="window.openRecordModal('${dateStr}')" class="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded font-bold">수정</button>
                    <button onclick="window.deleteWeightRecordData('${dateStr}')" class="px-2.5 py-1 bg-slate-950 border border-slate-800 text-rose-400 hover:bg-rose-500/10 rounded font-bold">삭제</button>
                </div>
            </div>`;
        container.appendChild(card);
    });
    updateKpiSnapshotCards();
}

export function toggleAccordionCard(dateStr) {
    const details = document.getElementById(`details-${dateStr}`);
    const arrow = document.getElementById(`arrow-${dateStr}`);
    if (!details) return;
    if (details.classList.contains('hidden')) { details.classList.remove('hidden'); arrow.style.transform = 'rotate(180deg)'; } 
    else { details.classList.add('hidden'); arrow.style.transform = 'rotate(0deg)'; }
}

export function openRecordModal(editDateStr = '') {
    const modal = document.getElementById('weight-record-modal');
    const dateInput = document.getElementById('record-date-input');
    const titleLbl = document.getElementById('record-modal-title');
    if (!modal) return;

    document.body.style.position = 'fixed'; document.body.style.width = '100%';
    document.querySelectorAll('.chip-note-tag').forEach(c => c.classList.remove('matrix-chip-active'));

    if (editDateStr) {
        titleLbl.innerText = `✏️ [${editDateStr}] 종합 건강 지표 정밀 수정`;
        dateInput.value = editDateStr; dateInput.readOnly = true;
        handleRecordDateChange(editDateStr);

        const data = state.workouts[editDateStr] || {};
        document.getElementById('record-weight-input').value = data.weight || '';
        document.getElementById('record-visual-input').value = data.visualScore || '';
        document.getElementById('record-hr-input').value = data.restingHR || '';
        document.getElementById('record-sleep-input').value = data.sleepTime || '';
        document.getElementById('record-part-input').value = data.workoutPart || '';
        document.getElementById('record-anaerobic-input').value = data.anaerobic || '';
        document.getElementById('record-aerobic-input').value = data.aerobic || '';
        document.getElementById('record-water-input').value = data.water || '0';
        document.getElementById('record-condition-input').value = data.condition || '7';
        document.getElementById('cond-val-lbl').innerText = (data.condition || '7') + '점';
        document.getElementById('record-carbs-input').value = data.carbs || '';
        document.getElementById('record-protein-input').value = data.protein || '';
        document.getElementById('record-fat-input').value = data.fat || '';
        document.getElementById('record-kcal-input').value = data.totalKcal || '';
        document.getElementById('record-ratio-display').innerText = data.macroRatio || '0:0:0';
        document.getElementById('record-special-input').value = data.specialNote || '';
        document.getElementById('record-memo-input').value = data.memo || '';
        setBowelField(data.bowel || '');
    } else {
        titleLbl.innerText = `＋ 당일 종합 신체 및 건강 지표 기입`;
        const todayStr = state.selectedDateStr || new Date().toISOString().slice(0, 10);
        dateInput.value = todayStr; dateInput.readOnly = false;
        handleRecordDateChange(todayStr);

        document.getElementById('record-weight-input').value = '';
        document.getElementById('record-visual-input').value = '';
        document.getElementById('record-hr-input').value = '';
        document.getElementById('record-sleep-input').value = '';
        document.getElementById('record-part-input').value = '';
        document.getElementById('record-anaerobic-input').value = '';
        document.getElementById('record-aerobic-input').value = '';
        document.getElementById('record-water-input').value = '0';
        document.getElementById('record-condition-input').value = '7';
        document.getElementById('cond-val-lbl').innerText = '7점';
        document.getElementById('record-carbs-input').value = '';
        document.getElementById('record-protein-input').value = '';
        document.getElementById('record-fat-input').value = '';
        document.getElementById('record-kcal-input').value = '';
        document.getElementById('record-ratio-display').innerText = '0:0:0';
        document.getElementById('record-special-input').value = '';
        document.getElementById('record-memo-input').value = '';
        setBowelField('');
    }
    modal.classList.remove('hidden'); modal.classList.add('flex');
}

export function closeRecordModal() {
    const modal = document.getElementById('weight-record-modal');
    if (modal) { modal.classList.add('hidden'); modal.classList.remove('flex'); }
    document.body.style.position = ''; document.body.style.width = '';
}

export function handleRecordDateChange(dateVal) {
    const display = document.getElementById('record-day-display'); if (!dateVal || !display) return;
    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayIndex = new Date(dateVal).getDay(); display.value = isNaN(dayIndex) ? '오류' : days[dayIndex];
}

export function setBowelField(val) {
    selectedBowelValue = val;
    const btnO = document.getElementById('btn-bowel-o'); const btnX = document.getElementById('btn-bowel-x');
    if (!btnO || !btnX) return;
    btnO.className = "bg-slate-950 border border-slate-700 font-black text-slate-400 rounded-lg transition-colors";
    btnX.className = "bg-slate-950 border border-slate-700 font-black text-slate-400 rounded-lg transition-colors";
    if (val === 'O') btnO.className = "bg-emerald-500 border border-emerald-600 font-black text-slate-950 rounded-lg transition-colors";
    if (val === 'X') btnX.className = "bg-rose-500 border border-rose-600 font-black text-slate-950 rounded-lg transition-colors";
}

export function toggleQuickNoteChip(tag) {
    const input = document.getElementById('record-special-input'); if (!input) return;
    let tokens = input.value.trim() ? input.value.split(',').map(s => s.trim()).filter(Boolean) : [];
    if (tokens.includes(tag)) tokens = tokens.filter(t => t !== tag); else tokens.push(tag);
    input.value = tokens.join(', ');
}

export function pullDietaryMacrosFromPlanner() {
    const activeDate = document.getElementById('record-date-input').value;
    const loader = document.getElementById('global-loading-layer');
    if(loader) { loader.classList.remove('hidden'); loader.classList.add('flex'); }

    setTimeout(() => {
        const kcalTxt = document.getElementById('sticky-kcal')?.innerText || '0';
        const carbsTxt = document.getElementById('sticky-carbs')?.innerText || '0g';
        const proteinTxt = document.getElementById('sticky-protein')?.innerText || '0g';
        const fatTxt = document.getElementById('sticky-fat')?.innerText || '0g';

        const totalKcal = parseInt(kcalTxt.replace(/,/g, '')) || 0;
        const carbs = parseFloat(carbsTxt.split(' ')[0]) || 0;
        const protein = parseFloat(proteinTxt.split(' ')[0]) || 0;
        const fat = parseFloat(fatTxt.split(' ')[0]) || 0;

        document.getElementById('record-carbs-input').value = carbs > 0 ? carbs : '';
        document.getElementById('record-protein-input').value = protein > 0 ? protein : '';
        document.getElementById('record-fat-input').value = fat > 0 ? fat : '';
        document.getElementById('record-kcal-input').value = totalKcal > 0 ? totalKcal : '';

        const cK = carbs * 4, pK = protein * 4, fK = fat * 9; const sum = cK + pK + fK;
        let ratioStr = '0:0:0';
        if (sum > 0) {
            const cP = Math.round((cK / sum) * 10); const pP = Math.round((pK / sum) * 10);
            ratioStr = `${cP}:${pP}:${10 - (cP + pP)}`;
        }
        document.getElementById('record-ratio-display').innerText = ratioStr;

        const wData = state.workouts[activeDate];
        if (wData && wData.exercises && wData.exercises.length > 0) {
            const parts = [...new Set(wData.exercises.map(e => e.part))];
            document.getElementById('record-part-input').value = parts.join(' / ');
            let totalSets = 0; wData.exercises.forEach(e => totalSets += (e.sets ? e.sets.length : 0));
            if (totalSets > 0) document.getElementById('record-anaerobic-input').value = totalSets * 3;
        }

        if(loader) loader.classList.add('hidden'); showToast("식단 및 수행 훈련 지표 상속 완료.");
    }, 250);
}

export function saveWeightRecordData() {
    const dateStr = document.getElementById('record-date-input').value;
    const weightVal = parseFloat(document.getElementById('record-weight-input').value) || 0;
    if (!dateStr || weightVal <= 0) { alert("기록 일자 및 공복 체중을 올바르게 기입하십시오."); return; }

    if (!state.workouts[dateStr]) state.workouts[dateStr] = { weight: 0, bf: 0, smm: 0, exercises: [] };
    const target = state.workouts[dateStr];
    
    target.weight = weightVal;
    target.dayOfWeek = document.getElementById('record-day-display').value;
    target.visualScore = parseInt(document.getElementById('record-visual-input').value) || 0;
    target.restingHR = parseInt(document.getElementById('record-hr-input').value) || 0;
    target.sleepTime = parseFloat(document.getElementById('record-sleep-input').value) || 0;
    target.workoutPart = document.getElementById('record-part-input').value.trim();
    target.anaerobic = parseInt(document.getElementById('record-anaerobic-input').value) || 0;
    target.aerobic = parseInt(document.getElementById('record-aerobic-input').value) || 0;
    target.water = parseFloat(document.getElementById('record-water-input').value) || 0;
    target.bowel = selectedBowelValue || 'X';
    target.condition = parseInt(document.getElementById('record-condition-input').value) || 7;
    target.carbs = parseFloat(document.getElementById('record-carbs-input').value) || 0;
    target.protein = parseFloat(document.getElementById('record-protein-input').value) || 0;
    target.fat = parseFloat(document.getElementById('record-fat-input').value) || 0;
    target.totalKcal = parseInt(document.getElementById('record-kcal-input').value) || 0;
    target.macroRatio = document.getElementById('record-ratio-display').innerText;
    target.specialNote = document.getElementById('record-special-input').value.trim();
    target.memo = document.getElementById('record-memo-input').value.trim();

    recalculateAllWeightDeltas(); saveToLocal(); closeRecordModal(); renderWeightRecordList();
    setMatrixFilter(state.weightRecordFilter || 'all');
    
    const activeToday = new Date().toISOString().slice(0,10);
    if (state.workouts[activeToday] && state.workouts[activeToday].weight > 0) {
        document.getElementById('prof-weight-display').innerText = state.workouts[activeToday].weight.toFixed(2) + 'kg';
    }
    showToast("종합 건강 지표 영속성 보존 완료.");
}

export function deleteWeightRecordData(dateStr) {
    if (confirm(`[${dateStr}] 일자의 건강 종합 지표를 소거할까요?\n(등록된 운동 일지는 완전히 보존됩니다.)`)) {
        const t = state.workouts[dateStr];
        if (t) {
            t.weight = 0; t.weightDelta = 0; t.visualScore = 0; t.restingHR = 0; t.sleepTime = 0;
            t.workoutPart = ''; t.anaerobic = 0; t.aerobic = 0; t.water = 0; t.bowel = 'X';
            t.carbs = 0; t.protein = 0; t.fat = 0; t.totalKcal = 0; t.macroRatio = '0:0:0'; t.specialNote = ''; t.memo = '';
        }
        recalculateAllWeightDeltas(); saveToLocal(); renderWeightRecordList();
        setMatrixFilter(state.weightRecordFilter || 'all'); showToast("당일 지표 기록을 초기화했습니다.");
    }
}

export function recalculateAllWeightDeltas() {
    const dates = Object.keys(state.workouts).filter(d => state.workouts[d].weight > 0).sort((a, b) => new Date(a) - new Date(b));
    dates.forEach((dateStr, idx) => {
        if (idx === 0) state.workouts[dateStr].weightDelta = 0.0;
        else state.workouts[dateStr].weightDelta = state.workouts[dateStr].weight - state.workouts[dates[idx - 1]].weight;
    });
}

// ==========================================
// 차트 및 그래픽스 대시보드 엔진
// ==========================================
export function setMatrixFilter(filterType) {
    state.weightRecordFilter = filterType;
    const chips = ['all', 'weight', 'macros', 'condition'];
    chips.forEach(c => {
        const btn = document.getElementById('chip-filter-' + c);
        if (btn) btn.className = (c === filterType) ? "px-4 py-2 text-xs font-black rounded-xl bg-amber-500 text-slate-950 transition-all shadow-md active:scale-95" : "px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 border border-slate-800 text-slate-400 transition-all";
    });

    const cWeight = document.getElementById('kpi-card-weight');
    const cMacros = document.getElementById('kpi-card-macros');
    const cCond = document.getElementById('kpi-card-condition');
    [cWeight, cMacros, cCond].forEach(card => { if (card) card.className = "glass-panel p-4 rounded-xl border border-slate-800 transition-all duration-300 opacity-100 scale-100"; });
    if (cCond) cCond.className += " col-span-2";

    if (filterType === 'weight') {
        if (cMacros) cMacros.className += " opacity-25 scale-95"; if (cCond) cCond.className += " opacity-25 scale-95";
        if (cWeight) cWeight.className = cWeight.className.replace('border-slate-800', 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] scale-[1.02]');
    } else if (filterType === 'macros') {
        if (cWeight) cWeight.className += " opacity-25 scale-95"; if (cCond) cCond.className += " opacity-25 scale-95";
        if (cMacros) cMacros.className = cMacros.className.replace('border-slate-800', 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] scale-[1.02]');
    } else if (filterType === 'condition') {
        if (cWeight) cWeight.className += " opacity-25 scale-95"; if (cMacros) cMacros.className += " opacity-25 scale-95";
        if (cCond) cCond.className = cCond.className.replace('border-slate-800', 'border-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.2)] scale-[1.02]');
    }

    const sortedDates = Object.keys(state.workouts).filter(d => state.workouts[d].weight > 0);
    sortedDates.forEach(dateStr => {
        const tW = document.getElementById(`txt-scale-weight-${dateStr}`);
        const tD = document.getElementById(`txt-scale-delta-${dateStr}`);
        const tB = document.getElementById(`txt-scale-bowel-${dateStr}`);
        if (tW && tD && tB) {
            tW.className = (filterType === 'weight') ? "text-base font-black text-amber-400 mr-1.5 transition-all" : "text-sm font-black text-white mr-1.5 transition-all";
            tB.className = (filterType === 'condition') ? "text-base font-black text-sky-400 transition-all" : "text-xs font-bold text-amber-500 transition-all";
        }
    });
    updateWeightTrendChart();
}

export function updateWeightTrendChart() {
    const canvas = document.getElementById('chart-weight-trend-mix'); if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const chronologicalDates = Object.keys(state.workouts).filter(date => state.workouts[date].weight > 0).sort((a, b) => new Date(a) - new Date(b));
    const recent7Days = chronologicalDates.slice(-7); const chartLabels = recent7Days.map(d => d.slice(5).replace('-', '/'));

    if (mixChartInstance) { mixChartInstance.destroy(); mixChartInstance = null; }
    if (recent7Days.length === 0) return;

    const filterMode = state.weightRecordFilter || 'all';
    let datasets = []; let optionsScales = { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10, weight: '600' } } } };

    if (filterMode === 'all') {
        datasets = [
            { type: 'line', label: '공복체중(kg)', data: recent7Days.map(d => state.workouts[d].weight), borderColor: '#F59E0B', backgroundColor: 'transparent', borderWidth: 3, pointBackgroundColor: '#F59E0B', yAxisID: 'yLeft', tension: 0.25 },
            { type: 'bar', label: '섭취열량(kcal)', data: recent7Days.map(d => state.workouts[d].totalKcal || 0), backgroundColor: 'rgba(30, 41, 59, 0.5)', borderColor: 'rgba(255, 255, 255, 0.1)', borderWidth: 1, borderRadius: 6, yAxisID: 'yRight' }
        ];
        optionsScales.yLeft = { position: 'left', grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#F59E0B', font: { size: 10 } } };
        optionsScales.yRight = { position: 'right', grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 9 } } };
    } else if (filterMode === 'weight') {
        datasets = [
            { type: 'line', label: '공복체중(kg)', data: recent7Days.map(d => state.workouts[d].weight), borderColor: '#F59E0B', backgroundColor: 'transparent', borderWidth: 3, pointBackgroundColor: '#F59E0B', yAxisID: 'yLeft', tension: 0.1 },
            { type: 'bar', label: '체중변화(kg)', data: recent7Days.map(d => state.workouts[d].weightDelta || 0), backgroundColor: recent7Days.map(d => (state.workouts[d].weightDelta || 0) > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(14, 165, 233, 0.4)'), borderColor: recent7Days.map(d => (state.workouts[d].weightDelta || 0) > 0 ? '#EF4444' : '#0EA5E9'), borderWidth: 1, borderRadius: 4, yAxisID: 'yDelta' }
        ];
        optionsScales.yLeft = { position: 'left', grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#F59E0B', font: { size: 10 } } };
        optionsScales.yDelta = { position: 'right', grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10 } } };
    } else if (filterMode === 'macros') {
        datasets = [
            { type: 'bar', label: '총칼로리(kcal)', data: recent7Days.map(d => state.workouts[d].totalKcal || 0), backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981', borderWidth: 1.5, borderRadius: 6, yAxisID: 'yLeft' },
            { type: 'line', label: '탄수화물(g)', data: recent7Days.map(d => state.workouts[d].carbs || 0), borderColor: '#F59E0B', borderWidth: 2, pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.2 },
            { type: 'line', label: '단백질(g)', data: recent7Days.map(d => state.workouts[d].protein || 0), borderColor: '#10B981', borderWidth: 2, pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.2 },
            { type: 'line', label: '지방(g)', data: recent7Days.map(d => state.workouts[d].fat || 0), borderColor: '#0EA5E9', borderWidth: 2, pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.2 }
        ];
        optionsScales.yLeft = { position: 'left', grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#10B981', font: { size: 9 } } };
        optionsScales.yRight = { position: 'right', grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 9 } } };
    } else if (filterMode === 'condition') {
        datasets = [
            { type: 'line', label: '종합컨디션(점)', data: recent7Days.map(d => state.workouts[d].condition || 7), borderColor: '#0EA5E9', borderWidth: 2.5, pointRadius: 3, backgroundColor: 'transparent', yAxisID: 'yLeft', tension: 0.3 },
            { type: 'line', label: '눈바디점수(점)', data: recent7Days.map(d => state.workouts[d].visualScore || 5), borderColor: '#A855F7', borderWidth: 2.5, pointRadius: 3, backgroundColor: 'transparent', yAxisID: 'yLeft', tension: 0.3 },
            { type: 'line', label: '수면시간(h)', data: recent7Days.map(d => state.workouts[d].sleepTime || 0), borderColor: '#64748B', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.1 }
        ];
        optionsScales.yLeft = { position: 'left', min: 1, max: 10, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#0EA5E9', stepSize: 1, font: { size: 10 } } };
        optionsScales.yRight = { position: 'right', min: 0, max: 12, grid: { display: false }, ticks: { color: '#94A3B8', stepSize: 2, font: { size: 9 } } };
    }

    mixChartInstance = new Chart(ctx, {
        data: { labels: chartLabels, datasets: datasets },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: true, position: 'top', labels: { color: '#64748B', boxWidth: 8, boxHeight: 8, font: { size: 9 } } } }, scales: optionsScales }
    });
}

function updateKpiSnapshotCards() {
    const sorted = Object.keys(state.workouts).filter(date => state.workouts[date].weight > 0).sort((a, b) => new Date(b) - new Date(a));
    const wLbl = document.getElementById('kpi-display-weight'); if (!wLbl) return;
    if (sorted.length === 0) { wLbl.innerText = "-- kg"; document.getElementById('kpi-display-kcal').innerText = "-- kcal"; return; }
    
    const recent7 = sorted.slice(0, 7); let sumW = 0, sumK = 0, sumC = 0, sumP = 0, sumF = 0, sumSleep = 0, sumCond = 0, bowelO = 0;
    recent7.forEach(d => { const o = state.workouts[d]; sumW += o.weight; sumK += o.totalKcal || 0; sumC += o.carbs || 0; sumP += o.protein || 0; sumF += o.fat || 0; sumSleep += o.sleepTime || 0; sumCond += o.condition || 7; if (o.bowel === 'O') bowelO++; });
    const len = recent7.length;
    
    wLbl.innerText = `${(sumW/len).toFixed(1)} kg`;
    document.getElementById('kpi-sub-weight').innerText = `최근 기록 변화량: ${(state.workouts[sorted[0]].weightDelta || 0).toFixed(1)} kg`;
    document.getElementById('kpi-display-kcal').innerText = `${Math.round(sumK/len).toLocaleString()} kcal`;
    document.getElementById('kpi-sub-macros').innerText = `주간평균 탄:${Math.round(sumC/len)}g 단:${Math.round(sumP/len)}g 지:${Math.round(sumF/len)}g`;
    document.getElementById('kpi-display-cond').innerText = `평균 수면: ${(sumSleep/len).toFixed(1)}h | 컨디션: ${(sumCond/len).toFixed(1)}점`;
    document.getElementById('kpi-display-bowel').innerText = `배변 빈도: ${Math.round((bowelO/len)*100)}%`;
}

// ==========================================
// 엑셀(CSV) 입출력 이중화 파이프라인
// ==========================================
export async function exportWeightRecordsToCSV() {
    const loader = document.getElementById('global-loading-layer');
    if (loader) { loader.classList.remove('hidden'); loader.classList.add('flex'); }

    setTimeout(async () => {
        let csvContent = "\uFEFF";
        const headers = ["일자", "요일", "공복체중(kg)", "체중변화량(kg)", "수면시간(시간)", "컨디션(1-10)", "눈바디점수(1-10)", "공복심박수(bpm)", "운동부위", "탄수화물(g)", "단백질(g)", "지방(g)", "총섭취칼로리(kcal)", "탄단지비율", "수분섭취(L)", "근력운동(분)", "유산소(분)", "배변활동(O/X)", "특이사항", "메모"];
        csvContent += headers.join(",") + "\n";

        const dates = Object.keys(state.workouts).filter(d => state.workouts[d].weight > 0).sort((a, b) => new Date(a) - new Date(b));
        dates.forEach(dateStr => {
            const d = state.workouts[dateStr];
            const sNote = d.specialNote ? `"${d.specialNote.replace(/"/g, '""')}"` : '""';
            const memoStr = d.memo ? `"${d.memo.replace(/"/g, '""')}"` : '""';
            const row = [dateStr, d.dayOfWeek || "", d.weight.toFixed(2), (d.weightDelta || 0).toFixed(2), d.sleepTime || 0, d.condition || 7, d.visualScore || 5, d.restingHR || 60, d.workoutPart ? `"${d.workoutPart.replace(/"/g, '""')}"` : '""', d.carbs || 0, d.protein || 0, d.fat || 0, d.totalKcal || 0, d.macroRatio || "0:0:0", d.water || 0, d.anaerobic || 0, d.aerobic || 0, d.bowel || "X", sNote, ...[memoStr]];
            csvContent += row.join(",") + "\n";
        });

        const pad = n => n < 10 ? '0' + n : n; const now = new Date();
        const fileName = `Diet_Weight_Report_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.csv`;

        try {
            if (window.showSaveFilePicker) {
                const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'Excel CSV', accept: { 'text/csv': ['.csv'] } }] });
                const writable = await handle.createWritable(); await writable.write(csvContent); await writable.close();
                showToast("모바일 지정 폴더에 저장되었습니다.");
            } else {
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' }); const link = document.createElement("a");
                link.href = URL.createObjectURL(blob); link.setAttribute("download", fileName); link.click(); showToast("다운로드 폴더에 저장되었습니다.");
            }
        } catch (err) { showToast("백업 취소됨."); } finally { if (loader) loader.classList.add('hidden'); }
    }, 200);
}

export function importWeightRecordsFromCSV(event) {
    const file = event.target.files[0]; if (!file) return;
    const loader = document.getElementById('global-loading-layer'); if (loader) { loader.classList.remove('hidden'); loader.classList.add('flex'); }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const lines = e.target.result.split(/\r?\n/).filter(line => line.trim().length > 0);
            if (lines.length <= 1 || !lines[0].includes("공복체중")) throw new Error("서식이 잘못되었습니다.");

            let count = 0;
            for (let i = 1; i < lines.length; i++) {
                const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.trim()); if (row.length < 3) continue;
                let rawDate = row[0].replace(/"/g, ''); const match = rawDate.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/); if (!match) continue;
                const dStr = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`;
                const weight = parseFloat(row[2]) || 0; if (weight <= 0) continue;

                if (!state.workouts[dStr]) state.workouts[dStr] = { weight: 0, bf: 0, smm: 0, exercises: [] };
                const t = state.workouts[dStr];
                t.weight = weight; t.dayOfWeek = row[1].replace(/"/g, '') || ""; t.sleepTime = parseFloat(row[4]) || 0;
                t.condition = parseInt(row[5]) || 7; t.visualScore = parseInt(row[6]) || 5; t.restingHR = parseInt(row[7]) || 60;
                t.workoutPart = row[8] ? row[8].replace(/"/g, '') : ""; t.carbs = parseFloat(row[9]) || 0; t.protein = parseFloat(row[10]) || 0;
                t.fat = parseFloat(row[11]) || 0; t.totalKcal = parseInt(row[12]) || 0; t.macroRatio = row[13] ? row[13].replace(/"/g, '') : "0:0:0";
                t.water = parseFloat(row[14]) || 0; t.anaerobic = parseInt(row[15]) || 0; t.aerobic = parseInt(row[16]) || 0; t.bowel = row[17] ? row[17].replace(/"/g, '') : "X";
                t.specialNote = row[18] ? row[18].replace(/"/g, '') : ""; t.memo = row[19] ? row[19].replace(/"/g, '') : "";
                count++;
            }
            recalculateAllWeightDeltas(); saveToLocal(); renderWeightRecordList(); setMatrixFilter(state.weightRecordFilter || 'all');
            showToast(`총 ${count}개 일자 지표 복원 완료.`);
        } catch (err) { alert(`복원 실패: ${err.message}`); } finally { if (loader) loader.classList.add('hidden'); event.target.value = ''; }
    };
    reader.readAsText(file, 'UTF-8');
}

function initWeightRecordModuleGards() {
    window.addEventListener('scroll', function() {
        const menubar = document.getElementById('main-tab-menubar'); const spacer = document.getElementById('menu-bar-spacer');
        if (!menubar || !spacer) return;
        if (window.scrollY > 350) { menubar.classList.add('sticky-menu-fixed'); spacer.style.display = 'block'; } 
        else { menubar.classList.remove('sticky-menu-fixed'); spacer.style.display = 'none'; }
    });
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function() {
            const bar = document.getElementById('sticky-macro-bar'); if (!bar) return;
            if (window.visualViewport.height < window.innerHeight * 0.75) bar.classList.add('hidden'); else bar.classList.remove('hidden');
        });
    }
}

// ==========================================
// 기존 식단 핵심 편의 기능 로직 (원형 보존)
// ==========================================
export function renderPhaseTabs() { const container = document.getElementById('phase-tabs-container'); if(!container) return; container.innerHTML = ''; state.phases.forEach(p => { const isActive = (p.id === state.currentPhaseId); const btnClass = isActive ? "px-5 py-3 rounded-lg text-base font-bold phase-btn-active shrink-0 transition-colors" : "px-5 py-3 rounded-lg text-base font-bold text-slate-400 hover:bg-slate-800 shrink-0 transition-colors"; container.innerHTML += `<button onclick="window.loadPhase('${p.id}')" class="${btnClass}">${p.title}</button>`; }); }
export function adjAmt(mIdx, iIdx, delta) { const cp = state.phases.find(p => p.id === state.currentPhaseId); let current = parseFloat(cp.meals[mIdx].items[iIdx].amount) || 0; let next = current + delta; if(next < 0) next = 0; cp.meals[mIdx].items[iIdx].amount = next; triggerSave(showToast); calculateMacros(); loadPhase(state.currentPhaseId); }
export function loadPhase(phaseId) { if(!state.phases.find(p => p.id === phaseId) && state.phases.length > 0) phaseId = state.phases[0].id; state.currentPhaseId = phaseId; renderPhaseTabs(); const cp = state.phases.find(p => p.id === phaseId); if(!cp) return; document.getElementById('phase-description').innerText = cp.desc; const container = document.getElementById('timeline-container'); if(!container) return; container.innerHTML = ''; cp.meals.forEach((meal, mIdx) => { let itemsHtml = ''; if(!meal.items) meal.items = []; meal.items.forEach((item, iIdx) => { let opts = `<optgroup label="탄수화물">` + state.foodCategories['탄수화물'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`; opts += `<optgroup label="단백질">` + state.foodCategories['단백질'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`; opts += `<optgroup label="지방">` + state.foodCategories['지방'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`; opts += `<optgroup label="야채">` + state.foodCategories['야채'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`; opts += `<optgroup label="보충제">` + state.foodCategories['보충제'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`; itemsHtml += ` <div class="flex items-center justify-between p-3 bg-slate-900/60 rounded-xl border border-slate-800 mb-2 gap-2"> <select onchange="window.updateItemName(${mIdx}, ${iIdx}, event.target.value)" class="bg-slate-800 text-slate-200 text-sm px-2 py-2 rounded-lg outline-none flex-1 min-w-[90px] max-w-[140px]">${opts}</select> <div class="flex items-center gap-1.5 sm:gap-2"> <div class="flex items-center bg-slate-950 border border-slate-700 rounded-lg p-0.5 shadow-inner"> <button onclick="window.adjAmt(${mIdx}, ${iIdx}, -10)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors text-lg font-bold select-none">−</button> <input type="number" inputmode="decimal" oninput="window.updateItemAmount(${mIdx}, ${iIdx}, event.target.value)" class="w-10 sm:w-14 bg-transparent text-white text-center text-base font-bold outline-none" value="${item.amount || 0}"> <button onclick="window.adjAmt(${mIdx}, ${iIdx}, 10)" class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-800 rounded transition-colors text-lg font-bold select-none">＋</button> </div> <span class="text-sm text-slate-400 font-bold w-2 text-center">g</span> <button onclick="window.deleteItem(${mIdx}, ${iIdx})" class="w-8 h-8 flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg ml-0.5 transition-colors text-base font-black">✕</button> </div> </div>`; }); const workoutChecked = meal.isWorkout ? 'checked' : ''; container.innerHTML += ` <div class="flex items-stretch mb-6"> <div class="relative flex flex-col items-center mr-4 sm:mr-6 w-10 shrink-0"> <div class="w-px h-full bg-slate-800 absolute top-8 bottom-[-32px] z-0"></div> <div onclick="event.stopPropagation(); window.cycleColor(${mIdx})" class="drag-handle relative z-10 w-10 h-10 bg-${meal.color}-500 rounded-full border-4 border-[#090D16] flex items-center justify-center cursor-move shadow-[0_0_15px_rgba(14,165,233,0.4)] active:scale-110 transition-transform"> <span class="text-white text-base font-black select-none pointer-events-none">↕</span> </div> </div> <div class="glass-panel flex-1 p-4 sm:p-5 rounded-2xl border border-slate-800 w-full overflow-hidden"> <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer gap-4 sm:gap-0" onclick="window.toggleCollapse(${mIdx})"> <div class="flex flex-col sm:flex-row items-start sm:items-center gap-1 sm:gap-4 w-full sm:w-auto" onclick="event.stopPropagation()"> <input type="text" onchange="window.updateMealField(${mIdx}, 'label', event.target.value)" value="${meal.label}" class="order-1 sm:order-2 px-2 py-0.5 text-sm font-black uppercase bg-${meal.color}-500/10 text-${meal.color}-400 border border-${meal.color}-500/20 rounded-md outline-none w-full sm:w-[160px]"> <input type="time" onchange="window.updateMealField(${mIdx}, 'time', event.target.value)" value="${meal.time}" class="order-2 sm:order-1 bg-transparent text-white font-black text-3xl sm:text-2xl tracking-tighter cursor-pointer p-0 -ml-1 sm:ml-0"> </div> <div class="flex gap-2 items-center self-end sm:self-auto shrink-0 mt-2 sm:mt-0" onclick="event.stopPropagation()"> <button onclick="window.openEditMealModal(${mIdx}, true)" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded border border-slate-700 transition-colors">📋 복제</button> <button onclick="window.openEditMealModal(${mIdx}, false)" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors">⚙️ 수정</button> <button onclick="window.deleteMeal(${mIdx})" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded border border-slate-700 transition-colors">🗑️ 삭제</button> <button onclick="window.toggleCollapse(${mIdx})" class="text-lg px-2 py-1 ml-1 text-slate-400 hover:text-white transition-colors">${meal.isCollapsed ? '🔽' : '🔼'}</button> </div> </div> <div class="transition-all duration-300 overflow-hidden ${meal.isCollapsed ? 'max-h-0 opacity-0 m-0' : 'max-h-[3000px] opacity-100 mt-5'}"> <div class="flex items-center gap-2 mb-3 bg-slate-950/40 p-2.5 rounded-xl border border-slate-800/60" onclick="event.stopPropagation()"> <input type="checkbox" id="meal-workout-check-${mIdx}" ${workoutChecked} onchange="window.toggleMealWorkout(${mIdx}, event.target.checked)" class="w-4 h-4 accent-rose-500 cursor-pointer shrink-0"> <label for="meal-workout-check-${mIdx}" class="text-xs font-bold text-slate-400 cursor-pointer select-none">이 일정은 훈련 스케줄입니다 (활성화 시 당일 영양소 연산 대상에서 제외)</label> </div> <input type="text" onchange="window.updateMealField(${mIdx}, 'explain', event.target.value)" value="${meal.explain || ''}" placeholder="스케줄 메모 (예: 오후 메인 본 운동 세션)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm sm:text-base text-white font-bold outline-none focus:border-sky-500 mb-3"> <textarea onchange="window.updateMealField(${mIdx}, 'supps', event.target.value)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm sm:text-base text-slate-200 outline-none focus:border-sky-500 mb-3 min-h-[100px] custom-scrollbar" placeholder="보충제 섭취 프로토콜 및 상세 코칭 메모">${meal.supps || ''}</textarea> ${itemsHtml} <button onclick="window.addItem(${mIdx})" class="w-full py-3 border border-dashed border-slate-700 text-sm sm:text-base text-slate-400 hover:text-sky-400 font-bold mt-2 rounded-xl transition-colors">+ 식품 및 보충제 추가</button> </div> </div> </div>`; }); if (typeof Sortable !== 'undefined' && document.getElementById('timeline-container')) { if (window.timelineSortable) { window.timelineSortable.destroy(); } window.timelineSortable = new Sortable(document.getElementById('timeline-container'), { handle: '.drag-handle', animation: 250, ghostClass: 'opacity-10', delay: 150, delayOnTouchOnly: true, forceFallback: false, onEnd: function (evt) { const oldIdx = evt.oldIndex; const newIdx = evt.newIndex; if (oldIdx === newIdx) return; const phase = state.phases.find(p => p.id === state.currentPhaseId); const movedItem = phase.meals.splice(oldIdx, 1)[0]; phase.meals.splice(newIdx, 0, movedItem); triggerSave(showToast); setTimeout(() => loadPhase(state.currentPhaseId), 10); } }); } }
export function openPhaseModal(isNew = false) { state.editingPhaseIsNew = isNew; if (isNew) { document.getElementById('phase-title').value = ''; document.getElementById('phase-desc').value = ''; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); document.getElementById('phase-title').value = cp.title; document.getElementById('phase-desc').value = cp.desc; } document.getElementById('phase-modal').classList.remove('hidden'); document.getElementById('phase-modal').classList.add('flex'); }
export function closePhaseModal() { document.getElementById('phase-modal').classList.add('hidden'); document.getElementById('phase-modal').classList.remove('flex'); }
export function savePhaseModal() { const title = document.getElementById('phase-title').value || '새 탭'; const desc = document.getElementById('phase-desc').value || ''; if (state.editingPhaseIsNew) { const newId = 'p_' + Date.now(); state.phases.push({ id: newId, title: title, desc: desc, meals: [] }); state.currentPhaseId = newId; } else { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.title = title; cp.desc = desc; } closePhaseModal(); triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function deletePhase() { if(state.phases.length <= 1) { showToast("최소 1개의 탭은 유지해야 합니다."); return; } if(confirm("탭 전체를 삭제하시겠습니까? 데이터가 파괴됩니다.")) { state.phases = state.phases.filter(p => p.id !== state.currentPhaseId); triggerSave(showToast); loadPhase(state.phases[0].id); } }
export function copyPhase() { const cp = state.phases.find(p => p.id === state.currentPhaseId); state.clipboardMeals = JSON.parse(JSON.stringify(cp.meals)); showToast("식단 세트 복사 완료."); }
export function pastePhase() { if (!state.clipboardMeals || state.clipboardMeals.length === 0) { showToast("복사된 세트가 없습니다."); return; } if(confirm("현재 탭의 내용이 덮어쓰기 됩니다. 진행할까요?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals = state.clipboardMeals.map(m => { let cloned = JSON.parse(JSON.stringify(m)); cloned.id = 'm' + Date.now() + Math.floor(Math.random() * 1000); return cloned; }); triggerSave(showToast); loadPhase(state.currentPhaseId); } }
export function openEditMealModal(mIdx, isDuplicate) { let meal; if (mIdx !== null) meal = state.phases.find(p => p.id === state.currentPhaseId).meals[mIdx]; else meal = { time: '12:00', label: '새 일정', color: 'sky', explain: '', supps: '', items: [], isWorkout: false }; state.editingMealState = { mIdx: mIdx, isDuplicate: isDuplicate, originalItems: meal.items || [] }; document.getElementById('edit-meal-title').innerText = (isDuplicate) ? "📋 일정 복제" : (mIdx === null ? "➕ 새 일정 추가" : "⚙️ 일정 수정"); document.getElementById('edit-meal-time').value = meal.time; document.getElementById('edit-meal-label').value = meal.label; document.getElementById('edit-meal-color').value = meal.color; document.getElementById('edit-meal-explain').value = meal.explain || ''; document.getElementById('edit-meal-supps').value = meal.supps || ''; document.getElementById('edit-meal-modal').classList.remove('hidden'); document.getElementById('edit-meal-modal').classList.add('flex'); }
export function closeEditMealModal() { document.getElementById('edit-meal-modal').classList.add('hidden'); document.getElementById('edit-meal-modal').classList.remove('flex'); }
export function saveEditMealModal() { const time = document.getElementById('edit-meal-time').value; const label = document.getElementById('edit-meal-label').value || '일정'; const color = document.getElementById('edit-meal-color').value; const explain = document.getElementById('edit-meal-explain').value; const supps = document.getElementById('edit-meal-supps').value; const cp = state.phases.find(p => p.id === state.currentPhaseId); if (state.editingMealState.mIdx === null || state.editingMealState.isDuplicate) { const newObj = { id: 'm'+Date.now(), time: time, label: label, color: color, explain: explain, supps: supps, items: JSON.parse(JSON.stringify(state.editingMealState.originalItems)), isCollapsed: false, isWorkout: false }; if(state.editingMealState.isDuplicate) { cp.meals.splice(state.editingMealState.mIdx + 1, 0, newObj); } else { cp.meals.push(newObj); } } else { const meal = cp.meals[state.editingMealState.mIdx]; meal.time = time; meal.label = label; meal.color = color; meal.explain = explain; meal.supps = supps; } triggerSave(showToast); closeEditMealModal(); loadPhase(state.currentPhaseId); }
export function cycleColor(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); const colors = ['sky', 'emerald', 'amber', 'rose', 'violet', 'slate']; const current = cp.meals[mIdx].color || 'sky'; cp.meals[mIdx].color = colors[(colors.indexOf(current) + 1) % colors.length]; triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function toggleCollapse(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].isCollapsed = !cp.meals[mIdx].isCollapsed; loadPhase(state.currentPhaseId); }
export function updateMealField(mIdx, field, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx][field] = val; triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function updateItemName(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].name = val; triggerSave(showToast); calculateMacros(); }
export function updateItemAmount(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].amount = parseFloat(val)||0; triggerSave(showToast); calculateMacros(); }
export function deleteItem(mIdx, iIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.splice(iIdx, 1); triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function addItem(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.push({name:'백미', amount:100}); triggerSave(showToast); loadPhase(state.currentPhaseId); }
export function deleteMeal(mIdx) { if(confirm("이 일정을 삭제하시겠습니까?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals.splice(mIdx, 1); triggerSave(showToast); loadPhase(state.currentPhaseId); } }
export function calculateMacros() { let tC=0, tP=0, tF=0, tK=0; let cSrc={}, pSrc={}, fSrc={}; const cp = state.phases.find(p => p.id === state.currentPhaseId); if(cp) { cp.meals.forEach(m => { if (m.isWorkout) return; if(m.items) { m.items.forEach(i => { const db = state.foodDB[i.name]; if(db) { let amt = i.amount || 0; let c=db.c*amt, p=db.p*amt, f=db.f*amt; tC+=c; tP+=p; tF+=f; tK+=db.k*amt; if(c>0) cSrc[i.name] = (cSrc[i.name]||0) + c; if(p>0) pSrc[i.name] = (pSrc[i.name]||0) + p; if(f>0) fSrc[i.name] = (fSrc[i.name]||0) + f; } }); } }); } let cKcal = tC * 4, pKcal = tP * 4, fKcal = tF * 9; let totCalc = cKcal + pKcal + fKcal; let cPct = totCalc > 0 ? Math.round((cKcal / totCalc) * 100) : 0; let pPct = totCalc > 0 ? Math.round((pKcal / totCalc) * 100) : 0; let fPct = totCalc > 0 ? Math.round((fKcal / totCalc) * 100) : 0; document.getElementById('dash-kcal').innerText = Math.round(tK).toLocaleString(); document.getElementById('dash-carbs').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-amber-500">${tC.toFixed(1)}g</span> <span class="text-sm sm:text-base text-amber-400/80 font-bold ml-1">(${cPct}%)</span>`; document.getElementById('dash-protein').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-emerald-400">${tP.toFixed(1)}g</span> <span class="text-sm sm:text-base text-emerald-400/80 font-bold ml-1">(${pPct}%)</span>`; document.getElementById('dash-fat').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-sky-400">${tF.toFixed(1)}g</span> <span class="text-sm sm:text-base text-sky-400/80 font-bold ml-1">(${fPct}%)</span>`; document.getElementById('sticky-kcal').innerText = Math.round(tK).toLocaleString(); document.getElementById('sticky-carbs').innerHTML = `${tC.toFixed(1)}g <span class="text-[10px] font-bold">(${cPct}%)</span>`; document.getElementById('sticky-protein').innerHTML = `${tP.toFixed(1)}g <span class="text-[10px] font-bold">(${pPct}%)</span>`; document.getElementById('sticky-fat').innerHTML = `${tF.toFixed(1)}g <span class="text-[10px] font-bold">(${fPct}%)</span>`; if (!state.pieChartInstance && document.getElementById('chart-pie-macros')) { state.pieChartInstance = new Chart(document.getElementById('chart-pie-macros').getContext('2d'), { type: 'doughnut', data: { labels: ['탄수화물', '단백질', '지방'], datasets: [{ data: [tC, tP, tF], backgroundColor: ['#F59E0B', '#10B981', '#0EA5E9'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 14 } } } } } }); } else if (state.pieChartInstance) { state.pieChartInstance.data.datasets[0].data = [tC, tP, tF]; state.pieChartInstance.update(); } renderAnalysisDetails(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc); }
export function renderAnalysisDetails(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc) { if (!document.getElementById('src-total-c')) return; document.getElementById('src-total-c').innerText = `${tC.toFixed(1)}g (${cPct}%)`; document.getElementById('src-total-p').innerText = `${tP.toFixed(1)}g (${pPct}%)`; document.getElementById('src-total-f').innerText = `${tF.toFixed(1)}g (${fPct}%)`; const renderList = (srcObj, total, elId, colorCls) => { let html = ''; let sorted = Object.entries(srcObj).sort((a,b)=>b[1]-a[1]); sorted.forEach(([name, amt]) => { let pct = total > 0 ? Math.round((amt/total)*100) : 0; html += `<div class="mb-3"><div class="flex justify-between text-xs text-slate-300 mb-1"><span>${name}</span><span>${amt.toFixed(1)}g (${pct}%)</span></div><div class="w-full bg-slate-800 rounded-full h-2"><div class="bg-${colorCls} h-2 rounded-full" style="width: ${pct}%"></div></div></div>`; }); document.getElementById(elId).innerHTML = html; }; renderList(cSrc, tC, 'src-list-c', 'amber-500'); renderList(pSrc, tP, 'src-list-p', 'emerald-500'); renderList(fSrc, tF, 'src-list-f', 'sky-500'); }
export function initCalcDropdowns() { const cDrop = document.getElementById('calc-carb-src'); const pDrop = document.getElementById('calc-pro-src'); const fDrop = document.getElementById('calc-fat-src'); if(!cDrop) return; cDrop.innerHTML = ''; pDrop.innerHTML = ''; fDrop.innerHTML = ''; state.foodCategories['탄수화물'].forEach(f => cDrop.innerHTML += `<option value="${f}">${f}</option>`); state.foodCategories['단백질'].forEach(f => pDrop.innerHTML += `<option value="${f}">${f}</option>`); state.foodCategories['지방'].forEach(f => { if(state.foodDB[f].f > 0.1) fDrop.innerHTML += `<option value="${f}">${f}</option>`; }); cDrop.value = '백미'; pDrop.value = '닭가슴살(익힘)'; fDrop.value = '아몬드'; }
export function runSmartCalc(type) { if(!document.getElementById(`calc-${type}-src`)) return; let src = document.getElementById(`calc-${type}-src`).value; let amt = parseFloat(document.getElementById(`calc-${type}-amt`).value) || 0; let targetMacro = 0; let resHtml = ''; if(type === 'carb') { targetMacro = amt * state.foodDB[src].c; state.foodCategories['탄수화물'].forEach(f => { if(f !== src && state.foodDB[f].c > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].c)}g</span></div>`; } }); } else if(type === 'pro') { targetMacro = amt * state.foodDB[src].p; state.foodCategories['단백질'].forEach(f => { if(f !== src && state.foodDB[f].p > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].p)}g</span></div>`; } }); } else if(type === 'fat') { targetMacro = amt * state.foodDB[src].f; state.foodCategories['지방'].forEach(f => { if(f !== src && state.foodDB[f].f > 0.1) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].f)}g</span></div>`; } }); } document.getElementById(`calc-${type}-res`).innerHTML = resHtml; }
export function switchMainTab(tabId) { document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden')); document.getElementById(tabId).classList.remove('hidden'); const tabs = ['tab-timeline', 'tab-calculator', 'tab-analysis']; tabs.forEach(t => { if(document.getElementById('btn-' + t)) document.getElementById('btn-' + t).className = (t === tabId) ? "px-5 py-3 rounded-xl text-base font-bold active-tab shrink-0" : "px-5 py-3 rounded-xl text-base font-bold border border-slate-800 text-slate-400 hover:text-white shrink-0"; }); if(tabId === 'tab-analysis') calculateMacros(); }
export function openProfileModal() { document.getElementById('mod-weight-user').value=state.userInfo.weight; document.getElementById('mod-height').value=state.userInfo.height; document.getElementById('mod-bf').value=state.userInfo.targetBF; document.getElementById('mod-date').value=state.userInfo.targetDate; document.getElementById('profile-modal').classList.remove('hidden'); document.getElementById('profile-modal').classList.add('flex'); }
export function closeProfileModal() { document.getElementById('profile-modal').classList.add('hidden'); document.getElementById('profile-modal').classList.remove('flex'); }
export function saveProfileModal() { state.userInfo = { weight: parseFloat(document.getElementById('mod-weight-user').value)||72.5, height: parseFloat(document.getElementById('mod-height').value)||173, targetBF: parseFloat(document.getElementById('mod-bf').value)||4.0, targetDate: document.getElementById('mod-date').value }; closeProfileModal(); triggerSave(showToast); finishInit(); }
export function renderCustomSupps() { const container = document.getElementById('custom-supp-list'); if(!container) return; container.innerHTML = ''; state.customSupps.forEach((supp, idx) => { container.innerHTML += ` <div class="bg-slate-900 border border-slate-700 p-4 sm:p-5 rounded-xl flex flex-col gap-4"> <div class="flex items-center gap-3"> <input type="text" id="supp-name-${idx}" value="${supp.name}" placeholder="보충제 명칭" class="flex-1 bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-bold focus:border-sky-500 outline-none text-base"> <button onclick="window.removeCustomSupp(${idx})" class="w-12 h-12 flex justify-center items-center bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-lg hover:bg-rose-500/20 transition-colors shrink-0" title="삭제"><span class="text-xl font-black">✕</span></button> </div> <div class="grid grid-cols-2 gap-3 text-sm"> <div class="flex items-center justify-between"><span class="text-slate-400">중량(g)</span><input type="number" id="supp-wt-${idx}" value="${supp.weight}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div> <div class="flex items-center justify-between"><span class="text-slate-400">Kcal</span><input type="number" id="supp-k-${idx}" value="${supp.kcal}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div> <div class="flex items-center justify-between"><span class="text-amber-500">탄(g)</span><input type="number" step="0.1" id="supp-c-${idx}" value="${supp.carbs}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div> <div class="flex items-center justify-between"><span class="text-emerald-500">단(g)</span><input type="number" step="0.1" id="supp-p-${idx}" value="${supp.protein}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div> <div class="flex items-center justify-between"><span class="text-sky-500">지(g)</span><input type="number" step="0.1" id="supp-f-${idx}" value="${supp.fat}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div> </div> </div>`; }); }
export function openMacroModal() { renderCustomSupps(); document.getElementById('macro-modal').classList.remove('hidden'); document.getElementById('macro-modal').classList.add('flex'); }
export function closeMacroModal() { document.getElementById('macro-modal').classList.add('hidden'); document.getElementById('macro-modal').classList.remove('flex'); }
export function addCustomSuppForm() { state.customSupps.push({ id: Date.now(), name: '새 보충제', weight: 30, kcal: 120, carbs: 3, protein: 20, fat: 1.5 }); renderCustomSupps(); }
export function removeCustomSupp(idx) { state.customSupps.splice(idx, 1); renderCustomSupps(); }
export function saveMacroModal() { let updatedSupps = []; for(let i=0; i<state.customSupps.length; i++) { let n = document.getElementById(`supp-name-${i}`).value || '보충제'+i; updatedSupps.push({ id: state.customSupps[i].id, name: n, weight: parseFloat(document.getElementById(`supp-wt-${i}`).value)||30, kcal: parseFloat(document.getElementById(`supp-k-${i}`).value)||0, carbs: parseFloat(document.getElementById(`supp-c-${i}`).value)||0, protein: parseFloat(document.getElementById(`supp-p-${i}`).value)||0, fat: parseFloat(document.getElementById(`supp-f-${i}`).value)||0 }); } state.customSupps = updatedSupps; applyCustomSuppsToDB(); closeMacroModal(); triggerSave(showToast); loadPhase(state.currentPhaseId); }

initializeFirebase((success) => {
    const statusEl = document.getElementById('cloud-status');
    if(statusEl) statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10B981]"></span> LOCAL AUTOSAVE ACTIVE';
    finishInit();
});

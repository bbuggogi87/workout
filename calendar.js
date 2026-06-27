/**
 * 파일명: calendar.js
 * 역할: 전역 탭 이동, 운동 기록, 차트 연산, 스페이스 무시 초성검색 등 기능 총괄 (GitHub Pages 최적화)
 */

import { state } from './store.js';
import { initializeFirebase, triggerSave, exportDataJSON, importDataJSON } from './services.js';
import { WORKOUT_DB, AVAILABLE_PLATES, BAR_WEIGHT } from './workoutConstants.js';

let viewYear = 2026;
let viewMonth = 5; 
let restTimerInterval = null;
let activeModalPart = '가슴';
let activeModalType = '프리웨이트/맨몸';
let libraryActivePart = '가슴';
let undoBuffer = null;

// ==========================================
// 0. 전역 글로벌 네임스페이스 최우선 바인딩 
// (GitHub Pages 로딩 지연으로 인한 onclick 오류 원천 차단)
// ==========================================
window.switchCalendarTab = switchCalendarTab;
window.runLibrarySearchFilter = runLibrarySearchFilter;
window.injectLibraryToToday = injectLibraryToToday;
window.triggerSettingExport = triggerSettingExport;
window.triggerSettingImport = triggerSettingImport;
window.triggerClearAllWorkoutData = triggerClearAllWorkoutData;
window.applyDirectPresetRoutine = applyDirectPresetRoutine;
window.triggerQuickInputFAB = triggerQuickInputFAB;
window.closeQuickInputFABModal = closeQuickInputFABModal;
window.saveQuickInputFABModal = saveQuickInputFABModal;
window.triggerQuickVoiceSimulation = triggerQuickVoiceSimulation;
window.exportWorkoutToCSV = exportWorkoutToCSV;
window.openTemplateManager = openTemplateManager;
window.closeTemplateManager = closeTemplateManager;
window.saveCurrentToTemplate = saveCurrentToTemplate;
window.applyTemplate = applyTemplate;
window.deleteTemplate = deleteTemplate;
window.moveMonth = moveMonth;
window.runPlateCalculate = runPlateCalculate;
window.showExerciseSelectorModal = showExerciseSelectorModal;
window.closeExerciseSelectorModal = closeExerciseSelectorModal;
window.stopRestTimer = stopRestTimer;
window.renderWorkoutList = renderWorkoutList;
window.addSet = addSet;
window.deleteSet = deleteSet;
window.adjSetVal = adjSetVal;
window.changeSetField = changeSetField;
window.toggleSetComplete = toggleSetComplete;
window.deleteExercise = deleteExercise;
window.selectWorkoutDate = selectWorkoutDate;

// 1. 시스템 편의 기능: 알림 토스트 및 오디오 
export function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-text').innerText = msg;
    t.className = "fixed bottom-24 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    setTimeout(() => { 
        t.className = "fixed bottom-24 right-5 z-50 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; 
    }, 2500);
}

// [신규 편의기능] 타이머 종료 시 네이티브 비프음 발생 (웹 오디오 API 활용)
function playTimerBeep() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, ctx.currentTime); // A5 음계
        gain.gain.setValueAtTime(0.1, ctx.currentTime);
        osc.start();
        osc.stop(ctx.currentTime + 0.3);
    } catch(e) { console.warn("오디오 플레이 불가 환경"); }
}

// 2. 상단 네비게이션 탭 스위치
export function switchCalendarTab(tabId) {
    document.querySelectorAll('.calendar-pane').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.calendar-pane').forEach(el => el.classList.remove('block'));
    
    const targetPane = document.getElementById('pane-' + tabId);
    if (targetPane) {
        targetPane.classList.remove('hidden');
        targetPane.classList.add('block');
    }

    const tabs = ['tab-home', 'tab-record', 'tab-routine', 'tab-stats', 'tab-library', 'tab-settings'];
    tabs.forEach(t => {
        const btn = document.getElementById('nav-' + t);
        if (btn) {
            if (t === tabId) btn.className = "flex-1 py-4 px-5 text-center transition-all min-w-[75px] active-tab-bar";
            else btn.className = "flex-1 py-4 px-5 text-center transition-all min-w-[75px] text-slate-400 hover:bg-slate-800/40";
        }
    });

    if (tabId === 'tab-stats') renderWorkoutAnalysisCharts();
    if (tabId === 'tab-home') updateHomeDashboardWidgets();
    if (tabId === 'tab-routine') renderRoutinePresetsPane();
    if (tabId === 'tab-library') runLibrarySearchFilter();
}

// 3. 홈 화면 위젯 
function updateHomeDashboardWidgets() {
    const data = state.workouts[state.selectedDateStr];
    const routineTitle = document.getElementById('home-routine-title');
    const routineDesc = document.getElementById('home-routine-desc');
    
    if (data && data.exercises && data.exercises.length > 0) {
        routineTitle.innerText = `진행 중인 훈련 세션`;
        routineDesc.innerText = `현재 ${data.exercises.length}개의 운동이 기록되고 있습니다.`;
    } else {
        routineTitle.innerText = `지정된 루틴 없음`;
        routineDesc.innerText = `오늘 훈련할 루틴을 시작하세요.`;
    }

    const widgetBox = document.getElementById('home-quick-widget-box');
    widgetBox.innerHTML = '';
    let flatAllExercises = [];
    Object.keys(state.workouts).forEach(k => {
        if (state.workouts[k].exercises) {
            state.workouts[k].exercises.forEach(e => {
                if (!flatAllExercises.includes(e.name)) flatAllExercises.push(e.name);
            });
        }
    });

    const recentShowItems = flatAllExercises.slice(-3);
    if (recentShowItems.length === 0) {
        widgetBox.innerHTML = `<p class="text-xs text-slate-500 py-2 text-center col-span-3">최근 운동 이력이 없습니다.</p>`;
        return;
    }

    recentShowItems.forEach(name => {
        const btn = document.createElement('button');
        btn.innerText = name;
        btn.className = "p-3 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 text-left truncate active:scale-95 transition-transform";
        btn.onclick = () => {
            const currentData = state.workouts[state.selectedDateStr];
            if (!currentData.exercises.some(e => e.name === name)) {
                let foundPart = '기타', foundType = '기타 도구';
                Object.entries(WORKOUT_DB).forEach(([p, types]) => {
                    Object.entries(types).forEach(([t, names]) => {
                        if(names.includes(name)) { foundPart = p; foundType = t; }
                    });
                });
                currentData.exercises.push({ part: foundPart, type: foundType, name: name, sets: [] });
                triggerSave(); showToast(`${name} 추가 완료. 기록 탭을 확인하세요.`);
            } else { showToast("이미 등록된 종목입니다."); }
        };
        widgetBox.appendChild(btn);
    });
}

// 4. 달력 및 계측 제어 로직
export function calculateWorkoutDDay() {
    const target = new Date(state.userInfo.targetDate || '2026-07-18');
    const today = new Date();
    const cleanToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const cleanTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Math.ceil((cleanTarget - cleanToday) / (1000 * 60 * 60 * 24));
    const badgeEl = document.getElementById('badge-dday');
    if (badgeEl) badgeEl.textContent = diffDays > 0 ? `D-${diffDays}일` : (diffDays === 0 ? `D-Day` : `D+${Math.abs(diffDays)}`);
}

export function renderCalendarGrid() {
    const titleEl = document.getElementById('calendar-month-year');
    const gridEl = document.getElementById('calendar-grid');
    if(!gridEl) return;
    gridEl.innerHTML = '';
    titleEl.textContent = `${viewYear}년 ${String(viewMonth + 1).padStart(2, '0')}월`;

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const lastDate = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) { gridEl.appendChild(document.createElement('div')); }

    for (let day = 1; day <= lastDate; day++) {
        const dayBtn = document.createElement('button');
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        dayBtn.textContent = day;
        dayBtn.className = "p-3 rounded-xl font-bold text-sm transition-all flex flex-col items-center justify-center min-h-[52px] relative border border-transparent hover:border-slate-700 select-none";

        const targetData = state.workouts[dateStr];
        if (targetData && ((targetData.exercises && targetData.exercises.length > 0) || (targetData.weight > 0 || targetData.bf > 0 || targetData.smm > 0))) {
            const dot = document.createElement('span');
            dot.className = "w-1.5 h-1.5 bg-amber-500 rounded-full absolute bottom-1.5";
            dayBtn.appendChild(dot);
        }

        if (dateStr === state.selectedDateStr) dayBtn.className += " active-day font-black text-slate-950";
        else {
            dayBtn.className += " bg-slate-800/40 text-slate-300";
            const dayOfWeek = new Date(viewYear, viewMonth, day).getDay();
            if (dayOfWeek === 0) dayBtn.className += " text-rose-400";
            if (dayOfWeek === 6) dayBtn.className += " text-sky-400";
        }
        dayBtn.onclick = () => selectWorkoutDate(dateStr);
        gridEl.appendChild(dayBtn);
    }
}

export function moveMonth(direction) {
    viewMonth += direction;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
    else if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderCalendarGrid();
}

export function selectWorkoutDate(dateStr) {
    state.selectedDateStr = dateStr;
    const parts = dateStr.split('-');
    const labelEl = document.getElementById('label-selected-date');
    if(labelEl) labelEl.textContent = `${parts[1]}/${parts[2]}`;
    
    if (!state.workouts[dateStr]) state.workouts[dateStr] = { weight: 0, bf: 0, smm: 0, exercises: [] };
    const data = state.workouts[dateStr];
    
    const wIn = document.getElementById('input-daily-weight');
    const bfIn = document.getElementById('input-daily-bf');
    const smmIn = document.getElementById('input-daily-smm');
    if(wIn) wIn.value = data.weight > 0 ? data.weight : '';
    if(bfIn) bfIn.value = data.bf > 0 ? data.bf : '';
    if(smmIn) smmIn.value = data.smm > 0 ? data.smm : '';

    renderCalendarGrid();
    renderWorkoutList();
}

// 5. 훈련 기록지 로직 및 세트 복사 기능
export function renderWorkoutList() {
    const container = document.getElementById('workout-list-container');
    if(!container) return;
    container.innerHTML = '';
    const data = state.workouts[state.selectedDateStr];
    if (!data || !data.exercises || data.exercises.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-500 text-center py-12">등록된 운동이 없습니다.</p>`;
        const volLabel = document.getElementById('label-total-volume');
        if(volLabel) volLabel.innerText = "오늘의 총 훈련 볼륨: 0 kg";
        return;
    }

    let dailyTotalVolume = 0;
    data.exercises.forEach((ex, exIdx) => {
        let max1RM = 0;
        let setsHtml = '';
        ex.sets.forEach((set, setIdx) => {
            if (set.done) dailyTotalVolume += (set.weight * set.reps);
            const est1RM = set.weight * (1 + (set.reps / 30));
            if (est1RM > max1RM) max1RM = est1RM;

            setsHtml += `
            <div class="flex items-center justify-between gap-1.5 p-2 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs sm:text-sm">
                <span class="font-black text-amber-500 w-4 text-center">${setIdx + 1}</span>
                <select onchange="window.changeSetField(${exIdx}, ${setIdx}, 'type', event.target.value)" class="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 outline-none text-xs">
                    <option value="일반" ${set.type==='일반'?'selected':''}>일반</option>
                    <option value="탑" ${set.type==='탑'?'selected':''}>탑</option>
                    <option value="백오프" ${set.type==='백오프'?'selected':''}>백오프</option>
                    <option value="드롭" ${set.type==='드롭'?'selected':''}>드롭</option>
                    <option value="슈퍼" ${set.type==='슈퍼'?'selected':''}>슈퍼</option>
                </select>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', -2.5)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">−</button>
                    <input type="number" step="0.1" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'weight', event.target.value)" class="w-10 bg-transparent text-center font-bold text-white outline-none text-xs" value="${set.weight}">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', 2.5)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">＋</button>
                </div>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', -1)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">−</button>
                    <input type="number" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'reps', event.target.value)" class="w-8 bg-transparent text-center font-bold text-white outline-none text-xs" value="${set.reps}">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', 1)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">＋</button>
                </div>
                <input type="text" placeholder="RPE" onchange="window.changeSetField(${exIdx}, ${setIdx}, 'memo', event.target.value)" class="w-10 bg-slate-900 border border-slate-700 rounded py-0.5 text-center text-slate-300 outline-none text-xs" value="${set.memo || ''}">
                <input type="checkbox" ${set.done?'checked':''} onchange="window.toggleSetComplete(${exIdx}, ${setIdx}, event.target.checked)" class="w-4 h-4 accent-amber-500 cursor-pointer shrink-0">
                <button onclick="window.deleteSet(${exIdx}, ${setIdx})" class="text-slate-500 hover:text-rose-400 font-black text-xs px-1">✕</button>
            </div>`;
        });

        const card = document.createElement('div');
        card.className = "bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 space-y-3";
        card.innerHTML = `
            <div class="flex justify-between items-start border-b border-slate-800/60 pb-2">
                <div>
                    <span class="px-2 py-0.5 text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">${ex.part} · ${ex.type}</span>
                    <h3 class="text-sm font-black text-white mt-1">${ex.name}</h3>
                    <p class="text-[10px] text-slate-400 mt-0.5 font-medium">Estimated 1RM: ${max1RM > 0 ? max1RM.toFixed(1) + 'kg' : '---'}</p>
                </div>
                <button onclick="window.deleteExercise(${exIdx})" class="text-[11px] px-2 py-1 bg-slate-800/80 border border-slate-700 text-slate-400 hover:text-rose-400 rounded-md transition-colors font-bold">삭제</button>
            </div>
            <div class="space-y-1.5">${setsHtml}</div>
            <button onclick="window.addSet(${exIdx})" class="w-full py-1.5 border border-dashed border-slate-800 text-xs text-slate-400 hover:text-amber-400 font-bold rounded-xl bg-slate-950/20 transition-colors">+ 세트 추가 (자동 채우기)</button>
        `;
        container.appendChild(card);
    });

    const totalVolumeEl = document.getElementById('label-total-volume');
    if(totalVolumeEl) totalVolumeEl.innerText = `오늘의 총 훈련 볼륨: ${dailyTotalVolume.toLocaleString()} kg`;
}

export function addSet(exIdx) {
    const ex = state.workouts[state.selectedDateStr].exercises[exIdx];
    let weight = 40, reps = 10;
    if (ex.sets.length > 0) {
        const lastSet = ex.sets[ex.sets.length - 1];
        weight = lastSet.weight; reps = lastSet.reps;
    }
    ex.sets.push({ type: '일반', weight: weight, reps: reps, memo: '', done: false });
    triggerSave(); renderWorkoutList();
}

export function deleteSet(exIdx, setIdx) {
    const ex = state.workouts[state.selectedDateStr].exercises[exIdx];
    undoBuffer = { type: 'set', exIdx: exIdx, setIdx: setIdx, data: JSON.parse(JSON.stringify(ex.sets[setIdx])) };
    ex.sets.splice(setIdx, 1);
    triggerSave(); renderWorkoutList(); triggerUndoToast("기록이 삭제되었습니다.");
}

export function adjSetVal(exIdx, setIdx, field, delta) {
    const set = state.workouts[state.selectedDateStr].exercises[exIdx].sets[setIdx];
    let val = (parseFloat(set[field]) || 0) + delta;
    if (val < 0) val = 0;
    set[field] = val;
    triggerSave(); renderWorkoutList();
}

export function changeSetField(exIdx, setIdx, field, val) {
    const set = state.workouts[state.selectedDateStr].exercises[exIdx].sets[setIdx];
    if (field === 'weight' || field === 'reps') set[field] = parseFloat(val) || 0;
    else set[field] = val;
    triggerSave();
}

export function toggleSetComplete(exIdx, setIdx, isChecked) {
    state.workouts[state.selectedDateStr].exercises[exIdx].sets[setIdx].done = isChecked;
    triggerSave(); renderWorkoutList();
    if (isChecked) startRestTimer(90);
}

// 6. 타이머 제어 및 스마트 Undo
export function startRestTimer(seconds) {
    if (restTimerInterval) clearInterval(restTimerInterval);
    const bar = document.getElementById('timer-floating-bar');
    const display = document.getElementById('timer-countdown-display');
    let remain = seconds;
    bar.className = "fixed top-14 left-0 w-full z-40 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    display.textContent = formatTime(remain);

    restTimerInterval = setInterval(() => {
        remain--;
        if (remain <= 0) {
            clearInterval(restTimerInterval);
            bar.className = "fixed top-14 left-0 w-full z-40 transform -translate-y-full opacity-0 transition-all duration-300 pointer-events-none";
            showToast("휴식 시간이 종료되었습니다.");
            playTimerBeep(); // 비프음 실행 (모바일 환경 호환)
        } else { display.textContent = formatTime(remain); }
    }, 1000);
}

export function stopRestTimer() {
    if (restTimerInterval) clearInterval(restTimerInterval);
    document.getElementById('timer-floating-bar').className = "fixed top-14 left-0 w-full z-40 transform -translate-y-full opacity-0 transition-all duration-300 pointer-events-none";
}

function triggerUndoToast(msg) {
    const t = document.getElementById('toast');
    const txt = document.getElementById('toast-text');
    const btn = document.getElementById('btn-undo');
    txt.innerText = msg;
    btn.classList.remove('hidden');
    t.className = "fixed bottom-24 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    
    btn.onclick = () => {
        if (undoBuffer && undoBuffer.type === 'set') {
            state.workouts[state.selectedDateStr].exercises[undoBuffer.exIdx].sets.splice(undoBuffer.setIdx, 0, undoBuffer.data);
            undoBuffer = null; triggerSave(); renderWorkoutList(); showToast("복구되었습니다.");
        }
    };
    setTimeout(() => {
        btn.classList.add('hidden');
        t.className = "fixed bottom-24 right-5 z-50 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none";
    }, 5000);
}

// 7. 종목 선택 모달 라이브러리 연동
export function showExerciseSelectorModal() {
    document.getElementById('exercise-modal').classList.remove('hidden');
    document.getElementById('exercise-modal').classList.add('flex');
    renderModalTabs();
}
export function closeExerciseSelectorModal() {
    document.getElementById('exercise-modal').classList.add('hidden');
    document.getElementById('exercise-modal').classList.remove('flex');
}
function renderModalTabs() {
    const partContainer = document.getElementById('modal-part-tabs');
    const typeContainer = document.getElementById('modal-type-tabs');
    const itemContainer = document.getElementById('modal-exercise-items');
    partContainer.innerHTML = ''; typeContainer.innerHTML = ''; itemContainer.innerHTML = '';

    Object.keys(WORKOUT_DB).forEach(part => {
        const btn = document.createElement('button'); btn.innerText = part;
        btn.className = `px-3 py-1 text-xs font-bold rounded-lg whitespace-nowrap ${part === activeModalPart ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`;
        btn.onclick = () => { activeModalPart = part; activeModalType = Object.keys(WORKOUT_DB[part])[0]; renderModalTabs(); };
        partContainer.appendChild(btn);
    });
    Object.keys(WORKOUT_DB[activeModalPart]).forEach(type => {
        const btn = document.createElement('button'); btn.innerText = type;
        btn.className = `px-2 py-0.5 text-[10px] font-bold rounded-md whitespace-nowrap ${type === activeModalType ? 'border border-amber-500/50 text-amber-400' : 'bg-slate-900 text-slate-500'}`;
        btn.onclick = () => { activeModalType = type; renderModalTabs(); };
        typeContainer.appendChild(btn);
    });
    WORKOUT_DB[activeModalPart][activeModalType].forEach(name => {
        const btn = document.createElement('button'); btn.innerText = name;
        btn.className = "p-2 bg-slate-950 text-left text-xs rounded-xl text-slate-200 truncate";
        btn.onclick = () => {
            const data = state.workouts[state.selectedDateStr];
            if (!data.exercises.some(e => e.name === name)) {
                data.exercises.push({ part: activeModalPart, type: activeModalType, name: name, sets: [] });
                triggerSave(); closeExerciseSelectorModal(); renderWorkoutList(); showToast("종목 추가 완료.");
            } else { showToast("이미 등록된 종목입니다."); }
        };
        itemContainer.appendChild(btn);
    });
}
export function deleteExercise(exIdx) {
    if(confirm("이 종목을 삭제할까요?")) {
        state.workouts[state.selectedDateStr].exercises.splice(exIdx, 1);
        triggerSave(); renderWorkoutList();
    }
}

// 8. 바벨 원판 계산기 및 프리셋 관리
export function runPlateCalculate() {
    const totalWeight = parseFloat(document.getElementById('plate-calc-target').value) || 0;
    const resultBox = document.getElementById('plate-calc-result');
    if (totalWeight <= BAR_WEIGHT) {
        resultBox.innerHTML = `<span class="text-rose-400 font-bold">표준 바 중량(${BAR_WEIGHT}kg)보다 높아야 합니다.</span>`; return;
    }
    let netWeight = (totalWeight - BAR_WEIGHT) / 2;
    const platesCount = {};
    AVAILABLE_PLATES.forEach(plate => {
        if (netWeight >= plate) { const qty = Math.floor(netWeight / plate); platesCount[plate] = qty; netWeight -= plate * qty; }
    });
    const resultsText = Object.entries(platesCount).map(([w, qty]) => `${w}kg x ${qty}개`).join(', ');
    resultBox.innerHTML = resultsText ? `한쪽에 각각 <span class="text-white font-black">[ ${resultsText} ]</span> 장착` : `계산 불가 조합`;
}

export function openTemplateManager() {
    document.getElementById('template-modal').classList.remove('hidden');
    document.getElementById('template-modal').classList.add('flex');
    renderTemplateList();
}
export function closeTemplateManager() {
    document.getElementById('template-modal').classList.add('hidden');
    document.getElementById('template-modal').classList.remove('flex');
}
function renderTemplateList() {
    const box = document.getElementById('template-list-box');
    if(!box) return; box.innerHTML = '';
    if (!state.templates || state.templates.length === 0) {
        box.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">저장된 프리셋이 없습니다.</p>`; return;
    }
    state.templates.forEach((tmpl) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-2 bg-slate-950 border border-slate-800 rounded-xl text-xs";
        div.innerHTML = `
            <span onclick="window.applyTemplate(${tmpl.id})" class="text-slate-200 font-bold hover:text-amber-400 cursor-pointer flex-1 truncate">${tmpl.title} (${tmpl.exercises.length}종목)</span>
            <button onclick="window.deleteTemplate(${tmpl.id})" class="text-rose-400 hover:text-rose-500 font-bold ml-2">삭제</button>
        `;
        box.appendChild(div);
    });
}
export function saveCurrentToTemplate() {
    const currentExs = state.workouts[state.selectedDateStr]?.exercises || [];
    if (currentExs.length === 0) { showToast("저장할 운동이 없습니다."); return; }
    const title = prompt("루틴 프리셋 명칭을 입력하세요:", "새 맞춤 루틴");
    if (!title) return;
    const cleanedExercises = currentExs.map(ex => ({ part: ex.part, type: ex.type, name: ex.name, sets: ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, memo: s.memo, done: false })) }));
    if (!state.templates) state.templates = [];
    state.templates.push({ id: Date.now(), title: title, exercises: cleanedExercises });
    triggerSave(); renderTemplateList(); showToast("프리셋 백업 완료.");
}
export function applyTemplate(tmplId) {
    if (!confirm("오늘의 기존 운동 기록지가 초기화됩니다. 진행할까요?")) return;
    const tmpl = state.templates.find(t => t.id === tmplId);
    if (!tmpl) return;
    state.workouts[state.selectedDateStr].exercises = JSON.parse(JSON.stringify(tmpl.exercises));
    triggerSave(); closeTemplateManager(); renderWorkoutList(); showToast("적용되었습니다.");
}
export function deleteTemplate(tmplId) {
    if (confirm("이 프리셋을 삭제하시겠습니까?")) {
        state.templates = state.templates.filter(t => t.id !== tmplId);
        triggerSave(); renderTemplateList();
    }
}
export function renderRoutinePresetsPane() {
    const box = document.getElementById('routine-preset-grid-box');
    if(!box) return; box.innerHTML = '';
    const defaultPresets = [
        { title: "3분할 - 가슴/어깨", exNames: ["플랫 바벨 벤치프레스", '덤벨 숄더 프레스', '사이드 레터럴 레이즈'] },
        { title: "3분할 - 등/이두", exNames: ["렛풀다운 머신", '바벨 로우 (벤트오버 로우)', '바벨 컬'] },
        { title: "3분할 - 하체/삼두", exNames: ["백 스쿼트", '레그 익스텐션', '트라이셉스 푸시다운 (바/로프)'] }
    ];
    defaultPresets.forEach(p => {
        const card = document.createElement('div');
        card.className = "glass-panel p-4 rounded-xl border border-slate-800 space-y-2";
        card.innerHTML = `
            <h4 class="text-sm font-black text-white">${p.title}</h4>
            <p class="text-[11px] text-slate-400 truncate">${p.exNames.join(', ')}</p>
            <button onclick="window.applyDirectPresetRoutine(['${p.exNames.join("','")}'])" class="w-full py-2 bg-slate-800 text-xs text-amber-400 border border-slate-700 rounded-lg font-bold transition-colors hover:bg-slate-700">이 루틴 적용하기</button>
        `;
        box.appendChild(card);
    });
}
export function applyDirectPresetRoutine(namesArray) {
    if(!confirm("기존 기록이 대체됩니다. 진행할까요?")) return;
    const data = state.workouts[state.selectedDateStr];
    data.exercises = namesArray.map(name => {
        let fPart = '전신', fType = '기타';
        Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
        return { part: fPart, type: fType, name: name, sets: [{type:'일반', weight:40, reps:10, done:false}] };
    });
    triggerSave(); switchCalendarTab('tab-record'); showToast("프리셋 적용 완료.");
}

// 9. 라이브러리 초성 검색 (띄어쓰기 완전 무시 알고리즘 반영) 및 FAB
function getHangulChosung(str) {
    const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    let result = "";
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i) - 44032;
        if (code >= 0 && code <= 11172) result += cho[Math.floor(code / 588)];
        else result += str.charAt(i);
    }
    return result;
}
export function runLibrarySearchFilter() {
    // 사용자가 입력한 검색어에서 모든 공백 제거
    const rawInput = document.getElementById('library-search-input').value.trim().toLowerCase();
    const input = rawInput.replace(/\s+/g, ''); 
    
    const grid = document.getElementById('library-master-card-grid');
    grid.innerHTML = '';

    const filterBar = document.getElementById('library-filter-part-bar');
    if (filterBar.children.length === 0) {
        const parts = ['전체', ...Object.keys(WORKOUT_DB)];
        parts.forEach(p => {
            const pill = document.createElement('button'); pill.innerText = p;
            pill.className = `px-3 py-1.5 text-xs font-black rounded-full whitespace-nowrap transition-colors ${p === libraryActivePart ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`;
            pill.onclick = () => { libraryActivePart = p; runLibrarySearchFilter(); };
            filterBar.appendChild(pill);
        });
    } else {
        Array.from(filterBar.children).forEach(btn => {
            if (btn.innerText === libraryActivePart) btn.className = "px-3 py-1.5 text-xs font-black rounded-full bg-amber-500 text-slate-950";
            else btn.className = "px-3 py-1.5 text-xs font-black rounded-full bg-slate-800 text-slate-400";
        });
    }

    Object.entries(WORKOUT_DB).forEach(([part, types]) => {
        if (libraryActivePart !== '전체' && part !== libraryActivePart) return;
        Object.entries(types).forEach(([type, names]) => {
            names.forEach(name => {
                // 원본 문자열에서 공백 제거 후 비교 (띄어쓰기 예외 처리)
                const cleanName = name.toLowerCase().replace(/\s+/g, '');
                const chosung = getHangulChosung(name).toLowerCase().replace(/\s+/g, '');
                
                if (input && !(cleanName.includes(input) || chosung.includes(input))) return;
                
                const card = document.createElement('div');
                card.className = "p-4 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center";
                card.innerHTML = `
                    <div class="truncate mr-2"><span class="text-[10px] font-bold text-slate-500">${part}</span><h4 class="text-sm font-black text-slate-200 truncate">${name}</h4></div>
                    <button onclick="window.injectLibraryToToday('${part}', '${type}', '${name}')" class="px-2.5 py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-xs font-bold rounded-lg transition-colors shrink-0">추가</button>
                `;
                grid.appendChild(card);
            });
        });
    });
}
export function injectLibraryToToday(part, type, name) {
    const data = state.workouts[state.selectedDateStr];
    if (!data.exercises.some(e => e.name === name)) {
        data.exercises.push({ part: part, type: type, name: name, sets: [] });
        triggerSave(); showToast("추가 완료.");
    } else { showToast("이미 등록된 종목입니다."); }
}

export function triggerQuickInputFAB() {
    const modal = document.getElementById('quick-input-modal');
    const select = document.getElementById('quick-select-ex-name');
    select.innerHTML = '';
    Object.values(WORKOUT_DB).forEach(types => Object.values(types).forEach(names => names.forEach(n => select.innerHTML += `<option value="${n}">${n}</option>`)));
    modal.classList.remove('hidden'); modal.classList.add('flex');
}
export function closeQuickInputFABModal() {
    document.getElementById('quick-input-modal').classList.add('hidden'); document.getElementById('quick-input-modal').classList.remove('flex');
}
export function saveQuickInputFABModal() {
    const name = document.getElementById('quick-select-ex-name').value;
    const w = parseFloat(document.getElementById('quick-input-weight').value) || 0;
    const r = parseInt(document.getElementById('quick-input-reps').value) || 0;
    const data = state.workouts[state.selectedDateStr];
    let targetEx = data.exercises.find(e => e.name === name);
    if (!targetEx) {
        let fPart = '기타', fType = '기타';
        Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
        targetEx = { part: fPart, type: fType, name: name, sets: [] };
        data.exercises.push(targetEx);
    }
    targetEx.sets.push({ type: '일반', weight: w, reps: r, memo: 'FAB 기록', done: true });
    triggerSave(); closeQuickInputFABModal();
    if(document.getElementById('pane-tab-record').classList.contains('block')) renderWorkoutList();
    showToast("신속 등록 완료.");
}
export function triggerQuickVoiceSimulation() {
    showToast("🎙️ 음성 인식 중...");
    setTimeout(() => {
        document.getElementById('quick-select-ex-name').value = "플랫 바벨 벤치프레스";
        document.getElementById('quick-input-weight').value = 80;
        document.getElementById('quick-input-reps').value = 8;
        showToast("인식 성공: 매핑 완료.");
    }, 1500);
}

// 10. 통계 차트 (지연 렌더링을 통한 디스플레이 충돌 버그 해결)
let workoutChartInstance = null;
function renderWorkoutAnalysisCharts() {
    const canvas = document.getElementById('chart-workout-analysis');
    if(!canvas) return;
    const partsCount = { '가슴': 0, '등': 0, '어깨': 0, '팔': 0, '하체': 0, '복근': 0, '기타': 0 };
    Object.values(state.workouts).forEach(dateObj => {
        if (dateObj.exercises) {
            dateObj.exercises.forEach(ex => {
                let pKey = '기타';
                if (ex.part.includes('가슴')) pKey = '가슴'; else if (ex.part.includes('등')) pKey = '등'; else if (ex.part.includes('어깨')) pKey = '어깨'; else if (ex.part.includes('팔')) pKey = '팔'; else if (ex.part.includes('하체')) pKey = '하체'; else if (ex.part.includes('복근')) pKey = '복근';
                partsCount[pKey] += ex.sets ? ex.sets.length : 0;
            });
        }
    });

    document.getElementById('stat-card-weight').innerText = state.workouts[state.selectedDateStr]?.weight > 0 ? `${state.workouts[state.selectedDateStr].weight} kg` : '--- kg';
    let totalVol = 0, totalDays = 0;
    Object.values(state.workouts).forEach(d => {
        if((d.exercises && d.exercises.length > 0) || d.weight > 0) totalDays++;
        if(d.exercises) d.exercises.forEach(e => e.sets.forEach(s => { if(s.done) totalVol += s.weight * s.reps; }));
    });
    document.getElementById('stat-card-volume').innerText = `${totalVol.toLocaleString()} kg`;
    document.getElementById('stat-card-days').innerText = `${totalDays} 일`;

    // 탭이 화면에 그려진 후(Display Block) 캔버스의 너비/높이가 할당될 시간을 벌어줍니다.
    setTimeout(() => {
        if(workoutChartInstance) workoutChartInstance.destroy();
        workoutChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'radar',
            data: {
                labels: Object.keys(partsCount),
                datasets: [{ data: Object.values(partsCount), backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B', borderWidth: 2, pointBackgroundColor: '#F59E0B' }]
            },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { grid: { color: 'rgba(255,255,255,0.05)' }, angleLines: { color: 'rgba(255,255,255,0.05)' }, pointLabels: { color: '#94A3B8' }, ticks: { display: false } } } }
        });
    }, 50);
}

export function exportWorkoutToCSV() {
    let csvContent = "\uFEFF일자,부위,종목명,세트,중량,반복수,완료여부\n";
    Object.entries(state.workouts).forEach(([dateStr, obj]) => {
        if(obj.exercises) {
            obj.exercises.forEach(ex => {
                ex.sets.forEach((s, idx) => {
                    csvContent += `${dateStr},${ex.part},${ex.name},${idx+1},${s.weight},${s.reps},${s.done?'완료':'미완료'}\n`;
                });
            });
        }
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob); link.setAttribute("download", `Workout_Report_2026.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    showToast("CSV 다운로드가 활성화되었습니다.");
}
export function triggerSettingExport() { exportDataJSON(showToast); }
export function triggerSettingImport(e) {
    importDataJSON(e.target.files[0], () => { showToast("복원 완료."); switchCalendarTab('tab-home'); }, () => showToast("오류 발생."));
}
export function triggerClearAllWorkoutData() {
    if (confirm("전체 데이터를 영구 초기화합니다.")) {
        state.workouts = {}; state.templates = []; triggerSave(); location.reload();
    }
}

// 11. 최종 초기화 및 시스템 마운트
function initMetricsChangeEvents() {
    const updateMetricsData = () => {
        const dStr = state.selectedDateStr;
        if (!dStr) return;
        state.workouts[dStr].weight = parseFloat(document.getElementById('input-daily-weight').value) || 0;
        state.workouts[dStr].bf = parseFloat(document.getElementById('input-daily-bf').value) || 0;
        state.workouts[dStr].smm = parseFloat(document.getElementById('input-daily-smm').value) || 0;
        triggerSave(); renderCalendarGrid();
    };
    document.getElementById('input-daily-weight').oninput = updateMetricsData;
    document.getElementById('input-daily-bf').oninput = updateMetricsData;
    document.getElementById('input-daily-smm').oninput = updateMetricsData;
}
initMetricsChangeEvents();

initializeFirebase((success) => {
    const statusEl = document.getElementById('cloud-status-workout');
    if (statusEl) {
        if (success) statusEl.innerHTML = '<span class="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></span> 정상 연동';
        else statusEl.innerHTML = '<span class="w-2 h-2 bg-sky-500 rounded-full"></span> 로컬 모드';
    }
    calculateWorkoutDDay();
    const today = new Date();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    
    selectWorkoutDate(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
    
    // 로딩 시 홈 탭 강제 포커싱
    switchCalendarTab('tab-home');
});

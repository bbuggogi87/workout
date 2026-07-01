/**
 * 파일명: calendar.js
 * 역할: 훈련 일지 기록 관리, 웹 오디오 알람 신디사이징 및 독립형 팝업 에디터 총괄 통제 컨트롤러
 * 변경사항: 최하단 유령 중괄호 구문 오류 전면 제거 및 캘린더 내 체중 변경 시 체중 변화량(Δ) 연산 동기화 적용 완료
 */

import { state, recalculateAllWeightDeltas } from './store.js';
import { initializeFirebase, triggerSave, importDataJSON, saveToLocal } from './services.js';
import { WORKOUT_DB, AVAILABLE_PLATES, BAR_WEIGHT, RECOMMENDED_ROUTINES } from './workoutConstants.js';

let viewYear = 2026;
let viewMonth = 5; 
let restTimerInterval = null;
let alarmAudioInterval = null;
let libraryActivePart = '가슴';
let libraryActiveType = '전체'; 
let undoBuffer = null;
let currentTimerSeconds = 0;
let currentAlarmSound = '1';

let chartBalance = null;
let chartVolume = null;
let chartWeight = null;

// ==========================================
// 브라우저 전역 윈도우 (window) 네임스페이스 바인딩
// ==========================================
window.switchCalendarTab = switchCalendarTab;
window.runLibrarySearchFilter = runLibrarySearchFilter;
window.injectLibraryToToday = injectLibraryToToday;
window.triggerSettingExport = triggerSettingExport;
window.triggerSettingImport = triggerSettingImport;
window.triggerClearAllWorkoutData = triggerClearAllWorkoutData;
window.exportWorkoutToCSV = exportWorkoutToCSV;
window.openTemplateManager = openTemplateManager;
window.closeTemplateManager = closeTemplateManager;
window.applyTemplate = applyTemplate;
window.deleteTemplate = deleteTemplate;
window.openSaveRoutineModal = openSaveRoutineModal;
window.closeSaveRoutineModal = closeSaveRoutineModal;
window.confirmSaveRoutine = confirmSaveRoutine;
window.applyDirectPresetRoutine = applyDirectPresetRoutine;
window.moveMonth = moveMonth;
window.runPlateCalculate = runPlateCalculate;
window.stopRestTimer = stopRestTimer;
window.extendRestTimer = extendRestTimer;
window.startGlobalAlarm = startGlobalAlarm;
window.renderWorkoutList = renderWorkoutList;
window.addSet = addSet;
window.deleteSet = deleteSet;
window.adjSetVal = adjSetVal;
window.changeSetField = changeSetField;
window.toggleSetComplete = toggleSetComplete;
window.deleteExercise = deleteExercise;
window.selectWorkoutDate = selectWorkoutDate;
window.openRestTimerModal = openRestTimerModal;
window.closeRestTimerModal = closeRestTimerModal;
window.saveRestTimerModal = saveRestTimerModal;
window.adjRestTimerSetting = adjRestTimerSetting;
window.openLibraryModal = openLibraryModal;
window.closeLibraryModal = closeLibraryModal;
window.saveSystemSettings = saveSystemSettings;
window.triggerQuickInputFAB = triggerQuickInputFAB;
window.closeQuickInputFABModal = closeQuickInputFABModal;
window.saveQuickInputFABModal = saveQuickInputFABModal;

// 편의 고도화 기능 윈도우 스코프 매핑
window.showFullExerciseName = showFullExerciseName;
window.changeLibraryPartFilter = changeLibraryPartFilter;
window.changeLibraryTypeFilter = changeLibraryTypeFilter;
window.openTemplatePopupEditor = openTemplatePopupEditor;
window.closeTemplatePopupEditor = closeTemplatePopupEditor;
window.addSetToEditor = addSetToEditor;
window.deleteSetFromEditor = deleteSetFromEditor;
window.deleteExerciseFromEditor = deleteExerciseFromEditor;
window.changeEditorSetField = changeEditorSetField;
window.saveTemplatePopupEditorData = saveTemplatePopupEditorData;
window.clearDailyExercises = clearDailyExercises;
window.moveSetOrder = moveSetOrder;
window.moveSetOrderInEditor = moveSetOrderInEditor;
window.triggerLibraryAddFromEditor = triggerLibraryAddFromEditor;
window.moveExerciseOrder = moveExerciseOrder;
window.initCalendarModule = initCalendarModule;

export function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-text').innerText = msg;
    t.className = "fixed bottom-32 right-5 z-[250] transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    setTimeout(() => { t.className = "fixed bottom-32 right-5 z-[250] transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 2500);
}

function toggleGlobalLoader(show, text = "시스템 인프라 정밀 동기화 중...") {
    const loader = document.getElementById('global-loading-layer');
    const msg = document.getElementById('global-loading-text');
    if (!loader) return;
    if (show) {
        msg.innerText = text; loader.classList.remove('hidden'); loader.classList.add('flex');
    } else {
        loader.classList.add('hidden'); loader.classList.remove('flex');
    }
}

function getWorkoutData() {
    let data = state.workouts[state.selectedDateStr];
    if (!data) {
        data = { weight: 0, bf: 0, smm: 0, exercises: [] };
        state.workouts[state.selectedDateStr] = data;
    }
    if (!data.exercises) data.exercises = [];
    return data;
}

export function saveSystemSettings() {
    if(!state.userInfo) state.userInfo = {};
    const setRest = document.getElementById('setting-default-rest');
    const setSound = document.getElementById('setting-default-sound');
    const setInt = document.getElementById('setting-default-interval');
    const alarmInt = document.getElementById('alarm-interval-select');

    if (setRest) state.userInfo.defaultRestTime = parseInt(setRest.value) || 90;
    if (setSound) state.userInfo.defaultAlarmSound = setSound.value || '1';
    if (document.getElementById('pane-tab-alarm') && !document.getElementById('pane-tab-alarm').classList.contains('hidden')) {
        state.userInfo.alarmInterval = parseInt(alarmInt.value) || 1000;
    } else {
        if (setInt) state.userInfo.alarmInterval = parseInt(setInt.value) || 1000;
    }
    triggerSave(showToast); loadSystemSettings();
}

function loadSystemSettings() {
    const dRest = state.userInfo?.defaultRestTime || 90;
    const dSound = state.userInfo?.defaultAlarmSound || '1';
    const dInt = state.userInfo?.alarmInterval || 1000;
    
    const restEl = document.getElementById('setting-default-rest');
    const soundEl = document.getElementById('setting-default-sound');
    const intEl = document.getElementById('setting-default-interval');
    const alarmIntEl = document.getElementById('alarm-interval-select');
    const alarmSoundEl = document.getElementById('alarm-sound-select');

    if(restEl) restEl.value = dRest;
    if(soundEl) soundEl.value = dSound;
    if(intEl) intEl.value = dInt;
    if(alarmIntEl) alarmIntEl.value = dInt;
    if(alarmSoundEl) alarmSoundEl.value = dSound;
}

function playAudioTone(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        if (type === '2') { 
            const notes = [659.25, 880, 1046.50];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine'; osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, now + i*0.15); gain.gain.linearRampToValueAtTime(0.4, now + i*0.15 + 0.02); gain.gain.exponentialRampToValueAtTime(0.001, now + i*0.15 + 0.15);
                osc.start(now + i*0.15); osc.stop(now + i*0.15 + 0.15);
            });
        } else if (type === '3') { 
            const notes = [523.25, 659.25, 783.99, 1046.50];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination); osc.type = 'triangle'; osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, now + i*0.2); gain.gain.linearRampToValueAtTime(0.2, now + i*0.2 + 0.1); gain.gain.exponentialRampToValueAtTime(0.001, now + i*0.2 + 0.4);
                osc.start(now + i*0.2); osc.stop(now + i*0.2 + 0.4);
            });
        } else if (type === '4') { 
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination); osc.type = 'square';
            osc.frequency.setValueAtTime(600, now); osc.frequency.setValueAtTime(800, now + 0.2); osc.frequency.setValueAtTime(600, now + 0.4); osc.frequency.setValueAtTime(800, now + 0.6);
            gain.gain.setValueAtTime(0.1, now); osc.start(now); osc.stop(now + 0.8);
        } else if (type === '5') { 
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine'; osc.frequency.value = 440; 
            gain.gain.setValueAtTime(0, now); gain.gain.linearRampToValueAtTime(0.4, now + 0.1); gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
            osc.start(now); osc.stop(now + 1.5);
        } else { 
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination); osc.type = 'sine'; osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.3, now); osc.start(now); osc.stop(now + 0.3);
        }
    } catch(e) {}
}

function triggerAlarmRing(soundType) {
    document.getElementById('timer-controls-default').classList.add('hidden');
    document.getElementById('timer-controls-extend').classList.remove('hidden'); document.getElementById('timer-controls-extend').classList.add('flex');
    document.getElementById('timer-pulse-dot').classList.remove('bg-rose-500'); document.getElementById('timer-pulse-dot').classList.add('bg-amber-500');

    playAudioTone(soundType);
    if(alarmAudioInterval) clearInterval(alarmAudioInterval);
    let userInterval = state.userInfo?.alarmInterval || 1000;
    alarmAudioInterval = setInterval(() => { playAudioTone(soundType); }, userInterval);
}

export function stopRestTimer() {
    if (restTimerInterval) clearInterval(restTimerInterval);
    if (alarmAudioInterval) clearInterval(alarmAudioInterval);
    document.getElementById('timer-floating-bar').className = "fixed bottom-0 left-0 w-full z-[70] transform translate-y-full opacity-0 transition-all duration-500 pointer-events-none";
}

export function extendRestTimer(secondsToAdd) {
    if (alarmAudioInterval) clearInterval(alarmAudioInterval);
    document.getElementById('timer-controls-default').classList.remove('hidden');
    document.getElementById('timer-controls-extend').classList.add('hidden'); document.getElementById('timer-controls-extend').classList.remove('flex');
    document.getElementById('timer-pulse-dot').classList.add('bg-rose-500'); document.getElementById('timer-pulse-dot').classList.remove('bg-amber-500');
    
    startTimerLogic(currentTimerSeconds + secondsToAdd, currentAlarmSound);
}

function startTimerLogic(seconds, soundType) {
    if (restTimerInterval) clearInterval(restTimerInterval);
    if (alarmAudioInterval) clearInterval(alarmAudioInterval);
    
    currentTimerSeconds = seconds; currentAlarmSound = soundType || '1';
    const bar = document.getElementById('timer-floating-bar');
    const display = document.getElementById('timer-countdown-display');
    document.getElementById('timer-controls-default').classList.remove('hidden');
    document.getElementById('timer-controls-extend').classList.add('hidden');
    
    bar.className = "fixed bottom-0 left-0 w-full z-[70] transform translate-y-0 opacity-100 transition-all duration-500 pointer-events-auto shadow-[0_-10px_40px_rgba(245,158,11,0.2)]";
    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    display.textContent = formatTime(currentTimerSeconds);

    restTimerInterval = setInterval(() => {
        currentTimerSeconds--;
        if (currentTimerSeconds <= 0) {
            clearInterval(restTimerInterval); display.textContent = "00:00"; triggerAlarmRing(currentAlarmSound);
        } else { display.textContent = formatTime(currentTimerSeconds); }
    }, 1000);
}

/**
 * [신규 추가] 종목 전용 휴식 알람 세팅 모달 4종 함수
 * (window 바인딩만 존재하고 본체가 누락되어 ReferenceError 로 calendar.js 모듈 전체가
 *  구동 직후 정지하던 치명적 결함을 해결합니다. calendar.html 의 #rest-timer-modal 마크업과 결합됩니다.)
 */
export function openRestTimerModal(exIdx) {
    const data = getWorkoutData();
    const ex = data.exercises[exIdx]; if (!ex) return;
    const modal = document.getElementById('rest-timer-modal'); if (!modal) return;

    document.getElementById('rest-timer-ex-idx').value = exIdx;
    document.getElementById('rest-timer-sec-input').value = ex.restTime || state.userInfo?.defaultRestTime || 90;
    document.getElementById('rest-timer-sound-input').value = ex.alarmSound || state.userInfo?.defaultAlarmSound || '1';

    modal.classList.remove('hidden'); modal.classList.add('flex');
}

export function closeRestTimerModal() {
    const modal = document.getElementById('rest-timer-modal'); if (!modal) return;
    modal.classList.add('hidden'); modal.classList.remove('flex');
}

export function adjRestTimerSetting(delta) {
    const input = document.getElementById('rest-timer-sec-input'); if (!input) return;
    let val = (parseInt(input.value) || 0) + delta;
    if (val < 0) val = 0;
    input.value = val;
}

export function saveRestTimerModal() {
    const idxInput = document.getElementById('rest-timer-ex-idx'); if (!idxInput) return;
    const exIdx = parseInt(idxInput.value);
    const data = getWorkoutData();
    const ex = data.exercises[exIdx]; if (!ex) return;

    ex.restTime = parseInt(document.getElementById('rest-timer-sec-input').value) || 90;
    ex.alarmSound = document.getElementById('rest-timer-sound-input').value || '1';

    closeRestTimerModal();
    triggerSave(showToast);
    renderWorkoutList();
    showToast("종목 전용 휴식 알람이 저장되었습니다.");
}

export function startGlobalAlarm() {
    const sec = parseInt(document.getElementById('manual-timer-sec').value) || 60;
    const soundType = document.getElementById('alarm-sound-select').value || '1';
    const interval = parseInt(document.getElementById('alarm-interval-select').value) || 1000;
    
    if(!state.userInfo) state.userInfo = {};
    state.userInfo.defaultAlarmSound = soundType; state.userInfo.alarmInterval = interval;
    triggerSave(showToast); loadSystemSettings(); startTimerLogic(sec, soundType);
}

export function switchCalendarTab(tabId) {
    document.querySelectorAll('.calendar-pane').forEach(el => { el.classList.add('hidden'); el.classList.remove('block'); });
    const targetPane = document.getElementById('pane-' + tabId);
    if (targetPane) { targetPane.classList.remove('hidden'); targetPane.classList.add('block'); }
    
    const tabs = ['tab-home', 'tab-record', 'tab-routine', 'tab-alarm', 'tab-stats', 'tab-settings'];
    tabs.forEach(t => {
        const btn = document.getElementById('nav-' + t);
        if (btn) {
            if (t === tabId) btn.className = "flex-1 py-4 px-5 text-center transition-all min-w-[75px] active-tab-bar";
            else btn.className = "flex-1 py-4 px-5 text-center transition-all min-w-[75px] text-slate-400 hover:bg-slate-800/40";
        }
    });

    if (tabId === 'tab-stats') renderWorkoutAnalysisCharts();
    if (tabId === 'tab-home') updateHomeDashboardWidgets();
    if (tabId === 'tab-routine') renderPresetRoutineGrid();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateDdayBadge() {
    const badge = document.getElementById('badge-dday');
    if (!badge || !state.userInfo?.targetDate) return;
    const diff = Math.ceil((new Date(state.userInfo.targetDate) - new Date()) / (1000 * 60 * 60 * 24));
    badge.innerText = diff >= 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
}

function updateHomeDashboardWidgets() {
    const data = getWorkoutData();
    const routineTitle = document.getElementById('home-routine-title');
    if (data.exercises.length > 0) routineTitle.innerText = `현재 ${data.exercises.length}개 종목 기록 중`;
    else routineTitle.innerText = `오늘 지정된 루틴 없음`;

    const widgetBox = document.getElementById('home-quick-widget-box'); widgetBox.innerHTML = '';
    const freqData = calculateExerciseFrequencies();
    const recentShowItems = freqData.slice(0, 3).map(item => item[0]);

    if (recentShowItems.length === 0) { 
        widgetBox.innerHTML = `<p class="text-xs text-slate-500 py-3 text-center col-span-3">누적 기록이 부족합니다.</p>`; return;
    }
    recentShowItems.forEach(name => {
        const btn = document.createElement('button'); btn.innerText = name;
        btn.className = "p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 truncate active:scale-95 text-center";
        btn.onclick = () => {
            const currentData = getWorkoutData();
            if (!currentData.exercises.some(e => e.name === name)) {
                let fPart = '기타', fType = '위젯';
                Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
                const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
                currentData.exercises.push({ part: fPart, type: fType, name: name, restTime: dRest, alarmSound: dSound, sets: [] });
                triggerSave(showToast); showToast(`${name} 기록지에 연동 완료.`);
            } else { showToast("이미 등록된 종목입니다."); }
        };
        widgetBox.appendChild(btn);
    });
}

export function renderCalendarGrid() {
    const gridEl = document.getElementById('calendar-grid'); if(!gridEl) return; gridEl.innerHTML = '';
    document.getElementById('calendar-month-year').textContent = `${viewYear}년 ${String(viewMonth + 1).padStart(2, '0')}월`;

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const lastDate = new Date(viewYear, viewMonth + 1, 0).getDate();
    for (let i = 0; i < firstDay; i++) { gridEl.appendChild(document.createElement('div')); }

    for (let day = 1; day <= lastDate; day++) {
        const dayBtn = document.createElement('button');
        const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        dayBtn.textContent = day;
        dayBtn.className = "p-3 rounded-xl font-bold text-sm transition-all flex flex-col items-center justify-center min-h-[52px] relative border border-transparent hover:border-slate-700 select-none";

        const td = state.workouts[dateStr];
        if (td && ((td.exercises && td.exercises.length > 0) || (td.weight > 0 || td.bf > 0 || td.smm > 0))) {
            const dot = document.createElement('span'); dot.className = "w-1.5 h-1.5 bg-amber-500 rounded-full absolute bottom-1.5"; dayBtn.appendChild(dot);
        }
        if (dateStr === state.selectedDateStr) dayBtn.className += " active-day font-black text-slate-950";
        else {
            dayBtn.className += " bg-slate-800/40 text-slate-300";
            const dayOfWeek = new Date(viewYear, viewMonth, day).getDay();
            if (dayOfWeek === 0) dayBtn.className += " text-rose-400"; if (dayOfWeek === 6) dayBtn.className += " text-sky-400";
        }
        dayBtn.onclick = () => selectWorkoutDate(dateStr);
        gridEl.appendChild(dayBtn);
    }
}

export function moveMonth(direction) {
    viewMonth += direction;
    if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; } else if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
    renderCalendarGrid();
}

export function selectWorkoutDate(dateStr) {
    state.selectedDateStr = dateStr;
    const parts = dateStr.split('-');
    const labelEl = document.getElementById('label-selected-date');
    if(labelEl) labelEl.textContent = `${parts[1]}/${parts[2]}`;
    
    const data = getWorkoutData();
    document.getElementById('input-daily-weight').value = data.weight > 0 ? data.weight : '';
    document.getElementById('input-daily-bf').value = data.bf > 0 ? data.bf : '';
    document.getElementById('input-daily-smm').value = data.smm > 0 ? data.smm : '';
    renderCalendarGrid(); renderWorkoutList();
}

export function renderWorkoutList() {
    const container = document.getElementById('workout-list-container');
    if(!container) return; container.innerHTML = '';

    const data = getWorkoutData();
    if (data.exercises.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-500 text-center py-12">등록된 운동이 없습니다.</p>`;
        const volLabel = document.getElementById('label-total-volume');
        if(volLabel) volLabel.innerText = "총 훈련 볼륨: 0 kg"; return;
    }

    let dailyTotalVolume = 0;
    data.exercises.forEach((ex, exIdx) => {
        let max1RM = 0; let setsHtml = '';
        const currentRestTime = ex.restTime || state.userInfo?.defaultRestTime || 90;

        ex.sets.forEach((set, setIdx) => {
            if (set.done) dailyTotalVolume += (set.weight * set.reps);
            const est1RM = set.weight * (1 + (set.reps / 30)); if (est1RM > max1RM) max1RM = est1RM;

            setsHtml += `
            <div class="flex items-center justify-between gap-1.5 p-2 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs sm:text-sm">
                <span class="font-black text-amber-500 w-4 text-center">${setIdx + 1}</span>
                <select onchange="window.changeSetField(${exIdx}, ${setIdx}, 'type', event.target.value)" class="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 outline-none text-xs">
                    <option value="일반" ${set.type==='일반'?'selected':''}>일반</option><option value="탑" ${set.type==='탑'?'selected':''}>탑</option>
                    <option value="백오프" ${set.type==='백오프'?'selected':''}>백오프</option><option value="드롭" ${set.type==='드롭'?'selected':''}>드롭</option><option value="슈퍼" ${set.type==='슈퍼'?'selected':''}>슈퍼</option>
                </select>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', -2.5)" class="w-5 h-6 text-slate-400 font-bold hover:text-white select-none">−</button>
                    <input type="number" step="0.1" inputmode="decimal" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'weight', event.target.value)" class="w-10 bg-transparent text-center font-bold text-white outline-none text-xs" value="${set.weight}">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', 2.5)" class="w-5 h-6 text-slate-400 font-bold hover:text-white select-none">＋</button>
                </div>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', -1)" class="w-5 h-6 text-slate-400 font-bold hover:text-white select-none">−</button>
                    <input type="number" inputmode="numeric" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'reps', event.target.value)" class="w-8 bg-transparent text-center font-bold text-white outline-none text-xs" value="${set.reps}">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', 1)" class="w-5 h-6 text-slate-400 font-bold hover:text-white select-none">＋</button>
                </div>
                
                <div class="flex gap-0.5 shrink-0">
                    <button onclick="window.moveSetOrder(${exIdx}, ${setIdx}, -1)" class="w-7 h-7 flex items-center justify-center bg-slate-800 active:bg-slate-700 rounded text-slate-300 font-bold text-[10px]">▲</button>
                    <button onclick="window.moveSetOrder(${exIdx}, ${setIdx}, 1)" class="w-7 h-7 flex items-center justify-center bg-slate-800 active:bg-slate-700 rounded text-slate-300 font-bold text-[10px]">▼</button>
                </div>

                <input type="checkbox" ${set.done?'checked':''} onchange="window.toggleSetComplete(${exIdx}, ${setIdx}, event.target.checked)" class="w-5 h-5 accent-amber-500 cursor-pointer shrink-0 ml-0.5">
                <button onclick="window.deleteSet(${exIdx}, ${setIdx})" class="text-slate-500 hover:text-rose-400 font-black text-xs px-1">✕</button>
            </div>`;
        });

        const card = document.createElement('div');
        card.className = "bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 space-y-3";
        card.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-800/60 pb-2">
                <div class="flex-1">
                    <span class="px-2 py-0.5 text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">${ex.part} · ${ex.type}</span>
                    <div class="flex flex-wrap items-center gap-2 mt-1.5 mb-1">
                        <h3 class="text-sm font-black text-white">${ex.name}</h3>
                        <span onclick="window.openRestTimerModal(${exIdx})" class="text-[10px] font-bold bg-slate-800 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-md cursor-pointer transition-colors active:scale-95">⏱️ 알람 (${currentRestTime}초)</span>
                    </div>
                    <p class="text-[10px] text-slate-400 font-medium">1RM 추정 최고치: ${max1RM > 0 ? max1RM.toFixed(1) + 'kg' : '---'}</p>
                </div>
                
                <div class="flex gap-1 shrink-0 items-center mr-1">
                    <button onclick="window.moveExerciseOrder(${exIdx}, -1)" class="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:bg-amber-500 text-slate-200 active:text-slate-950 rounded-lg font-black text-sm shadow">▲</button>
                    <button onclick="window.moveExerciseOrder(${exIdx}, 1)" class="w-8 h-8 flex items-center justify-center bg-slate-800 hover:bg-slate-700 active:bg-amber-500 text-slate-200 active:text-slate-950 rounded-lg font-black text-sm shadow">▼</button>
                </div>

                <button onclick="window.deleteExercise(${exIdx})" class="text-[11px] px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-400 rounded-md shrink-0">삭제</button>
            </div>
            <div class="space-y-1.5">${setsHtml}</div>
            <button onclick="window.addSet(${exIdx})" class="w-full py-1.5 border border-dashed border-slate-700 text-xs text-slate-400 hover:text-amber-400 font-bold rounded-xl bg-slate-950/20 transition-colors">+ 세트 추가</button>
        `;
        container.appendChild(card);
    });

    const totalVolumeEl = document.getElementById('label-total-volume');
    if(totalVolumeEl) totalVolumeEl.innerText = `총 훈련 볼륨: ${dailyTotalVolume.toLocaleString()} kg`;
}

export function moveExerciseOrder(exIdx, direction) {
    const data = getWorkoutData();
    const targetIdx = exIdx + direction;
    if (targetIdx >= 0 && targetIdx < data.exercises.length) {
        const temp = data.exercises[exIdx];
        data.exercises[exIdx] = data.exercises[targetIdx];
        data.exercises[targetIdx] = temp;
        triggerSave(showToast); renderWorkoutList(); showToast("운동 종목 배치 순서가 수정되었습니다.");
    }
}

export function moveSetOrder(exIdx, setIdx, direction) {
    const data = getWorkoutData(); const sets = data.exercises[exIdx].sets; const targetIdx = setIdx + direction;
    if (targetIdx >= 0 && targetIdx < sets.length) {
        const temp = sets[setIdx]; sets[setIdx] = sets[targetIdx]; sets[targetIdx] = temp;
        triggerSave(showToast); renderWorkoutList();
    }
}

export function addSet(exIdx) {
    const data = getWorkoutData(); const ex = data.exercises[exIdx];
    let weight = 40, reps = 10;
    if (ex.sets.length > 0) { const lastSet = ex.sets[ex.sets.length - 1]; weight = lastSet.weight; reps = lastSet.reps; }
    ex.sets.push({ type: '일반', weight: weight, reps: reps, memo: '', done: false });
    triggerSave(showToast); renderWorkoutList();
}
export function deleteSet(exIdx, setIdx) {
    const data = getWorkoutData(); const ex = data.exercises[exIdx];
    undoBuffer = { type: 'set', exIdx: setIdx, setIdx: setIdx, data: JSON.parse(JSON.stringify(ex.sets[setIdx])) };
    ex.sets.splice(setIdx, 1); triggerSave(showToast); renderWorkoutList(); 
    document.getElementById('btn-undo').classList.remove('hidden'); showToast("세트 기록이 제거되었습니다.");
}
export function adjSetVal(exIdx, setIdx, field, delta) {
    const data = getWorkoutData(); const set = data.exercises[exIdx].sets[setIdx];
    let val = (parseFloat(set[field]) || 0) + delta; if (val < 0) val = 0; set[field] = val; triggerSave(showToast); renderWorkoutList();
}
export function changeSetField(exIdx, setIdx, field, val) {
    const data = getWorkoutData(); const set = data.exercises[exIdx].sets[setIdx];
    if (field === 'weight' || field === 'reps') set[field] = parseFloat(val) || 0; else set[field] = val; triggerSave(showToast);
}
export function toggleSetComplete(exIdx, setIdx, isChecked) {
    const data = getWorkoutData(); data.exercises[exIdx].sets[setIdx].done = isChecked;
    triggerSave(showToast); renderWorkoutList();
    if (isChecked) {
        const customRestTime = data.exercises[exIdx].restTime || state.userInfo?.defaultRestTime || 90;
        const customSound = data.exercises[exIdx].alarmSound || state.userInfo?.defaultAlarmSound || '1';
        startTimerLogic(customRestTime, customSound);
    }
}
export function deleteExercise(exIdx) {
    if(confirm("이 종목 전체를 일지에서 제거할까요?")) { 
        const data = getWorkoutData(); data.exercises.splice(exIdx, 1); triggerSave(showToast); renderWorkoutList(); 
    }
}

export function clearDailyExercises() {
    const data = getWorkoutData();
    if (data.exercises.length === 0) { showToast("삭제할 운동 정보가 존재하지 않습니다."); return; }
    if (confirm("선택하신 날짜의 모든 운동 기록을 삭제하시겠습니까?\n(신체 계측 골격근량 및 체지방 정보는 안전하게 유지됩니다)")) {
        toggleGlobalLoader(true, "당일 운동 일지 초기화 처리 중...");
        setTimeout(() => {
            data.exercises = []; triggerSave(showToast); renderCalendarGrid(); renderWorkoutList();
            toggleGlobalLoader(false); showToast("당일 운동 일지 기록이 초기화되었습니다.");
        }, 300);
    }
}

function getHangulChosung(str) {
    const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    let result = "";
    for (let i = 0; i < str.length; i++) {
        let code = str.charCodeAt(i) - 44032;
        if (code >= 0 && code <= 11172) result += cho[Math.floor(code / 588)];
        else result += str.charAt(i);
    }
    return result;
}

function calculateExerciseFrequencies() {
    const counts = {};
    Object.values(state.workouts).forEach(w => {
        if (w && w.exercises) { w.exercises.forEach(e => { counts[e.name] = (counts[e.name] || 0) + 1; }); }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export function openLibraryModal() {
    document.getElementById('library-fullname-viewer').classList.add('hidden');
    document.getElementById('library-modal').classList.remove('hidden'); 
    document.getElementById('library-modal').classList.add('flex');
    libraryActivePart = '전체'; libraryActiveType = '전체'; runLibrarySearchFilter();
}
export function closeLibraryModal() { document.getElementById('library-modal').classList.add('hidden'); document.getElementById('library-modal').classList.remove('flex'); }
export function changeLibraryPartFilter(part) { libraryActivePart = part; libraryActiveType = '전체'; runLibrarySearchFilter(); }
export function changeLibraryTypeFilter(type) { libraryActiveType = type; runLibrarySearchFilter(); }

export function showFullExerciseName(mapperIndex) {
    const meta = state.libraryTempMapper[mapperIndex]; if (!meta) return;
    const viewer = document.getElementById('library-fullname-viewer');
    viewer.innerText = `🔍 전체 운동 명칭: ${meta.name}`; viewer.classList.remove('hidden');
}

export function runLibrarySearchFilter() {
    const rawInput = document.getElementById('library-search-input').value.trim().toLowerCase();
    const input = rawInput.replace(/\s+/g, ''); 
    const grid = document.getElementById('library-master-card-grid'); grid.innerHTML = '';
    
    const filterBar = document.getElementById('library-filter-part-bar'); filterBar.innerHTML = '';
    const parts = ['전체', ...Object.keys(WORKOUT_DB)];
    parts.forEach(p => {
        const pill = document.createElement('button'); pill.innerText = p;
        pill.className = `px-3 py-1.5 text-xs font-black rounded-full whitespace-nowrap transition-colors ${p === libraryActivePart ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`;
        pill.onclick = () => changeLibraryPartFilter(p); filterBar.appendChild(pill);
    });

    const typeBar = document.getElementById('library-filter-type-bar'); typeBar.innerHTML = '';
    if (libraryActivePart !== '전체' && WORKOUT_DB[libraryActivePart]) {
        typeBar.classList.remove('hidden'); typeBar.classList.add('flex');
        const types = ['전체', ...Object.keys(WORKOUT_DB[libraryActivePart])];
        types.forEach(t => {
            const pill = document.createElement('button'); pill.innerText = t;
            pill.className = `px-2.5 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap transition-colors ${t === libraryActiveType ? 'bg-sky-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`;
            pill.onclick = () => changeLibraryTypeFilter(t); typeBar.appendChild(pill);
        });
    } else { typeBar.classList.remove('flex'); typeBar.classList.add('hidden'); }

    let globalMatchCounter = 0; state.libraryTempMapper = [];

    Object.entries(WORKOUT_DB).forEach(([part, types]) => {
        if (libraryActivePart !== '전체' && part !== libraryActivePart) return;
        Object.entries(types).forEach(([type, names]) => {
            if (libraryActiveType !== '전체' && type !== libraryActiveType) return;
            names.forEach(name => {
                const cleanName = name.toLowerCase().replace(/\s+/g, '');
                const chosung = getHangulChosung(name).toLowerCase().replace(/\s+/g, '');
                if (input && !(cleanName.includes(input) || chosung.includes(input))) return;
                
                const mappedIdx = globalMatchCounter++;
                state.libraryTempMapper.push({ part: part, type: type, name: name });

                const card = document.createElement('div');
                card.className = "h-16 p-3 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center overflow-hidden";
                card.innerHTML = `
                    <div class="truncate mr-2 flex-1 cursor-pointer" onclick="window.showFullExerciseName(${mappedIdx})">
                        <span class="text-[9px] font-bold text-slate-500 block uppercase">${part} · ${type}</span>
                        <h4 class="text-xs sm:text-sm font-black text-slate-200 truncate leading-tight">${name}</h4>
                    </div>
                    <button onclick="window.injectLibraryToToday(${mappedIdx})" class="px-2.5 py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-[11px] font-bold rounded-lg transition-colors shrink-0">추가</button>`;
                grid.appendChild(card);
            });
        });
    });

    const freqBox = document.getElementById('library-frequent-box');
    const freqGrid = document.getElementById('library-frequent-grid'); freqGrid.innerHTML = '';
    const freqData = calculateExerciseFrequencies();
    
    if (freqData.length > 0) {
        freqBox.classList.remove('hidden');
        freqData.forEach(([name, count]) => {
            let fPart = '기타', fType = '기타';
            Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
            
            const mappedIdx = globalMatchCounter++;
            state.libraryTempMapper.push({ part: fPart, type: fType, name: name });

            const card = document.createElement('div');
            card.className = "h-16 p-3 bg-slate-950 border border-amber-500/20 rounded-xl flex justify-between items-center overflow-hidden";
            card.innerHTML = `
                <div class="truncate mr-2 flex-1 cursor-pointer" onclick="window.showFullExerciseName(${mappedIdx})">
                    <span class="text-[9px] font-black text-amber-500 block uppercase">★ 최다수행 (${count}회)</span>
                    <h4 class="text-xs sm:text-sm font-black text-slate-300 truncate leading-tight">${name}</h4>
                </div>
                <button onclick="window.injectLibraryToToday(${mappedIdx})" class="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500 hover:text-slate-950 text-[11px] text-amber-400 font-bold rounded-lg border border-amber-500/20 transition-colors shrink-0">추가</button>`;
            freqGrid.appendChild(card);
        });
    } else { freqBox.classList.add('hidden'); }
}

export function injectLibraryToToday(mapperIndex) {
    const meta = state.libraryTempMapper[mapperIndex]; if (!meta) return;

    if (state.libraryTarget === 'editor') {
        const buf = state.routineEditorBuffer; if (!buf) return;
        if (!buf.exercises.some(e => e.name === meta.name)) {
            buf.exercises.push({
                part: meta.part, type: meta.type, name: meta.name, restTime: 90, alarmSound: '1',
                sets: [{ type: '일반', weight: 40, reps: 10, done: false }]
            });
            renderRoutinePopupEditorDOM(); showToast(`[${meta.name}] 편집창 주입 완료.`);
        } else { showToast("이미 추가된 종목입니다."); }
    } else {
        const data = getWorkoutData();
        if (!data.exercises.some(e => e.name === meta.name)) {
            const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
            data.exercises.push({ part: meta.part, type: meta.type, name: meta.name, restTime: dRest, alarmSound: dSound, sets: [] });
            triggerSave(showToast); if (document.getElementById('pane-tab-record').classList.contains('block')) renderWorkoutList();
            showToast(`[${meta.name}] 일지 반영 완료.`);
        } else { showToast("이미 추가된 종목입니다."); }
    }
}

export function openTemplateManager() { document.getElementById('template-modal').classList.remove('hidden'); document.getElementById('template-modal').classList.add('flex'); renderTemplateList(); }
export function closeTemplateManager() { document.getElementById('template-modal').classList.add('hidden'); document.getElementById('template-modal').classList.remove('flex'); }

function renderTemplateList() {
    const box = document.getElementById('template-list-box'); if(!box) return; box.innerHTML = '';
    if (!state.templates || state.templates.length === 0) { box.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">저장된 루틴이 없습니다.</p>`; return; }
    state.templates.forEach((tmpl) => {
        const div = document.createElement('div'); div.className = "flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs gap-2";
        div.innerHTML = `<span onclick="window.applyTemplate(${tmpl.id})" class="text-slate-200 font-bold hover:text-amber-400 cursor-pointer flex-1 truncate">${tmpl.title} (${tmpl.exercises.length}종목)</span><button onclick="window.deleteTemplate(${tmpl.id})" class="text-rose-400 hover:text-rose-500 font-bold shrink-0">삭제</button>`;
        box.appendChild(div);
    });
}

export function openSaveRoutineModal() {
    const data = getWorkoutData(); if (data.exercises.length === 0) { showToast("현재 일지에 저장할 운동이 없습니다."); return; }
    document.getElementById('save-routine-name-input').value = ''; document.getElementById('save-routine-modal').classList.remove('hidden'); document.getElementById('save-routine-modal').classList.add('flex');
}
export function closeSaveRoutineModal() { document.getElementById('save-routine-modal').classList.add('hidden'); document.getElementById('save-routine-modal').classList.remove('flex'); }

export function confirmSaveRoutine() {
    const data = getWorkoutData(); const title = document.getElementById('save-routine-name-input').value.trim() || '내 맞춤 루틴';
    const cleanedExercises = data.exercises.map(ex => ({ part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime, alarmSound: ex.alarmSound, sets: ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, memo: s.memo, done: false })) }));
    if (!state.templates) state.templates = [];
    state.templates.push({ id: Date.now(), title: title, exercises: cleanedExercises });
    triggerSave(showToast); closeSaveRoutineModal(); showToast("루틴 백업 보존 성공.");
}

export function applyTemplate(tmplId) {
    if (!confirm("오늘 일지의 기존 기록이 초기화되고 복원 프리셋으로 대체됩니다. 계속할까요?")) return;
    toggleGlobalLoader(true, "루틴 프리셋 복원 및 렌더 가동 중...");
    
    setTimeout(() => {
        const tmpl = state.templates.find(t => t.id === tmplId); 
        if (tmpl) {
            const data = getWorkoutData(); data.exercises = JSON.parse(JSON.stringify(tmpl.exercises));
            triggerSave(showToast); closeTemplateManager(); switchCalendarTab('tab-record'); renderWorkoutList();
        }
        toggleGlobalLoader(false); showToast("루틴 데이터가 즉각 정상 반영되었습니다.");
    }, 300);
}

export function deleteTemplate(tmplId) {
    if (confirm("이 프리셋을 영구 삭제하시겠습니까?")) { state.templates = state.templates.filter(t => t.id !== tmplId); triggerSave(showToast); renderTemplateList(); }
}

export function renderPresetRoutineGrid() {
    const gridBox = document.getElementById('routine-preset-grid-box'); if(!gridBox) return; gridBox.innerHTML = '';
    const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');

    if (state.templates && state.templates.length > 0) {
        const titleSec = document.createElement('div'); titleSec.className = "col-span-1 sm:col-span-2 border-b border-slate-800 pb-1 mt-2";
        titleSec.innerHTML = `<h3 class="text-xs font-black text-sky-400 uppercase tracking-wider">💾 내가 백업한 맞춤형 프리셋 루틴</h3>`;
        gridBox.appendChild(titleSec);
        
        state.templates.forEach(tmpl => {
            const card = document.createElement('div'); card.className = "glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between gap-4 animate-fade-in";
            card.innerHTML = `
                <div><h3 class="text-sm font-black text-white uppercase">${tmpl.title}</h3><p class="text-xs text-slate-400 mt-2 leading-relaxed break-all">${tmpl.exercises.map(e => e.name).join(', ')}</p></div>
                <div class="flex gap-2">
                    <button class="flex-1 bg-slate-800 hover:bg-sky-500 hover:text-white text-xs font-bold py-3 rounded-xl border border-slate-700 transition-colors" onclick="window.applyTemplate(${tmpl.id})">가져오기</button>
                    <button class="flex-1 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-xs font-black py-3 rounded-xl border border-slate-800 transition-colors" onclick="window.openTemplatePopupEditor(true, ${tmpl.id})">✏️ 루틴 편집</button>
                </div>`;
            gridBox.appendChild(card);
        });
    }

    const titleSecRec = document.createElement('div'); titleSecRec.className = "col-span-1 sm:col-span-2 border-b border-slate-800 pb-1 mt-4";
    titleSecRec.innerHTML = `<h3 class="text-xs font-black text-amber-500 uppercase tracking-wider">🌟 보디빌딩 협업자 추천 분할 마스터 프로그램</h3>`;
    gridBox.appendChild(titleSecRec);

    RECOMMENDED_ROUTINES.forEach((prog, idx) => {
        const hasCustom = !!customRecommended[prog.title];
        const displayExercises = hasCustom ? customRecommended[prog.title] : prog.exercises;
        const subBadge = hasCustom ? `<span class="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded ml-1.5">수정됨</span>` : '';

        const card = document.createElement('div'); card.className = "glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between gap-4 animate-fade-in";
        card.innerHTML = `
            <div><h3 class="text-sm font-black text-slate-100 uppercase flex items-center">${prog.title} ${subBadge}</h3><p class="text-xs text-slate-400 mt-2 leading-relaxed break-keep">${displayExercises.map(e => e.name).join(', ')}</p></div>
            <div class="flex gap-2">
                <button class="flex-1 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-xs font-bold py-3 rounded-xl border border-slate-700 transition-colors" onclick='window.applyDirectPresetRoutine(${idx})'>가동 마운트</button>
                <button class="flex-1 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-xs font-black py-3 rounded-xl border border-slate-800 transition-colors" onclick="window.openTemplatePopupEditor(false, ${idx})">✏️ 루틴 편집</button>
            </div>`;
        gridBox.appendChild(card);
    });
}

export function openTemplatePopupEditor(isUserTemplate, idOrIndex) {
    toggleGlobalLoader(true, "독립 팝업 에디터 버퍼 생성 중...");
    
    setTimeout(() => {
        let title = ''; let targetExercises = [];
        if (isUserTemplate) {
            const tmpl = state.templates.find(t => t.id === idOrIndex);
            if (tmpl) { title = tmpl.title; targetExercises = JSON.parse(JSON.stringify(tmpl.exercises)); }
        } else {
            const orig = RECOMMENDED_ROUTINES[idOrIndex];
            if (orig) {
                title = orig.title; const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');
                if (customRecommended[title]) { targetExercises = customRecommended[title]; } else { targetExercises = orig.exercises; }
            }
        }
        if (!title) { toggleGlobalLoader(false); showToast("루틴을 식별할 수 없습니다."); return; }

        state.routineEditorBuffer = {
            title: title, isUserTemplate: isUserTemplate, idOrIndex: idOrIndex,
            exercises: targetExercises.map(ex => ({
                part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime || 90, alarmSound: ex.alarmSound || '1',
                sets: (ex.sets && ex.sets.length > 0) ? JSON.parse(JSON.stringify(ex.sets)) : [{ type: '일반', weight: 40, reps: 10, done: false }]
            }))
        };

        document.getElementById('routine-editor-popup-title').innerText = `✏️ ${title} 독립 편집`;
        renderRoutinePopupEditorDOM();
        
        toggleGlobalLoader(false);
        document.getElementById('routine-editor-popup-modal').classList.remove('hidden');
        document.getElementById('routine-editor-popup-modal').classList.add('flex');
    }, 200);
}

export function closeTemplatePopupEditor() {
    state.routineEditorBuffer = null; state.libraryTarget = 'record'; 
    document.getElementById('routine-editor-popup-modal').classList.add('hidden');
    document.getElementById('routine-editor-popup-modal').classList.remove('flex');
}

export function triggerLibraryAddFromEditor() {
    state.libraryTarget = 'editor'; openLibraryModal();
}

function renderRoutinePopupEditorDOM() {
    const container = document.getElementById('routine-editor-list-container');
    if (!container || !state.routineEditorBuffer) return; container.innerHTML = '';

    state.routineEditorBuffer.exercises.forEach((ex, exIdx) => {
        let setsHtml = '';
        ex.sets.forEach((set, setIdx) => {
            setsHtml += `
            <div class="flex items-center justify-between gap-1 p-1.5 bg-slate-950 rounded-lg text-xs">
                <span class="font-black text-amber-500 w-4 text-center">${setIdx + 1}</span>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5">
                    <input type="number" step="2.5" class="w-10 bg-transparent text-center font-bold text-white outline-none" value="${set.weight}" oninput="window.changeEditorSetField(${exIdx}, ${setIdx}, 'weight', this.value)">
                    <span class="text-[9px] text-slate-500 mr-1">kg</span>
                </div>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded p-0.5">
                    <input type="number" class="w-8 bg-transparent text-center font-bold text-white outline-none" value="${set.reps}" oninput="window.changeEditorSetField(${exIdx}, ${setIdx}, 'reps', this.value)">
                    <span class="text-[9px] text-slate-500 mr-1">회</span>
                </div>
                
                <div class="flex gap-0.5 shrink-0">
                    <button onclick="window.moveSetOrderInEditor(${exIdx}, ${setIdx}, -1)" class="w-6 h-6 flex items-center justify-center bg-slate-800 active:bg-slate-700 rounded text-slate-400 font-bold text-[9px]">▲</button>
                    <button onclick="window.moveSetOrderInEditor(${exIdx}, ${setIdx}, 1)" class="w-6 h-6 flex items-center justify-center bg-slate-800 active:bg-slate-700 rounded text-slate-400 font-bold text-[9px]">▼</button>
                </div>

                <button onclick="window.deleteSetFromEditor(${exIdx}, ${setIdx})" class="text-rose-400 font-bold px-1">✕</button>
            </div>`;
        });

        const div = document.createElement('div');
        div.className = "p-3 bg-slate-900/90 border border-slate-800 rounded-xl space-y-2";
        div.innerHTML = `
            <div class="flex justify-between items-center border-b border-slate-800 pb-1">
                <div class="truncate"><span class="text-[9px] text-slate-500 block uppercase">${ex.part}</span><h4 class="text-xs font-black text-white truncate timeline-ex-title leading-tight">${ex.name}</h4></div>
                <button onclick="window.deleteExerciseFromEditor(${exIdx})" class="text-[10px] text-rose-400 font-bold bg-slate-800 px-1.5 py-0.5 rounded">삭제</button>
            </div>
            <div class="space-y-1">${setsHtml}</div>
            <button onclick="window.addSetToEditor(${exIdx})" class="w-full py-1 border border-dashed border-slate-700 text-[10px] text-slate-400 font-bold rounded-lg bg-slate-950/40">+ 세트 추가</button>
        `;
        container.appendChild(div);
    });
}

export function moveSetOrderInEditor(exIdx, setIdx, direction) {
    const sets = state.routineEditorBuffer.exercises[exIdx].sets;
    const targetIdx = setIdx + direction;
    if (targetIdx >= 0 && targetIdx < sets.length) {
        const temp = sets[setIdx]; sets[setIdx] = sets[targetIdx]; sets[targetIdx] = temp;
        renderRoutinePopupEditorDOM();
    }
}

export function addSetToEditor(exIdx) {
    const ex = state.routineEditorBuffer.exercises[exIdx];
    let w = 40, r = 10; if(ex.sets.length > 0) { w = ex.sets[ex.sets.length-1].weight; r = ex.sets[ex.sets.length-1].reps; }
    ex.sets.push({ type: '일반', weight: w, reps: r, done: false }); renderRoutinePopupEditorDOM();
}
export function deleteSetFromEditor(exIdx, setIdx) {
    state.routineEditorBuffer.exercises[exIdx].sets.splice(setIdx, 1); renderRoutinePopupEditorDOM();
}
export function deleteExerciseFromEditor(exIdx) {
    if(confirm("이 종목을 편집 리스트에서 제거할까요?")) { state.routineEditorBuffer.exercises.splice(exIdx, 1); renderRoutinePopupEditorDOM(); }
}
export function changeEditorSetField(exIdx, setIdx, field, val) {
    state.routineEditorBuffer.exercises[exIdx].sets[setIdx][field] = parseFloat(val) || 0;
}

export function saveTemplatePopupEditorData() {
    if (!state.routineEditorBuffer) return;
    toggleGlobalLoader(true, "편집 완료본 정밀 영속 구조 덮어쓰기 중...");

    setTimeout(() => {
        const buffer = state.routineEditorBuffer;
        const optimizedExercises = buffer.exercises.map(ex => ({
            part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime, alarmSound: ex.alarmSound,
            sets: ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, done: false }))
        }));

        if (buffer.isUserTemplate) {
            const tmpl = state.templates.find(t => t.id === buffer.idOrIndex); if (tmpl) tmpl.exercises = optimizedExercises;
        } else {
            const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');
            customRecommended[buffer.title] = optimizedExercises;
            localStorage.setItem('prep_master_custom_recommended', JSON.stringify(customRecommended));
        }

        triggerSave(showToast); closeTemplatePopupEditor(); renderPresetRoutineGrid();
        toggleGlobalLoader(false); showToast(`[${buffer.title}] 저장 완료.`);
    }, 300);
}

export function applyDirectPresetRoutine(index) {
    if(!confirm("기존 기록이 프리셋 종목으로 완전 대체 마운트됩니다. 진행할까요?")) return;
    toggleGlobalLoader(true, "추천 루틴 마운트 로드 중...");
    
    setTimeout(() => {
        const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');
        const orig = RECOMMENDED_ROUTINES[index]; if (!orig) { toggleGlobalLoader(false); return; }
        const displayExercises = customRecommended[orig.title] || orig.exercises;
        
        const data = getWorkoutData();
        const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
        data.exercises = displayExercises.map(ex => ({
            part: ex.part, type: ex.type, name: ex.name, restTime: dRest, alarmSound: dSound,
            sets: [{type:'일반', weight:40, reps:10, done:false}]
        }));
        triggerSave(showToast); switchCalendarTab('tab-record'); renderWorkoutList();
        toggleGlobalLoader(false); showToast(`[${orig.title}] 가동 마운트 완료.`);
    }, 300);
}

function renderWorkoutAnalysisCharts() {
    const cvsBalance = document.getElementById('chart-workout-analysis');
    const cvsVolume = document.getElementById('chart-volume-trend');
    const cvsWeight = document.getElementById('chart-weight-trend');
    if(!cvsBalance) return;

    const partsCount = { '가슴': 0, '등': 0, '어깨': 0, '팔': 0, '하체': 0, '복근': 0, '기타': 0 };
    let best1RMVal = 0; let best1RMEx = '-'; const exFreq = {};

    Object.values(state.workouts).forEach(dateObj => {
        if (dateObj.exercises) { dateObj.exercises.forEach(ex => { 
            let pKey = '기타'; if (ex.part.includes('가슴')) pKey = '가슴'; else if (ex.part.includes('등')) pKey = '등'; else if (ex.part.includes('어깨')) pKey = '어깨'; else if (ex.part.includes('팔')) pKey = '팔'; else if (ex.part.includes('하체')) pKey = '하체'; else if (ex.part.includes('복근')) pKey = '복근';
            partsCount[pKey] += ex.sets ? ex.sets.length : 0; exFreq[ex.name] = (exFreq[ex.name] || 0) + 1;
            ex.sets.forEach(s => { if(s.done) { const est1RM = s.weight * (1 + (s.reps / 30)); if(est1RM > best1RMVal) { best1RMVal = est1RM; best1RMEx = ex.name; } } });
        });}
    });

    let maxFreq = 0; let favEx = '-';
    Object.entries(exFreq).forEach(([name, count]) => { if(count > maxFreq) { maxFreq = count; favEx = name; } });

    document.getElementById('stat-favorite-ex').innerText = favEx !== '-' ? favEx : '기록 부족';
    document.getElementById('stat-best-1rm').innerText = best1RMEx !== '-' ? `${best1RMEx} (${best1RMVal.toFixed(1)}kg)` : '기록 부족';

    const activeDates = Object.keys(state.workouts).filter(d => (state.workouts[d].exercises && state.workouts[d].exercises.length > 0) || state.workouts[d].weight > 0).sort();
    const last7Days = activeDates.slice(-7); const labels = last7Days.map(d => d.slice(5).replace('-','/'));
    const volData = []; const weightData = [];
    
    last7Days.forEach(d => {
        const obj = state.workouts[d]; let dayVol = 0;
        if(obj.exercises) obj.exercises.forEach(e => e.sets.forEach(s => { if(s.done) dayVol += s.weight * s.reps; }));
        volData.push(dayVol); weightData.push(obj.weight || null);
    });

    setTimeout(() => {
        if(chartBalance) chartBalance.destroy();
        chartBalance = new Chart(cvsBalance.getContext('2d'), {
            type: 'radar', data: { labels: Object.keys(partsCount), datasets: [{ data: Object.values(partsCount), backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B', borderWidth: 2, pointBackgroundColor: '#F59E0B' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { grid: { color: 'rgba(255,255,255,0.05)' }, angleLines: { color: 'rgba(255,255,255,0.05)' }, pointLabels: { color: '#94A3B8' }, ticks: { display: false } } } }
        });
        if(chartVolume) chartVolume.destroy();
        chartVolume = new Chart(cvsVolume.getContext('2d'), {
            type: 'bar', data: { labels: labels, datasets: [{ label: '총 볼륨(kg)', data: volData, backgroundColor: '#F59E0B', borderRadius: 4 }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: {size: 10} } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: {size: 10} } } } }
        });
        if(chartWeight) chartWeight.destroy();
        chartWeight = new Chart(cvsWeight.getContext('2d'), {
            type: 'line', data: { labels: labels, datasets: [{ label: '체중(kg)', data: weightData, borderColor: '#0EA5E9', backgroundColor: 'rgba(14,165,233,0.1)', fill: true, tension: 0.3, pointBackgroundColor: '#0EA5E9', spanGaps: true }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#94A3B8', font: {size: 10} } }, y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: '#94A3B8', font: {size: 10} } } } }
        });
    }, 50);
}

export function runPlateCalculate() {
    const totalWeight = parseFloat(document.getElementById('plate-calc-target').value) || 0;
    const resultBox = document.getElementById('plate-calc-result');
    if (totalWeight <= BAR_WEIGHT) { resultBox.innerHTML = `<span class="text-rose-400 font-bold">바 중량(${BAR_WEIGHT}kg) 이상이어야 합니다.</span>`; return; }
    let netWeight = (totalWeight - BAR_WEIGHT) / 2; const platesCount = {};
    AVAILABLE_PLATES.forEach(plate => { if (netWeight >= plate) { const qty = Math.floor(netWeight / plate); platesCount[plate] = qty; netWeight -= plate * qty; } });
    const resultsText = Object.entries(platesCount).map(([w, qty]) => `${w}kg x ${qty}개`).join(', ');
    resultBox.innerHTML = resultsText ? `한쪽에 각각 <span class="text-white font-black">[ ${resultsText} ]</span> 장착` : `계산 불가 조합`;
}

export async function triggerSettingExport() {
    const dataStr = JSON.stringify({ phases: state.phases, customSupps: state.customSupps, userInfo: state.userInfo, workouts: state.workouts, templates: state.templates }, null, 2);
    const pad = n => n < 10 ? '0' + n : n; const now = new Date();
    const fileName = `TotalPrep_Backup_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`;
    try {
        if (window.showSaveFilePicker) {
            const handle = await window.showSaveFilePicker({ suggestedName: fileName, types: [{ description: 'JSON Backup File', accept: {'application/json': ['.json']} }] });
            const writable = await handle.createWritable(); await writable.write(dataStr); await writable.close();
            showToast("보안 지정 폴더에 저장되었습니다.");
        } else {
            const blob = new Blob([dataStr], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = fileName; link.click();
            showToast("다운로드 폴더에 백업 파일이 내보내기 되었습니다.");
        }
    } catch (err) { showToast("백업 내보내기 작업이 취소되었습니다."); }
}
export function triggerSettingImport(e) { importDataJSON(e.target.files[0], () => { showToast("복원 완료."); switchCalendarTab('tab-home'); location.reload(); }, () => showToast("오류 발생.")); }
export function triggerClearAllWorkoutData() { if (confirm("데이터를 영구 초기화합니다. 계속할까요?")) { state.workouts = {}; state.templates = []; saveToLocal(); location.reload(); } }
export function exportWorkoutToCSV() {
    let csvContent = "\uFEFF일자,부위,종목명,세트,중량,반복수,완료여부\n";
    Object.entries(state.workouts).forEach(([dateStr, obj]) => { if(obj.exercises) { obj.exercises.forEach(ex => { ex.sets.forEach((s, idx) => { csvContent += `${dateStr},${ex.part},${ex.name},${idx+1},${s.weight},${s.reps},${s.done?'완료':'미완료'}\n`; }); }); } });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.setAttribute("download", `Workout_Report_2026.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("CSV 다운로드 활성화.");
}

export function triggerQuickInputFAB() {
    const modal = document.getElementById('quick-input-modal'); const select = document.getElementById('quick-select-ex-name'); select.innerHTML = '';
    Object.values(WORKOUT_DB).forEach(types => Object.values(types).forEach(names => names.forEach(n => select.innerHTML += `<option value="${n}">${n}</option>`)));
    modal.classList.remove('hidden'); modal.classList.add('flex');
}
export function closeQuickInputFABModal() { document.getElementById('quick-input-modal').classList.add('hidden'); document.getElementById('quick-input-modal').classList.remove('flex'); }
export function saveQuickInputFABModal() {
    const name = document.getElementById('quick-select-ex-name').value; const w = parseFloat(document.getElementById('quick-input-weight').value) || 0; const r = parseInt(document.getElementById('quick-input-reps').value) || 0;
    const data = getWorkoutData(); let targetEx = data.exercises.find(e => e.name === name);
    if (!targetEx) {
        let fPart = '기타', fType = '기타';
        Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
        const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
        targetEx = { part: fPart, type: fType, name: name, restTime: dRest, alarmSound: dSound, sets: [] }; data.exercises.push(targetEx);
    }
    targetEx.sets.push({ type: '일반', weight: w, reps: r, memo: 'FAB 기록', done: true });
    triggerSave(showToast); closeQuickInputFABModal(); if(document.getElementById('pane-tab-record').classList.contains('block')) renderWorkoutList(); showToast("신속 등록 완료.");
}

export function initCalendarModule() {
    const now = new Date();
    viewYear = now.getFullYear(); viewMonth = now.getMonth();
    const day = now.getDate();
    const dateStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    state.selectedDateStr = dateStr;

    const labelEl = document.getElementById('label-selected-date');
    if (labelEl) labelEl.textContent = `${String(viewMonth + 1).padStart(2, '0')}/${String(day).padStart(2, '0')}`;

    renderCalendarGrid();
    if (document.getElementById('workout-list-container')) renderWorkoutList();
    loadSystemSettings();
    updateHomeDashboardWidgets();
    updateDdayBadge();
}

function initMetricsChangeEvents() {
    const updateMetricsData = () => {
        const dStr = state.selectedDateStr; if (!dStr) return;
        state.workouts[dStr].weight = parseFloat(document.getElementById('input-daily-weight').value) || 0;
        state.workouts[dStr].bf = parseFloat(document.getElementById('input-daily-bf').value) || 0;
        state.workouts[dStr].smm = parseFloat(document.getElementById('input-daily-smm').value) || 0;
        
        recalculateAllWeightDeltas();

        triggerSave(window.showToast); renderCalendarGrid();
    };
    const weightEl = document.getElementById('input-daily-weight');
    const bfEl = document.getElementById('input-daily-bf');
    const smmEl = document.getElementById('input-daily-smm');

    if (weightEl) weightEl.oninput = updateMetricsData;
    if (bfEl) bfEl.oninput = updateMetricsData;
    if (smmEl) smmEl.oninput = updateMetricsData;
}

initializeFirebase((success) => {
    const statusEl = document.getElementById('cloud-status-workout');
    if (statusEl) { statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10B981]"></span> LOCAL TRAINER ACTIVE'; }
    initMetricsChangeEvents();
    initCalendarModule();
});

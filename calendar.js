/**
 * 파일명: calendar.js
 * 역할: 훈련 일지 기록 관리, 웹 오디오 알람 신디사이징 및 통계 분석 컨트롤러 (2단계 필터 및 편집 오버라이드 적용본)
 * 변경사항: 가져오기 지연 전면 소거, 2단계 연쇄 필터 레일 추가, 최다 선호 종목 정렬 및 추천 루틴 편집 세이브 파이프라인 연동
 */

import { state } from './store.js';
import { initializeFirebase, triggerSave, importDataJSON, saveToLocal } from './services.js';
import { WORKOUT_DB, AVAILABLE_PLATES, BAR_WEIGHT, RECOMMENDED_ROUTINES } from './workoutConstants.js';

let viewYear = 2026;
let viewMonth = 5; 
let restTimerInterval = null;
let alarmAudioInterval = null;
let libraryActivePart = '가슴';
let libraryActiveType = '전체'; // 2단계 세부 종류(중분류) 검색 필터 변수
let undoBuffer = null;
let currentTimerSeconds = 0;
let currentAlarmSound = '1';

let chartBalance = null;
let chartVolume = null;
let chartWeight = null;

// ==========================================
// 브라우저 전역 윈도우 (window) 바인딩 규격 유지
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

// 신규 추가 UI 편의 모듈 윈도우 명세 주입
window.showFullExerciseName = showFullExerciseName;
window.changeLibraryPartFilter = changeLibraryPartFilter;
window.changeLibraryTypeFilter = changeLibraryTypeFilter;
window.triggerEditRecommendedRoutine = triggerEditRecommendedRoutine;
window.saveOverriddenRecommendedRoutine = saveOverriddenRecommendedRoutine;
window.cancelRecommendedRoutineEdit = cancelRecommendedRoutineEdit;

export function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-text').innerText = msg;
    t.className = "fixed bottom-32 right-5 z-[130] transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    setTimeout(() => { t.className = "fixed bottom-32 right-5 z-[130] transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 2500);
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

// ==========================================
// 시스템 전역 설정
// ==========================================
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

// ==========================================
// 웹 오디오 API 기반 알람 합성기 엔진
// ==========================================
function playAudioTone(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const now = ctx.currentTime;
        if (type === '2') { 
            const notes = [659.25, 880, 1046.50];
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'sine'; osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, now + i*0.15);
                gain.gain.linearRampToValueAtTime(0.4, now + i*0.15 + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i*0.15 + 0.15);
                osc.start(now + i*0.15); osc.stop(now + i*0.15 + 0.15);
            });
        } else if (type === '3') { 
            const notes = [523.25, 659.25, 783.99, 1046.50]; 
            notes.forEach((freq, i) => {
                const osc = ctx.createOscillator(); const gain = ctx.createGain();
                osc.connect(gain); gain.connect(ctx.destination);
                osc.type = 'triangle'; osc.frequency.value = freq;
                gain.gain.setValueAtTime(0, now + i*0.2);
                gain.gain.linearRampToValueAtTime(0.2, now + i*0.2 + 0.1);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i*0.2 + 0.4);
                osc.start(now + i*0.2); osc.stop(now + i*0.2 + 0.4);
            });
        } else if (type === '4') { 
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'square';
            osc.frequency.setValueAtTime(600, now); osc.frequency.setValueAtTime(800, now + 0.2);
            osc.frequency.setValueAtTime(600, now + 0.4); osc.frequency.setValueAtTime(800, now + 0.6);
            gain.gain.setValueAtTime(0.1, now);
            osc.start(now); osc.stop(now + 0.8);
        } else if (type === '5') { 
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine'; osc.frequency.value = 440; 
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.4, now + 0.1);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.5);
            osc.start(now); osc.stop(now + 1.5);
        } else { 
            const osc = ctx.createOscillator(); const gain = ctx.createGain();
            osc.connect(gain); gain.connect(ctx.destination);
            osc.type = 'sine'; osc.frequency.value = 880;
            gain.gain.setValueAtTime(0.3, now);
            osc.start(now); osc.stop(now + 0.3);
        }
    } catch(e) {}
}

function triggerAlarmRing(soundType) {
    document.getElementById('timer-controls-default').classList.add('hidden');
    document.getElementById('timer-controls-extend').classList.remove('hidden');
    document.getElementById('timer-controls-extend').classList.add('flex');
    document.getElementById('timer-pulse-dot').classList.remove('bg-rose-500');
    document.getElementById('timer-pulse-dot').classList.add('bg-amber-500');

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
    document.getElementById('timer-controls-extend').classList.add('hidden');
    document.getElementById('timer-controls-extend').classList.remove('flex');
    document.getElementById('timer-pulse-dot').classList.add('bg-rose-500');
    document.getElementById('timer-pulse-dot').classList.remove('bg-amber-500');
    
    startTimerLogic(currentTimerSeconds + secondsToAdd, currentAlarmSound);
}

function startTimerLogic(seconds, soundType) {
    if (restTimerInterval) clearInterval(restTimerInterval);
    if (alarmAudioInterval) clearInterval(alarmAudioInterval);
    
    currentTimerSeconds = seconds;
    currentAlarmSound = soundType || '1';
    
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
            clearInterval(restTimerInterval);
            display.textContent = "00:00";
            triggerAlarmRing(currentAlarmSound);
        } else { display.textContent = formatTime(currentTimerSeconds); }
    }, 1000);
}

export function startGlobalAlarm() {
    const sec = parseInt(document.getElementById('manual-timer-sec').value) || 60;
    const soundType = document.getElementById('alarm-sound-select').value || '1';
    const interval = parseInt(document.getElementById('alarm-interval-select').value) || 1000;
    
    if(!state.userInfo) state.userInfo = {};
    state.userInfo.defaultAlarmSound = soundType;
    state.userInfo.alarmInterval = interval;
    triggerSave(showToast); loadSystemSettings();

    startTimerLogic(sec, soundType);
}

// ==========================================
// 탭 전환 및 메인 스크리닝 요약 바인딩
// ==========================================
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

function updateHomeDashboardWidgets() {
    const data = getWorkoutData();
    const routineTitle = document.getElementById('home-routine-title');
    if (data.exercises.length > 0) routineTitle.innerText = `현재 ${data.exercises.length}개 종목 기록 중`;
    else routineTitle.innerText = `오늘 지정된 루틴 없음`;

    const widgetBox = document.getElementById('home-quick-widget-box');
    widgetBox.innerHTML = '';
    
    const freqData = calculateExerciseFrequencies();
    const recentShowItems = freqData.slice(0, 3).map(item => item[0]);

    if (recentShowItems.length === 0) { 
        widgetBox.innerHTML = `<p class="text-xs text-slate-500 py-3 text-center col-span-3">누적 기록이 부족합니다.</p>`; 
        return; 
    }
    recentShowItems.forEach(name => {
        const btn = document.createElement('button'); btn.innerText = name;
        btn.className = "p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 truncate active:scale-95 text-center";
        btn.onclick = () => {
            const currentData = getWorkoutData();
            if (!currentData.exercises.some(e => e.name === name)) {
                let fPart = '기타', fType = '위젯';
                Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
                const dRest = state.userInfo?.defaultRestTime || 90;
                const dSound = state.userInfo?.defaultAlarmSound || '1';
                currentData.exercises.push({ part: fPart, type: fType, name: name, restTime: dRest, alarmSound: dSound, sets: [] });
                triggerSave(showToast); showToast(`${name} 기록지에 연동 완료.`);
            } else { showToast("이미 등록된 종목입니다."); }
        };
        widgetBox.appendChild(btn);
    });
}

export function calculateWorkoutDDay() {
    const target = new Date(state.userInfo.targetDate || '2026-07-18');
    const today = new Date();
    const diffDays = Math.ceil((new Date(target.getFullYear(), target.getMonth(), target.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / (1000 * 60 * 60 * 24));
    const badgeEl = document.getElementById('badge-dday');
    if (badgeEl) badgeEl.textContent = diffDays > 0 ? `D-${diffDays}일` : (diffDays === 0 ? `D-Day` : `D+${Math.abs(diffDays)}`);
}

// ==========================================
// 달력 제어 컴포넌트
// ==========================================
export function renderCalendarGrid() {
    const gridEl = document.getElementById('calendar-grid');
    if(!gridEl) return; gridEl.innerHTML = '';
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

export function openRestTimerModal(exIdx) {
    const data = getWorkoutData();
    const ex = data.exercises[exIdx];
    document.getElementById('rest-timer-ex-idx').value = exIdx;
    document.getElementById('rest-timer-sec-input').value = ex.restTime || state.userInfo?.defaultRestTime || 90;
    document.getElementById('rest-timer-sound-input').value = ex.alarmSound || state.userInfo?.defaultAlarmSound || '1';
    
    document.getElementById('rest-timer-modal').classList.remove('hidden');
    document.getElementById('rest-timer-modal').classList.add('flex');
}

export function closeRestTimerModal() {
    document.getElementById('rest-timer-modal').classList.add('hidden');
    document.getElementById('rest-timer-modal').classList.remove('flex');
}

export function adjRestTimerSetting(delta) {
    const input = document.getElementById('rest-timer-sec-input');
    let val = parseInt(input.value) || 0; val += delta; if(val < 0) val = 0; input.value = val;
}

export function saveRestTimerModal() {
    const exIdx = parseInt(document.getElementById('rest-timer-ex-idx').value);
    const sec = parseInt(document.getElementById('rest-timer-sec-input').value) || 90;
    const sound = document.getElementById('rest-timer-sound-input').value || '1';
    
    const data = getWorkoutData();
    data.exercises[exIdx].restTime = sec;
    data.exercises[exIdx].alarmSound = sound;
    
    triggerSave(showToast); closeRestTimerModal(); renderWorkoutList(); showToast("개별 알람 설정이 반영되었습니다.");
}

// ==========================================
// 일지 기록지 및 세트 편집 엔진 (오버라이드 바 신설)
// ==========================================
export function renderWorkoutList() {
    const container = document.getElementById('workout-list-container');
    if(!container) return; container.innerHTML = '';
    
    // [신규 핵심 편의 구조] 추천 분할 루틴 프로그램 편집 모드 활성화 시 상단 에디팅 제어 바 노출
    const overrideBar = document.getElementById('recommended-override-bar');
    const overrideTitle = document.getElementById('recommended-override-title');
    if (state.editingRecommendedTitle) {
        overrideTitle.innerText = `현재 [${state.editingRecommendedTitle}] 프로그램 편집 모드`;
        overrideBar.classList.remove('hidden');
        overrideBar.classList.add('flex');
    } else {
        overrideBar.classList.remove('flex');
        overrideBar.classList.add('hidden');
    }

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
            const est1RM = set.weight * (1 + (set.reps / 30));
            if (est1RM > max1RM) max1RM = est1RM;

            setsHtml += `
            <div class="flex items-center justify-between gap-1.5 p-2 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs sm:text-sm">
                <span class="font-black text-amber-500 w-4 text-center">${setIdx + 1}</span>
                <select onchange="window.changeSetField(${exIdx}, ${setIdx}, 'type', event.target.value)" class="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 outline-none text-xs">
                    <option value="일반" ${set.type==='일반'?'selected':''}>일반</option><option value="탑" ${set.type==='탑'?'selected':''}>탑</option>
                    <option value="백오프" ${set.type==='백오프'?'selected':''}>백오프</option><option value="드롭" ${set.type==='드롭'?'selected':''}>드롭</option><option value="슈퍼" ${set.type==='슈퍼'?'selected':''}>슈퍼</option>
                </select>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', -2.5)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">−</button>
                    <input type="number" step="0.1" inputmode="decimal" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'weight', event.target.value)" class="w-10 bg-transparent text-center font-bold text-white outline-none text-xs" value="${set.weight}">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', 2.5)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">＋</button>
                </div>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', -1)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">−</button>
                    <input type="number" inputmode="numeric" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'reps', event.target.value)" class="w-8 bg-transparent text-center font-bold text-white outline-none text-xs" value="${set.reps}">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', 1)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">＋</button>
                </div>
                <input type="checkbox" ${set.done?'checked':''} onchange="window.toggleSetComplete(${exIdx}, ${setIdx}, event.target.checked)" class="w-5 h-5 accent-amber-500 cursor-pointer shrink-0 ml-1">
                <button onclick="window.deleteSet(${exIdx}, ${setIdx})" class="text-slate-500 hover:text-rose-400 font-black text-xs px-1">✕</button>
            </div>`;
        });

        const card = document.createElement('div');
        card.className = "bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 space-y-3";
        card.innerHTML = `
            <div class="flex justify-between items-start border-b border-slate-800/60 pb-2">
                <div class="flex-1">
                    <span class="px-2 py-0.5 text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">${ex.part} · ${ex.type}</span>
                    <div class="flex flex-wrap items-center gap-2 mt-1.5 mb-1">
                        <h3 class="text-sm font-black text-white">${ex.name}</h3>
                        <span onclick="window.openRestTimerModal(${exIdx})" class="text-[10px] font-bold bg-slate-800 hover:bg-amber-500/20 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-md cursor-pointer transition-colors active:scale-95">⏱️ 알람 (${currentRestTime}초)</span>
                    </div>
                    <p class="text-[10px] text-slate-400 font-medium">1RM 추정 최고치: ${max1RM > 0 ? max1RM.toFixed(1) + 'kg' : '---'}</p>
                </div>
                <button onclick="window.deleteExercise(${exIdx})" class="text-[11px] px-2 py-1 bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-400 rounded-md shrink-0">삭제</button>
            </div>
            <div class="space-y-1.5">${setsHtml}</div>
            <button onclick="window.addSet(${exIdx})" class="w-full py-1.5 border border-dashed border-slate-800 text-xs text-slate-400 hover:text-amber-400 font-bold rounded-xl bg-slate-950/20 transition-colors">+ 세트 추가</button>
        `;
        container.appendChild(card);
    });

    const totalVolumeEl = document.getElementById('label-total-volume');
    if(totalVolumeEl) totalVolumeEl.innerText = `총 훈련 볼륨: ${dailyTotalVolume.toLocaleString()} kg`;
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
    undoBuffer = { type: 'set', exIdx: exIdx, setIdx: setIdx, data: JSON.parse(JSON.stringify(ex.sets[setIdx])) };
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
document.getElementById('btn-undo').onclick = () => {
    if (undoBuffer && undoBuffer.type === 'set') {
        const data = getWorkoutData(); data.exercises[undoBuffer.exIdx].sets.splice(undoBuffer.setIdx, 0, undoBuffer.data);
        undoBuffer = null; triggerSave(showToast); renderWorkoutList(); document.getElementById('btn-undo').classList.add('hidden'); showToast("세트 복원 성공.");
    }
};

// ==========================================
// 📚 종목 사전 계층형 2단계 상세 검색 및 빈도 산출 시스템
// ==========================================
/**
 * 모든 과거 기록지를 루프하여 사용 빈도가 높은 보디빌딩 종목 리스트를 계량화하는 함수
 */
function calculateExerciseFrequencies() {
    const counts = {};
    Object.values(state.workouts).forEach(w => {
        if (w && w.exercises) {
            w.exercises.forEach(e => { counts[e.name] = (counts[e.name] || 0) + 1; });
        }
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
}

export function openLibraryModal() {
    document.getElementById('library-fullname-viewer').classList.add('hidden');
    document.getElementById('library-modal').classList.remove('hidden'); 
    document.getElementById('library-modal').classList.add('flex');
    libraryActiveType = '전체'; 
    runLibrarySearchFilter();
}

export function closeLibraryModal() {
    document.getElementById('library-modal').classList.add('hidden'); 
    document.getElementById('library-modal').classList.remove('flex');
}

export function changeLibraryPartFilter(part) {
    libraryActivePart = part; libraryActiveType = '전체'; runLibrarySearchFilter();
}

export function changeLibraryTypeFilter(type) {
    libraryActiveType = type; runLibrarySearchFilter();
}

export function showFullExerciseName(name) {
    const viewer = document.getElementById('library-fullname-viewer');
    viewer.innerText = `🔍 전체 운동 명칭: ${name}`; viewer.classList.remove('hidden');
}

export function runLibrarySearchFilter() {
    const rawInput = document.getElementById('library-search-input').value.trim().toLowerCase();
    const input = rawInput.replace(/\s+/g, ''); 
    const grid = document.getElementById('library-master-card-grid'); grid.innerHTML = '';
    
    // 1단계 대분류 수평 렌더레일
    const filterBar = document.getElementById('library-filter-part-bar'); filterBar.innerHTML = '';
    const parts = ['전체', ...Object.keys(WORKOUT_DB)];
    parts.forEach(p => {
        const pill = document.createElement('button'); pill.innerText = p;
        pill.className = `px-3 py-1.5 text-xs font-black rounded-full whitespace-nowrap transition-colors ${p === libraryActivePart ? 'bg-amber-500 text-slate-950' : 'bg-slate-800 text-slate-400'}`;
        pill.onclick = () => changeLibraryPartFilter(p); filterBar.appendChild(pill);
    });

    // 2단계 중분류 연쇄 수평 렌더레일
    const typeBar = document.getElementById('library-filter-type-bar'); typeBar.innerHTML = '';
    if (libraryActivePart !== '전체' && WORKOUT_DB[libraryActivePart]) {
        typeBar.classList.remove('hidden'); typeBar.classList.add('flex');
        const types = ['전체', ...Object.keys(WORKOUT_DB[libraryActivePart])];
        types.forEach(t => {
            const pill = document.createElement('button'); pill.innerText = t;
            pill.className = `px-2.5 py-1 text-[11px] font-bold rounded-lg whitespace-nowrap transition-colors ${t === libraryActiveType ? 'bg-sky-500 text-white' : 'bg-slate-900 border border-slate-800 text-slate-400'}`;
            pill.onclick = () => changeLibraryTypeFilter(t); typeBar.appendChild(pill);
        });
    } else {
        typeBar.classList.remove('flex'); typeBar.classList.add('hidden');
    }

    // 조건부 종목 마운팅 루프
    Object.entries(WORKOUT_DB).forEach(([part, types]) => {
        if (libraryActivePart !== '전체' && part !== libraryActivePart) return;
        Object.entries(types).forEach(([type, names]) => {
            if (libraryActiveType !== '전체' && type !== libraryActiveType) return;
            names.forEach(name => {
                const cleanName = name.toLowerCase().replace(/\s+/g, '');
                const chosung = getHangulChosung(name).toLowerCase().replace(/\s+/g, '');
                if (input && !(cleanName.includes(input) || chosung.includes(input))) return;
                
                const card = document.createElement('div');
                card.className = "h-16 p-3 bg-slate-900 border border-slate-800 rounded-xl flex justify-between items-center overflow-hidden";
                card.innerHTML = `
                    <div class="truncate mr-2 flex-1 cursor-pointer" onclick="window.showFullExerciseName('${name}')">
                        <span class="text-[9px] font-bold text-slate-500 block uppercase">${part} · ${type}</span>
                        <h4 class="text-xs sm:text-sm font-black text-slate-200 truncate leading-tight">${name}</h4>
                    </div>
                    <button onclick="window.injectLibraryToToday('${part}', '${type}', '${name}')" class="px-2.5 py-1.5 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-[11px] font-bold rounded-lg transition-colors shrink-0">추가</button>`;
                grid.appendChild(card);
            });
        });
    });

    // 하단 최다 빈도 핫픽 목록 내림차순 출력부
    const freqBox = document.getElementById('library-frequent-box');
    const freqGrid = document.getElementById('library-frequent-grid');
    freqGrid.innerHTML = '';
    
    const freqData = calculateExerciseFrequencies();
    if (freqData.length > 0) {
        freqBox.classList.remove('hidden');
        freqData.forEach(([name, count]) => {
            let fPart = '기타', fType = '기타';
            Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
            
            const card = document.createElement('div');
            card.className = "h-16 p-3 bg-slate-950 border border-amber-500/20 rounded-xl flex justify-between items-center overflow-hidden";
            card.innerHTML = `
                <div class="truncate mr-2 flex-1 cursor-pointer" onclick="window.showFullExerciseName('${name}')">
                    <span class="text-[9px] font-black text-amber-500 block uppercase">★ 최다수행 (${count}회)</span>
                    <h4 class="text-xs sm:text-sm font-black text-slate-300 truncate leading-tight">${name}</h4>
                </div>
                <button onclick="window.injectLibraryToToday('${fPart}', '${fType}', '${name}')" class="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500 hover:text-slate-950 text-[11px] text-amber-400 font-bold rounded-lg border border-amber-500/20 transition-colors shrink-0">추가</button>`;
            freqGrid.appendChild(card);
        });
    } else { freqBox.classList.add('hidden'); }
}

export function injectLibraryToToday(part, type, name) {
    const data = getWorkoutData();
    if (!data.exercises.some(e => e.name === name)) {
        const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
        data.exercises.push({ part: part, type: type, name: name, restTime: dRest, alarmSound: dSound, sets: [] });
        triggerSave(showToast); if (document.getElementById('pane-tab-record').classList.contains('block')) renderWorkoutList();
        showToast(`[${name}]이 일지에 마운트되었습니다.`);
    } else { showToast("이미 추가된 종목입니다."); }
}

// ==========================================
// 📋 분할 루틴 및 추천 프로그램 오버라이드 엔진
// ==========================================
export function openTemplateManager() { document.getElementById('template-modal').classList.remove('hidden'); document.getElementById('template-modal').classList.add('flex'); renderTemplateList(); }
export function closeTemplateManager() { document.getElementById('template-modal').classList.add('hidden'); document.getElementById('template-modal').classList.remove('flex'); }

function renderTemplateList() {
    const box = document.getElementById('template-list-box'); if(!box) return; box.innerHTML = '';
    if (!state.templates || state.templates.length === 0) { box.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">저장된 내 프리셋 루틴이 없습니다.</p>`; return; }
    state.templates.forEach((tmpl) => {
        const div = document.createElement('div'); div.className = "flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs gap-2";
        div.innerHTML = `<span onclick="window.applyTemplate(${tmpl.id})" class="text-slate-200 font-bold hover:text-amber-400 cursor-pointer flex-1 truncate">${tmpl.title} (${tmpl.exercises.length}종목)</span><button onclick="window.deleteTemplate(${tmpl.id})" class="text-rose-400 hover:text-rose-500 font-bold shrink-0">삭제</button>`;
        box.appendChild(div);
    });
}

export function openSaveRoutineModal() {
    const data = getWorkoutData(); if (data.exercises.length === 0) { showToast("현재 일지에 저장할 운동이 없습니다."); return; }
    document.getElementById('save-routine-name-input').value = '';
    document.getElementById('save-routine-modal').classList.remove('hidden'); document.getElementById('save-routine-modal').classList.add('flex');
}
export function closeSaveRoutineModal() { document.getElementById('save-routine-modal').classList.add('hidden'); document.getElementById('save-routine-modal').classList.remove('flex'); }

export function confirmSaveRoutine() {
    const data = getWorkoutData(); const title = document.getElementById('save-routine-name-input').value.trim() || '내 맞춤 루틴';
    const cleanedExercises = data.exercises.map(ex => ({ part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime, alarmSound: ex.alarmSound, sets: ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, memo: s.memo, done: false })) }));
    if (!state.templates) state.templates = [];
    state.templates.push({ id: Date.now(), title: title, exercises: cleanedExercises });
    triggerSave(showToast); closeSaveRoutineModal(); showToast("루틴 백업이 영구 보존 완료되었습니다.");
}

/**
 * 사용자 맞춤형 루틴 불러오기 가동 함수
 * 보완 대책: 불러오기 즉시 기록 탭 전환(리다이렉션) 및 0ms 즉각 화면 갱신을 통해 시각적 지연 현상 소거
 */
export function applyTemplate(tmplId) {
    if (!confirm("오늘 일지의 기존 기록이 초기화되고 복원 프리셋으로 대체됩니다. 계속할까요?")) return;
    const tmpl = state.templates.find(t => t.id === tmplId); if (!tmpl) return;
    const data = getWorkoutData();
    data.exercises = JSON.parse(JSON.stringify(tmpl.exercises));
    
    // 로컬 즉시 영속화 및 지연 소거 탭 리다이렉션 체인 가동
    triggerSave(showToast); 
    closeTemplateManager(); 
    switchCalendarTab('tab-record'); 
    renderWorkoutList(); 
    showToast("루틴 데이터가 실시간 복원 반영되었습니다.");
}

export function deleteTemplate(tmplId) {
    if (confirm("이 프리셋을 영구 삭제하시겠습니까?")) { state.templates = state.templates.filter(t => t.id !== tmplId); triggerSave(showToast); renderTemplateList(); }
}

/**
 * 분할루틴 탭 인터페이스 자동 빌더 엔진
 * 보완 대책: 사용자 재정의(Override) 덮어쓰기 데이터가 감지되면 마스터 상수를 차단하고 커스텀 수정본을 최우선 정렬 배치 노출
 */
export function renderPresetRoutineGrid() {
    const gridBox = document.getElementById('routine-preset-grid-box'); if(!gridBox) return; gridBox.innerHTML = '';
    
    // 로컬 스토리지에 저장된 추천 루틴 수정 오버라이드 딕셔너리 로드
    const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');

    // 1. 최상단 사용자 맞춤형 백업 루틴 세트 나열
    if (state.templates && state.templates.length > 0) {
        const titleSec = document.createElement('div');
        titleSec.className = "col-span-1 sm:col-span-2 border-b border-slate-800 pb-1 mt-2";
        titleSec.innerHTML = `<h3 class="text-xs font-black text-sky-400 uppercase tracking-wider">💾 내가 백업한 맞춤형 프리셋 루틴</h3>`;
        gridBox.appendChild(titleSec);
        
        state.templates.forEach(tmpl => {
            const card = document.createElement('div');
            card.className = "glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between gap-4 animate-fade-in";
            card.innerHTML = `
                <div>
                    <h3 class="text-sm font-black text-white uppercase">${tmpl.title}</h3>
                    <p class="text-xs text-slate-400 mt-2 leading-relaxed break-all">${tmpl.exercises.map(e => e.name).join(', ')}</p>
                </div>
                <div class="flex gap-2">
                    <button class="flex-1 bg-slate-800 hover:bg-sky-500 hover:text-white text-xs font-bold py-3 rounded-xl border border-slate-700 transition-colors" onclick="window.applyTemplate(${tmpl.id})">가져오기</button>
                    <button class="flex-1 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-xs font-black py-3 rounded-xl border border-slate-800 transition-colors" onclick="window.triggerEditRecommendedRoutine('${tmpl.title}', true, ${tmpl.id})">✏️ 루틴 편집</button>
                </div>`;
            gridBox.appendChild(card);
        });
    }

    // 2. 하단 협업자 추천 분할 프로그램 세트 나열 (우선순위 역산 검사 매핑)
    const titleSecRec = document.createElement('div');
    titleSecRec.className = "col-span-1 sm:col-span-2 border-b border-slate-800 pb-1 mt-4";
    titleSecRec.innerHTML = `<h3 class="text-xs font-black text-amber-500 uppercase tracking-wider">🌟 보디빌딩 협업자 추천 분할 마스터 프로그램</h3>`;
    gridBox.appendChild(titleSecRec);

    RECOMMENDED_ROUTINES.forEach(prog => {
        // 우선순위 정렬 정책: 오버라이드된 사용자 편집본이 있다면 상수 컬렉션을 차단하고 대체 주입
        const hasCustom = !!customRecommended[prog.title];
        const displayExercises = hasCustom ? customRecommended[prog.title] : prog.exercises;
        const subBadge = hasCustom ? `<span class="text-[9px] font-black text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded ml-1.5">내가 편집함</span>` : '';

        const card = document.createElement('div');
        card.className = "glass-panel p-5 rounded-2xl border border-slate-800 flex flex-col justify-between gap-4 animate-fade-in";
        card.innerHTML = `
            <div>
                <h3 class="text-sm font-black text-slate-100 uppercase flex items-center">${prog.title} ${subBadge}</h3>
                <p class="text-xs text-slate-400 mt-2 leading-relaxed break-keep">${displayExercises.map(e => e.name).join(', ')}</p>
            </div>
            <div class="flex gap-2">
                <button class="flex-1 bg-slate-800 hover:bg-amber-500 hover:text-slate-950 text-xs font-bold py-3 rounded-xl border border-slate-700 transition-colors" onclick='window.applyDirectPresetRoutine(${JSON.stringify(displayExercises.map(e => e.name))})'>가동 마운트</button>
                <button class="flex-1 bg-slate-900 hover:bg-amber-500 hover:text-slate-950 text-xs font-black py-3 rounded-xl border border-slate-800 transition-colors" onclick="window.triggerEditRecommendedRoutine('${prog.title}', false, null)">✏️ 루틴 편집</button>
            </div>`;
        gridBox.appendChild(card);
    });
}

/**
 * 루틴 편집 모드 기동 핸들러 함수 (방법 A: 일지 화면 직접 상속 공유 방식)
 */
export function triggerEditRecommendedRoutine(title, isUserTemplate, templateId) {
    if (!confirm(`[${title}] 구성을 현재 일지 기록지로 이관하여 편집하시겠습니까?\n편집 후 상단의 저장창을 통해 오버라이드 보존이 집행됩니다.`)) return;
    
    let targetExercises = [];
    if (isUserTemplate) {
        const tmpl = state.templates.find(t => t.id === templateId);
        if (tmpl) targetExercises = JSON.parse(JSON.stringify(tmpl.exercises));
    } else {
        const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');
        if (customRecommended[title]) {
            targetExercises = customRecommended[title];
        } else {
            const orig = RECOMMENDED_ROUTINES.find(r => r.title === title);
            if (orig) targetExercises = orig.exercises;
        }
    }

    const data = getWorkoutData();
    const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
    
    // 일지 기록지 버퍼로 데이터 강제 주입 복사
    data.exercises = targetExercises.map(ex => ({
        part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime || dRest, alarmSound: ex.alarmSound || dSound,
        sets: (ex.sets && ex.sets.length > 0) ? JSON.parse(JSON.stringify(ex.sets)) : [{ type: '일반', weight: 40, reps: 10, done: false }]
    }));

    // 전역 상태에 에디팅 메타 추적 플래그 셋 수립
    state.editingRecommendedTitle = title;
    state.editingIsUserTemplateFlag = isUserTemplate;
    state.editingTemplateIdRef = templateId;

    // 즉시 일지 기록지로 페이지를 전환하고 뷰 마운트 동기화
    switchCalendarTab('tab-record');
    renderWorkoutList();
    showToast("루틴 실전 편집 모드가 연결되었습니다.");
}

/**
 * 편집 완료된 버퍼 데이터를 확정하여 전용 데이터셋에 덮어쓰기 오버라이드 집행하는 함수
 */
export function saveOverriddenRecommendedRoutine() {
    if (!state.editingRecommendedTitle) return;
    const data = getWorkoutData();
    
    // 불필요한 일회성 수행 완료 상태를 지우고 순수 코어 블루프린트 템플릿 형태로 인코딩 구조화
    const optimizedExercises = data.exercises.map(ex => ({
        part: ex.part, type: ex.type, name: ex.name, restTime: ex.restTime, alarmSound: ex.alarmSound,
        sets: ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, done: false }))
    }));

    if (state.editingIsUserTemplateFlag) {
        // 1. 내 개인 루틴 프리셋 수정 덮어쓰기 분기
        const tmpl = state.templates.find(t => t.id === state.editingTemplateIdRef);
        if (tmpl) tmpl.exercises = optimizedExercises;
    } else {
        // 2. 협업자 추천 마스터 프로그램 오버라이드 수동 분기
        const customRecommended = JSON.parse(localStorage.getItem('prep_master_custom_recommended') || '{}');
        customRecommended[state.editingRecommendedTitle] = optimizedExercises;
        localStorage.setItem('prep_master_custom_recommended', JSON.stringify(customRecommended));
    }

    state.editingRecommendedTitle = null;
    triggerSave(showToast); renderWorkoutList(); showToast("편집본 덮어쓰기 저장이 안전하게 영속화되었습니다.");
}

export function cancelRecommendedRoutineEdit() {
    state.editingRecommendedTitle = null; renderWorkoutList(); showToast("루틴 편집 작업이 철회되었습니다.");
}

export function applyDirectPresetRoutine(namesArray) {
    if(!confirm("기존 일지 기록이 초기화되고 선택한 프로그램 종목으로 대체 마운트됩니다. 진행할까요?")) return;
    const data = getWorkoutData();
    const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
    data.exercises = namesArray.map(name => {
        let fPart = '전신', fType = '기타';
        Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
        return { part: fPart, type: fType, name: name, restTime: dRest, alarmSound: dSound, sets: [{type:'일반', weight:40, reps:10, done:false}] };
    });
    triggerSave(showToast); switchCalendarTab('tab-record'); showToast("프로그램 가동 마운트 완료.");
}

// ==========================================
// 다차원 분석 리포트 통계 모듈
// ==========================================
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
            showToast("보안 지정 폴더에 정상 보존되었습니다.");
        } else {
            const blob = new Blob([dataStr], { type: 'application/json' }); const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = fileName; link.click();
            showToast("다운로드 폴더에 백업 내보내기가 집행되었습니다.");
        }
    } catch (err) { showToast("백업 내보내기가 취소되었습니다."); }
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
        let fPart = '기타', fType = '기타'; Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
        const dRest = state.userInfo?.defaultRestTime || 90; const dSound = state.userInfo?.defaultAlarmSound || '1';
        targetEx = { part: fPart, type: fType, name: name, restTime: dRest, alarmSound: dSound, sets: [] }; data.exercises.push(targetEx);
    }
    targetEx.sets.push({ type: '일반', weight: w, reps: r, memo: 'FAB 기록', done: true });
    triggerSave(showToast); closeQuickInputFABModal(); if(document.getElementById('pane-tab-record').classList.contains('block')) renderWorkoutList(); showToast("신속 등록 완료.");
}

function initMetricsChangeEvents() {
    const updateMetricsData = () => {
        const dStr = state.selectedDateStr; if (!dStr) return;
        state.workouts[dStr].weight = parseFloat(document.getElementById('input-daily-weight').value) || 0;
        state.workouts[dStr].bf = parseFloat(document.getElementById('input-daily-bf').value) || 0;
        state.workouts[dStr].smm = parseFloat(document.getElementById('input-daily-smm').value) || 0;
        triggerSave(showToast); renderCalendarGrid();
    };
    document.getElementById('input-daily-weight').oninput = updateMetricsData; document.getElementById('input-daily-bf').oninput = updateMetricsData; document.getElementById('input-daily-smm').oninput = updateMetricsData;
}
initMetricsChangeEvents();

initializeFirebase((success) => {
    const statusEl = document.getElementById('cloud-status-workout');
    if (statusEl) { statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full shadow-[0_0_8px_#10B981]"></span> LOCAL AUTOSAVE ACTIVE'; }
    calculateWorkoutDDay();
    const today = new Date(); viewYear = today.getFullYear(); viewMonth = today.getMonth();
    selectWorkoutDate(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
    loadSystemSettings(); switchCalendarTab('tab-home');
    setInterval(() => { saveToLocal(); }, 60000);
});

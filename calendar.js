/**
 * 파일명: calendar.js
 * 역할: 전역 탭 고정, 개별 휴식 타이머, 웹 오디오 알람 및 띄어쓰기 무시 사전 검색 통합 컨트롤러
 */

import { state } from './store.js';
import { initializeFirebase, triggerSave, exportDataJSON, importDataJSON } from './services.js';
import { WORKOUT_DB, AVAILABLE_PLATES, BAR_WEIGHT } from './workoutConstants.js';

let viewYear = 2026;
let viewMonth = 5; 
let restTimerInterval = null;
let alarmAudioInterval = null;
let libraryActivePart = '가슴';
let undoBuffer = null;
let currentTimerSeconds = 0;
let isRinging = false;

window.switchCalendarTab = switchCalendarTab;
window.runLibrarySearchFilter = runLibrarySearchFilter;
window.injectLibraryToToday = injectLibraryToToday;
window.triggerSettingExport = triggerSettingExport;
window.triggerSettingImport = triggerSettingImport;
window.triggerClearAllWorkoutData = triggerClearAllWorkoutData;
window.triggerQuickInputFAB = triggerQuickInputFAB;
window.closeQuickInputFABModal = closeQuickInputFABModal;
window.saveQuickInputFABModal = saveQuickInputFABModal;
window.exportWorkoutToCSV = exportWorkoutToCSV;
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

export function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-text').innerText = msg;
    t.className = "fixed bottom-32 right-5 z-[60] transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    setTimeout(() => { t.className = "fixed bottom-32 right-5 z-[60] transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 2500);
}

// ==========================================
// 1. 웹 오디오 API 기반 5종 합성 알람 시스템
// ==========================================
function playAudioTone(type) {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        
        const now = ctx.currentTime;
        if(type === '1') { osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); gain.gain.setValueAtTime(0.3, now); osc.start(now); osc.stop(now + 0.3); }
        else if(type === '2') { osc.type = 'sine'; osc.frequency.setValueAtTime(1000, now); gain.gain.setValueAtTime(0.3, now); osc.start(now); gain.gain.exponentialRampToValueAtTime(0.001, now+0.1); osc.stop(now+0.1); setTimeout(()=>{ playAudioTone('1'); }, 150); }
        else if(type === '3') { osc.type = 'triangle'; osc.frequency.setValueAtTime(1200, now); osc.frequency.linearRampToValueAtTime(800, now+0.5); gain.gain.setValueAtTime(0.3, now); osc.start(now); osc.stop(now + 0.5); }
        else if(type === '4') { osc.type = 'square'; osc.frequency.setValueAtTime(600, now); osc.frequency.setValueAtTime(800, now+0.2); gain.gain.setValueAtTime(0.2, now); osc.start(now); osc.stop(now + 0.4); }
        else if(type === '5') { osc.type = 'sawtooth'; osc.frequency.setValueAtTime(200, now); gain.gain.setValueAtTime(0.3, now); osc.start(now); osc.stop(now + 0.4); }
        else { osc.type = 'sine'; osc.frequency.setValueAtTime(880, now); gain.gain.setValueAtTime(0.3, now); osc.start(now); osc.stop(now + 0.3); }
    } catch(e) { console.warn("오디오 지원 불가"); }
}

function triggerAlarmRing() {
    isRinging = true;
    const soundType = document.getElementById('alarm-sound-select') ? document.getElementById('alarm-sound-select').value : '1';
    document.getElementById('timer-controls-default').classList.add('hidden');
    document.getElementById('timer-controls-extend').classList.remove('hidden');
    document.getElementById('timer-controls-extend').classList.add('flex');
    document.getElementById('timer-pulse-dot').classList.remove('bg-rose-500');
    document.getElementById('timer-pulse-dot').classList.add('bg-amber-500');

    playAudioTone(soundType);
    if(alarmAudioInterval) clearInterval(alarmAudioInterval);
    alarmAudioInterval = setInterval(() => { playAudioTone(soundType); }, 1500);
}

export function stopRestTimer() {
    if (restTimerInterval) clearInterval(restTimerInterval);
    if (alarmAudioInterval) clearInterval(alarmAudioInterval);
    isRinging = false;
    document.getElementById('timer-floating-bar').className = "fixed bottom-0 left-0 w-full z-[70] transform translate-y-full opacity-0 transition-all duration-500 pointer-events-none";
}

export function extendRestTimer(secondsToAdd) {
    if (alarmAudioInterval) clearInterval(alarmAudioInterval);
    isRinging = false;
    document.getElementById('timer-controls-default').classList.remove('hidden');
    document.getElementById('timer-controls-extend').classList.add('hidden');
    document.getElementById('timer-controls-extend').classList.remove('flex');
    document.getElementById('timer-pulse-dot').classList.add('bg-rose-500');
    document.getElementById('timer-pulse-dot').classList.remove('bg-amber-500');
    
    startTimerLogic(currentTimerSeconds + secondsToAdd);
}

function startTimerLogic(seconds) {
    if (restTimerInterval) clearInterval(restTimerInterval);
    if (alarmAudioInterval) clearInterval(alarmAudioInterval);
    
    const bar = document.getElementById('timer-floating-bar');
    const display = document.getElementById('timer-countdown-display');
    
    document.getElementById('timer-controls-default').classList.remove('hidden');
    document.getElementById('timer-controls-extend').classList.add('hidden');
    
    currentTimerSeconds = seconds;
    bar.className = "fixed bottom-0 left-0 w-full z-[70] transform translate-y-0 opacity-100 transition-all duration-500 pointer-events-auto";
    
    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    display.textContent = formatTime(currentTimerSeconds);

    restTimerInterval = setInterval(() => {
        currentTimerSeconds--;
        if (currentTimerSeconds <= 0) {
            clearInterval(restTimerInterval);
            display.textContent = "00:00";
            triggerAlarmRing();
        } else { 
            display.textContent = formatTime(currentTimerSeconds); 
        }
    }, 1000);
}

export function startGlobalAlarm() {
    const sec = parseInt(document.getElementById('manual-timer-sec').value) || 60;
    startTimerLogic(sec);
    switchCalendarTab('tab-home');
    showToast("글로벌 알람이 백그라운드에서 가동됩니다.");
}

// 2. 상단 탭 제어
export function switchCalendarTab(tabId) {
    document.querySelectorAll('.calendar-pane').forEach(el => el.classList.add('hidden'));
    document.querySelectorAll('.calendar-pane').forEach(el => el.classList.remove('block'));
    const targetPane = document.getElementById('pane-' + tabId);
    if (targetPane) { targetPane.classList.remove('hidden'); targetPane.classList.add('block'); }
    
    const tabs = ['tab-home', 'tab-record', 'tab-routine', 'tab-alarm', 'tab-stats', 'tab-library', 'tab-settings'];
    tabs.forEach(t => {
        const btn = document.getElementById('nav-' + t);
        if (btn) {
            if (t === tabId) btn.className = "flex-1 py-4 px-5 text-center transition-all min-w-[75px] active-tab-bar";
            else btn.className = "flex-1 py-4 px-5 text-center transition-all min-w-[75px] text-slate-400 hover:bg-slate-800/40";
        }
    });

    if (tabId === 'tab-stats') renderWorkoutAnalysisCharts();
    if (tabId === 'tab-home') updateHomeDashboardWidgets();
    if (tabId === 'tab-library') runLibrarySearchFilter();
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateHomeDashboardWidgets() {
    const data = state.workouts[state.selectedDateStr];
    const routineTitle = document.getElementById('home-routine-title');
    if (data && data.exercises && data.exercises.length > 0) { routineTitle.innerText = `현재 ${data.exercises.length}종목 진행 중`; } 
    else { routineTitle.innerText = `지정된 루틴 없음`; }

    const widgetBox = document.getElementById('home-quick-widget-box');
    widgetBox.innerHTML = '';
    let flatAllExercises = [];
    Object.keys(state.workouts).forEach(k => { if(state.workouts[k].exercises) state.workouts[k].exercises.forEach(e => { if (!flatAllExercises.includes(e.name)) flatAllExercises.push(e.name); }); });

    const recentShowItems = flatAllExercises.slice(-3);
    if (recentShowItems.length === 0) { widgetBox.innerHTML = `<p class="text-xs text-slate-500 py-2 text-center col-span-3">최근 이력이 없습니다.</p>`; return; }
    recentShowItems.forEach(name => {
        const btn = document.createElement('button'); btn.innerText = name;
        btn.className = "p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 truncate active:scale-95";
        btn.onclick = () => {
            const currentData = state.workouts[state.selectedDateStr];
            if (!currentData.exercises.some(e => e.name === name)) {
                currentData.exercises.push({ part: '기타', type: '위젯추가', name: name, restTime: 90, sets: [] });
                triggerSave(); showToast(`${name} 추가 완료.`);
            } else { showToast("이미 등록된 종목입니다."); }
        };
        widgetBox.appendChild(btn);
    });
}

// 3. 달력 제어 로직
export function calculateWorkoutDDay() {
    const target = new Date(state.userInfo.targetDate || '2026-07-18');
    const today = new Date();
    const diffDays = Math.ceil((new Date(target.getFullYear(), target.getMonth(), target.getDate()) - new Date(today.getFullYear(), today.getMonth(), today.getDate())) / (1000 * 60 * 60 * 24));
    const badgeEl = document.getElementById('badge-dday');
    if (badgeEl) badgeEl.textContent = diffDays > 0 ? `D-${diffDays}일` : (diffDays === 0 ? `D-Day` : `D+${Math.abs(diffDays)}`);
}

export function renderCalendarGrid() {
    const gridEl = document.getElementById('calendar-grid');
    if(!gridEl) return;
    gridEl.innerHTML = '';
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
    if (!state.workouts[dateStr]) state.workouts[dateStr] = { weight: 0, bf: 0, smm: 0, exercises: [] };
    
    const data = state.workouts[dateStr];
    document.getElementById('input-daily-weight').value = data.weight > 0 ? data.weight : '';
    document.getElementById('input-daily-bf').value = data.bf > 0 ? data.bf : '';
    document.getElementById('input-daily-smm').value = data.smm > 0 ? data.smm : '';
    renderCalendarGrid(); renderWorkoutList();
}

// 4. 종목별 개별 휴식 타이머(Rest Timer) 설정 로직
export function openRestTimerModal(exIdx) {
    const ex = state.workouts[state.selectedDateStr].exercises[exIdx];
    document.getElementById('rest-timer-ex-idx').value = exIdx;
    document.getElementById('rest-timer-sec-input').value = ex.restTime || 90;
    document.getElementById('rest-timer-modal').classList.remove('hidden');
    document.getElementById('rest-timer-modal').classList.add('flex');
}

export function closeRestTimerModal() {
    document.getElementById('rest-timer-modal').classList.add('hidden');
    document.getElementById('rest-timer-modal').classList.remove('flex');
}

export function adjRestTimerSetting(delta) {
    const input = document.getElementById('rest-timer-sec-input');
    let val = parseInt(input.value) || 0;
    val += delta;
    if(val < 0) val = 0;
    input.value = val;
}

export function saveRestTimerModal() {
    const exIdx = parseInt(document.getElementById('rest-timer-ex-idx').value);
    const sec = parseInt(document.getElementById('rest-timer-sec-input').value) || 90;
    state.workouts[state.selectedDateStr].exercises[exIdx].restTime = sec;
    triggerSave();
    closeRestTimerModal();
    renderWorkoutList();
    showToast("개별 휴식 시간이 저장되었습니다.");
}

// 5. 훈련 일지 리스트 렌더링
export function renderWorkoutList() {
    const container = document.getElementById('workout-list-container');
    if(!container) return; container.innerHTML = '';
    const data = state.workouts[state.selectedDateStr];
    if (!data || !data.exercises || data.exercises.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-500 text-center py-12">등록된 운동이 없습니다.</p>`;
        document.getElementById('label-total-volume').innerText = "총 훈련 볼륨: 0 kg"; return;
    }

    let dailyTotalVolume = 0;
    data.exercises.forEach((ex, exIdx) => {
        let max1RM = 0; let setsHtml = '';
        const currentRestTime = ex.restTime || 90; // 개별 휴식 시간 로드

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
                    <input type="number" step="0.1" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'weight', event.target.value)" class="w-10 bg-transparent text-center font-bold text-white outline-none text-xs" value="${set.weight}">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', 2.5)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">＋</button>
                </div>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded shadow-inner shrink-0">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', -1)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">−</button>
                    <input type="number" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'reps', event.target.value)" class="w-8 bg-transparent text-center font-bold text-white outline-none text-xs" value="${set.reps}">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', 1)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">＋</button>
                </div>
                <input type="text" placeholder="RPE" onchange="window.changeSetField(${exIdx}, ${setIdx}, 'memo', event.target.value)" class="w-10 bg-slate-900 border border-slate-700 rounded py-0.5 text-center text-slate-300 outline-none text-[10px]" value="${set.memo || ''}">
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
                    <div class="flex items-center gap-2 mt-1.5 mb-1">
                        <h3 class="text-sm font-black text-white">${ex.name}</h3>
                        <span onclick="window.openRestTimerModal(${exIdx})" class="text-[10px] font-bold bg-slate-800 hover:bg-slate-700 text-amber-400 border border-amber-500/30 px-2 py-1 rounded-md cursor-pointer transition-colors">⏱️ Rest: ${currentRestTime} sec</span>
                    </div>
                    <p class="text-[10px] text-slate-400 mt-0.5 font-medium">1RM(One Repetition Maximum) 예측: ${max1RM > 0 ? max1RM.toFixed(1) + 'kg' : '---'}</p>
                </div>
                <button onclick="window.deleteExercise(${exIdx})" class="text-[11px] px-2 py-1 bg-slate-800 border border-slate-700 text-slate-400 hover:text-rose-400 rounded-md">삭제</button>
            </div>
            <div class="space-y-1.5">${setsHtml}</div>
            <button onclick="window.addSet(${exIdx})" class="w-full py-1.5 border border-dashed border-slate-800 text-xs text-slate-400 hover:text-amber-400 font-bold rounded-xl bg-slate-950/20 transition-colors">+ 세트 추가 (자동 채우기)</button>
        `;
        container.appendChild(card);
    });

    const totalVolumeEl = document.getElementById('label-total-volume');
    if(totalVolumeEl) totalVolumeEl.innerText = `총 훈련 볼륨: ${dailyTotalVolume.toLocaleString()} kg`;
}

export function addSet(exIdx) {
    const ex = state.workouts[state.selectedDateStr].exercises[exIdx];
    let weight = 40, reps = 10;
    if (ex.sets.length > 0) { const lastSet = ex.sets[ex.sets.length - 1]; weight = lastSet.weight; reps = lastSet.reps; }
    ex.sets.push({ type: '일반', weight: weight, reps: reps, memo: '', done: false });
    triggerSave(); renderWorkoutList();
}
export function deleteSet(exIdx, setIdx) {
    const ex = state.workouts[state.selectedDateStr].exercises[exIdx];
    undoBuffer = { type: 'set', exIdx: exIdx, setIdx: setIdx, data: JSON.parse(JSON.stringify(ex.sets[setIdx])) };
    ex.sets.splice(setIdx, 1); triggerSave(); renderWorkoutList(); triggerUndoToast("기록 삭제됨.");
}
export function adjSetVal(exIdx, setIdx, field, delta) {
    const set = state.workouts[state.selectedDateStr].exercises[exIdx].sets[setIdx];
    let val = (parseFloat(set[field]) || 0) + delta; if (val < 0) val = 0; set[field] = val; triggerSave(); renderWorkoutList();
}
export function changeSetField(exIdx, setIdx, field, val) {
    const set = state.workouts[state.selectedDateStr].exercises[exIdx].sets[setIdx];
    if (field === 'weight' || field === 'reps') set[field] = parseFloat(val) || 0; else set[field] = val; triggerSave();
}
export function toggleSetComplete(exIdx, setIdx, isChecked) {
    state.workouts[state.selectedDateStr].exercises[exIdx].sets[setIdx].done = isChecked;
    triggerSave(); renderWorkoutList();
    if (isChecked) {
        const customRestTime = state.workouts[state.selectedDateStr].exercises[exIdx].restTime || 90;
        startTimerLogic(customRestTime);
    }
}
function triggerUndoToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-text').innerText = msg;
    document.getElementById('btn-undo').classList.remove('hidden');
    t.className = "fixed bottom-32 right-5 z-[60] transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    document.getElementById('btn-undo').onclick = () => {
        if (undoBuffer && undoBuffer.type === 'set') {
            state.workouts[state.selectedDateStr].exercises[undoBuffer.exIdx].sets.splice(undoBuffer.setIdx, 0, undoBuffer.data);
            undoBuffer = null; triggerSave(); renderWorkoutList(); showToast("복구되었습니다.");
        }
    };
    setTimeout(() => { document.getElementById('btn-undo').classList.add('hidden'); t.className = "fixed bottom-32 right-5 z-[60] transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 5000);
}
export function deleteExercise(exIdx) {
    if(confirm("이 종목을 삭제할까요?")) { state.workouts[state.selectedDateStr].exercises.splice(exIdx, 1); triggerSave(); renderWorkoutList(); }
}

// 6. 사전(라이브러리) 초성 및 띄어쓰기 무시 검색
function getHangulChosung(str) {
    const cho = ["ㄱ","ㄲ","ㄴ","ㄷ","ㄸ","ㄹ","ㅁ","ㅂ","ㅃ","ㅅ","ㅆ","ㅇ","ㅈ","ㅉ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
    let result = "";
    for (let i = 0; i < str.length; i++) {
        const code = str.charCodeAt(i) - 44032;
        if (code >= 0 && code <= 11172) result += cho[Math.floor(code / 588)]; else result += str.charAt(i);
    }
    return result;
}
export function runLibrarySearchFilter() {
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
        data.exercises.push({ part: part, type: type, name: name, restTime: 90, sets: [] });
        triggerSave(); 
        switchCalendarTab('tab-record'); // 종목 추가 즉시 기록 탭으로 자동 점프
        showToast("종목이 성공적으로 추가되었습니다.");
    } else { showToast("이미 등록된 종목입니다."); }
}

export function triggerQuickInputFAB() {
    const modal = document.getElementById('quick-input-modal');
    const select = document.getElementById('quick-select-ex-name');
    select.innerHTML = '';
    Object.values(WORKOUT_DB).forEach(types => Object.values(types).forEach(names => names.forEach(n => select.innerHTML += `<option value="${n}">${n}</option>`)));
    modal.classList.remove('hidden'); modal.classList.add('flex');
}
export function closeQuickInputFABModal() { document.getElementById('quick-input-modal').classList.add('hidden'); document.getElementById('quick-input-modal').classList.remove('flex'); }
export function saveQuickInputFABModal() {
    const name = document.getElementById('quick-select-ex-name').value;
    const w = parseFloat(document.getElementById('quick-input-weight').value) || 0;
    const r = parseInt(document.getElementById('quick-input-reps').value) || 0;
    const data = state.workouts[state.selectedDateStr];
    let targetEx = data.exercises.find(e => e.name === name);
    if (!targetEx) {
        let fPart = '기타', fType = '기타';
        Object.entries(WORKOUT_DB).forEach(([p, types]) => Object.entries(types).forEach(([t, nList]) => { if(nList.includes(name)) { fPart = p; fType = t; } }));
        targetEx = { part: fPart, type: fType, name: name, restTime: 90, sets: [] };
        data.exercises.push(targetEx);
    }
    targetEx.sets.push({ type: '일반', weight: w, reps: r, memo: 'FAB 기록', done: true });
    triggerSave(); closeQuickInputFABModal();
    if(document.getElementById('pane-tab-record').classList.contains('block')) renderWorkoutList();
    showToast("신속 등록 완료.");
}

export function runPlateCalculate() {
    const totalWeight = parseFloat(document.getElementById('plate-calc-target').value) || 0;
    const resultBox = document.getElementById('plate-calc-result');
    if (totalWeight <= BAR_WEIGHT) { resultBox.innerHTML = `<span class="text-rose-400 font-bold">표준 바 중량(${BAR_WEIGHT}kg)보다 높아야 합니다.</span>`; return; }
    let netWeight = (totalWeight - BAR_WEIGHT) / 2;
    const platesCount = {};
    AVAILABLE_PLATES.forEach(plate => { if (netWeight >= plate) { const qty = Math.floor(netWeight / plate); platesCount[plate] = qty; netWeight -= plate * qty; } });
    const resultsText = Object.entries(platesCount).map(([w, qty]) => `${w}kg x ${qty}개`).join(', ');
    resultBox.innerHTML = resultsText ? `한쪽에 각각 <span class="text-white font-black">[ ${resultsText} ]</span> 장착` : `계산 불가 조합`;
}

// 7. 차트 및 백업
let workoutChartInstance = null;
function renderWorkoutAnalysisCharts() {
    const canvas = document.getElementById('chart-workout-analysis');
    if(!canvas) return;
    const partsCount = { '가슴': 0, '등': 0, '어깨': 0, '팔': 0, '하체': 0, '복근': 0, '기타': 0 };
    Object.values(state.workouts).forEach(dateObj => {
        if (dateObj.exercises) { dateObj.exercises.forEach(ex => {
            let pKey = '기타'; if (ex.part.includes('가슴')) pKey = '가슴'; else if (ex.part.includes('등')) pKey = '등'; else if (ex.part.includes('어깨')) pKey = '어깨'; else if (ex.part.includes('팔')) pKey = '팔'; else if (ex.part.includes('하체')) pKey = '하체'; else if (ex.part.includes('복근')) pKey = '복근';
            partsCount[pKey] += ex.sets ? ex.sets.length : 0;
        });}
    });

    setTimeout(() => {
        if(workoutChartInstance) workoutChartInstance.destroy();
        workoutChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'radar',
            data: { labels: Object.keys(partsCount), datasets: [{ data: Object.values(partsCount), backgroundColor: 'rgba(245,158,11,0.15)', borderColor: '#F59E0B', borderWidth: 2, pointBackgroundColor: '#F59E0B' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { r: { grid: { color: 'rgba(255,255,255,0.05)' }, angleLines: { color: 'rgba(255,255,255,0.05)' }, pointLabels: { color: '#94A3B8' }, ticks: { display: false } } } }
        });
    }, 50);
}

export function exportWorkoutToCSV() {
    let csvContent = "\uFEFF일자,부위,종목명,세트,중량,반복수,완료여부\n";
    Object.entries(state.workouts).forEach(([dateStr, obj]) => {
        if(obj.exercises) { obj.exercises.forEach(ex => { ex.sets.forEach((s, idx) => { csvContent += `${dateStr},${ex.part},${ex.name},${idx+1},${s.weight},${s.reps},${s.done?'완료':'미완료'}\n`; }); }); }
    });
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.setAttribute("download", `Workout_Report_2026.csv`);
    document.body.appendChild(link); link.click(); document.body.removeChild(link); showToast("CSV 다운로드 활성화.");
}
export function triggerSettingExport() { exportDataJSON(showToast); }
export function triggerSettingImport(e) { importDataJSON(e.target.files[0], () => { showToast("복원 완료."); switchCalendarTab('tab-home'); }, () => showToast("오류 발생.")); }
export function triggerClearAllWorkoutData() { if (confirm("데이터를 초기화합니다.")) { state.workouts = {}; state.templates = []; triggerSave(); location.reload(); } }

// 8. 초기 부팅
function initMetricsChangeEvents() {
    const updateMetricsData = () => {
        const dStr = state.selectedDateStr; if (!dStr) return;
        state.workouts[dStr].weight = parseFloat(document.getElementById('input-daily-weight').value) || 0;
        state.workouts[dStr].bf = parseFloat(document.getElementById('input-daily-bf').value) || 0;
        state.workouts[dStr].smm = parseFloat(document.getElementById('input-daily-smm').value) || 0;
        triggerSave(); renderCalendarGrid();
    };
    document.getElementById('input-daily-weight').oninput = updateMetricsData; document.getElementById('input-daily-bf').oninput = updateMetricsData; document.getElementById('input-daily-smm').oninput = updateMetricsData;
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
    viewYear = today.getFullYear(); viewMonth = today.getMonth();
    selectWorkoutDate(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
    switchCalendarTab('tab-home');
});


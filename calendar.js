/**
 * 파일명: calendar.js
 * 역할: 운동 캘린더 제어, 계층형 운동 일지 기록 및 편의 기능 총괄 컨트롤러 (오류 수정본)
 */

import { state } from './store.js';
import { initializeFirebase, triggerSave } from './services.js';
import { WORKOUT_DB, AVAILABLE_PLATES, BAR_WEIGHT } from './workoutConstants.js';

// 화면 뷰어 및 타이머 제어용 내부 변수
let viewYear = 2026;
let viewMonth = 5; 
let restTimerInterval = null;
let activeModalPart = '가슴';
let activeModalType = '프리웨이트';

// 1. 전역 알림 토스트 시스템
export function showToast(msg) {
    const t = document.getElementById('toast');
    document.getElementById('toast-text').innerText = msg;
    t.className = "fixed bottom-5 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    setTimeout(() => { 
        t.className = "fixed bottom-5 right-5 z-50 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; 
    }, 2500);
}

// 2. 대회 날짜 기준 디데이(D-Day) 연산
export function calculateWorkoutDDay() {
    const target = new Date(state.userInfo.targetDate || '2026-07-18');
    const today = new Date();
    const cleanToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const cleanTarget = new Date(target.getFullYear(), target.getMonth(), target.getDate());
    const diffDays = Math.ceil((cleanTarget - cleanToday) / (1000 * 60 * 60 * 24));
    
    const badgeEl = document.getElementById('badge-dday');
    if (diffDays > 0) badgeEl.textContent = `대회까지 D-${diffDays}일`;
    else if (diffDays === 0) badgeEl.textContent = `D-Day: 본 대회 당일`;
    else badgeEl.textContent = `대회 종료 (D+${Math.abs(diffDays)}일)`;
}

// 3. 월별 달력 렌더링
export function renderCalendarGrid() {
    const titleEl = document.getElementById('calendar-month-year');
    const gridEl = document.getElementById('calendar-grid');
    gridEl.innerHTML = '';
    titleEl.textContent = `${viewYear}년 ${String(viewMonth + 1).padStart(2, '0')}월`;

    const firstDay = new Date(viewYear, viewMonth, 1).getDay();
    const lastDate = new Date(viewYear, viewMonth + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        gridEl.appendChild(document.createElement('div'));
    }

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
    document.getElementById('label-selected-date').textContent = `${parts[1]}/${parts[2]}`;
    
    if (!state.workouts[dateStr]) {
        state.workouts[dateStr] = { weight: 0, bf: 0, smm: 0, exercises: [] };
    }
    const data = state.workouts[dateStr];
    document.getElementById('input-daily-weight').value = data.weight > 0 ? data.weight : '';
    document.getElementById('input-daily-bf').value = data.bf > 0 ? data.bf : '';
    document.getElementById('input-daily-smm').value = data.smm > 0 ? data.smm : '';

    renderCalendarGrid();
    renderWorkoutList(); // [버그 수정] 외부 객체 판별을 제거하고 내부 스코프 함수를 다이렉트로 호출하여 무조건 실행 보장
}

// 4. 실시간 총 훈련 볼륨 및 개별 운동 볼륨 연산 엔진
export function renderWorkoutList() {
    const container = document.getElementById('workout-list-container');
    container.innerHTML = '';
    const data = state.workouts[state.selectedDateStr];
    if (!data || !data.exercises || data.exercises.length === 0) {
        container.innerHTML = `<p class="text-sm text-slate-500 text-center py-12">등록된 운동이 없습니다. 우측 상단의 버튼을 눌러 운동을 추가해 주십시오.</p>`;
        document.getElementById('label-total-volume').innerText = "오늘의 총 훈련 볼륨: 0 kg";
        return;
    }

    let dailyTotalVolume = 0;

    data.exercises.forEach((ex, exIdx) => {
        let exVolume = 0;
        let max1RM = 0;
        let setsHtml = '';

        ex.sets.forEach((set, setIdx) => {
            const vol = set.weight * set.reps;
            exVolume += vol;
            if (set.done) dailyTotalVolume += vol;

            const est1RM = set.weight * (1 + (set.reps / 30));
            if (est1RM > max1RM) max1RM = est1RM;

            setsHtml += `
            <div class="flex items-center justify-between gap-1.5 sm:gap-3 p-2 bg-slate-950/60 rounded-xl border border-slate-800/80 text-xs sm:text-sm">
                <span class="font-black text-amber-500 w-5 text-center">${setIdx + 1}</span>
                <select onchange="window.changeSetField(${exIdx}, ${setIdx}, 'type', event.target.value)" class="bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-slate-300 outline-none max-w-[70px] sm:max-w-none">
                    <option value="일반" ${set.type==='일반'?'selected':''}>일반</option>
                    <option value="탑" ${set.type==='탑'?'selected':''}>탑</option>
                    <option value="백오프" ${set.type==='백오프'?'selected':''}>백오프</option>
                    <option value="드롭" ${set.type==='드롭'?'selected':''}>드롭</option>
                    <option value="슈퍼" ${set.type==='슈퍼'?'selected':''}>슈퍼</option>
                </select>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded px-1 shadow-inner shrink-0">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', -2.5)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">−</button>
                    <input type="number" step="0.1" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'weight', event.target.value)" class="w-9 sm:w-12 bg-transparent text-center font-bold text-white outline-none text-xs sm:text-sm" value="${set.weight}">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'weight', 2.5)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">＋</button>
                </div>
                <div class="flex items-center bg-slate-900 border border-slate-700 rounded px-1 shadow-inner shrink-0">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', -1)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">−</button>
                    <input type="number" oninput="window.changeSetField(${exIdx}, ${setIdx}, 'reps', event.target.value)" class="w-7 sm:w-10 bg-transparent text-center font-bold text-white outline-none text-xs sm:text-sm" value="${set.reps}">
                    <button onclick="window.adjSetVal(${exIdx}, ${setIdx}, 'reps', 1)" class="w-6 h-6 text-slate-400 font-bold hover:text-white select-none">＋</button>
                </div>
                <input type="text" placeholder="RPE" onchange="window.changeSetField(${exIdx}, ${setIdx}, 'memo', event.target.value)" class="w-12 sm:w-20 bg-slate-900 border border-slate-700 rounded px-1.5 py-1 text-center text-slate-300 outline-none" value="${set.memo || ''}">
                <input type="checkbox" ${set.done?'checked':''} onchange="window.toggleSetComplete(${exIdx}, ${setIdx}, event.target.checked)" class="w-5 h-5 accent-amber-500 cursor-pointer shrink-0">
                <button onclick="window.deleteSet(${exIdx}, ${setIdx})" class="text-slate-500 hover:text-rose-400 font-black text-sm px-1">✕</button>
            </div>`;
        });

        const card = document.createElement('div');
        card.className = "bg-slate-900/80 border border-slate-800/80 rounded-2xl p-4 space-y-3";
        card.innerHTML = `
            <div class="flex justify-between items-start border-b border-slate-800/60 pb-2">
                <div>
                    <span class="px-2 py-0.5 text-[10px] font-black uppercase bg-amber-500/10 text-amber-400 border border-amber-500/20 rounded-md">${ex.part} · ${ex.type}</span>
                    <h3 class="text-base font-black text-white mt-1">${ex.name}</h3>
                    <p class="text-[11px] text-slate-400 mt-0.5 font-medium">예상 최고 1RM: ${max1RM > 0 ? max1RM.toFixed(1) + 'kg' : '---'}</p>
                </div>
                <button onclick="window.deleteExercise(${exIdx})" class="text-xs px-2 py-1 bg-slate-800/80 hover:bg-rose-950/40 border border-slate-700 text-slate-400 hover:text-rose-400 rounded-md transition-colors font-bold">종목 삭제</button>
            </div>
            <div class="space-y-2">${setsHtml}</div>
            <button onclick="window.addSet(${exIdx})" class="w-full py-2 border border-dashed border-slate-800 text-xs text-slate-400 hover:text-amber-400 font-bold rounded-xl bg-slate-950/20 transition-colors">+ 세트 추가 (자동 채우기 가동)</button>
        `;
        container.appendChild(card);
    });

    document.getElementById('label-total-volume').innerText = `오늘의 총 훈련 볼륨 (완료 기준): ${dailyTotalVolume.toLocaleString()} kg`;
}

// 5. 원터치 세트 복사(Auto-Fill) 비즈니스 로직
export function addSet(exIdx) {
    const ex = state.workouts[state.selectedDateStr].exercises[exIdx];
    let weight = 40;
    let reps = 10;
    
    if (ex.sets.length > 0) {
        const lastSet = ex.sets[ex.sets.length - 1];
        weight = lastSet.weight;
        reps = lastSet.reps;
    }

    ex.sets.push({ type: '일반', weight: weight, reps: reps, memo: '', done: false });
    triggerSave();
    renderWorkoutList();
}

export function deleteSet(exIdx, setIdx) {
    state.workouts[state.selectedDateStr].exercises[exIdx].sets.splice(setIdx, 1);
    triggerSave();
    renderWorkoutList();
}

export function adjSetVal(exIdx, setIdx, field, delta) {
    const set = state.workouts[state.selectedDateStr].exercises[exIdx].sets[setIdx];
    let val = (parseFloat(set[field]) || 0) + delta;
    if (val < 0) val = 0;
    set[field] = val;
    triggerSave();
    renderWorkoutList();
}

export function changeSetField(exIdx, setIdx, field, val) {
    const set = state.workouts[state.selectedDateStr].exercises[exIdx].sets[setIdx];
    if (field === 'weight' || field === 'reps') {
        set[field] = parseFloat(val) || 0;
    } else {
        set[field] = val;
    }
    triggerSave();
}

// 6. 비동기식 자동 휴식 인터벌(Interval) 타이머
export function toggleSetComplete(exIdx, setIdx, isChecked) {
    state.workouts[state.selectedDateStr].exercises[exIdx].sets[setIdx].done = isChecked;
    triggerSave();
    renderWorkoutList();

    if (isChecked) {
        startRestTimer(90); 
    }
}

export function startRestTimer(seconds) {
    if (restTimerInterval) clearInterval(restTimerInterval);
    const bar = document.getElementById('timer-floating-bar');
    const display = document.getElementById('timer-countdown-display');
    
    let remain = seconds;
    bar.className = "fixed top-0 left-0 w-full z-40 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl";
    
    const formatTime = (s) => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    display.textContent = formatTime(remain);

    restTimerInterval = setInterval(() => {
        remain--;
        if (remain <= 0) {
            clearInterval(restTimerInterval);
            bar.className = "fixed top-0 left-0 w-full z-40 transform -translate-y-full opacity-0 transition-all duration-300 pointer-events-none";
            showToast("휴식 시간이 종료되었습니다. 다음 세트를 진행하십시오.");
        } else {
            display.textContent = formatTime(remain);
        }
    }, 1000);
}

export function stopRestTimer() {
    if (restTimerInterval) clearInterval(restTimerInterval);
    document.getElementById('timer-floating-bar').className = "fixed top-0 left-0 w-full z-40 transform -translate-y-full opacity-0 transition-all duration-300 pointer-events-none";
}

// 7. 계층형 운동 종목 모달 제어 및 추가 로직
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
    
    partContainer.innerHTML = '';
    typeContainer.innerHTML = '';
    itemContainer.innerHTML = '';

    Object.keys(WORKOUT_DB).forEach(part => {
        const btn = document.createElement('button');
        btn.textContent = part;
        btn.className = `px-3 py-1.5 text-xs font-bold rounded-lg whitespace-nowrap transition-colors ${part === activeModalPart ? 'bg-amber-500 text-slate-950 font-black' : 'bg-slate-800 text-slate-400'}`;
        btn.onclick = () => { activeModalPart = part; activeModalType = Object.keys(WORKOUT_DB[part])[0]; renderModalTabs(); };
        partContainer.appendChild(btn);
    });

    Object.keys(WORKOUT_DB[activeModalPart]).forEach(type => {
        const btn = document.createElement('button');
        btn.textContent = type;
        btn.className = `px-2.5 py-1 text-[11px] font-bold rounded-md whitespace-nowrap transition-colors ${type === activeModalType ? 'border border-amber-500/50 bg-amber-500/10 text-amber-400' : 'bg-slate-900 text-slate-500'}`;
        btn.onclick = () => { activeModalType = type; renderModalTabs(); };
        typeContainer.appendChild(btn);
    });

    WORKOUT_DB[activeModalPart][activeModalType].forEach(name => {
        const btn = document.createElement('button');
        btn.textContent = name;
        btn.className = "p-2.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-left text-xs font-semibold rounded-xl text-slate-200 transition-colors truncate";
        btn.onclick = () => addExerciseToDate(name);
        itemContainer.appendChild(btn);
    });
}

function addExerciseToDate(name) {
    const data = state.workouts[state.selectedDateStr];
    if (data.exercises.some(e => e.name === name)) {
        showToast("이미 오늘의 훈련 목록에 존재하는 종목입니다.");
        return;
    }
    data.exercises.push({ part: activeModalPart, type: activeModalType, name: name, sets: [] });
    triggerSave();
    closeExerciseSelectorModal();
    renderWorkoutList();
    showToast(`${name} 종목이 추가되었습니다.`);
}

export function deleteExercise(exIdx) {
    if (confirm("해당 운동 종목과 하위 세트 기록을 모두 삭제하시겠습니까?")) {
        state.workouts[state.selectedDateStr].exercises.splice(exIdx, 1);
        triggerSave();
        renderWorkoutList();
    }
}

// 8. 바벨 원판 계산기 연산 시스템 (Greedy Algorithm 적용)
export function runPlateCalculate() {
    const targetInput = document.getElementById('plate-calc-target');
    const resultBox = document.getElementById('plate-calc-result');
    const totalWeight = parseFloat(targetInput.value) || 0;

    if (totalWeight <= BAR_WEIGHT) {
        resultBox.innerHTML = `<span class="text-rose-400 font-bold">바벨 바 자체 무게(${BAR_WEIGHT}kg)보다 높게 중량을 설정해 주십시오.</span>`;
        return;
    }

    let netWeight = (totalWeight - BAR_WEIGHT) / 2; 
    const platesCount = {};
    
    AVAILABLE_PLATES.forEach(plate => {
        if (netWeight >= plate) {
            const qty = Math.floor(netWeight / plate);
            platesCount[plate] = qty;
            netWeight -= plate * qty;
        }
    });

    if (netWeight > 0) {
        resultBox.innerHTML = `<span class="text-amber-400 font-bold">가용 원판 조합으로 정확한 환산이 불가능합니다.<br>근사치 원판 조합: </span>`;
    } else {
        resultBox.innerHTML = '';
    }

    const resultsText = Object.entries(platesCount).map(([w, qty]) => `${w}kg 원판 [${qty}개]`).join(', ');
    resultBox.innerHTML += resultsText ? `양쪽에 각각 <span class="text-white font-black">${resultsText}</span> 장착` : `<span class="text-slate-400">계산 가능한 조합이 없습니다.</span>`;
}

// 9. 루틴 프리셋 마스터 템플릿 관리자
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
    box.innerHTML = '';
    if (!state.templates || state.templates.length === 0) {
        box.innerHTML = `<p class="text-xs text-slate-500 text-center py-6">저장된 루틴 프리셋이 없습니다.</p>`;
        return;
    }

    state.templates.forEach((tmpl, idx) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-between p-2 bg-slate-950 border border-slate-800 rounded-xl text-xs";
        div.innerHTML = `
            <span onclick="window.applyTemplate(${tmpl.id})" class="text-slate-200 font-bold hover:text-amber-400 cursor-pointer flex-1 truncate">${tmpl.title} (${tmpl.exercises.length}개 종목)</span>
            <button onclick="window.deleteTemplate(${tmpl.id})" class="text-rose-400 hover:text-rose-500 font-bold ml-2">삭제</button>
        `;
        box.appendChild(div);
    });
}

export function saveCurrentToTemplate() {
    const currentExs = state.workouts[state.selectedDateStr]?.exercises || [];
    if (currentExs.length === 0) {
        showToast("저장할 운동 종목 데이터가 없습니다.");
        return;
    }
    const title = prompt("저장할 루틴 프리셋의 명칭을 입력해 주십시오:", "나의 맞춤 루틴");
    if (!title) return;

    const cleanedExercises = currentExs.map(ex => ({
        part: ex.part,
        type: ex.type,
        name: ex.name,
        sets: ex.sets.map(s => ({ type: s.type, weight: s.weight, reps: s.reps, memo: s.memo, done: false }))
    }));

    state.templates.push({ id: Date.now(), title: title, exercises: cleanedExercises });
    triggerSave();
    renderTemplateList();
    showToast("새 루틴 프리셋이 성공적으로 백업되었습니다.");
}

export function applyTemplate(tmplId) {
    if (!confirm("⚠️ 프리셋을 불러오면 오늘의 기존 운동 일지 데이터가 초기화되고 대체됩니다. 진행하시겠습니까?")) return;
    const tmpl = state.templates.find(t => t.id === tmplId);
    if (!tmpl) return;

    state.workouts[state.selectedDateStr].exercises = JSON.parse(JSON.stringify(tmpl.exercises));
    triggerSave();
    closeTemplateManager();
    renderWorkoutList();
    showToast(`[${tmpl.title}] 루틴 프리셋을 성공적으로 적용했습니다.`);
}

export function deleteTemplate(tmplId) {
    if (confirm("해당 루틴 프리셋을 완전히 삭제하시겠습니까?")) {
        state.templates = state.templates.filter(t => t.id !== tmplId);
        triggerSave();
        renderTemplateList();
        showToast("프리셋 삭제 완료.");
    }
}

// 10. 자바스크립트 모듈 스코프 해제를 위한 전역 글로벌 네임스페이스 바인딩
window.moveMonth = moveMonth;
window.runPlateCalculate = runPlateCalculate;
window.showExerciseSelectorModal = showExerciseSelectorModal;
window.closeExerciseSelectorModal = closeExerciseSelectorModal;
window.openTemplateManager = openTemplateManager;
window.closeTemplateManager = closeTemplateManager;
window.saveCurrentToTemplate = saveCurrentToTemplate;
window.applyTemplate = applyTemplate;
window.deleteTemplate = deleteTemplate;
window.stopRestTimer = stopRestTimer;
window.renderWorkoutList = renderWorkoutList; // 글로벌 동적 연동 바인딩 확장 고정

window.addSet = addSet;
window.deleteSet = deleteSet;
window.adjSetVal = adjSetVal;
window.changeSetField = changeSetField;
window.toggleSetComplete = toggleSetComplete;
window.deleteExercise = deleteExercise;

// 신체 계측 리스너 및 부팅 연동 초기화
function initMetricsChangeEvents() {
    const wIn = document.getElementById('input-daily-weight');
    const bfIn = document.getElementById('input-daily-bf');
    const smmIn = document.getElementById('input-daily-smm');

    const updateMetricsData = () => {
        const dStr = state.selectedDateStr;
        if (!dStr) return;
        state.workouts[dStr].weight = parseFloat(wIn.value) || 0;
        state.workouts[dStr].bf = parseFloat(bfIn.value) || 0;
        state.workouts[dStr].smm = parseFloat(smmIn.value) || 0;
        triggerSave();
        renderCalendarGrid();
    };

    wIn.oninput = updateMetricsData;
    bfIn.oninput = updateMetricsData;
    smmIn.oninput = updateMetricsData;
}

initMetricsChangeEvents();

initializeFirebase((success) => {
    const statusEl = document.getElementById('cloud-status-workout');
    if (statusEl) {
        if (success) statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> 클라우드 연결됨';
        else statusEl.innerHTML = '<span class="w-1.5 h-1.5 bg-sky-500 rounded-full"></span> 로컬 스토리지 모드';
    }
    calculateWorkoutDDay();
    const today = new Date();
    viewYear = today.getFullYear();
    viewMonth = today.getMonth();
    selectWorkoutDate(`${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`);
});

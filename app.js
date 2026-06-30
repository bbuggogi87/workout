/**
 * 파일명: app.js (3단계 분할 구현본)
 * 역할: 체중 기록 도메인 뷰 렌더링, 아코디언 타임라인 제어 및 3분할 입력 폼 데이터 바인딩
 * 변경사항: 20가지 지표의 그룹화 입력 양식 인터페이스 및 식단 세트 정보 일괄 불러오기 엔진 구축 완료
 */

import { state } from './store.js';
import { triggerSave, saveToLocal } from './services.js';

// 브라우저 전역 윈도우 (window) 네임스페이스 바인딩 (HTML 레이어 인라인 라우팅 보장)
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

// 3단계 내부 관리용 상태 변수
let selectedBowelValue = ''; // 'O' 또는 'X' 상태 임시 보관 버퍼

/**
 * 1. 상단 4대 메인 메뉴바 전환 및 스티키 고정 레이아웃 스위칭 함수
 * @param {string} tabId - 선택된 탭 식별자 ('planner', 'converter', 'analytics', 'weight')
 */
export function switchTab(tabId) {
    // 모든 탭 컨테이너 레이어 은닉 처리
    document.querySelectorAll('.tab-pane').forEach(el => {
        el.classList.add('hidden');
        el.classList.remove('block');
    });

    // 선택된 타깃 탭 레이어 활성화
    const targetPane = document.getElementById('pane-tab-' + (tabId === 'weight' ? 'weight-record' : tabId));
    if (targetPane) {
        targetPane.classList.remove('hidden');
        targetPane.classList.add('block');
    }

    // 메뉴바 버튼의 시각적 활성화 활성 상태 클래스 토글
    const tabs = ['planner', 'converter', 'analytics', 'weight'];
    tabs.forEach(t => {
        const btn = document.getElementById('tab-btn-' + t);
        if (btn) {
            if (t === tabId) {
                btn.className = "flex-1 py-3.5 text-center text-xs font-black transition-colors active-tab";
            } else {
                btn.className = "flex-1 py-3.5 text-center text-xs font-bold text-slate-400 transition-colors hover:text-slate-200";
            }
        }
    });

    // 특정 탭 진입 시 전용 렌더러 파이프라인 집행
    if (tabId === 'weight') {
        renderWeightRecordList();
        if (typeof window.updateWeightTrendChart === 'function') {
            window.updateWeightTrendChart(); // 4단계에서 구현될 차트 연동 인터페이스
        }
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

/**
 * 2. 레이어 3: 컴팩트 인덱스 타임라인 아코디언 카드 스트림 렌더러 함수
 * 목적: 20가지 확장 데이터를 정렬하여 드롭다운 구조의 카드로 화면에 출력합니다.
 */
export function renderWeightRecordList() {
    const container = document.getElementById('weight-records-timeline-container');
    if (!container) return;
    container.innerHTML = '';

    // 날짜 키값을 시간 역순(최신순)으로 정렬 스크리닝
    const sortedDates = Object.keys(state.workouts)
        .filter(date => state.workouts[date].weight > 0)
        .sort((a, b) => new Date(b) - new Date(a));

    if (sortedDates.length === 0) {
        container.innerHTML = `<p class="text-xs text-slate-500 text-center py-10">기록된 신체 및 체중 지표가 없습니다. 우측 상단 버튼을 통해 당일 지표를 최초 기록하십시오.</p>`;
        updateKpiSnapshotCards(); // 주간 KPI 카드 초기화 호출
        return;
    }

    sortedDates.forEach((dateStr) => {
        const data = state.workouts[dateStr];
        const dayOfWeek = data.dayOfWeek || '';
        const delta = data.weightDelta || 0;
        const deltaText = delta > 0 ? `+${delta.toFixed(1)}` : delta.toFixed(1);
        const deltaClass = delta > 0 ? 'text-rose-500' : delta < 0 ? 'text-sky-500' : 'text-slate-400';
        
        // 외식, 음주 등 체중 정체 트리거 단어 감지 시 테두리 경고 서식 부여
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

            <div id="details-${dateStr}" class="hidden border-t border-slate-800/60 bg-slate-950/40 p-3.5 space-y-3 text-[11px] animate-fade-in">
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

    updateKpiSnapshotCards(); // 대시보드 요약 수치 연동
}

/**
 * 3. 아코디언 드롭다운 카드 개별 확장 토글 함수
 */
export function toggleAccordionCard(dateStr) {
    const details = document.getElementById(`details-${dateStr}`);
    const arrow = document.getElementById(`arrow-${dateStr}`);
    if (!details) return;

    if (details.classList.contains('hidden')) {
        details.classList.remove('hidden');
        arrow.style.transform = 'rotate(180deg)';
    } else {
        details.classList.add('hidden');
        arrow.style.transform = 'rotate(0deg)';
    }
}

/**
 * 4. 독립 버퍼 에디터 모달 열기 및 초기 구조 마운트 함수
 * @param {string} [editDateStr] - 수정할 날짜 키값 (공백일 경우 신규 당일 종합 지표 입력 모드)
 */
export function openRecordModal(editDateStr = '') {
    const modal = document.getElementById('weight-record-modal');
    const dateInput = document.getElementById('record-date-input');
    const titleLbl = document.getElementById('record-modal-title');
    
    if (!modal) return;

    // 모바일 배경 스크롤 침투 현상 차단 CSS 동적 기입
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';

    // 초기 활성화 칩 스타일 리셋 처리
    document.querySelectorAll('.chip-note-tag').forEach(c => c.classList.remove('matrix-chip-active'));

    if (editDateStr) {
        // 기존 과거 데이터 수정 모드 진입
        titleLbl.innerText = `✏️ [${editDateStr}] 종합 건강 지표 정밀 수정`;
        dateInput.value = editDateStr;
        dateInput.readOnly = true; // 날짜 변조 가드 차단
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
        // 당일 신규 종합 지표 기입 모드 진입
        titleLbl.innerText = `＋ 당일 종합 신체 및 건강 지표 기입`;
        const todayStr = new Date().toISOString().slice(0, 10);
        dateInput.value = todayStr;
        dateInput.readOnly = false;
        handleRecordDateChange(todayStr);

        // 기본 리셋 폼 주입
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

    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

export function closeRecordModal() {
    const modal = document.getElementById('weight-record-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.classList.remove('flex');
    }
    // 모바일 배경 스크롤 간섭 해제 복구
    document.body.style.position = '';
    document.body.style.width = '';
}

/**
 * 5. 날짜 변경 입력 피커 변경 시 요일 자동 연산 비즈니스 로직
 */
export function handleRecordDateChange(dateVal) {
    const display = document.getElementById('record-day-display');
    if (!dateVal || !display) return;
    
    const days = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
    const dayIndex = new Date(dateVal).getDay();
    display.value = isNaN(dayIndex) ? '오류' : days[dayIndex];
}

/**
 * 6. 이분법 구조의 원터치 배변 활동 O/X 토글 처리 함수
 */
export function setBowelField(val) {
    selectedBowelValue = val;
    const btnO = document.getElementById('btn-bowel-o');
    const btnX = document.getElementById('btn-bowel-x');
    if (!btnO || !btnX) return;

    btnO.className = "bg-slate-950 border border-slate-700 font-black text-slate-400 rounded-lg transition-colors";
    btnX.className = "bg-slate-950 border border-slate-700 font-black text-slate-400 rounded-lg transition-colors";

    if (val === 'O') btnO.className = "bg-emerald-500 border border-emerald-600 font-black text-slate-950 rounded-lg transition-colors";
    if (val === 'X') btnX.className = "bg-rose-500 border border-rose-600 font-black text-slate-950 rounded-lg transition-colors";
}

/**
 * 7. 특이사항 원터치 퀵 태그 문자열 토글 삽입 함수
 */
export function toggleQuickNoteChip(tag) {
    const input = document.getElementById('record-special-input');
    if (!input) return;

    let currentTokens = input.value.trim() ? input.value.split(',').map(s => s.trim()).filter(Boolean) : [];
    
    if (currentTokens.includes(tag)) {
        currentTokens = currentTokens.filter(t => t !== tag);
    } else {
        currentTokens.push(tag);
    }
    
    input.value = currentTokens.join(', ');
}

/**
 * 8. 고정밀 매크로 식단 영양소 통합 원터치 불러오기 엔진 함수
 * 목적: 식단 대시보드 계측 데이터 및 운동 캘린더 완료 기록을 원터치 일괄 자동 상속 주입합니다.
 */
export function pullDietaryMacrosFromPlanner() {
    const activeDate = document.getElementById('record-date-input').value;
    
    // 글로벌 비비드 로딩 레이어 가동 (모바일 랙 현상 방어)
    const loader = document.getElementById('global-loading-layer');
    if(loader) {
        document.getElementById('global-loading-text').innerText = "플래너 핵심 식단 및 운동 지표 통합 연동 중...";
        loader.classList.remove('hidden'); loader.classList.add('flex');
    }

    setTimeout(() => {
        // [식단 도메인 연동] DOM 카운터 셸 텍스트 직접 이식 및 매크로 정보 수집
        const barKcal = document.getElementById('bar-kcal-display')?.innerText || '0';
        const barCarbs = document.getElementById('bar-carbs-display')?.innerText || '0g';
        const barProto = document.getElementById('bar-protein-display')?.innerText || '0g';
        const barFat = document.getElementById('bar-fat-display')?.innerText || '0g';

        const totalKcal = parseInt(barKcal.split('/')[0].trim()) || 0;
        const carbs = parseFloat(barCarbs.replace('g','')) || 0;
        const protein = parseFloat(barProto.replace('g','')) || 0;
        const fat = parseFloat(barFat.replace('g','')) || 0;

        document.getElementById('record-carbs-input').value = carbs > 0 ? carbs : '';
        document.getElementById('record-protein-input').value = protein > 0 ? protein : '';
        document.getElementById('record-fat-input').value = fat > 0 ? fat : '';
        document.getElementById('record-kcal-input').value = totalKcal > 0 ? totalKcal : '';

        // 탄단지 실질 칼로리 비율 역산 공식 계산 집행
        const cKcal = carbs * 4;
        const pKcal = protein * 4;
        const fKcal = fat * 9;
        const sumKcal = cKcal + pKcal + fKcal;
        
        let ratioStr = '0:0:0';
        if (sumKcal > 0) {
            const cPct = Math.round((cKcal / sumKcal) * 10);
            const pPct = Math.round((pKcal / sumKcal) * 10);
            const fPct = 10 - (cPct + pPct);
            ratioStr = `${cPct}:${pPct}:${fPct}`;
        }
        document.getElementById('record-ratio-display').innerText = ratioStr;

        // [운동 도메인 자동 연동] 캘린더 상태 구조 역산 탐색
        const workoutData = state.workouts[activeDate];
        if (workoutData && workoutData.exercises && workoutData.exercises.length > 0) {
            // 완료 세트가 있는 부위 문자열 결합 유도
            const parts = [...new Set(workoutData.exercises.map(e => e.part))];
            document.getElementById('record-part-input').value = parts.join(' / ');

            // 근력 운동 시간 세트수 기반 자동 예측 모델 바인딩 (세트당 약 3분 역산 세팅)
            let totalSets = 0;
            workoutData.exercises.forEach(e => totalSets += (e.sets ? e.sets.length : 0));
            if (totalSets > 0) {
                document.getElementById('record-anaerobic-input').value = totalSets * 3;
            }
        }

        if(loader) loader.classList.add('hidden');
        if (typeof window.showToast === 'function') window.showToast("당일 식단 매크로 및 수행 훈련 지표 상속 완료.");
    }, 250);
}

/**
 * 9. 에디터 폼 기입 변수 전수 검사 및 영속성 동기화 저장 함수
 */
export function saveWeightRecordData() {
    const dateStr = document.getElementById('record-date-input').value;
    const weightVal = parseFloat(document.getElementById('record-weight-input').value) || 0;

    if (!dateStr) { alert("기록 일자가 오염되었습니다."); return; }
    if (weightVal <= 0) { alert("공복 체중은 필수 입력 지표입니다."); return; }

    // 격리 임시 입력 버퍼에서 마스터 전역 객체로 인젝션 집행
    if (!state.workouts[dateStr]) {
        state.workouts[dateStr] = { weight: 0, bf: 0, smm: 0, exercises: [] };
    }

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

    // 체중 변화량(Δ) 시간순 자동 추적 알고리즘 가동
    recalculateAllWeightDeltas();

    // 3중 안전 장치 즉시 동기화 백업 집행
    saveToLocal();
    closeRecordModal();
    renderWeightRecordList();
    
    // 메인 헤더 위젯 실시간 동적 오버라이드 피드백
    const activeToday = new Date().toISOString().slice(0,10);
    if (state.workouts[activeToday] && state.workouts[activeToday].weight > 0) {
        document.getElementById('prof-weight-display').innerText = state.workouts[activeToday].weight.toFixed(2) + 'kg';
    }

    if (typeof window.showToast === 'function') window.showToast("종합 건강 지표 영속성 보존에 성공했습니다.");
}

/**
 * 10. 기록 제거 파이프라인 함수
 */
export function deleteWeightRecordData(dateStr) {
    if (confirm(`[${dateStr}] 일자의 체중 및 건강 종합 지표를 소거할까요?\n(기존에 등록하셨던 운동 세트 일지는 완벽하게 보존됩니다.)`)) {
        const target = state.workouts[dateStr];
        if (target) {
            // 변수 필드만 초기화 가드 처리 (exercises 배열 자산 수호)
            target.weight = 0;
            target.weightDelta = 0;
            target.visualScore = 0;
            target.restingHR = 0;
            target.sleepTime = 0;
            target.workoutPart = '';
            target.anaerobic = 0;
            target.aerobic = 0;
            target.water = 0;
            target.bowel = 'X';
            target.carbs = 0;
            target.protein = 0;
            target.fat = 0;
            target.totalKcal = 0;
            target.macroRatio = '0:0:0';
            target.specialNote = '';
            target.memo = '';
        }
        recalculateAllWeightDeltas();
        saveToLocal();
        renderWeightRecordList();
        if (typeof window.showToast === 'function') window.showToast("당일 지표 기록을 영구 소거했습니다.");
    }
}

/**
 * 11. 체중 변화량(Δ) 전수 타임라인 연속형 재계산 수학 모듈
 */
export function recalculateAllWeightDeltas() {
    const chronologicalDates = Object.keys(state.workouts)
        .filter(d => state.workouts[d].weight > 0)
        .sort((a, b) => new Date(a) - new Date(b)); // 시간순 정렬 스크리닝

    chronologicalDates.forEach((dateStr, idx) => {
        if (idx === 0) {
            state.workouts[dateStr].weightDelta = 0.0; // 최초 기준점 예외처리 방어
        } else {
            const prevDateStr = chronologicalDates[idx - 1];
            state.workouts[dateStr].weightDelta = state.workouts[dateStr].weight - state.workouts[prevDateStr].weight;
        }
    });
}

/**
 * 12. 레이어 1: 주간 핵심 성과 지표 (KPI) 스냅샷 연산 및 마운트 내부 유틸리티
 */
function updateKpiSnapshotCards() {
    const sortedDates = Object.keys(state.workouts)
        .filter(date => state.workouts[date].weight > 0)
        .sort((a, b) => new Date(b) - new Date(a));

    const wLbl = document.getElementById('kpi-display-weight');
    const wSub = document.getElementById('kpi-sub-weight');
    const mLbl = document.getElementById('kpi-display-kcal');
    const mSub = document.getElementById('kpi-sub-macros');
    const cLbl = document.getElementById('kpi-display-cond');
    const bLbl = document.getElementById('kpi-display-bowel');

    if (!wLbl) return;

    if (sortedDates.length === 0) {
        wLbl.innerText = "-- kg"; wSub.innerText = "주간 격차: --";
        mLbl.innerText = "-- kcal"; mSub.innerText = "탄단지: --g";
        cLbl.innerText = "수면: --시간 | 상태: --점"; bLbl.innerText = "배변: --%";
        return;
    }

    // 최근 7개 로그 추출하여 주간 평균 흐름 역산
    const recent7 = sortedDates.slice(0, 7);
    let sumW = 0, sumK = 0, sumC = 0, sumP = 0, sumF = 0, sumSleep = 0, sumCond = 0, bowelCount = 0;

    recent7.forEach(d => {
        const obj = state.workouts[d];
        sumW += obj.weight; sumK += obj.totalKcal;
        sumC += obj.carbs; sumP += obj.protein; sumF += obj.fat;
        sumSleep += obj.sleepTime; sumCond += obj.condition;
        if (obj.bowel === 'O') bowelCount++;
    });

    const len = recent7.length;
    const avgW = sumW / len;
    const avgK = sumK / len;
    const latestDelta = state.workouts[sortedDates[0]].weightDelta || 0;

    wLbl.innerText = `${avgW.toFixed(1)} kg`;
    wSub.innerText = `최근 기록 변화량: ${latestDelta >= 0 ? '+' : ''}${latestDelta.toFixed(1)} kg`;
    wSub.className = `text-[10px] font-medium mt-0.5 ${latestDelta > 0 ? 'text-rose-500' : 'text-sky-500'}`;
    
    mLbl.innerText = `${Math.round(avgK).toLocaleString()} kcal`;
    mSub.innerText = `주간평균 탄:${Math.round(sumC/len)}g 단:${Math.round(sumP/len)}g 지:${Math.round(sumF/len)}g`;
    cLbl.innerText = `평균 수면: ${(sumSleep/len).toFixed(1)}h | 컨디션: ${(sumCond/len).toFixed(1)}점`;
    bLbl.innerText = `배변 빈도: ${Math.round((bowelCount/len)*100)}%`;
}

/**
 * 파일명: app.js (4단계 분할 구현본)
 * 역할: 대시보드 동적 매트릭스 필터 제어 및 Chart.js 활용 다중 축 시계열 혼합 차트 드라이버
 * 변경사항: 세그먼트 터치에 따른 3단 레이어 시각적 강조 포커싱 및 모드별 차트 축 재매핑 엔진 구현 완료
 */

import { state } from './store.js';
import { saveToLocal } from './services.js';

// 브라우저 전역 윈도우 (window) 네임스페이스 바인딩 (HTML 레이어 인라인 호출 규격 보장)
window.setMatrixFilter = setMatrixFilter;
window.updateWeightTrendChart = updateWeightTrendChart;

// 4단계 내부 관리용 단독 차트 인스턴스 보관 플래그
let mixChartInstance = null;

/**
 * 1. 대시보드 최상단 동적 매트릭스 필터 제어 함수
 * 목적: 선택된 핵심 성과 지표(KPI: Key Performance Indicator) 도메인 외의 카드들을 반투명 처리하여 시인성을 극대화합니다.
 * @param {string} filterType - 필터 모드 식별자 ('all', 'weight', 'macros', 'condition')
 */
export function setMatrixFilter(filterType) {
    // 글로벌 상태 객체에 현재 필터 모드 최전선 갱신 기입
    state.weightRecordFilter = filterType;

    // 1. 필터 칩 버튼의 시각적 활성화 활성 상태 클래스 토글
    const chips = ['all', 'weight', 'macros', 'condition'];
    chips.forEach(c => {
        const btn = document.getElementById('chip-filter-all'.replace('all', c));
        if (btn) {
            if (c === filterType) {
                btn.className = "px-4 py-2 text-xs font-black rounded-xl bg-amber-500 text-slate-950 transition-all shadow-md active:scale-95";
            } else {
                btn.className = "px-4 py-2 text-xs font-bold rounded-xl bg-slate-900 border border-slate-800 text-slate-400 transition-all";
            }
        }
    });

    // 2. 레이어 1 (KPI 카드) 및 레이어 3 (타임라인 상세 뷰) 문서 객체 모델(DOM: Document Object Model) 강조 동적 결합
    const cardWeight = document.getElementById('kpi-card-weight');
    const cardMacros = document.getElementById('kpi-card-macros');
    const cardCond = document.getElementById('kpi-card-condition');

    // 모든 강조 스타일 가드 초기화 초기화 집행
    [cardWeight, cardMacros, cardCond].forEach(card => {
        if (card) card.className = "glass-panel p-4 rounded-xl border border-slate-800 transition-all duration-300 opacity-100 scale-100";
    });
    if (cardCond) cardCond.className += " col-span-2"; // 레이아웃 격리 유지

    // 선택 모드에 따른 고대비 포커싱 링 및 반투명(opacity-25) 클래스 동적 바인딩
    if (filterType === 'weight') {
        if (cardMacros) cardMacros.className += " opacity-25 scale-95";
        if (cardCond) cardCond.className += " opacity-25 scale-95";
        if (cardWeight) cardWeight.className = cardWeight.className.replace('border-slate-800', 'border-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.2)] scale-[1.02]');
    } else if (filterType === 'macros') {
        if (cardWeight) cardWeight.className += " opacity-25 scale-95";
        if (cardCond) cardCond.className += " opacity-25 scale-95";
        if (cardMacros) cardMacros.className = cardMacros.className.replace('border-slate-800', 'border-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.2)] scale-[1.02]');
    } else if (filterType === 'condition') {
        if (cardWeight) cardWeight.className += " opacity-25 scale-95";
        if (cardMacros) cardMacros.className += " opacity-25 scale-95";
        if (cardCond) cardCond.className = cardCond.className.replace('border-slate-800', 'border-sky-500 shadow-[0_0_15px_rgba(14,165,233,0.2)] scale-[1.02]');
    }

    // 3. 레이어 3 타임라인 목록 내 텍스트 스케일링 가동 제어
    const sortedDates = Object.keys(state.workouts).filter(d => state.workouts[d].weight > 0);
    sortedDates.forEach(dateStr => {
        const txtWeight = document.getElementById(`txt-scale-weight-${dateStr}`);
        const txtDelta = document.getElementById(`txt-scale-delta-${dateStr}`);
        const txtBowel = document.getElementById(`txt-scale-bowel-${dateStr}`);
        
        if (txtWeight && txtDelta && txtBowel) {
            // 기본 크기 리셋
            txtWeight.className = "text-sm font-black text-white mr-1.5 transition-all";
            txtDelta.className = txtDelta.className.replace('text-base', 'text-xs').replace('font-black', 'font-bold');
            txtBowel.className = "text-xs font-bold text-amber-500 transition-all";

            // 필터 선택 정보 145% 강조 확대 스위칭
            if (filterType === 'weight') {
                txtWeight.className = "text-base font-black text-amber-400 mr-1.5 transition-all";
                txtDelta.className = txtDelta.className.replace('text-xs', 'text-sm').replace('font-bold', 'font-black');
            } else if (filterType === 'condition') {
                txtBowel.className = "text-base font-black text-sky-400 transition-all";
            }
        }
    });

    // 4. 레이어 2 시계열 차트 그래픽스 엔진 동적 동기화
    updateWeightTrendChart();
}

/**
 * 2. 레이어 2: 이중 축 동적 혼합 추세 차트 구동 엔진 함수
 * 목적: 모바일 기기의 제한된 메모리 부하를 방지하기 위해 단일 인스턴스를 파괴 후 재건축하여 다중 축(Multi-Axis)을 렌더링합니다.
 */
export function updateWeightTrendChart() {
    const canvas = document.getElementById('chart-weight-trend-mix');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 시간순(오름차순) 정렬 스크리닝을 통한 7일 타임라인 라벨 가공
    const chronologicalDates = Object.keys(state.workouts)
        .filter(date => state.workouts[date].weight > 0)
        .sort((a, b) => new Date(a) - new Date(b));

    const recent7Days = chronologicalDates.slice(-7);
    const chartLabels = recent7Days.map(d => d.slice(5).replace('-', '/')); // 형식: MM/DD

    // 메모리 누수(Memory Leak) 및 터치 버그 방지를 위해 기존 차트 인스턴스 영구 파괴
    if (mixChartInstance) {
        mixChartInstance.destroy();
        mixChartInstance = null;
    }

    if (recent7Days.length === 0) return;

    // 모드별 다차원 데이터셋 배열 추출 파이프라인
    const filterMode = state.weightRecordFilter || 'all';
    let datasets = [];
    let optionsScales = {
        x: { grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10, weight: '600' } } }
    };

    if (filterMode === 'all') {
        // [전체 종합 모드]: 공복 체중(Line, 좌측 Y축) + 총 섭취 열량(Bar, 우측 Y축)
        datasets = [
            {
                type: 'line', label: '공복체중(kg)',
                data: recent7Days.map(d => state.workouts[d].weight),
                borderColor: '#F59E0B', backgroundColor: 'transparent',
                borderWidth: 3, pointBackgroundColor: '#F59E0B',
                yAxisID: 'yLeft', tension: 0.25
            },
            {
                type: 'bar', label: '섭취열량(kcal)',
                data: recent7Days.map(d => state.workouts[d].totalKcal || 0),
                backgroundColor: 'rgba(30, 41, 59, 0.5)', borderColor: 'rgba(255, 255, 255, 0.1)',
                borderWidth: 1, borderRadius: 6, yAxisID: 'yRight'
            }
        ];

        optionsScales.yLeft = {
            position: 'left', grid: { color: 'rgba(255,255,255,0.03)' },
            ticks: { color: '#F59E0B', font: { size: 10 } },
            title: { display: false }
        };
        optionsScales.yRight = {
            position: 'right', grid: { display: false },
            ticks: { color: '#94A3B8', font: { size: 9 } },
            title: { display: false }
        };

    } else if (filterMode === 'weight') {
        // [체중 지표 모드]: 공복 체중선(Line) + 일간 체중 변화량(Bar) -> 고대비 단독 축 정렬
        datasets = [
            {
                type: 'line', label: '공복체중(kg)',
                data: recent7Days.map(d => state.workouts[d].weight),
                borderColor: '#F59E0B', backgroundColor: 'transparent',
                borderWidth: 3, pointRadius: 4, pointBackgroundColor: '#F59E0B', yAxisID: 'yLeft', tension: 0.1
            },
            {
                type: 'bar', label: '체중변화(kg)',
                data: recent7Days.map(d => state.workouts[d].weightDelta || 0),
                backgroundColor: recent7Days.map(d => (state.workouts[d].weightDelta || 0) > 0 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(14, 165, 233, 0.4)'),
                borderColor: recent7Days.map(d => (state.workouts[d].weightDelta || 0) > 0 ? '#EF4444' : '#0EA5E9'),
                borderWidth: 1.5, borderRadius: 4, yAxisID: 'yDelta'
            }
        ];

        optionsScales.yLeft = {
            position: 'left', grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#F59E0B', font: { size: 10 } }
        };
        optionsScales.yDelta = {
            position: 'right', grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 10 } }
        };

    } else if (filterMode === 'macros') {
        // [영양소 합산 모드]: 총 열량(Bar, 좌축) + 탄/단/지 실측 그램수(Line 적층형 구조 대조, 우축)
        datasets = [
            {
                type: 'bar', label: '총칼로리(kcal)',
                data: recent7Days.map(d => state.workouts[d].totalKcal || 0),
                backgroundColor: 'rgba(16, 185, 129, 0.15)', borderColor: '#10B981',
                borderWidth: 1.5, borderRadius: 6, yAxisID: 'yLeft'
            },
            {
                type: 'line', label: '탄수화물(g)', data: recent7Days.map(d => state.workouts[d].carbs || 0),
                borderColor: '#F59E0B', borderWidth: 2, pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.2
            },
            {
                type: 'line', label: '단백질(g)', data: recent7Days.map(d => state.workouts[d].protein || 0),
                borderColor: '#10B981', borderWidth: 2, pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.2
            },
            {
                type: 'line', label: '지방(g)', data: recent7Days.map(d => state.workouts[d].fat || 0),
                borderColor: '#0EA5E9', borderWidth: 2, pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.2
            }
        ];

        optionsScales.yLeft = { position: 'left', grid: { color: 'rgba(255,255,255,0.03)' }, ticks: { color: '#10B981', font: { size: 9 } } };
        optionsScales.yRight = { position: 'right', grid: { display: false }, ticks: { color: '#94A3B8', font: { size: 9 } } };

    } else if (filterMode === 'condition') {
        // [컨디션/대사 모드]: Y축을 1~10 평점 레일로 동적 동화매핑하여 컨디션(Line) + 눈바디(Line) + 수면(Line, 우축) 대조
        datasets = [
            {
                type: 'line', label: '종합컨디션(점)', data: recent7Days.map(d => state.workouts[d].condition || 7),
                borderColor: '#0EA5E9', borderWidth: 2.5, pointRadius: 3, backgroundColor: 'transparent', yAxisID: 'yLeft', tension: 0.3
            },
            {
                type: 'line', label: '눈바디점수(점)', data: recent7Days.map(d => state.workouts[d].visualScore || 5),
                borderColor: '#A855F7', borderWidth: 2.5, pointRadius: 3, backgroundColor: 'transparent', yAxisID: 'yLeft', tension: 0.3
            },
            {
                type: 'line', label: '수면시간(h)', data: recent7Days.map(d => state.workouts[d].sleepTime || 0),
                borderColor: '#64748B', borderWidth: 1.5, borderDash: [4, 4], pointRadius: 2, backgroundColor: 'transparent', yAxisID: 'yRight', tension: 0.1
            }
        ];

        optionsScales.yLeft = { position: 'left', min: 1, max: 10, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#0EA5E9', stepSize: 1, font: { size: 10 } } };
        optionsScales.yRight = { position: 'right', min: 0, max: 12, grid: { display: false }, ticks: { color: '#94A3B8', stepSize: 2, font: { size: 9 } } };
    }

    // 스마트폰 뷰포트 맞춤 하이퍼 매니지드 그래픽스 렌더링 집행
    mixChartInstance = new Chart(ctx, {
        data: { labels: chartLabels, datasets: datasets },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 10, bottom: 5, left: 2, right: 2 } },
            plugins: {
                legend: {
                    display: true, position: 'top', align: 'end',
                    labels: { color: '#64748B', boxWidth: 8, boxHeight: 8, font: { size: 9, weight: '700' }, padding: 6 }
                },
                tooltip: {
                    backgroundColor: '#0F172A', titleFont: { size: 11, weight: '900' },
                    bodyFont: { size: 10, weight: '600' }, padding: 10, borderRadius: 8, borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)'
                }
            },
            scales: optionsScales
        }
    });
}

/**
 * 파일명: app.js (5단계 최종 분할 구현본)
 * 역할: 엑셀(CSV: Comma-Separated Values) 데이터 백업/복원 엔진 및 글로벌 이벤트를 관장하는 초기화 통합 레이어
 * 변경사항: \uFEFF BOM 헤더 주입형 내보내기, 정규식 날짜 복원 파서 및 키보드 레이아웃 왜곡 방어 가드 구현 완료
 */

import { state } from './store.js';
import { saveToLocal, triggerSave } from './services.js';
import { renderWeightRecordList, recalculateAllWeightDeltas, setMatrixFilter } from './app.js'; 

// 브라우저 전역 윈도우 (window) 네임스페이스 바인딩 (인라인 HTML 트리거 바인딩 보장)
window.exportWeightRecordsToCSV = exportWeightRecordsToCSV;
window.importWeightRecordsFromCSV = importWeightRecordsFromCSV;
window.initWeightRecordModule = initWeightRecordModule;

/**
 * 1. 고밀도 엑셀(CSV) 파일 내보내기 파이프라인 함수
 * 목적: 20가지 종합 건강 지표를 UTF-8 인코딩 및 큰따옴표 이스케이프 가드를 적용하여 내보냅니다.
 */
export async function exportWeightRecordsToCSV() {
    // 글로벌 비비드 로딩 레이어 즉시 가동 (모바일 연산 랙 방어)
    const loader = document.getElementById('global-loading-layer');
    if (loader) {
        document.getElementById('global-loading-text').innerText = "보디빌딩 20대 변수 고밀도 엑셀 파일 생성 중...";
        loader.classList.remove('hidden'); loader.classList.add('flex');
    }

    setTimeout(async () => {
        // 마이크로소프트 엑셀(Microsoft Excel) 한글 깨짐 방지용 바이트 순서 표식 (BOM: Byte Order Mark) 주입
        let csvContent = "\uFEFF";
        
        // 20가지 핵심 변수 표준 헤더 라인 정의
        const headers = [
            "일자", "요일", "공복체중(kg)", "체중변화량(kg)", "수면시간(시간)", 
            "컨디션(1-10)", "눈바디점수(1-10)", "공복심박수(bpm)", "운동부위", 
            "탄수화물(g)", "단백질(g)", "지방(g)", "총섭취칼로리(kcal)", "탄단지비율", 
            "수분섭취(L)", "근력운동(분)", "유산소(분)", "배변활동(O/X)", "특이사항", "메모"
        ];
        csvContent += headers.join(",") + "\n";

        // 전역 상태 타임라인 데이터를 시간 오름차순(과거->최신)으로 정렬하여 엑셀 가독성 극대화
        const chronologicalDates = Object.keys(state.workouts)
            .filter(d => state.workouts[d].weight > 0)
            .sort((a, b) => new Date(a) - new Date(b));

        chronologicalDates.forEach(dateStr => {
            const data = state.workouts[dateStr];
            
            // 메모 및 특이사항 내 쉼표(,) 입력 시 구획 파괴 에러를 차단하기 위한 큰따옴표 이스케이프 가드 처리
            const cleanSpecialNote = data.specialNote ? `"${data.specialNote.replace(/"/g, '""')}"` : '""';
            const cleanMemo = data.memo ? `"${data.memo.replace(/"/g, '""')}"` : '""';

            const row = [
                dateStr,
                data.dayOfWeek || "",
                data.weight ? data.weight.toFixed(2) : "0.00",
                data.weightDelta ? data.weightDelta.toFixed(2) : "0.00",
                data.sleepTime || 0,
                data.condition || 7,
                data.visualScore || 5,
                data.restingHR || 60,
                data.workoutPart ? `"${data.workoutPart.replace(/"/g, '""')}"` : '""',
                data.carbs || 0,
                data.protein || 0,
                data.fat || 0,
                data.totalKcal || 0,
                data.macroRatio || "0:0:0",
                data.water || 0,
                data.anaerobic || 0,
                data.aerobic || 0,
                data.bowel || "X",
                cleanSpecialNote,
                cleanMemo
            ];
            csvContent += row.join(",") + "\n";
        });

        // 스마트폰 기기별 파일 시스템 권한 감지 및 이중화 저장 위치 지정 엔진 가동
        const pad = n => n < 10 ? '0' + n : n;
        const now = new Date();
        const fileName = `Diet_Weight_Report_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.csv`;

        try {
            if (window.showSaveFilePicker) {
                // [지원 기기]: 사용자가 직접 디렉토리 폴더 위치 및 명칭 지정형 팝업 연동
                const handle = await window.showSaveFilePicker({
                    suggestedName: fileName,
                    types: [{ description: 'Excel CSV Document', accept: { 'text/csv': ['.csv'] } }]
                });
                const writable = await handle.createWritable();
                await writable.write(csvContent);
                await writable.close();
                if (typeof window.showToast === 'function') window.showToast("선택하신 모바일 지정 폴더에 안전하게 내보내기 되었습니다.");
            } else {
                // [구형/미지원 기기]: 하위 호환성 안심 우회(Fallback) 자동 다운로드 링크 처리
                const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                const link = document.createElement("a");
                link.href = URL.createObjectURL(blob);
                link.setAttribute("download", fileName);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                if (typeof window.showToast === 'function') window.showToast("기본 다운로드 폴더에 엑셀 백업본이 저장되었습니다.");
            }
        } catch (err) {
            if (typeof window.showToast === 'function') window.showToast("백업 내보내기 처리가 안전하게 취소되었습니다.");
        } finally {
            if (loader) loader.classList.add('hidden');
        }
    }, 200);
}

/**
 * 2. 정규식 가드 기반 엑셀 파일 불러오기 및 무결성 파서 복원 함수
 * @param {Event} event - 파일 업로드 변경 동적 이벤트 객체
 */
export function importWeightRecordsFromCSV(event) {
    const file = event.target.files[0];
    if (!file) return;

    const loader = document.getElementById('global-loading-layer');
    if (loader) {
        document.getElementById('global-loading-text').innerText = "엑셀 패킷 해석 및 20대 건강 변수 병합 분석 중...";
        loader.classList.remove('hidden'); loader.classList.add('flex');
    }

    const reader = new FileReader();
    reader.onload = function (e) {
        try {
            const text = e.target.result;
            const lines = text.split(/\r?\n/).filter(line => line.trim().length > 0);
            
            if (lines.length <= 1) { throw new Error("복원 가능한 지표 행 데이터가 파일 내부에 존재하지 않습니다."); }

            // 1차 가드 절: 헤더 정밀 타이틀 무결성 대조 검사
            if (!lines[0].includes("일자") || !lines[0].includes("공복체중")) {
                throw new Error("본 애플리케이션의 규격과 일치하지 않는 손상된 엑셀 서식 파일입니다.");
            }

            let importSuccessCounter = 0;

            // 두 번째 행(실측 데이터 라인)부터 순회 파싱 집행
            for (let i = 1; i < lines.length; i++) {
                // 큰따옴표 내부의 쉼표를 구분 기호에서 예외 처리하는 엑셀 전용 정규식 분할 알고리즘 이식
                const row = lines[i].split(/,(?=(?:(?:[^"]*"){2})*[^"]*$)/).map(s => s.trim());
                if (row.length < 3) continue;

                let rawDate = row[0].replace(/"/g, '');
                
                // [날짜 포맷 정규식 강제 보정 가드]: 2026-6-8 형태를 YYYY-MM-DD(2026-06-08) 규격으로 안전 정렬 패딩
                const dateMatch = rawDate.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/);
                if (!dateMatch) continue;
                
                const normalizedDateStr = `${dateMatch[1]}-${dateMatch[2].padStart(2, '0')}-${dateMatch[3].padStart(2, '0')}`;
                
                const weightVal = parseFloat(row[2]) || 0;
                if (weightVal <= 0) continue; // 필수 실측값 공백 감지 시 데이터 무결성을 위해 생략 가드

                // 단일 진실 공급원 전역 구조 보존 병합 집행 (기존 exercises 훈련 자산은 완벽히 보존)
                if (!state.workouts[normalizedDateStr]) {
                    state.workouts[normalizedDateStr] = { weight: 0, bf: 0, smm: 0, exercises: [] };
                }

                const target = state.workouts[normalizedDateStr];
                target.weight = weightVal;
                target.dayOfWeek = row[1].replace(/"/g, '') || "";
                target.sleepTime = parseFloat(row[4]) || 0;
                target.condition = parseInt(row[5]) || 7;
                target.visualScore = parseInt(row[6]) || 5;
                target.restingHR = parseInt(row[7]) || 60;
                target.workoutPart = row[8] ? row[8].replace(/"/g, '') : "";
                target.carbs = parseFloat(row[9]) || 0;
                target.protein = parseFloat(row[10]) || 0;
                target.fat = parseFloat(row[11]) || 0;
                target.totalKcal = parseInt(row[12]) || 0;
                target.macroRatio = row[13] ? row[13].replace(/"/g, '') : "0:0:0";
                target.water = parseFloat(row[14]) || 0;
                target.anaerobic = parseInt(row[15]) || 0;
                target.aerobic = parseInt(row[16]) || 0;
                target.bowel = row[17] ? row[17].replace(/"/g, '') : "X";
                target.specialNote = row[18] ? row[18].replace(/"/g, '') : "";
                target.memo = row[19] ? row[19].replace(/"/g, '') : "";

                importSuccessCounter++;
            }

            // 20대 변수 병합이 완료된 직후 연속형 체중 변화량(Δ) 전체 재계산 파이프라인 집행
            recalculateAllWeightDeltas();
            
            // 3중 세이프 보존 동기화 저장 강제 집행
            saveToLocal();
            
            // UI 레이어 화면 뷰 리프레시 동기화 가동
            renderWeightRecordList();
            setMatrixFilter(state.weightRecordFilter || 'all');

            if (typeof window.showToast === 'function') {
                window.showToast(`총 ${importSuccessCounter}개 일자의 하드코어 보디빌딩 지표 복원에 성공했습니다.`);
            }

        } catch (err) {
            alert(`엑셀 복원 실패: ${err.message}`);
        } finally {
            if (loader) loader.classList.add('hidden');
            event.target.value = ''; // 동일 파일 재업로드 트리거 보장용 인풋 초기화
        }
    };
    reader.readAsText(file, 'UTF-8');
}

/**
 * 3. 스마트폰 모바일 화면 전용 중앙 집중식 레이아웃 반응형 최적화 가드 엔진
 * 목적: 스크롤 스티키 처리 및 가상 키보드 호출 시 레이아웃 왜곡을 전면 완벽 방어합니다.
 */
export function initWeightRecordModule() {
    // [가드 1]: 스크롤 350px 이상 이동 시 상단 4대 메뉴바 고정 및 튀림 현상 방어 스페이서 연동
    window.addEventListener('scroll', function() {
        const menubar = document.getElementById('main-tab-menubar');
        const spacer = document.getElementById('menu-bar-spacer');
        if (!menubar || !spacer) return;

        if (window.scrollY > 350) {
            menubar.classList.add('sticky-menu-fixed', 'px-4', 'pt-2');
            spacer.classList.remove('relative'); spacer.classList.add('block');
        } else {
            menubar.classList.remove('sticky-menu-fixed', 'px-4', 'pt-2');
            spacer.classList.remove('block'); spacer.classList.add('relative');
        }
    });

    // [가드 2]: 모바일 가상 숫자 패드 활성화 시 최하단 고정 영양소 바 오버레이 가림 전면 방어 가드
    if (window.visualViewport) {
        window.visualViewport.addEventListener('resize', function() {
            const macroBar = document.getElementById('sticky-macro-bar');
            if (!macroBar) return;
            
            // 키보드가 뷰포트 영역을 침범하여 화면 높이가 축소되었는지 정밀 탐색
            if (window.visualViewport.height < window.innerHeight * 0.75) {
                macroBar.classList.add('hidden'); // 입력 패널 개방 중 일시 은닉 처리
            } else {
                macroBar.classList.remove('hidden'); // 자판 해제 즉시 복구 노출
            }
        });
    }
}

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

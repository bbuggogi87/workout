// 4. 비즈니스 로직 및 UI 제어 (App)
    const App = {
        showToast: function(msg) { 
            const t = document.getElementById('toast'); document.getElementById('toast-text').innerText = msg; 
            t.className = "fixed bottom-5 right-5 z-50 transform translate-y-0 opacity-100 transition-all duration-300 pointer-events-auto shadow-2xl"; 
            setTimeout(() => { t.className = "fixed bottom-5 right-5 z-50 transform translate-y-10 opacity-0 transition-all duration-300 pointer-events-none"; }, 2500); 
        },

        finishInit: function() { 
            document.getElementById('prof-weight-display').innerText = state.userInfo.weight + 'kg'; 
            document.getElementById('prof-bf-display').innerText = state.userInfo.targetBF + '%';
            document.getElementById('prof-height-display').innerText = state.userInfo.height + 'cm';
            if(state.userInfo.targetDate) { document.getElementById('badge-target-date').innerText = `Target Date: ${state.userInfo.targetDate.substring(5).replace('-','.')}`; }
            applyCustomSuppsToDB(); this.initCalcDropdowns();
            if(state.phases.length > 0) this.loadPhase(state.phases[0].id); 
            this.runSmartCalc('carb'); this.runSmartCalc('pro'); this.runSmartCalc('fat');
        },

        renderPhaseTabs: function() {
            const container = document.getElementById('phase-tabs-container'); container.innerHTML = '';
            state.phases.forEach(p => {
                const isActive = (p.id === state.currentPhaseId);
                const btnClass = isActive ? "px-5 py-3 rounded-lg text-base font-bold phase-btn-active shrink-0 transition-colors" : "px-5 py-3 rounded-lg text-base font-bold text-slate-400 hover:bg-slate-800 shrink-0 transition-colors";
                container.innerHTML += `<button onclick="window.loadPhase('${p.id}')" class="${btnClass}">${p.title}</button>`;
            });
        },

        loadPhase: function(phaseId) { 
            if(!state.phases.find(p => p.id === phaseId) && state.phases.length > 0) phaseId = state.phases[0].id;
            state.currentPhaseId = phaseId; this.renderPhaseTabs();
            const cp = state.phases.find(p => p.id === phaseId); if(!cp) return;
            document.getElementById('phase-description').innerText = cp.desc;
            const container = document.getElementById('timeline-container'); container.innerHTML = '';
            
            cp.meals.forEach((meal, mIdx) => {
                let itemsHtml = ''; if(!meal.items) meal.items = [];
                meal.items.forEach((item, iIdx) => {
                    let opts = `<optgroup label="탄수화물">` + state.foodCategories['탄수화물'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
                    opts += `<optgroup label="단백질">` + state.foodCategories['단백질'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
                    opts += `<optgroup label="지방">` + state.foodCategories['지방'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
                    opts += `<optgroup label="야채">` + state.foodCategories['야채'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
                    opts += `<optgroup label="보충제">` + state.foodCategories['보충제'].map(o => `<option value="${o}" ${o===item.name?'selected':''}>${o}</option>`).join('') + `</optgroup>`;
                    
                    itemsHtml += `
                    <div class="flex items-center justify-between p-3 bg-slate-900/60 rounded-xl border border-slate-800 mb-2">
                        <select onchange="window.updateItemName(${mIdx}, ${iIdx}, event.target.value)" class="bg-slate-800 text-slate-200 text-sm px-3 py-2 rounded-lg outline-none w-[140px] sm:w-[160px]">${opts}</select>
                        <div class="flex items-center gap-2">
                            <input type="number" oninput="window.updateItemAmount(${mIdx}, ${iIdx}, event.target.value)" class="w-16 sm:w-20 bg-slate-950 text-white text-right text-base px-3 py-2 rounded-lg focus:border-sky-500 outline-none" value="${item.amount || 0}">
                            <span class="text-sm text-slate-400 font-bold">g</span>
                            <button onclick="window.deleteItem(${mIdx}, ${iIdx})" class="text-slate-600 hover:text-rose-400 ml-2 px-2 text-lg">✕</button>
                        </div>
                    </div>`;
                });

                container.innerHTML += `
                <div class="relative transition-all duration-300 mb-6">
                    <div onclick="event.stopPropagation(); window.cycleColor(${mIdx})" class="drag-handle absolute -left-[35px] sm:-left-[58px] top-3 w-6 h-6 bg-${meal.color}-500 rounded-full border-4 border-slate-950 timeline-line-glow cursor-move flex items-center justify-center shadow-lg"><span class="text-white/70 text-[10px] font-black select-none pointer-events-none">↕</span></div>
                    <div class="glass-panel p-4 sm:p-5 rounded-2xl border border-slate-800">
                        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center cursor-pointer gap-3 sm:gap-0" onclick="window.toggleCollapse(${mIdx})">
                            <div class="flex items-center gap-2 sm:gap-4 w-full sm:w-auto" onclick="event.stopPropagation()">
                                <input type="time" onchange="window.updateMealField(${mIdx}, 'time', event.target.value)" value="${meal.time}" class="bg-transparent text-${meal.color}-400 font-black text-xl sm:text-2xl outline-none shrink-0 p-0 tracking-tighter">
                                <input type="text" onchange="window.updateMealField(${mIdx}, 'label', event.target.value)" value="${meal.label}" class="px-2 py-1 text-xs sm:text-sm font-bold uppercase bg-${meal.color}-500/10 text-${meal.color}-400 border border-${meal.color}-500/20 rounded-md outline-none flex-1 min-w-[100px] max-w-[200px]">
                            </div>
                            <div class="flex gap-2 items-center self-end sm:self-auto shrink-0" onclick="event.stopPropagation()">
                                <button onclick="window.openEditMealModal(${mIdx}, true)" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-sky-300 rounded border border-slate-700 transition-colors">📋 복제</button>
                                <button onclick="window.openEditMealModal(${mIdx}, false)" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded border border-slate-700 transition-colors">⚙️ 수정</button>
                                <button onclick="window.deleteMeal(${mIdx})" class="text-xs sm:text-sm px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-rose-400 rounded border border-slate-700 transition-colors">🗑️ 삭제</button>
                                <button onclick="window.toggleCollapse(${mIdx})" class="text-lg px-2 py-1 ml-1 text-slate-400 hover:text-white transition-colors">${meal.isCollapsed ? '🔽' : '🔼'}</button>
                            </div>
                        </div>
                        <div class="transition-all duration-300 overflow-hidden ${meal.isCollapsed ? 'max-h-0 opacity-0 m-0' : 'max-h-[3000px] opacity-100 mt-5'}">
                            <input type="text" onchange="window.updateMealField(${mIdx}, 'explain', event.target.value)" value="${meal.explain || ''}" placeholder="스케줄 메모 (예: 오후 메인 본 운동 세션)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm sm:text-base text-white font-bold outline-none focus:border-sky-500 mb-3">
                            <textarea onchange="window.updateMealField(${mIdx}, 'supps', event.target.value)" class="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-4 py-3 text-sm sm:text-base text-slate-200 outline-none focus:border-sky-500 mb-3 min-h-[100px] custom-scrollbar" placeholder="보충제 섭취 프로토콜 및 상세 코칭 메모">${meal.supps || ''}</textarea>
                            ${itemsHtml}
                            <button onclick="window.addItem(${mIdx})" class="w-full py-3 border border-dashed border-slate-700 text-sm sm:text-base text-slate-400 hover:text-sky-400 font-bold mt-2 rounded-xl transition-colors">+ 식품 및 보충제 추가</button>
                        </div>
                    </div>
                </div>`;
            });
            this.calculateMacros();

            // SortableJS 초기화 (모바일 터치 딜레이 0.15초 적용)
            if (typeof Sortable !== 'undefined') {
                if (window.timelineSortable) { window.timelineSortable.destroy(); }
                window.timelineSortable = new Sortable(document.getElementById('timeline-container'), {
                    handle: '.drag-handle', animation: 200, ghostClass: 'opacity-40', delay: 150, delayOnTouchOnly: true,
                    onEnd: function (evt) {
                        const oldIdx = evt.oldIndex; const newIdx = evt.newIndex; if (oldIdx === newIdx) return;
                        const phase = state.phases.find(p => p.id === state.currentPhaseId);
                        const movedItem = phase.meals.splice(oldIdx, 1)[0];
                        phase.meals.splice(newIdx, 0, movedItem);
                        Services.triggerSave();
                    }
                });
            }
        },

        openPhaseModal: function(isNew = false) {
            state.editingPhaseIsNew = isNew;
            if (isNew) { document.getElementById('phase-title').value = ''; document.getElementById('phase-desc').value = ''; } 
            else { const cp = state.phases.find(p => p.id === state.currentPhaseId); document.getElementById('phase-title').value = cp.title; document.getElementById('phase-desc').value = cp.desc; }
            document.getElementById('phase-modal').classList.remove('hidden'); document.getElementById('phase-modal').classList.add('flex');
        },
        closePhaseModal: function() { document.getElementById('phase-modal').classList.add('hidden'); document.getElementById('phase-modal').classList.remove('flex'); },
        savePhaseModal: function() {
            const title = document.getElementById('phase-title').value || '새로운 식단 탭'; const desc = document.getElementById('phase-desc').value || '';
            if (state.editingPhaseIsNew) { const newId = 'p_' + Date.now(); state.phases.push({ id: newId, title: title, desc: desc, meals: [] }); state.currentPhaseId = newId; } 
            else { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.title = title; cp.desc = desc; }
            this.closePhaseModal(); Services.triggerSave(this.showToast); this.loadPhase(state.currentPhaseId); this.showToast("탭 정보가 저장되었습니다.");
        },
        deletePhase: function() {
            if(state.phases.length <= 1) { this.showToast("최소 1개의 탭은 존재해야 합니다."); return; }
            if(confirm("탭을 삭제하시겠습니까? 데이터가 완전히 삭제됩니다.")) {
                state.phases = state.phases.filter(p => p.id !== state.currentPhaseId);
                Services.triggerSave(this.showToast); this.loadPhase(state.phases[0].id); this.showToast("탭이 삭제되었습니다.");
            }
        },
        copyPhase: function() {
            const cp = state.phases.find(p => p.id === state.currentPhaseId);
            state.clipboardMeals = JSON.parse(JSON.stringify(cp.meals)); this.showToast("현재 식단 세트가 클립보드에 복사되었습니다.");
        },
        pastePhase: function() {
            if (!state.clipboardMeals || state.clipboardMeals.length === 0) { this.showToast("복사된 세트가 없습니다."); return; }
            if(confirm("⚠️ 붙여넣기를 진행하면 현재 탭의 기존 식단이 모두 지워집니다.\n정말 덮어쓰시겠습니까?")) {
                const cp = state.phases.find(p => p.id === state.currentPhaseId);
                cp.meals = state.clipboardMeals.map(m => { let cloned = JSON.parse(JSON.stringify(m)); cloned.id = 'm' + Date.now() + Math.floor(Math.random() * 1000); return cloned; });
                Services.triggerSave(this.showToast); this.loadPhase(state.currentPhaseId); this.showToast("덮어쓰기가 완료되었습니다.");
            }
        },

        openEditMealModal: function(mIdx, isDuplicate) {
            let meal; if (mIdx !== null) meal = state.phases.find(p => p.id === state.currentPhaseId).meals[mIdx];
            else meal = { time: '12:00', label: '새 일정', color: 'sky', explain: '', supps: '', items: [] };
            state.editingMealState = { mIdx: mIdx, isDuplicate: isDuplicate, originalItems: meal.items || [] };
            document.getElementById('edit-meal-title').innerText = (isDuplicate) ? "📋 일정 복제" : (mIdx === null ? "➕ 새 일정 추가" : "⚙️ 일정 수정");
            document.getElementById('edit-meal-time').value = meal.time; document.getElementById('edit-meal-label').value = meal.label;
            document.getElementById('edit-meal-color').value = meal.color; document.getElementById('edit-meal-explain').value = meal.explain || ''; document.getElementById('edit-meal-supps').value = meal.supps || '';
            document.getElementById('edit-meal-modal').classList.remove('hidden'); document.getElementById('edit-meal-modal').classList.add('flex');
        },
        closeEditMealModal: function() { document.getElementById('edit-meal-modal').classList.add('hidden'); document.getElementById('edit-meal-modal').classList.remove('flex'); },
        saveEditMealModal: function() {
            const time = document.getElementById('edit-meal-time').value; const label = document.getElementById('edit-meal-label').value || '일정';
            const color = document.getElementById('edit-meal-color').value; const explain = document.getElementById('edit-meal-explain').value;
            const supps = document.getElementById('edit-meal-supps').value; const cp = state.phases.find(p => p.id === state.currentPhaseId);
            
            if (state.editingMealState.mIdx === null || state.editingMealState.isDuplicate) {
                const newObj = { id: 'm'+Date.now(), time: time, label: label, color: color, explain: explain, supps: supps, items: JSON.parse(JSON.stringify(state.editingMealState.originalItems)), isCollapsed: false };
                if(state.editingMealState.isDuplicate) { cp.meals.splice(state.editingMealState.mIdx + 1, 0, newObj); this.showToast("원본 바로 아래에 복제되었습니다."); } 
                else { cp.meals.push(newObj); this.showToast("새 일정이 추가되었습니다."); }
            } else {
                const meal = cp.meals[state.editingMealState.mIdx];
                meal.time = time; meal.label = label; meal.color = color; meal.explain = explain; meal.supps = supps; this.showToast("수정이 완료되었습니다.");
            }
            Services.triggerSave(this.showToast); this.closeEditMealModal(); this.loadPhase(state.currentPhaseId);
        },

        cycleColor: function(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); const colors = ['sky', 'emerald', 'amber', 'rose', 'violet', 'slate']; const current = cp.meals[mIdx].color || 'sky'; cp.meals[mIdx].color = colors[(colors.indexOf(current) + 1) % colors.length]; Services.triggerSave(); this.loadPhase(state.currentPhaseId); },
        toggleCollapse: function(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].isCollapsed = !cp.meals[mIdx].isCollapsed; this.loadPhase(state.currentPhaseId); },
        updateMealField: function(mIdx, field, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx][field] = val; Services.triggerSave(); this.loadPhase(state.currentPhaseId); },
        updateItemName: function(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].name = val; Services.triggerSave(); this.calculateMacros(); },
        updateItemAmount: function(mIdx, iIdx, val) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items[iIdx].amount = parseFloat(val)||0; Services.triggerSave(); this.calculateMacros(); },
        deleteItem: function(mIdx, iIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.splice(iIdx, 1); Services.triggerSave(); this.loadPhase(state.currentPhaseId); },
        addItem: function(mIdx) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals[mIdx].items.push({name:'백미', amount:100}); Services.triggerSave(); this.loadPhase(state.currentPhaseId); },
        deleteMeal: function(mIdx) { if(confirm("이 일정을 삭제하시겠습니까?")) { const cp = state.phases.find(p => p.id === state.currentPhaseId); cp.meals.splice(mIdx, 1); Services.triggerSave(); this.loadPhase(state.currentPhaseId); } },

        calculateMacros: function() {
            let tC=0, tP=0, tF=0, tK=0; let cSrc={}, pSrc={}, fSrc={}; const cp = state.phases.find(p => p.id === state.currentPhaseId);
            if(cp) {
                cp.meals.forEach(m => {
                    if(m.items) { m.items.forEach(i => { const db = state.foodDB[i.name]; if(db) { 
                        let amt = i.amount || 0; let c=db.c*amt, p=db.p*amt, f=db.f*amt; tC+=c; tP+=p; tF+=f; tK+=db.k*amt; 
                        if(c>0) cSrc[i.name] = (cSrc[i.name]||0) + c; if(p>0) pSrc[i.name] = (pSrc[i.name]||0) + p; if(f>0) fSrc[i.name] = (fSrc[i.name]||0) + f;
                    }});}
                });
            }
            let cKcal = tC * 4, pKcal = tP * 4, fKcal = tF * 9; let totCalc = cKcal + pKcal + fKcal;
            let cPct = totCalc > 0 ? Math.round((cKcal / totCalc) * 100) : 0; let pPct = totCalc > 0 ? Math.round((pKcal / totCalc) * 100) : 0; let fPct = totCalc > 0 ? Math.round((fKcal / totCalc) * 100) : 0;
            
            document.getElementById('dash-kcal').innerText = Math.round(tK).toLocaleString(); 
            document.getElementById('dash-carbs').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-amber-500">${tC.toFixed(1)}g</span> <span class="text-sm sm:text-base text-amber-400/80 font-bold ml-1">(${cPct}%)</span>`;
            document.getElementById('dash-protein').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-emerald-400">${tP.toFixed(1)}g</span> <span class="text-sm sm:text-base text-emerald-400/80 font-bold ml-1">(${pPct}%)</span>`;
            document.getElementById('dash-fat').innerHTML = `<span class="text-3xl sm:text-4xl font-black text-sky-400">${tF.toFixed(1)}g</span> <span class="text-sm sm:text-base text-sky-400/80 font-bold ml-1">(${fPct}%)</span>`;
            
            document.getElementById('sticky-kcal').innerText = Math.round(tK).toLocaleString(); document.getElementById('sticky-carbs').innerHTML = `${tC.toFixed(1)}g <span class="text-[10px] font-bold">(${cPct}%)</span>`; document.getElementById('sticky-protein').innerHTML = `${tP.toFixed(1)}g <span class="text-[10px] font-bold">(${pPct}%)</span>`; document.getElementById('sticky-fat').innerHTML = `${tF.toFixed(1)}g <span class="text-[10px] font-bold">(${fPct}%)</span>`;
            
            if (!state.pieChartInstance && !document.getElementById('tab-analysis').classList.contains('hidden')) { 
                state.pieChartInstance = new Chart(document.getElementById('chart-pie-macros').getContext('2d'), { 
                    type: 'doughnut', data: { labels: ['탄수화물', '단백질', '지방'], datasets: [{ data: [tC, tP, tF], backgroundColor: ['#F59E0B', '#10B981', '#0EA5E9'], borderWidth: 0 }] }, 
                    options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { position: 'bottom', labels: { color: '#94A3B8', font: { size: 14 } } } } } 
                }); 
            } else if (state.pieChartInstance) { state.pieChartInstance.data.datasets[0].data = [tC, tP, tF]; state.pieChartInstance.update(); }
            this.renderAnalysisDetails(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc);
        },

        renderAnalysisDetails: function(tC, tP, tF, cPct, pPct, fPct, cSrc, pSrc, fSrc) {
            document.getElementById('src-total-c').innerText = `${tC.toFixed(1)}g (${cPct}%)`; document.getElementById('src-total-p').innerText = `${tP.toFixed(1)}g (${pPct}%)`; document.getElementById('src-total-f').innerText = `${tF.toFixed(1)}g (${fPct}%)`;
            const renderList = (srcObj, total, elId, colorCls) => {
                let html = ''; let sorted = Object.entries(srcObj).sort((a,b)=>b[1]-a[1]);
                sorted.forEach(([name, amt]) => { let pct = total > 0 ? Math.round((amt/total)*100) : 0; html += `<div class="mb-3"><div class="flex justify-between text-xs text-slate-300 mb-1"><span>${name}</span><span>${amt.toFixed(1)}g (${pct}%)</span></div><div class="w-full bg-slate-800 rounded-full h-2"><div class="bg-${colorCls} h-2 rounded-full" style="width: ${pct}%"></div></div></div>`; });
                document.getElementById(elId).innerHTML = html;
            };
            renderList(cSrc, tC, 'src-list-c', 'amber-500'); renderList(pSrc, tP, 'src-list-p', 'emerald-500'); renderList(fSrc, tF, 'src-list-f', 'sky-500');
        },

        initCalcDropdowns: function() {
            const cDrop = document.getElementById('calc-carb-src'); const pDrop = document.getElementById('calc-pro-src'); const fDrop = document.getElementById('calc-fat-src');
            cDrop.innerHTML = ''; pDrop.innerHTML = ''; fDrop.innerHTML = ''; 
            state.foodCategories['탄수화물'].forEach(f => cDrop.innerHTML += `<option value="${f}">${f}</option>`);
            state.foodCategories['단백질'].forEach(f => pDrop.innerHTML += `<option value="${f}">${f}</option>`);
            state.foodCategories['지방'].forEach(f => { if(state.foodDB[f].f > 0.1) fDrop.innerHTML += `<option value="${f}">${f}</option>`; });
            cDrop.value = '백미'; pDrop.value = '닭가슴살'; fDrop.value = '아몬드';
        },

        runSmartCalc: function(type) {
            let src = document.getElementById(`calc-${type}-src`).value; let amt = parseFloat(document.getElementById(`calc-${type}-amt`).value) || 0; let targetMacro = 0; let resHtml = '';
            if(type === 'carb') { targetMacro = amt * state.foodDB[src].c; state.foodCategories['탄수화물'].forEach(f => { if(f !== src && state.foodDB[f].c > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].c)}g</span></div>`; } }); } 
            else if(type === 'pro') { targetMacro = amt * state.foodDB[src].p; state.foodCategories['단백질'].forEach(f => { if(f !== src && state.foodDB[f].p > 0) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].p)}g</span></div>`; } }); } 
            else if(type === 'fat') { targetMacro = amt * state.foodDB[src].f; state.foodCategories['지방'].forEach(f => { if(f !== src && state.foodDB[f].f > 0.1) { resHtml += `<div class="flex justify-between items-center py-2 border-b border-slate-800 last:border-0 text-base"><span class="text-slate-400">${f}</span><span class="text-white font-bold">${Math.round(targetMacro/state.foodDB[f].f)}g</span></div>`; } }); }
            document.getElementById(`calc-${type}-res`).innerHTML = resHtml;
        },

        switchMainTab: function(tabId) { 
            document.querySelectorAll('.tab-content').forEach(el => el.classList.add('hidden')); document.getElementById(tabId).classList.remove('hidden'); 
            const tabs = ['tab-timeline', 'tab-calculator', 'tab-analysis'];
            tabs.forEach(t => { document.getElementById('btn-' + t).className = (t === tabId) ? "px-5 py-3 rounded-xl text-base font-bold active-tab shrink-0" : "px-5 py-3 rounded-xl text-base font-bold border border-slate-800 text-slate-400 hover:text-white shrink-0"; });
            if(tabId === 'tab-analysis') this.calculateMacros();
        },

        openProfileModal: function() { document.getElementById('mod-weight-user').value=state.userInfo.weight; document.getElementById('mod-height').value=state.userInfo.height; document.getElementById('mod-bf').value=state.userInfo.targetBF; document.getElementById('mod-date').value=state.userInfo.targetDate; document.getElementById('profile-modal').classList.remove('hidden'); document.getElementById('profile-modal').classList.add('flex'); },
        closeProfileModal: function() { document.getElementById('profile-modal').classList.add('hidden'); document.getElementById('profile-modal').classList.remove('flex'); },
        saveProfileModal: function() { state.userInfo = { weight: parseFloat(document.getElementById('mod-weight-user').value)||72.5, height: parseFloat(document.getElementById('mod-height').value)||173, targetBF: parseFloat(document.getElementById('mod-bf').value)||4.0, targetDate: document.getElementById('mod-date').value }; this.closeProfileModal(); Services.triggerSave(this.showToast); this.finishInit(); this.showToast("프로필이 저장되었습니다."); },

        renderCustomSupps: function() {
            const container = document.getElementById('custom-supp-list'); container.innerHTML = '';
            state.customSupps.forEach((supp, idx) => {
                container.innerHTML += `
                <div class="bg-slate-900 border border-slate-700 p-5 rounded-xl relative">
                    <button onclick="window.removeCustomSupp(${idx})" class="absolute top-3 right-3 text-rose-500 text-sm font-bold hover:text-rose-400">✕ 삭제</button>
                    <input type="text" id="supp-name-${idx}" value="${supp.name}" placeholder="보충제 명칭" class="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-white font-bold mb-4 focus:border-sky-500 outline-none text-base">
                    <div class="grid grid-cols-2 gap-3 text-sm">
                        <div class="flex items-center justify-between"><span class="text-slate-400">중량(g)</span><input type="number" id="supp-wt-${idx}" value="${supp.weight}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                        <div class="flex items-center justify-between"><span class="text-slate-400">Kcal</span><input type="number" id="supp-k-${idx}" value="${supp.kcal}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                        <div class="flex items-center justify-between"><span class="text-amber-500">탄(g)</span><input type="number" step="0.1" id="supp-c-${idx}" value="${supp.carbs}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                        <div class="flex items-center justify-between"><span class="text-emerald-500">단(g)</span><input type="number" step="0.1" id="supp-p-${idx}" value="${supp.protein}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                        <div class="flex items-center justify-between"><span class="text-sky-500">지(g)</span><input type="number" step="0.1" id="supp-f-${idx}" value="${supp.fat}" class="w-16 text-right bg-slate-800 rounded p-2 text-white"></div>
                    </div>
                </div>`;
            });
        },
        openMacroModal: function() { this.renderCustomSupps(); document.getElementById('macro-modal').classList.remove('hidden'); document.getElementById('macro-modal').classList.add('flex'); },
        closeMacroModal: function() { document.getElementById('macro-modal').classList.add('hidden'); document.getElementById('macro-modal').classList.remove('flex'); },
        addCustomSuppForm: function() { state.customSupps.push({ id: Date.now(), name: '새 보충제', weight: 30, kcal: 120, carbs: 3, protein: 20, fat: 1.5 }); this.renderCustomSupps(); },
        removeCustomSupp: function(idx) { state.customSupps.splice(idx, 1); this.renderCustomSupps(); },
        saveMacroModal: function() { 
            let updatedSupps = [];
            for(let i=0; i<state.customSupps.length; i++) {
                let n = document.getElementById(`supp-name-${i}`).value || '보충제'+i;
                updatedSupps.push({ id: state.customSupps[i].id, name: n, weight: parseFloat(document.getElementById(`supp-wt-${i}`).value)||30, kcal: parseFloat(document.getElementById(`supp-k-${i}`).value)||0, carbs: parseFloat(document.getElementById(`supp-c-${i}`).value)||0, protein: parseFloat(document.getElementById(`supp-p-${i}`).value)||0, fat: parseFloat(document.getElementById(`supp-f-${i}`).value)||0 });
            }
            state.customSupps = updatedSupps; applyCustomSuppsToDB(); this.closeMacroModal(); Services.triggerSave(this.showToast); this.loadPhase(state.currentPhaseId); this.showToast("보충제 DB 저장 완료."); 
        }
    };

    // 5. 브라우저 글로벌 인터페이스 브릿지 연결 (에러 완전 차단)
    window.switchMainTab = (id) => App.switchMainTab(id);
    window.loadPhase = (id) => App.loadPhase(id);
    window.cycleColor = (idx) => App.cycleColor(idx);
    window.toggleCollapse = (idx) => App.toggleCollapse(idx);
    window.updateMealField = (idx, f, v) => App.updateMealField(idx, f, v);
    window.updateItemName = (m, i, v) => App.updateItemName(m, i, v);
    window.updateItemAmount = (m, i, v) => App.updateItemAmount(m, i, v);
    window.addItem = (m) => App.addItem(m);
    window.deleteItem = (m, i) => App.deleteItem(m, i);
    window.deleteMeal = (m) => App.deleteMeal(m);
    window.openPhaseModal = (n) => App.openPhaseModal(n);
    window.closePhaseModal = () => App.closePhaseModal();
    window.savePhaseModal = () => App.savePhaseModal();
    window.deletePhase = () => App.deletePhase();
    window.copyPhase = () => App.copyPhase();
    window.pastePhase = () => App.pastePhase();
    window.openEditMealModal = (m, d) => App.openEditMealModal(m, d);
    window.closeEditMealModal = () => App.closeEditMealModal();
    window.saveEditMealModal = () => App.saveEditMealModal();
    window.openProfileModal = () => App.openProfileModal();
    window.closeProfileModal = () => App.closeProfileModal();
    window.saveProfileModal = () => App.saveProfileModal();
    window.openMacroModal = () => App.openMacroModal();
    window.closeMacroModal = () => App.closeMacroModal();
    window.saveMacroModal = () => App.saveMacroModal();
    window.addCustomSuppForm = () => App.addCustomSuppForm();
    window.removeCustomSupp = (idx) => App.removeCustomSupp(idx);
    window.runSmartCalc = (t) => App.runSmartCalc(t);

    window.exportData = () => Services.exportDataJSON(App.showToast);
    window.importData = (e) => Services.importDataJSON(e.target.files[0], () => { App.finishInit(); App.showToast("복원 성공."); }, () => App.showToast("오류 파일."));

    // 스크롤 UI 제어
    window.addEventListener('scroll', function() {
        const stickyBar = document.getElementById('sticky-macro-bar');
        if (window.scrollY > 350) { stickyBar.classList.remove('-translate-y-full', 'opacity-0', 'pointer-events-none'); stickyBar.classList.add('translate-y-0', 'opacity-100', 'pointer-events-auto'); } 
        else { stickyBar.classList.remove('translate-y-0', 'opacity-100', 'pointer-events-auto'); stickyBar.classList.add('-translate-y-full', 'opacity-0', 'pointer-events-none'); }
    });

    // 6. 시스템 부팅 가동 (HTML 렌더링 직후)
    window.onload = () => {
        Services.initFirebase((success) => {
            const el = document.getElementById('cloud-status');
            if(success) el.innerHTML = '<span class="w-1.5 h-1.5 bg-emerald-500 rounded-full"></span> 클라우드 연결됨';
            else el.innerHTML = '<span class="w-1.5 h-1.5 bg-sky-500 rounded-full"></span> 로컬 스토리지 모드';
            App.finishInit();
        });
    };

})(); // 즉시 실행 함수(IIFE) 종료


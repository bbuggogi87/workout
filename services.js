window.PrepServices = {
    saveTimeout: null,

    saveToLocalStorage: function() {
        localStorage.setItem('prep_master_local_data', JSON.stringify({
            phases: window.PrepStore.state.phases,
            customSupps: window.PrepStore.state.customSupps,
            userInfo: window.PrepStore.state.userInfo
        }));
    },

    loadFromLocalStorage: function() {
        const local = localStorage.getItem('prep_master_local_data');
        if (local) {
            try {
                const parsed = JSON.parse(local);
                if (parsed.phases) window.PrepStore.state.phases = parsed.phases;
                if (parsed.customSupps) window.PrepStore.state.customSupps = parsed.customSupps;
                if (parsed.userInfo) window.PrepStore.state.userInfo = parsed.userInfo;
                return true;
            } catch(e) { return false; }
        }
        return false;
    },

    initializeFirebase: async function(onInitComplete) {
        // 로컬 가동 안정성 확보를 위해 로컬 스토리지(내부 저장소) 데이터 먼저 강제 복원
        this.loadFromLocalStorage();
        
        try {
            const cfg = typeof __firebase_config !== 'undefined' && __firebase_config ? JSON.parse(__firebase_config) : null;
            if (!cfg) { onInitComplete(false); return; } // 클라우드 설정 없으면 로컬 모드로 즉시 실행
            
            // 파이어베이스(Firebase) 모듈 동적 백그라운드 로딩
            const { initializeApp } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js");
            const { getAuth, signInAnonymously, onAuthStateChanged } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js");
            const { getFirestore, doc, getDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");

            const app = initializeApp(cfg); const auth = getAuth(app); window.PrepStore.state.db = getFirestore(app);
            await signInAnonymously(auth);

            onAuthStateChanged(auth, async (user) => {
                if (user) {
                    window.PrepStore.state.userId = user.uid;
                    const docRef = doc(window.PrepStore.state.db, 'artifacts', window.PrepStore.state.appId, 'users', window.PrepStore.state.userId, 'prepData', 'userData');
                    const snap = await getDoc(docRef);
                    if (snap.exists()) {
                        const data = snap.data();
                        if (data.phases) window.PrepStore.state.phases = data.phases;
                        if (data.customSupps) window.PrepStore.state.customSupps = data.customSupps;
                        if (data.userInfo) window.PrepStore.state.userInfo = data.userInfo;
                        this.saveToLocalStorage(); // 클라우드 데이터 다운로드 후 로컬에 동기화 백업
                    }
                }
                onInitComplete(true);
            });
        } catch (e) {
            // 에러 시 스크립트 정지 방지 (로컬 모드로 안전하게 폴백)
            onInitComplete(false);
        }
    },

    saveToCloud: async function() {
        this.saveToLocalStorage(); // 무조건 로컬 백업 동시 저장
        if (!window.PrepStore.state.userId || !window.PrepStore.state.db) return;
        try {
            const { doc, setDoc } = await import("https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js");
            const docRef = doc(window.PrepStore.state.db, 'artifacts', window.PrepStore.state.appId, 'users', window.PrepStore.state.userId, 'prepData', 'userData');
            await setDoc(docRef, { phases: window.PrepStore.state.phases, customSupps: window.PrepStore.state.customSupps, userInfo: window.PrepStore.state.userInfo }, { merge: true });
        } catch(e) {}
    },

    triggerSave: function(showToastCallback) {
        this.saveToLocalStorage();
        if (this.saveTimeout) clearTimeout(this.saveTimeout);
        this.saveTimeout = setTimeout(() => {
            this.saveToCloud();
            if(showToastCallback) showToastCallback("저장 동기화 완료.");
        }, 1000);
    },

    exportDataJSON: function(showToastCallback) {
        const dataStr = JSON.stringify({ phases: window.PrepStore.state.phases, customSupps: window.PrepStore.state.customSupps, userInfo: window.PrepStore.state.userInfo }, null, 2);
        const pad = n => n < 10 ? '0' + n : n; const now = new Date();
        const fileName = `Diet_현체중(${window.PrepStore.state.userInfo.weight})_${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}.json`;
        const linkElement = document.createElement('a'); linkElement.setAttribute('href', 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr)); linkElement.setAttribute('download', fileName); linkElement.click();
        if(showToastCallback) showToastCallback("백업 파일(JSON)이 저장되었습니다.");
    },

    importDataJSON: function(file, onSuccess, onError) {
        if (!file) return; const reader = new FileReader();
        reader.onload = function(e) {
            try {
                const data = JSON.parse(e.target.result);
                if (data.phaseData && !data.phases) { // 구버전 마이그레이션 호환
                    let migrated = []; let idx = 1;
                    for (let key in data.phaseData) { migrated.push({ id: 'p_' + idx++, title: data.phaseData[key].title || key, desc: data.phaseData[key].desc || '', meals: data.phaseData[key].meals || [] }); }
                    window.PrepStore.state.phases = migrated;
                } else if(data.phases) { window.PrepStore.state.phases = data.phases; }
                
                if(data.customSupps) window.PrepStore.state.customSupps = data.customSupps;
                if(data.userInfo) window.PrepStore.state.userInfo = data.userInfo;
                
                window.PrepStore.applyCustomSuppsToDB(); window.PrepServices.saveToLocalStorage(); window.PrepServices.saveToCloud(); if(onSuccess) onSuccess();
            } catch(err) { if(onError) onError(); }
        };
        reader.readAsText(file);
    }
};


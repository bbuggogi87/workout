export const FOOD_DB = {
    '백미':{c:0.28,p:0.027,f:0.003,k:1.3}, '현미밥':{c:0.32,p:0.03,f:0.01,k:1.5}, '감자':{c:0.20,p:0.02,f:0.001,k:0.86}, '고구마':{c:0.31,p:0.015,f:0.002,k:1.3}, '찐단호박':{c:0.10,p:0.01,f:0.0,k:0.45}, '오트밀':{c:0.66,p:0.13,f:0.06,k:3.8}, '바나나':{c:0.23,p:0.01,f:0.0,k:0.89}, '사과':{c:0.14,p:0.0,f:0.0,k:0.52}, '파스타(건면)':{c:0.75,p:0.13,f:0.01,k:3.7}, '베이글':{c:0.50,p:0.10,f:0.01,k:2.5}, '식빵':{c:0.49,p:0.09,f:0.04,k:2.7},
    '닭가슴살':{c:0.0,p:0.23,f:0.012,k:1.1}, '닭다리살(껍질X)':{c:0.0,p:0.19,f:0.08,k:1.5}, '돼지안심':{c:0.0,p:0.26,f:0.03,k:1.4}, '소고기부채살':{c:0.0,p:0.21,f:0.11,k:1.9}, '소고기우둔살':{c:0.0,p:0.22,f:0.04,k:1.3}, '연어':{c:0.0,p:0.20,f:0.13,k:2.0}, '틸라피아':{c:0.0,p:0.20,f:0.017,k:0.98}, '오징어':{c:0.03,p:0.16,f:0.01,k:0.9}, '전란':{c:0.007,p:0.125,f:0.095,k:1.43}, '난백액':{c:0.01,p:0.10,f:0.0,k:0.45},
    '아몬드':{c:0.216,p:0.211,f:0.499,k:5.79}, '호두':{c:0.13,p:0.15,f:0.65,k:6.5}, '피넛버터(무당)':{c:0.20,p:0.25,f:0.50,k:5.9}, '아보카도':{c:0.08,p:0.02,f:0.15,k:1.6}, '올리브오일':{c:0.0,p:0.0,f:1.0,k:8.8}, '계란노른자':{c:0.03,p:0.16,f:0.27,k:3.2},
    '브로콜리':{c:0.07,p:0.03,f:0.0,k:0.34}, '아스파라거스':{c:0.04,p:0.02,f:0.0,k:0.20}, '양배추':{c:0.06,p:0.01,f:0.0,k:0.25}, '방울토마토':{c:0.04,p:0.01,f:0.0,k:0.18}, '야채(혼합)':{c:0.03,p:0.01,f:0.0,k:0.2}, '블루베리':{c:0.14,p:0.007,f:0.003,k:0.57}
};

export const FOOD_CATEGORIES = {
    '탄수화물':['백미','현미밥','고구마','감자','찐단호박','오트밀','바나나','사과','파스타(건면)','베이글','식빵'],
    '단백질':['닭가슴살','닭다리살(껍질X)','돼지안심','소고기부채살','소고기우둔살','연어','틸라피아','오징어','전란','난백액'],
    '지방':['아몬드','호두','피넛버터(무당)','아보카도','올리브오일','계란노른자'],
    '야채':['브로콜리','아스파라거스','양배추','방울토마토','야채(혼합)','블루베리'],
    '보충제':[]
};

export const INITIAL_USER_INFO = { targetBF: '4.0', height: 173, weight: 72.5, targetDate: '2026-07-18' };
export const INITIAL_CUSTOM_SUPPS = [ { id: 1, name: '단백질 보충제', weight: 30, kcal: 120, carbs: 3, protein: 24, fat: 1.5 } ];

export const INITIAL_PHASES = [
    { 
        id: 'p_1', title: '기본 베이스 식단', desc: '식단, 영양제, 훈련 일정을 자유롭게 배치하고 섭취 메모를 남겨보세요.', 
        meals: [
           { id: 'm1', time: '12:00', label: '식사 1 (첫 식사)', color: 'sky', explain: '', supps: '[보충제 패키지 A]\n• 멀티비타민 2캡슐\n• OptiMSM 1.5g\n• CoQ10 100mg\n• 오메가-3 1캡슐', items: [{name:'백미', amount:130}, {name:'닭가슴살', amount:150}, {name:'전란', amount:100}, {name:'야채(혼합)', amount:180}, {name:'아몬드', amount:15}], isWorkout: false, isCollapsed: false },
            { id: 'm2', time: '17:00', label: '식사 2 (1차 분할)', color: 'amber', explain: '', supps: '[보충제 패키지 B]\n• 멀티비타민 1캡슐\n• OptiMSM 1.5g', items: [{name:'감자', amount:115}, {name:'닭가슴살', amount:75}, {name:'전란', amount:100}, {name:'야채(혼합)', amount:180}], isWorkout: false, isCollapsed: false },
            { id: 'm3', time: '19:00', label: '식사 2 (2차 분할)', color: 'emerald', explain: '', supps: '보충제 없음\n(훈련 전 위장 부담 최소화 및 복압 확보)', items: [{name:'감자', amount:115}, {name:'닭가슴살', amount:75}], isWorkout: false, isCollapsed: false },
            { id: 'm4', time: '21:00', label: '고강도 웨이트 훈련', color: 'rose', explain: '오후 메인 본 운동 세션 인트라 아웃 워크아웃', supps: '', items: [], isWorkout: true, isCollapsed: false },
            { id: 'm5', time: '23:00', label: '훈련 직후 유산소', color: 'violet', explain: '체지방 4% 커팅 유산소 세션\n* 유산소 중 근손실 방지 완벽 방어', supps: '• EAA 1스쿱 (수분 500ml에 희석)', items: [], isWorkout: true, isCollapsed: false },
            { id: 'm6', time: '23:40', label: '포스트 워크아웃', color: 'sky', explain: '골격근 동화 창 오픈 타이밍\n* 유산소 완전히 끝난 직후 섭취', supps: '• 크레아틴 6g', items: [{name:'단백질 보충제', amount:30}], isWorkout: false, isCollapsed: false },
            { id: 'm7', time: '01:00', label: '식사 3 (새벽 식사)', color: 'amber', explain: '', supps: '보충제 절대 금지\n(B군 각성 작용으로 인한 수면 방해 차단)', items: [{name:'백미', amount:130}, {name:'닭가슴살', amount:150}, {name:'전란', amount:100}, {name:'야채(혼합)', amount:180}], isWorkout: false, isCollapsed: false },
            { id: 'm8', time: '03:00', label: '식사 4 (취침 전)', color: 'slate', explain: '', supps: '보충제 없음\n(깊은 수면 유도)', items: [{name:'블루베리', amount:100}, {name:'아몬드', amount:20}], isWorkout: false, isCollapsed: false }
       ] 
    },
    { id: 'p_2', title: '수분 조절 & 밴딩', desc: '수분 조절 및 밴딩 상세 일정 관리 탭', meals: [] }, 
    { id: 'p_3', title: 'D-Day 카보로딩', desc: '대회 당일 최상의 컨디션을 위한 카보로딩 로직', meals: [] }
];

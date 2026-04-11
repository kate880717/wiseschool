// State
window.appState = {
    selectedName: null,
    selectedGrade: null,
    selectedCls: null,
    selectedCharacter: null,
    selectedCharacterName: null,
    currentMissionId: null,
    currentQuestionIndex: 0,
    currentQuestions: [],
    completedMissions: new Map(), // map of missionId -> result (e.g., 'O' or 'X' on first try)
    wrongQuestions: [],
    learningLog: [],
    isProcessing: false,
    isRetryMode: false,
    audioBase64: null,
    radarChart: null
};

const getScreens = () => ({
    login: document.getElementById('login-screen'),
    mic: document.getElementById('mic-screen'),
    promise: document.getElementById('promise-screen'),
    character: document.getElementById('character-screen'),
    map: document.getElementById('map-screen'),
    quiz: document.getElementById('quiz-screen'),
    feedback: document.getElementById('feedback'),
    recording: document.getElementById('recording-screen'),
    report: document.getElementById('report-screen'),
    retryModal: document.getElementById('retry-modal')
});

window.onload = function () {
    loadDataFromGAS();
};

window.loadDataFromGAS = async function() {
    if (!window.GAS_API_URL || window.GAS_API_URL.trim() === '') {
        console.warn("GAS_API_URL이 설정되지 않아 기본 데이터로 시작합니다.");
        populateStudentSelect(window.defaultStudentData);
        window.missions = window.defaultMissionsData;
        return;
    }

    try {
        const selectEl = document.getElementById('name-input');
        if(selectEl) selectEl.innerHTML = '<option value="">데이터 불러오는 중...</option>';

        const response = await fetch(window.GAS_API_URL);
        const result = await response.json();

        if (result.students) {
            populateStudentSelect(result.students);
        } else {
            populateStudentSelect(window.defaultStudentData);
        }

        if (result.missionsData && Object.keys(result.missionsData).length > 0) {
            window.missions = result.missionsData;
        } else {
            window.missions = window.defaultMissionsData;
        }
    } catch (error) {
        console.error("데이터 불러오기 실패:", error);
        populateStudentSelect(window.defaultStudentData);
        window.missions = window.defaultMissionsData;
    }
}

window.populateStudentSelect = function(students) {
    const selectEl = document.getElementById('name-input');
    if (!selectEl) return;
    selectEl.innerHTML = '<option value="">이름 찾아보기</option>';
    
    students.forEach(student => {
        const option = document.createElement('option');
        // value 문자열에 학년, 반, 이름을 인코딩해서 넣습니다.
        option.value = JSON.stringify(student);
        option.textContent = `${student.grade}학년 ${student.cls}반 ${student.name}`;
        selectEl.appendChild(option);
    });
}

// Login Logic
window.checkLoginReady = () => {
    const selectEl = document.getElementById('name-input');
    const btn = document.getElementById('btn-start');
    
    if (selectEl.value && selectEl.value !== "") {
        try {
            const student = JSON.parse(selectEl.value);
            window.appState.selectedName = student.name;
            window.appState.selectedGrade = student.grade;
            window.appState.selectedCls = student.cls;
            btn.disabled = false;
            btn.classList.remove('grayscale');
        } catch (e) {
            btn.disabled = true;
            btn.classList.add('grayscale');
        }
    } else {
        btn.disabled = true;
        btn.classList.add('grayscale');
    }
};

window.requestMicAndGoToPromise = () => {
    const screens = getScreens();
    screens.login.classList.add('hidden');
    // 네이티브에서 마이크 권한 요청을 짚고 넘어가기 위함
    screens.mic.classList.remove('hidden');
};

// Character Logic
window.initApp = () => {
    window.initAudioContext();
    const screens = getScreens();
    screens.promise.classList.add('hidden');
    screens.character.classList.remove('hidden');
};

window.selectCharacter = (emoji, name) => {
    window.appState.selectedCharacter = emoji;
    window.appState.selectedCharacterName = name;

    document.querySelectorAll('.character-card').forEach(c => c.classList.remove('selected', 'border-sky-500', 'bg-sky-50'));
    if (event && event.currentTarget) {
        event.currentTarget.classList.add('selected', 'border-sky-500', 'bg-sky-50');
    }

    document.getElementById('btn-char').disabled = false;
};

window.startGame = () => {
    window.initAudioContext();
    const screens = getScreens();
    screens.character.classList.add('hidden');
    screens.map.classList.remove('hidden');

    document.getElementById('char-emoji').textContent = window.appState.selectedCharacter;
    document.getElementById('player-name').textContent = window.appState.selectedName;
    
    if (!window.isMuted) {
        setTimeout(() => window.speak("지도 화면이에요. 가고 싶은 장소를 선택하세요.", 1.1, 1.0), 500);
    }

    window.updateMapStatus();
};

// Quiz Logic
window.loadQuiz = (missionId) => {
    if (window.appState.completedMissions.has(missionId)) {
        alert("이미 도장을 받은 장소예요!");
        return;
    }
    window.appState.currentMissionId = missionId;

    const mission = window.missions[missionId];
    if (!mission) {
        alert("데이터를 찾을 수 없습니다.");
        return;
    }
    const langData = mission.data; // Now it's just Korean data directly under 'data'

    window.appState.currentQuestions = langData.qs;
    window.appState.currentQuestionIndex = 0;
    window.appState.isRetryMode = false;

    // Track if any question was missed in this mission
    window.appState.currentMissionFlawless = true; 

    const screens = getScreens();
    screens.map.classList.add('hidden');
    screens.quiz.classList.remove('hidden');
    document.getElementById('loc-icon').textContent = mission.icon;
    document.getElementById('loc-name').textContent = langData.locationName;
    document.getElementById('quiz-fairy').textContent = window.appState.selectedCharacter;

    window.showQuestion();
};

window.showQuestion = function () {
    const qData = window.appState.isRetryMode
        ? window.appState.currentQuestions[window.appState.currentQuestionIndex].data
        : window.appState.currentQuestions[window.appState.currentQuestionIndex];

    const badge = document.getElementById('quiz-badge');
    if (window.appState.isRetryMode) {
        badge.textContent = '다시 풀기';
        badge.className = "absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-orange-500 text-white px-6 py-2 rounded-full text-lg font-bold border-4 border-white shadow-md";
    } else {
        badge.textContent = `문제 ${window.appState.currentQuestionIndex + 1}`;
        badge.className = "absolute top-0 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-sky-500 text-white px-6 py-2 rounded-full text-lg font-bold border-4 border-white shadow-md";
    }

    document.getElementById('q-text').textContent = qData.q;
    document.getElementById('quiz-hint-text').textContent = qData.h;
    
    // Update choices
    const btn1 = document.getElementById('btn-c1');
    const btn2 = document.getElementById('btn-c2');
    btn1.querySelector('span').textContent = qData.c1;
    btn2.querySelector('span').textContent = qData.c2;

    window.appState.isProcessing = false;
    
    if (!window.isMuted) {
        setTimeout(() => window.speak(qData.q, 1.0, 1.0), 300);
    }
};

window.replayAudio = () => {
    const txt = document.getElementById('q-text').textContent;
    window.speak(txt, 1.0, 1.0);
};

window.checkAnswer = (userAnswerIndex) => {
    if (window.appState.isProcessing) return;
    window.appState.isProcessing = true;

    const qData = window.appState.isRetryMode
        ? window.appState.currentQuestions[window.appState.currentQuestionIndex].data
        : window.appState.currentQuestions[window.appState.currentQuestionIndex];

    const isCorrect = (userAnswerIndex === qData.ans);

    if (!window.appState.isRetryMode) {
        window.appState.learningLog.push({ q: qData.q, correct: isCorrect });
        if (!isCorrect) {
            window.appState.currentMissionFlawless = false;
        }
    }

    const fbTitle = document.getElementById('fb-title');
    const fbDesc = document.getElementById('fb-desc');
    const fbIcon = document.getElementById('fb-icon');

    const screens = getScreens();
    screens.feedback.classList.remove('hidden');
    document.getElementById('next-btn').classList.add('hidden');
    document.getElementById('success-btn').classList.add('hidden');
    document.getElementById('retry-btn').classList.add('hidden');

    document.getElementById('fb-fairy-icon').textContent = window.appState.selectedCharacter;

    if (isCorrect) {
        window.playChime();
        fbIcon.textContent = '⭕';
        fbTitle.textContent = '정답입니다!';
        fbTitle.className = 'text-4xl font-bold mb-4 text-green-600';
        fbDesc.textContent = qData.f;

        if (window.appState.currentQuestionIndex < window.appState.currentQuestions.length - 1) {
            document.getElementById('next-btn').classList.remove('hidden');
            if (!window.isMuted) window.speak(qData.f, 1.0, 1.0);
        } else {
            document.getElementById('success-btn').classList.remove('hidden');
            if (!window.isMuted) window.speak(qData.f, 1.0, 1.0);
            if (!window.appState.isRetryMode) {
                if (typeof confetti !== 'undefined') {
                    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
                }
            }
        }
    } else {
        window.playWrongSound();
        fbIcon.textContent = '❌';
        fbTitle.textContent = '아쉬워요!';
        fbTitle.className = 'text-4xl font-bold mb-4 text-orange-600';
        fbDesc.textContent = qData.x;

        if (!window.appState.isRetryMode) {
            const alreadyExists = window.appState.wrongQuestions.some(wq => wq.data.q === qData.q);
            if (!alreadyExists) {
                window.appState.wrongQuestions.push({ missionId: window.appState.currentMissionId, data: qData });
            }
        }

        document.getElementById('retry-btn').classList.remove('hidden');
        if (!window.isMuted) window.speak(qData.x, 1.0, 1.0);
    }
};

window.playFeedbackAudio = () => {
    const text = document.getElementById('fb-desc').textContent;
    window.speak(text, 1.0, 1.0);
};

window.retryQuestion = () => {
    const screens = getScreens();
    screens.feedback.classList.add('hidden');
    window.appState.isProcessing = false;
};

window.nextQuestion = () => {
    const screens = getScreens();
    screens.feedback.classList.add('hidden');
    window.appState.currentQuestionIndex++;
    window.showQuestion();
};

window.returnToMap = () => {
    const screens = getScreens();
    screens.quiz.classList.add('hidden');
    screens.map.classList.remove('hidden');
};

window.completeMission = () => {
    const screens = getScreens();
    screens.feedback.classList.add('hidden');
    screens.quiz.classList.add('hidden');
    screens.map.classList.remove('hidden');

    if (window.appState.isRetryMode) {
        window.showRecordingScreen();
    } else {
        // Record mission result
        window.appState.completedMissions.set(window.appState.currentMissionId, window.appState.currentMissionFlawless ? 'O' : 'X');
        window.updateMapStatus();

        if (window.appState.completedMissions.size === 6) {
            setTimeout(window.checkRetryOrFinish, 1000);
        }
    }
};

window.updateMapStatus = function () {
    const completedCount = window.appState.completedMissions.size;
    
    document.getElementById('top-status-text').textContent = completedCount === 6 ? '탐험 완료!' : `${completedCount + 1}단계 탐험 중`;
    
    // Update Stars
    const starContainer = document.getElementById('star-container');
    starContainer.innerHTML = '';
    for(let i=0; i<6; i++) {
        const star = document.createElement('span');
        star.className = 'text-2xl drop-shadow-sm';
        star.textContent = i < completedCount ? '⭐' : '☆';
        star.style.color = i < completedCount ? '#f59e0b' : '#94a3b8';
        starContainer.appendChild(star);
    }

    // Update Spots opacity
    document.querySelectorAll('.mission-spot').forEach(spot => {
        if (window.appState.completedMissions.has(spot.dataset.mission)) {
            spot.classList.add('completed');
            spot.style.opacity = '0.5';
            spot.style.pointerEvents = 'none';
        }
    });
};

window.checkRetryOrFinish = function () {
    if (window.appState.wrongQuestions.length > 0) {
        const screens = getScreens();
        screens.retryModal.classList.remove('hidden');
    } else {
        window.showRecordingScreen();
    }
};

window.startRetryMode = () => {
    const screens = getScreens();
    screens.retryModal.classList.add('hidden');
    window.appState.isRetryMode = true;
    window.appState.currentQuestions = [...window.appState.wrongQuestions];
    window.appState.currentQuestionIndex = 0;

    screens.map.classList.add('hidden');
    screens.quiz.classList.remove('hidden');
    document.getElementById('loc-icon').textContent = '📝';
    document.getElementById('loc-name').textContent = "틀린 문제 다시 풀어보기";
    document.getElementById('quiz-fairy').textContent = window.appState.selectedCharacter;

    window.showQuestion();
};


// Recording Screen
window.showRecordingScreen = function() {
    const screens = getScreens();
    screens.recording.classList.remove('hidden');
    if (!window.isMuted) {
        window.speak('슬기로운 학교 생활을 위해 어떤 규칙이 필요할까요? 친구의 생각을 마이크를 눌러 목소리로 남겨주세요!', 1.0, 1.0);
    }
}

window.submitResults = async function() {
    // Show spinner
    document.getElementById('submitting-overlay').classList.remove('hidden');
    
    let resultPayload = {
        name: window.appState.selectedName,
        grade: window.appState.selectedGrade,
        cls: window.appState.selectedCls,
        results: Object.fromEntries(window.appState.completedMissions),
        audioBase64: window.appState.audioBase64
    };

    if (window.GAS_API_URL && window.GAS_API_URL.trim() !== '') {
        try {
            const res = await fetch(window.GAS_API_URL, {
                method: 'POST',
                body: JSON.stringify(resultPayload)
            });
            const textResponse = await res.text();
            console.log("시트 전송 결과: ", textResponse);
        } catch (e) {
            console.error("전송 에러, 하지만 진행합니다.", e);
        }
    } else {
        console.warn("GAS_API_URL이 없어 데이터가 전송되지 않았습니다.");
    }

    document.getElementById('submitting-overlay').classList.add('hidden');
    const screens = getScreens();
    screens.recording.classList.add('hidden');
    window.showReport();
}


// Report & Chart
window.showReport = function () {
    document.getElementById('report-name-display').textContent = window.appState.selectedName;
    const today = new Date();
    document.getElementById('report-date').textContent = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;

    const screens = getScreens();
    screens.report.classList.remove('hidden');
    
    // Draw Traffic Lights
    renderTrafficLights();

    // Draw Radar Chart
    renderRadarChart();

    // Confetti
    const duration = 3000;
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 100 };

    if (typeof confetti !== 'undefined') {
        const interval = setInterval(function () {
            const timeLeft = animationEnd - Date.now();
            if (timeLeft <= 0) return clearInterval(interval);
            const particleCount = 50 * (timeLeft / duration);
            confetti(Object.assign({}, defaults, { particleCount, origin: { x: Math.random(), y: Math.random() - 0.2 } }));
        }, 250);
    }
    
    if (!window.isMuted) {
        setTimeout(() => window.speak("축하해요. 훌륭한 탐험가 상을 받았어요.", 1.1, 1.0), 1000);
    }
};

window.renderTrafficLights = function() {
    const container = document.getElementById('traffic-light-feedback');
    container.innerHTML = '';
    
    const areaOrder = [
        { id: 'classroom', name: '교실' },
        { id: 'specialroom', name: '특별실' },
        { id: 'restroom', name: '화장실' },
        { id: 'hallway', name: '복도' },
        { id: 'cafeteria', name: '급식실' },
        { id: 'library', name: '도서관' }
    ];

    areaOrder.forEach(area => {
        const result = window.appState.completedMissions.get(area.id);
        const card = document.createElement('div');
        card.className = "flex flex-col items-center p-2 bg-slate-50 border-2 border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100 transition-colors";
        
        let lightContent = '';
        if (result === 'O') {
            lightContent = `<div class="w-8 h-8 rounded-full bg-green-500 border-4 border-green-700 shadow-inner mb-1"></div>`; // 초록불
        } else {
            lightContent = `<div class="w-8 h-8 rounded-full bg-yellow-400 border-4 border-yellow-600 shadow-inner mb-1 animate-pulse"></div>`; // 노란불
        }

        const icon = window.missions[area.id] ? window.missions[area.id].icon : '📍';
        card.innerHTML = `
            ${lightContent}
            <span class="text-2xl">${icon}</span>
            <span class="text-sm font-bold text-slate-600 mt-1">${area.name}</span>
        `;
        
        // Add click listener for feedback popup
        card.onclick = () => {
            const isFlawless = result === 'O';
            const missionData = window.missions[area.id]?.data;
            if(!missionData) return;
            
            // Just show the positive feedback sentence from the first question
            const sentence = missionData.qs[0].f;
            
            // Re-use feedback modal for a custom display
            const fbTitle = document.getElementById('fb-title');
            const fbDesc = document.getElementById('fb-desc');
            const fbIcon = document.getElementById('fb-icon');
            
            fbIcon.innerHTML = isFlawless ? '🟢' : '🟡';
            fbTitle.textContent = `${area.name}의 규칙`;
            fbTitle.className = isFlawless ? 'text-4xl font-bold mb-4 text-green-600' : 'text-4xl font-bold mb-4 text-yellow-600';
            fbDesc.textContent = sentence;
            
            const screens = getScreens();
            screens.feedback.classList.remove('hidden');
            document.getElementById('next-btn').classList.add('hidden');
            document.getElementById('success-btn').classList.add('hidden');
            document.getElementById('retry-btn').classList.add('hidden');
            // Adding a close button dynamically
            document.getElementById('success-btn').classList.remove('hidden');
            document.getElementById('success-btn').textContent = "닫기 ✖";
            // Override standard success-btn behavior temporarily
            const originalComplete = window.completeMission;
            window.completeMission = function() {
                screens.feedback.classList.add('hidden');
                document.getElementById('success-btn').textContent = "미션 완료! ⭐";
                window.completeMission = originalComplete; // Restore
            };
        };

        container.appendChild(card);
    });
};

window.renderRadarChart = function() {
    const ctx = document.getElementById('radar-chart');
    if (!ctx) return;
    
    const labels = ['교실', '특별실', '화장실', '복도', '급식실', '도서관'];
    const ids = ['classroom', 'specialroom', 'restroom', 'hallway', 'cafeteria', 'library'];
    const dataValues = ids.map(id => window.appState.completedMissions.has(id) ? 100 : 60);

    if (window.appState.radarChart) {
        window.appState.radarChart.destroy();
    }

    Chart.defaults.font.family = '"Jua", "Noto Sans KR", sans-serif';
    Chart.defaults.color = '#475569';

    window.appState.radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: labels,
            datasets: [{
                label: '영역별 달성도',
                data: dataValues,
                fill: true,
                backgroundColor: 'rgba(56, 189, 248, 0.2)',
                borderColor: 'rgb(14, 165, 233)',
                pointBackgroundColor: 'rgb(2, 132, 199)',
                pointBorderColor: '#fff',
                pointHoverBackgroundColor: '#fff',
                pointHoverBorderColor: 'rgb(2, 132, 199)',
                borderWidth: 3,
                pointRadius: 4
            }]
        },
        options: {
            maintainAspectRatio: false,
            scales: {
                r: {
                    angleLines: { color: 'rgba(0,0,0,0.1)' },
                    grid: { color: 'rgba(0,0,0,0.1)' },
                    pointLabels: {
                        font: { size: 16, weight: 'bold' },
                        color: '#334155'
                    },
                    ticks: {
                        display: false,
                        min: 0,
                        max: 100
                    }
                }
            },
            plugins: {
                legend: { display: false }
            }
        }
    });
};

// Canvas Helper
function generateCanvas() {
    const canvas = document.createElement('canvas');
    const width = 800;
    const height = 1200;
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Bg
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);

    // Header
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(0, 0, width, 550);

    ctx.fillStyle = '#1e3a8a';
    ctx.font = 'bold 40px "Jua", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`📊 탐험 결과`, width / 2, 80);

    // List
    ctx.fillStyle = '#334155'; ctx.font = 'bold 28px "Jua", sans-serif'; ctx.textAlign = 'left';
    ctx.fillText(`📋 배운 내용`, 100, 150);

    ctx.font = '22px "Noto Sans KR", sans-serif';
    let yPos = 200;
    const history = window.appState.learningLog;

    history.slice(0, 8).forEach((h) => {
        const mark = h.correct ? '🟢' : '🟡';
        const truncatedQ = h.q.length > 28 ? h.q.substring(0, 28) + '...' : h.q;
        ctx.fillStyle = h.correct ? '#475569' : '#f97316';
        ctx.fillText(`${mark} ${truncatedQ}`, 100, yPos);
        yPos += 40;
    });

    // Certificate
    const certY = 550;
    ctx.fillStyle = '#fffbeb';
    ctx.fillRect(0, certY, width, height - certY);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 10;
    ctx.setLineDash([20, 15]);
    ctx.strokeRect(40, certY + 40, width - 80, height - certY - 80);
    ctx.setLineDash([]);

    ctx.textAlign = 'center';
    ctx.font = '80px Arial';
    ctx.fillText('🏆', width / 2, certY + 160);

    ctx.fillStyle = '#92400e';
    ctx.font = 'bold 60px "Jua", sans-serif';
    ctx.fillText('위대한 탐험가 상', width / 2, certY + 260);

    ctx.fillStyle = '#333';
    ctx.font = 'bold 45px "Jua", sans-serif';
    const infoText = `${window.appState.selectedName} 어린이`;
    ctx.fillText(infoText, width / 2, certY + 350);

    ctx.font = '30px "Noto Sans KR", sans-serif';
    ctx.fillStyle = '#475569';
    ctx.fillText('위 어린이는 학교생활의 소중한 규칙을', width / 2, certY + 440);
    ctx.fillText('모두 배우고 훌륭하게 완수하였기에', width / 2, certY + 490);
    ctx.fillText('이 상장을 수여합니다.', width / 2, certY + 540);

    ctx.font = '24px "Noto Sans KR", sans-serif';
    ctx.fillStyle = '#94a3b8';
    const today = new Date();
    const dateStr = `${today.getFullYear()}년 ${today.getMonth() + 1}월 ${today.getDate()}일`;
    ctx.fillText(dateStr, width / 2, certY + 620);

    ctx.font = '100px Arial';
    ctx.fillText('⭐', width / 2, certY + 750); 

    return canvas;
}

window.downloadReport = () => {
    const canvas = generateCanvas();
    const link = document.createElement('a');
    link.download = `슬기로운학교생활_수료증_${window.appState.selectedName}.png`;
    link.href = canvas.toDataURL();
    link.click();
};

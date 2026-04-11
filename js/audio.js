window.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
window.isMuted = true; // 기본 꺼짐 상태 제공

window.initAudioContext = function () {
    if (window.audioCtx.state === 'suspended') {
        window.audioCtx.resume();
    }
};

window.toggleAudio = function () {
    window.isMuted = !window.isMuted;
    const btn = document.getElementById('global-audio-toggle');
    if (btn) {
        btn.textContent = window.isMuted ? '🔇' : '🔊';
        // Add visual feedback
        btn.classList.add('scale-110');
        setTimeout(() => btn.classList.remove('scale-110'), 200);
    }
    window.initAudioContext();
};

window.speak = (text, rate = 1.0, pitch = 1.0) => {
    if (window.isMuted) return; // MUTE 상태이면 읽지 않음
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    
    // Check if user is currently recording. We don't want TTS to bleed into microphone
    if (window.isRecording) return;
    
    const synth = window.speechSynthesis;

    const utter = () => {
        if (synth.speaking) synth.cancel();
        const utterThis = new SpeechSynthesisUtterance(text);
        
        const targetLang = 'ko-KR';
        utterThis.lang = targetLang;

        const voices = synth.getVoices();
        // Google Korean -> Any Korean
        let voice = voices.find(v => v.lang === targetLang && v.name.includes('Google'));
        if (!voice) voice = voices.find(v => v.lang === targetLang);
        if (voice) utterThis.voice = voice;

        utterThis.rate = rate;
        utterThis.pitch = pitch;
        synth.speak(utterThis);
    };

    if (synth.getVoices().length === 0) {
        window.speechSynthesis.onvoiceschanged = utter;
    } else {
        utter();
    }
};

// Play Raw text for buttons
window.playRawText = (text) => {
    // If user clicked the button manually, we should play it even if muted? 
    // Usually, explicit listen buttons should output sound. 
    // But since there's a global toggle, let's respect the toggle or force it.
    // Let's force it if they explicitly clicked the speaker icon.
    // So we don't check `isMuted` here, or we unmute it.
    // Let's temporarily unmute if it was muted? No, just play it using speech synthesis.
    
    if (typeof window === 'undefined' || !window.speechSynthesis) return;
    window.initAudioContext();
    
    const synth = window.speechSynthesis;
    if (synth.speaking) synth.cancel();
    
    const utterThis = new SpeechSynthesisUtterance(text);
    utterThis.lang = 'ko-KR';

    const voices = synth.getVoices();
    let voice = voices.find(v => v.lang === 'ko-KR' && v.name.includes('Google'));
    if (!voice) voice = voices.find(v => v.lang === 'ko-KR');
    if (voice) utterThis.voice = voice;

    synth.speak(utterThis);
};

window.playChime = function () {
    if (window.isMuted) return;
    window.initAudioContext();
    const t = window.audioCtx.currentTime;
    const osc = window.audioCtx.createOscillator();
    const gain = window.audioCtx.createGain();
    osc.connect(gain); gain.connect(window.audioCtx.destination);
    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, t);
    osc.frequency.setValueAtTime(659.25, t + 0.1);
    osc.frequency.setValueAtTime(783.99, t + 0.2);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 1.5);
    osc.start(t); osc.stop(t + 1.5);
};

window.playWrongSound = function () {
    if (window.isMuted) return;
    window.initAudioContext();
    const t = window.audioCtx.currentTime;
    const osc = window.audioCtx.createOscillator();
    const gain = window.audioCtx.createGain();
    osc.connect(gain); gain.connect(window.audioCtx.destination);
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.linearRampToValueAtTime(100, t + 0.3);
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.01, t + 0.5);
    osc.start(t); osc.stop(t + 0.5);
};

// --- 녹음 관련 로직 (Microphone Recording) ---

window.mediaRecorder = null;
window.audioChunks = [];
window.isRecording = false;

window.requestMicAccess = async function() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // 권한 획득 성공 시 MediaRecorder 초기화
        window.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        
        window.mediaRecorder.ondataavailable = (event) => {
            if (event.data.size > 0) {
                window.audioChunks.push(event.data);
            }
        };

        window.mediaRecorder.onstop = () => {
            const audioBlob = new Blob(window.audioChunks, { type: 'audio/webm' });
            
            // Base64로 변환하여 저장
            const reader = new FileReader();
            reader.readAsDataURL(audioBlob);
            reader.onloadend = () => {
                window.appState.audioBase64 = reader.result;
            };

            const audioUrl = URL.createObjectURL(audioBlob);
            const audioPlayback = document.getElementById('audio-playback');
            if (audioPlayback) {
                audioPlayback.src = audioUrl;
                audioPlayback.classList.remove('hidden');
                document.getElementById('recording-status').textContent = '녹음이 완료되었어요! 들어보세요.';
                document.getElementById('post-record-actions').classList.remove('hidden');
                document.getElementById('btn-record').classList.add('hidden');
            }
        };
        
        // 권한 획득 후 Promise 스크린으로 이동
        const screens = getScreens();
        screens['mic'].classList.add('hidden');
        screens['promise'].classList.remove('hidden');
        
    } catch (err) {
        console.error("마이크 권한 거부", err);
        alert("마이크를 허용해야 나의 다짐을 녹음할 수 있어요!\n웹 브라우저 설정에서 마이크를 허용해주세요.");
        // 실패해도 일단 진행은 하게 해줌
        const screens = getScreens();
        screens['mic'].classList.add('hidden');
        screens['promise'].classList.remove('hidden');
    }
}

window.startRecordingUser = function() {
    window.initAudioContext();
    const btnStart = document.getElementById('btn-record-start');
    const btnStop = document.getElementById('btn-record-stop');
    const status = document.getElementById('recording-status');
    
    if (!window.mediaRecorder) {
        alert("마이크 권한이 필요해요.");
        return;
    }

    window.audioChunks = [];
    window.mediaRecorder.start();
    window.isRecording = true;
    
    btnStart.classList.add('hidden');
    btnStop.classList.remove('hidden');
    status.textContent = "녹음 중이에요... 다 끝나면 '녹음 완료'를 눌러주세요!";
    status.className = 'text-2xl font-bold text-red-600 h-8 animate-pulse mt-2';
};

window.stopRecordingUser = function() {
    if (window.mediaRecorder && window.isRecording) {
        window.mediaRecorder.stop();
        window.isRecording = false;
        
        const btnStop = document.getElementById('btn-record-stop');
        const status = document.getElementById('recording-status');
        
        btnStop.classList.remove('animate-pulse');
        btnStop.querySelector('span:nth-child(2)').textContent = '저장 중...';
        status.textContent = "오디오 정리 중...";
        status.className = 'text-2xl font-bold text-slate-500 h-8 mt-2';
    }
};

window.discardRecording = function() {
    window.appState.audioBase64 = null;
    window.audioChunks = [];
    const audioPlayback = document.getElementById('audio-playback');
    audioPlayback.src = "";
    audioPlayback.classList.add('hidden');
    document.getElementById('post-record-actions').classList.add('hidden');
    
    const btnStart = document.getElementById('btn-record-start');
    const btnStop = document.getElementById('btn-record-stop');
    btnStop.classList.add('hidden');
    btnStop.classList.add('animate-pulse');
    btnStop.querySelector('span:nth-child(2)').textContent = '녹음 완료(멈춤)';
    
    btnStart.classList.remove('hidden');
    document.getElementById('recording-status').textContent = "버튼을 눌러 다시 녹음하세요.";
    document.getElementById('recording-status').className = 'text-2xl font-bold text-slate-500 h-8 mt-2';
};

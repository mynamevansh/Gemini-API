const ws = new WebSocket("ws://localhost:3000");
let isListening = false;
let isProcessing = false;
let isSpeaking = false;
let currentUtterance = null;
let audioContext = null;
let analyzer = null;
let microphone = null;
let recognition = null;
let silenceTimer = null;
let voiceStartTime = null;
let recordedText = "";

const statusEl = document.getElementById("status");
const toggleBtn = document.getElementById("toggleBtn");
const stopAIBtn = document.getElementById("stopAI");
const testBtn = document.getElementById("testBtn");
const conversationHistory = document.getElementById("conversationHistory");
const volumeBar = document.getElementById("volumeBar");
const container = document.querySelector(".container");

const SILENCE_THRESHOLD = 1200;
const VOLUME_THRESHOLD = 0.003;
const MIN_SPEECH_DURATION = 200;

statusEl.textContent = "Connecting...";
toggleBtn.disabled = true;

container.classList.remove("listening", "speaking");

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;
  recognition.serviceURI = 'wss://www.google.com/speech-api/v2/recognize';
  
  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';
    
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const transcript = event.results[i][0].transcript;
      if (event.results[i].isFinal) {
        finalTranscript += transcript;
      } else {
        interimTranscript += transcript;
      }
    }
    
    if (finalTranscript) {
      recordedText += finalTranscript + ' ';
    }
    
    if (interimTranscript) {
      statusEl.textContent = `🎤 "${interimTranscript.trim()}"`;
    }
  };
  
  recognition.onerror = (event) => {
    statusEl.textContent = "Speech recognition error";
  };
}

function speakText(text) {
  return new Promise((resolve) => {
    if ('speechSynthesis' in window) {
      speechSynthesis.cancel();
      
      currentUtterance = new SpeechSynthesisUtterance(text);
      currentUtterance.rate = 1.2;
      currentUtterance.pitch = 1;
      currentUtterance.volume = 1;
      
      const voices = speechSynthesis.getVoices();
      const preferredVoice = voices.find(voice => 
        voice.name.includes('Google') || 
        voice.name.includes('Microsoft') ||
        voice.lang.startsWith('en')
      );
      if (preferredVoice) {
        currentUtterance.voice = preferredVoice;
      }
      
      currentUtterance.onstart = () => {
        isSpeaking = true;
        container.classList.remove("listening");
        container.classList.add("speaking");
        statusEl.textContent = "🔊 AI Speaking...";
        stopAIBtn.style.display = "block";
      };
      
      currentUtterance.onend = () => {
        isSpeaking = false;
        container.classList.remove("speaking");
        currentUtterance = null;
        stopAIBtn.style.display = "none";
        if (isListening) {
          statusEl.textContent = "🎤 Listening... (release to send)";
        } else {
          statusEl.textContent = "Ready - Hold button to talk";
        }
        resolve();
      };
      
      currentUtterance.onerror = () => {
        isSpeaking = false;
        container.classList.remove("speaking");
        currentUtterance = null;
        stopAIBtn.style.display = "none";
        if (isListening) {
          statusEl.textContent = "🎤 Listening... (release to send)";
        } else {
          statusEl.textContent = "Ready - Hold button to talk";
        }
        resolve();
      };
      
      speechSynthesis.speak(currentUtterance);
    } else {
      resolve();
    }
  });
}

function stopAISpeaking() {
  if (isSpeaking && currentUtterance) {
    speechSynthesis.cancel();
    isSpeaking = false;
    container.classList.remove("speaking");
    currentUtterance = null;
    stopAIBtn.style.display = "none";
    if (isListening) {
      container.classList.add("listening");
      statusEl.textContent = "🎤 Listening... (release to send)";
    } else {
      statusEl.textContent = "Ready - Hold button to talk";
    }
  }
}

async function initializeAudio() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        sampleRate: 16000,
        channelCount: 1,
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }
    });
    
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyzer = audioContext.createAnalyser();
    microphone = audioContext.createMediaStreamSource(stream);
    
    analyzer.fftSize = 256;
    analyzer.smoothingTimeConstant = 0.8;
    microphone.connect(analyzer);
    
    return stream;
  } catch (error) {
    throw error;
  }
}

function getVolumeLevel() {
  if (!analyzer) return 0;
  
  const bufferLength = analyzer.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);
  analyzer.getByteFrequencyData(dataArray);
  
  let sum = 0;
  for (let i = 0; i < bufferLength; i++) {
    sum += dataArray[i];
  }
  
  const average = sum / bufferLength;
  return average / 255;
}

function voiceActivityDetection() {
  if (!isListening) return;
  
  const volume = getVolumeLevel();
  volumeBar.style.width = (volume * 100) + '%';
  
  if (volume > VOLUME_THRESHOLD) {
    if (!voiceStartTime) {
      voiceStartTime = Date.now();
    }
    
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    
    statusEl.textContent = "🎤 Speaking...";
  } else {
    if (voiceStartTime && !silenceTimer && isButtonPressed) {
      silenceTimer = setTimeout(() => {
        const speechDuration = Date.now() - voiceStartTime;
        if (speechDuration > MIN_SPEECH_DURATION && recordedText.trim() && isButtonPressed) {
          stopListeningAndProcess();
        }
        voiceStartTime = null;
        silenceTimer = null;
      }, SILENCE_THRESHOLD);
    }
  }
  
  requestAnimationFrame(voiceActivityDetection);
}

function processVoiceInput() {
  if (isProcessing || !recordedText.trim()) return;
  
  isProcessing = true;
  container.classList.remove("listening", "speaking");
  statusEl.textContent = "🤖 Processing...";
  
  addMessage(recordedText.trim(), 'user');
  
  const responseTimeout = setTimeout(() => {
    if (isProcessing) {
      isProcessing = false;
      container.classList.remove("listening", "speaking");
      statusEl.textContent = "⏰ Response timeout - try again";
      setTimeout(() => {
        statusEl.textContent = "Ready - Hold button to talk";
      }, 2000);
    }
  }, 12000);
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "response.create",
      userText: recordedText.trim(),
      timestamp: Date.now()
    }));
    
    window.currentResponseTimeout = responseTimeout;
  } else {
    clearTimeout(responseTimeout);
    isProcessing = false;
    container.classList.remove("listening", "speaking");
    statusEl.textContent = "❌ Not connected to server";
  }
  
  recordedText = "";
  voiceStartTime = null;
}

function addMessage(text, type) {
  const messageEl = document.createElement('div');
  messageEl.className = `message ${type}-message`;
  
  const avatarEl = document.createElement('div');
  avatarEl.className = `message-avatar ${type}-avatar`;
  avatarEl.textContent = type === 'user' ? '👤' : '🤖';
  
  const contentEl = document.createElement('div');
  contentEl.className = 'message-content';
  
  const textEl = document.createElement('div');
  textEl.className = 'message-text';
  textEl.textContent = text;
  
  contentEl.appendChild(textEl);
  messageEl.appendChild(avatarEl);
  messageEl.appendChild(contentEl);
  
  conversationHistory.appendChild(messageEl);
  conversationHistory.scrollTop = conversationHistory.scrollHeight;
}

ws.onopen = () => {
  statusEl.textContent = "Ready - Hold button to talk";
  toggleBtn.disabled = false;
  container.classList.remove("listening", "speaking");
};

ws.onerror = (error) => {
  statusEl.textContent = "❌ Connection error";
};

ws.onclose = () => {
  statusEl.textContent = "❌ Disconnected";
  toggleBtn.disabled = true;
};

ws.onmessage = async (e) => {
  try {
    const msg = JSON.parse(e.data);
    
    if (msg.type === "response.text") {
      if (window.currentResponseTimeout) {
        clearTimeout(window.currentResponseTimeout);
        window.currentResponseTimeout = null;
      }
      
      isProcessing = false;
      
      addMessage(msg.text, 'ai');
      
      await speakText(msg.text);
      
    } else if (msg.type === "error") {
      if (window.currentResponseTimeout) {
        clearTimeout(window.currentResponseTimeout);
        window.currentResponseTimeout = null;
      }
      
      isProcessing = false;
      statusEl.textContent = "❌ Error: " + msg.message;
      setTimeout(() => {
        if (isListening) {
          statusEl.textContent = "🎤 Listening... (release to send)";
        } else {
          statusEl.textContent = "Ready - Hold button to talk";
        }
      }, 3000);
    }
  } catch (error) {
    isProcessing = false;
    statusEl.textContent = "❌ Message error";
    setTimeout(() => {
      statusEl.textContent = "Ready - Hold button to talk";
    }, 2000);
  }
};

let isButtonPressed = false;

toggleBtn.onmousedown = async (e) => {
  e.preventDefault();
  if (isSpeaking) {
    stopAISpeaking();
    return;
  }
  
  if (!isButtonPressed && !isProcessing) {
    startListening();
  }
};

toggleBtn.onmouseup = (e) => {
  e.preventDefault();
  if (isButtonPressed && !isProcessing) {
    stopListeningAndProcess();
  }
};

toggleBtn.onmouseleave = (e) => {
  if (isButtonPressed && !isProcessing) {
    stopListeningAndProcess();
  }
};

toggleBtn.ontouchstart = async (e) => {
  e.preventDefault();
  if (isSpeaking) {
    stopAISpeaking();
    return;
  }
  
  if (!isButtonPressed && !isProcessing) {
    startListening();
  }
};

toggleBtn.ontouchend = (e) => {
  e.preventDefault();
  if (isButtonPressed && !isProcessing) {
    stopListeningAndProcess();
  }
};

async function startListening() {
  try {
    isButtonPressed = true;
    toggleBtn.disabled = true;
    
    await initializeAudio();
    
    if (recognition) {
      recognition.start();
    }
    
    isListening = true;
    recordedText = "";
    voiceStartTime = null;
    
    container.classList.remove("speaking");
    container.classList.add("listening");
    toggleBtn.innerHTML = '<span class="btn-icon">🎤</span><span class="btn-text">Recording...</span>';
    toggleBtn.classList.add("active");
    statusEl.textContent = "🎤 Listening... (release to send)";
    
    voiceActivityDetection();
    
    toggleBtn.disabled = false;
    
  } catch (error) {
    statusEl.textContent = "❌ Microphone access denied";
    isButtonPressed = false;
    toggleBtn.disabled = false;
  }
}

function stopListeningAndProcess() {
  if (!isListening) return;
  
  if (recognition) {
    recognition.stop();
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  isListening = false;
  isButtonPressed = false;
  container.classList.remove("listening");
  container.classList.remove("speaking");
  toggleBtn.innerHTML = '<span class="btn-icon">🎤</span><span class="btn-text">Hold to Talk</span>';
  toggleBtn.classList.remove("active");
  volumeBar.style.width = '0%';
  
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  
  if (recordedText.trim()) {
    processVoiceInput();
  } else {
    statusEl.textContent = "Ready - Hold button to talk";
  }
}

stopAIBtn.onclick = () => {
  stopAISpeaking();
};

testBtn.onclick = () => {
  addMessage("Hello, can you hear me?", 'user');
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "response.create",
      userText: "Hello, can you hear me? Please respond to test if you're working."
    }));
  } else {
    statusEl.textContent = "❌ Not connected to server";
  }
};

let spacePressed = false;

document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !toggleBtn.disabled && !spacePressed) {
    e.preventDefault();
    spacePressed = true;
    if (isSpeaking) {
      stopAISpeaking();
    } else if (!isButtonPressed && !isProcessing) {
      startListening();
    }
  }
  
  if (e.code === "Escape") {
    if (isSpeaking) {
      stopAISpeaking();
    } else if (isListening) {
      stopListeningAndProcess();
    }
  }
});

document.addEventListener("keyup", (e) => {
  if (e.code === "Space" && spacePressed) {
    e.preventDefault();
    spacePressed = false;
    if (isButtonPressed && !isProcessing) {
      stopListeningAndProcess();
    }
  }
});

setInterval(() => {
  if (isListening && isSpeaking && getVolumeLevel() > VOLUME_THRESHOLD) {
    stopAISpeaking();
  }
}, 100);

if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => {
  };
}
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

// DOM elements
const statusEl = document.getElementById("status");
const toggleBtn = document.getElementById("toggleBtn");
const stopAIBtn = document.getElementById("stopAI");
const testBtn = document.getElementById("testBtn");
const conversationHistory = document.getElementById("conversationHistory");
const volumeBar = document.getElementById("volumeBar");
const container = document.querySelector(".container");

// Voice activity detection settings
const SILENCE_THRESHOLD = 2000; // ms of silence before stopping recording
const VOLUME_THRESHOLD = 0.005; // Minimum volume to detect voice (more sensitive)
const MIN_SPEECH_DURATION = 300; // Minimum speech duration in ms

// Initialize
statusEl.textContent = "Connecting...";
toggleBtn.disabled = true;

// Initialize speech recognition
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  
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
      console.log(`📝 Final transcript: "${finalTranscript}"`);
      console.log(`📄 Total recorded text: "${recordedText}"`);
    }
    
    if (interimTranscript) {
      statusEl.textContent = `🎤 "${interimTranscript.trim()}"`;
      console.log(`🔄 Interim transcript: "${interimTranscript}"`);
    }
  };
  
  recognition.onerror = (event) => {
    console.error('Speech recognition error:', event.error);
  };
} else {
  console.warn('Speech recognition not supported');
}

// Text-to-speech function with interrupt capability
function speakText(text) {
  return new Promise((resolve) => {
    if ('speechSynthesis' in window) {
      // Stop any current speech
      speechSynthesis.cancel();
      
      currentUtterance = new SpeechSynthesisUtterance(text);
      currentUtterance.rate = 0.9;
      currentUtterance.pitch = 1;
      currentUtterance.volume = 1;
      
      // Choose a nice voice if available
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
          statusEl.textContent = "🎤 Listening...";
        } else {
          statusEl.textContent = "Ready - Click to start listening";
        }
        resolve();
      };
      
      currentUtterance.onerror = () => {
        isSpeaking = false;
        container.classList.remove("speaking");
        currentUtterance = null;
        stopAIBtn.style.display = "none";
        resolve();
      };
      
      speechSynthesis.speak(currentUtterance);
    } else {
      resolve();
    }
  });
}

// Stop AI speaking
function stopAISpeaking() {
  if (isSpeaking && currentUtterance) {
    speechSynthesis.cancel();
    isSpeaking = false;
    container.classList.remove("speaking");
    currentUtterance = null;
    stopAIBtn.style.display = "none";
    if (isListening) {
      statusEl.textContent = "🎤 Listening...";
    } else {
      statusEl.textContent = "Ready - Click to start listening";
    }
  }
}

// Initialize audio context for voice activity detection
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
    console.error("Error accessing microphone:", error);
    throw error;
  }
}

// Get audio volume level
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

// Voice activity detection loop
function voiceActivityDetection() {
  if (!isListening) return;
  
  const volume = getVolumeLevel();
  volumeBar.style.width = (volume * 100) + '%';
  
  // Debug logging
  if (volume > 0.001) {
    console.log(`Volume: ${volume.toFixed(4)}, Threshold: ${VOLUME_THRESHOLD}, Text: "${recordedText}"`);
  }
  
  if (volume > VOLUME_THRESHOLD) {
    // Voice detected
    if (!voiceStartTime) {
      voiceStartTime = Date.now();
      console.log("🎤 Voice started");
    }
    
    // Clear silence timer
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    
    statusEl.textContent = "🎤 Listening...";
  } else {
    // Silence detected
    if (voiceStartTime && !silenceTimer) {
      console.log("🔇 Starting silence timer");
      silenceTimer = setTimeout(() => {
        const speechDuration = Date.now() - voiceStartTime;
        console.log(`Speech duration: ${speechDuration}ms, Text: "${recordedText.trim()}"`);
        if (speechDuration > MIN_SPEECH_DURATION && recordedText.trim()) {
          console.log("✅ Processing voice input");
          processVoiceInput();
        } else {
          console.log("❌ Speech too short or no text");
        }
        voiceStartTime = null;
        silenceTimer = null;
      }, SILENCE_THRESHOLD);
    }
  }
  
  requestAnimationFrame(voiceActivityDetection);
}

// Process voice input
function processVoiceInput() {
  if (isProcessing || !recordedText.trim()) return;
  
  isProcessing = true;
  container.classList.remove("listening");
  statusEl.textContent = "🤖 Processing...";
  
  // Add user message to conversation
  addMessage(recordedText.trim(), 'user');
  
  // Send to AI
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "response.create",
      userText: recordedText.trim()
    }));
  }
  
  // Reset for next input
  recordedText = "";
  voiceStartTime = null;
  
  setTimeout(() => {
    isProcessing = false;
    if (isListening) {
      container.classList.add("listening");
      statusEl.textContent = "🎤 Listening...";
    }
  }, 1000);
}

// Add message to conversation history
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

// WebSocket connection handling
ws.onopen = () => {
  console.log("Connected to server");
  statusEl.textContent = "Ready - Click to start listening";
  toggleBtn.disabled = false;
};

ws.onerror = (error) => {
  statusEl.textContent = "❌ Connection error";
  console.error("WebSocket error:", error);
};

ws.onclose = () => {
  statusEl.textContent = "❌ Disconnected";
  toggleBtn.disabled = true;
};

ws.onmessage = async (e) => {
  try {
    const msg = JSON.parse(e.data);
    console.log("Received message type:", msg.type);
    
    if (msg.type === "response.text") {
      console.log("AI says:", msg.text);
      
      // Add AI message to conversation
      addMessage(msg.text, 'ai');
      
      // Speak the response
      await speakText(msg.text);
      
    } else if (msg.type === "error") {
      statusEl.textContent = "❌ Error: " + msg.message;
      setTimeout(() => {
        if (isListening) {
          statusEl.textContent = "🎤 Listening...";
        } else {
          statusEl.textContent = "Ready - Click to start listening";
        }
      }, 3000);
    }
  } catch (error) {
    console.error("Error:", error);
  }
};

// Toggle listening
toggleBtn.onclick = async () => {
  if (!isListening) {
    try {
      toggleBtn.disabled = true;
      
      // Initialize audio and speech recognition
      await initializeAudio();
      
      if (recognition) {
        recognition.start();
      }
      
      isListening = true;
      recordedText = "";
      
      container.classList.add("listening");
      toggleBtn.innerHTML = '<span class="btn-icon">🔇</span><span class="btn-text">Stop Listening</span>';
      toggleBtn.classList.add("active");
      statusEl.textContent = "🎤 Listening...";
      
      // Start voice activity detection
      voiceActivityDetection();
      
      toggleBtn.disabled = false;
      
    } catch (error) {
      console.error("Error starting listening:", error);
      statusEl.textContent = "❌ Microphone access denied";
      toggleBtn.disabled = false;
    }
  } else {
    // Stop listening
    if (recognition) {
      recognition.stop();
    }
    
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    
    isListening = false;
    container.classList.remove("listening");
    toggleBtn.innerHTML = '<span class="btn-icon">🎤</span><span class="btn-text">Start Listening</span>';
    toggleBtn.classList.remove("active");
    statusEl.textContent = "Ready - Click to start listening";
    volumeBar.style.width = '0%';
    
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
  }
};

// Stop AI button
stopAIBtn.onclick = () => {
  stopAISpeaking();
};

// Test button - sends a test message to AI
testBtn.onclick = () => {
  console.log("🧪 Testing AI response");
  addMessage("Hello, can you hear me?", 'user');
  
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "response.create",
      userText: "Hello, can you hear me? Please respond to test if you're working."
    }));
  } else {
    console.log("❌ WebSocket not connected");
    statusEl.textContent = "❌ Not connected to server";
  }
};

// Keyboard shortcuts
document.addEventListener("keydown", (e) => {
  if (e.code === "Space" && !toggleBtn.disabled) {
    e.preventDefault();
    if (isSpeaking) {
      stopAISpeaking();
    } else if (!isListening) {
      toggleBtn.click();
    }
  }
  
  if (e.code === "Escape") {
    if (isSpeaking) {
      stopAISpeaking();
    }
  }
});

// Auto-interrupt when user starts speaking
setInterval(() => {
  if (isListening && isSpeaking && getVolumeLevel() > VOLUME_THRESHOLD) {
    console.log("User interrupted AI - stopping speech");
    stopAISpeaking();
  }
}, 100);

// Load voices when available
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => {
    // Voices loaded
  };
}
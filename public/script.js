const ws = new WebSocket("ws://localhost:3000");
let isListening = false;
let isProcessing = false;
let isSpeaking = false;
let cu// Stop AI speaking
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
const SILENCE_THRESHOLD = 1200; // ms of silence before stopping recording (reduced for faster response)
const VOLUME_THRESHOLD = 0.003; // Minimum volume to detect voice (more sensitive)
const MIN_SPEECH_DURATION = 200; // Minimum speech duration in ms (reduced)

// Initialize
statusEl.textContent = "Connecting...";
toggleBtn.disabled = true;

// Ensure clean initial state - no animations
container.classList.remove("listening", "speaking");

// Initialize speech recognition
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.maxAlternatives = 1;  // Faster processing
  recognition.serviceURI = 'wss://www.google.com/speech-api/v2/recognize'; // Use faster endpoint
  
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
      currentUtterance.rate = 1.2;  // Faster speech rate
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
  
  // Reduced logging for cleaner console
  
  if (volume > VOLUME_THRESHOLD) {
    // Voice detected
    if (!voiceStartTime) {
      voiceStartTime = Date.now();
    }
    
    // Clear silence timer
    if (silenceTimer) {
      clearTimeout(silenceTimer);
      silenceTimer = null;
    }
    
    statusEl.textContent = "🎤 Listening...";
  } else {
    // Silence detected - auto-stop if button is still pressed
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

// Process voice input
function processVoiceInput() {
  if (isProcessing || !recordedText.trim()) return;
  
  isProcessing = true;
  // Remove all animation classes during processing
  container.classList.remove("listening", "speaking");
  statusEl.textContent = "🤖 Processing...";
  
  // Add user message to conversation
  addMessage(recordedText.trim(), 'user');
  
  // Set timeout for response
  const responseTimeout = setTimeout(() => {
    if (isProcessing) {
      isProcessing = false;
      container.classList.remove("listening", "speaking");
      statusEl.textContent = "⏰ Response timeout - try again";
      setTimeout(() => {
        statusEl.textContent = "Ready - Hold button to talk";
      }, 2000);
    }
  }, 12000); // 12 second timeout
  
  // Send to AI
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: "response.create",
      userText: recordedText.trim(),
      timestamp: Date.now()
    }));
    
    // Store timeout ID for clearing later
    window.currentResponseTimeout = responseTimeout;
  } else {
    clearTimeout(responseTimeout);
    isProcessing = false;
    container.classList.remove("listening", "speaking");
    statusEl.textContent = "❌ Not connected to server";
  }
  
  // Reset for next input
  recordedText = "";
  voiceStartTime = null;
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
  statusEl.textContent = "Ready - Hold button to talk";
  toggleBtn.disabled = false;
  // Ensure no animations are running on connection
  container.classList.remove("listening", "speaking");
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
    
    if (msg.type === "response.text") {
      // Clear timeout since we got a response
      if (window.currentResponseTimeout) {
        clearTimeout(window.currentResponseTimeout);
        window.currentResponseTimeout = null;
      }
      
      isProcessing = false;
      
      // Add AI message to conversation
      addMessage(msg.text, 'ai');
      
      // Speak the response
      await speakText(msg.text);
      
    } else if (msg.type === "error") {
      // Clear timeout on error too
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

// Push-to-talk functionality
let isButtonPressed = false;

// Mouse events for push-to-talk
toggleBtn.onmousedown = async (e) => {
  e.preventDefault();
  if (isSpeaking) {
    // Stop AI if speaking
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

// Touch events for mobile
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
    
    // Initialize audio and speech recognition
    await initializeAudio();
    
    if (recognition) {
      recognition.start();
    }
    
    isListening = true;
    recordedText = "";
    voiceStartTime = null;
    
    // Only add listening class, remove speaking if it exists
    container.classList.remove("speaking");
    container.classList.add("listening");
    toggleBtn.innerHTML = '<span class="btn-icon">🎤</span><span class="btn-text">Recording...</span>';
    toggleBtn.classList.add("active");
    statusEl.textContent = "🎤 Listening... (release to send)";
    
    // Start voice activity detection
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
  
  // Stop listening
  if (recognition) {
    recognition.stop();
  }
  
  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }
  
  isListening = false;
  isButtonPressed = false;
  // Remove all animation classes when not listening
  container.classList.remove("listening");
  container.classList.remove("speaking");
  toggleBtn.innerHTML = '<span class="btn-icon">🎤</span><span class="btn-text">Hold to Talk</span>';
  toggleBtn.classList.remove("active");
  volumeBar.style.width = '0%';
  
  if (silenceTimer) {
    clearTimeout(silenceTimer);
    silenceTimer = null;
  }
  
  // Process the recorded text if we have any
  if (recordedText.trim()) {
    processVoiceInput();
  } else {
    statusEl.textContent = "Ready - Hold button to talk";
  }
}

// Stop AI button
stopAIBtn.onclick = () => {
  stopAISpeaking();
};

// Test button - sends a test message to AI
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

// Keyboard shortcuts - Space for push-to-talk
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
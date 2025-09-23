# Voice AI Assistant

## 🎤 Your Personal Talking AI Companion

This is a complete voice-to-voice AI chatbot that allows you to have natural conversations with an AI assistant using just your voice!

## ✨ Features

- **Real-time Voice Conversation**: Speak naturally and get audio responses
- **Hands-free Operation**: Use keyboard shortcuts (Space bar) for easy recording
- **High-quality Audio**: Optimized audio processing for clear communication
- **Modern UI**: Beautiful, responsive interface with visual feedback
- **Error Handling**: Robust error handling and connection status indicators

## 🚀 How to Use

### 1. Start the Server
```bash
# Navigate to your project folder
cd "C:\Users\vansh\OneDrive\Desktop\API"

# Start the server
npm start
```

### 2. Open in Browser
- Open your browser and go to: `http://localhost:3000`
- Allow microphone access when prompted

### 3. Start Talking
- **Method 1**: Click "Start Talking" button, speak, then click "Stop"
- **Method 2**: Press and hold `Space` bar, speak, then release
- Wait for the AI to respond with voice

## 🎯 What You Can Do

Talk to your AI assistant about anything:
- Ask questions: "What's the weather like?" 
- Get help: "How do I cook pasta?"
- Have conversations: "Tell me a joke"
- Get information: "Explain quantum physics"
- Creative tasks: "Write me a short story"

## 🔧 Technical Details

- **Frontend**: HTML5, CSS3, JavaScript (WebRTC MediaRecorder)
- **Backend**: Node.js, Express, WebSocket
- **AI Integration**: Google Gemini Live API
- **Audio Format**: WebM with real-time streaming
- **Connection**: Secure WebSocket for low-latency communication

## 🎛️ Status Indicators

- **Connecting...**: Initial connection to server
- **Connected - Ready to chat!**: Ready to receive voice input
- **🎤 Listening...**: Currently recording your voice
- **🤔 Processing...**: AI is processing your message
- **🎧 Playing response...**: AI is speaking back to you
- **❌ Errors**: Connection issues or microphone problems

## 🔐 Setup Requirements

1. **Gemini API Key**: You need a valid Google Gemini API key in `.env` file
2. **Microphone**: Working microphone and browser permission
3. **Modern Browser**: Chrome, Firefox, Safari, or Edge with WebRTC support
4. **Internet Connection**: For AI API communication

## 🐛 Troubleshooting

**"Microphone access denied"**
- Grant microphone permission in browser settings
- Check if another app is using the microphone

**"Connection error"**
- Ensure the server is running (`npm start`)
- Check your internet connection
- Verify Gemini API key is valid

**"No audio response"**
- Check browser audio settings
- Ensure speakers/headphones are working
- Try refreshing the page

## 🎨 Customization

You can customize:
- **AI Voice**: Change voice in `script.js` (charon, alloy, etc.)
- **UI Theme**: Modify `style.css` for different colors/layout
- **Instructions**: Edit AI instructions in `server/index.js`
- **Audio Quality**: Adjust MediaRecorder settings

## 🚀 Advanced Features

- **Keyboard Shortcuts**: Space bar for push-to-talk
- **Visual Feedback**: Recording state animations
- **Auto-reconnect**: Handles connection drops gracefully
- **Error Recovery**: Automatic retry mechanisms

Enjoy your voice conversations with AI! 🎉
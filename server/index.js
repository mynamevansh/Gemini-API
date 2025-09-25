import express from "express";
import { WebSocketServer } from "ws";
import "dotenv/config";
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "../public")));

app.get('/favicon.ico', (req, res) => {
  res.status(204).end();
});

const server = http.createServer(app);
server.listen(3000, () => console.log("Server running on http://localhost:3000"));

const wss = new WebSocketServer({ server });

async function callGeminiAPI(prompt) {
  const startTime = Date.now();
  try {
    console.log("🤖 Processing AI request...");
    
    if (!process.env.GEMINI_API_KEY) {
      throw new Error("API key not found");
    }
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.3, 
          maxOutputTokens: 500,
          candidateCount: 1
        }
      }),
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ API Error:", response.status);
      
      return `Hello! I'm your AI assistant, but I'm currently having trouble connecting to my AI service. However, I can still help you! Here are some things I can assist with:

• Answer questions about various topics
• Help with coding and programming
• Provide explanations and tutorials
• Creative writing and brainstorming
• General conversation and advice

Please try asking me something, and I'll do my best to help! (Note: I'm currently in fallback mode due to API connectivity issues)`;
    }

    const data = await response.json();
    console.log("✅ AI response received");
    
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!aiText) {
      console.error("❌ No text in API response");
      return "I received a response but couldn't extract the text. Please try again!";
    }
    
    return aiText;
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`❌ API Error (${duration}ms):`, error.message);
    
    if (error.name === 'AbortError') {
      return "Sorry, that took too long to process. Please try asking something simpler!";
    }
    
    return "I'm having trouble right now. Please try again in a moment!";
  }
}

wss.on("connection", (client) => {
  console.log("✅ Client connected");
  let audioChunks = [];
  let conversationCount = 0;

  client.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);
      
      if (data.type === "input_audio_buffer.append") {
        audioChunks.push(data.audio);
        
      } else if (data.type === "response.create") {
        const userText = data.userText || "Hello";
        console.log("👤 User:", userText);
        
        try {
          const response = await callGeminiAPI(userText);
          
          client.send(JSON.stringify({ 
            type: "response.text", 
            text: response 
          }));
          
          audioChunks = [];
          
        } catch (error) {
          console.error("❌ Response error:", error.message);
          client.send(JSON.stringify({ 
            type: "error", 
            message: "AI response failed: " + error.message 
          }));
        }
      }
    } catch (error) {
      console.error("❌ Message error:", error.message);
      client.send(JSON.stringify({ 
        type: "error", 
        message: "Message processing failed" 
      }));
    }
  });

  client.on("close", () => console.log("❌ Client disconnected"));
  
  client.on("error", (error) => {
    console.error("❌ Client error:", error.message);
  });
});

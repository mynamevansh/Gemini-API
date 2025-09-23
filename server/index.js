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

// Handle favicon.ico requests to prevent 404 errors
app.get('/favicon.ico', (req, res) => {
  res.status(204).end(); // No Content
});

const server = http.createServer(app);
server.listen(3000, () => console.log("Server running on http://localhost:3000"));

const wss = new WebSocketServer({ server });

async function callGeminiAPI(prompt) {
  try {
    console.log("🔄 Calling Gemini API with prompt:", prompt.substring(0, 100) + "...");
    console.log("🔑 Using API Key:", process.env.GEMINI_API_KEY ? `${process.env.GEMINI_API_KEY.substring(0, 10)}...` : "NOT FOUND");
    
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
    console.log("🌐 API URL:", url.substring(0, 100) + "...");
    
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { 
          temperature: 0.7, 
          maxOutputTokens: 1000,
          candidateCount: 1
        }
      })
    });

    console.log("📡 API Response Status:", response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error("❌ API Error:", response.status, errorText);
      
      // Return a helpful fallback response instead of failing
      return `Hello! I'm your AI assistant, but I'm currently having trouble connecting to my AI service. However, I can still help you! Here are some things I can assist with:

• Answer questions about various topics
• Help with coding and programming
• Provide explanations and tutorials
• Creative writing and brainstorming
• General conversation and advice

Please try asking me something, and I'll do my best to help! (Note: I'm currently in fallback mode due to API connectivity issues)`;
    }

    const data = await response.json();
    console.log("📦 API Response received successfully");
    
    const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    
    if (!aiText) {
      console.error("❌ No text in API response:", data);
      return "I received a response but couldn't extract the text. Please try again!";
    }
    
    console.log("✅ AI Response:", aiText.substring(0, 100) + "...");
    return aiText;
    
  } catch (error) {
    console.error("❌ Gemini API Error:", error.message);
    return `Hello! I'm your AI assistant. I'm currently experiencing some technical difficulties with my main AI service, but I'm still here to help! 

I can assist you with:
🤖 General questions and answers
💡 Creative ideas and brainstorming  
📚 Learning and explanations
💻 Programming help
🗣️ Friendly conversation

What would you like to talk about? (Running in backup mode)`;
  }
}

wss.on("connection", (client) => {
  console.log("✅ Client connected");
  let audioChunks = [];
  let conversationCount = 0;

  client.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("📨 Received:", data.type);
      
      if (data.type === "input_audio_buffer.append") {
        audioChunks.push(data.audio);
        console.log(`🎤 Audio chunk ${audioChunks.length} received`);
        
      } else if (data.type === "response.create") {
        console.log("🤖 Creating AI response...");
        
        // Get the actual user text from speech recognition
        const userText = data.userText || "Hello";
        console.log("👤 User said:", userText);
        
        try {
          const response = await callGeminiAPI(userText);
          console.log("📤 Sending response to client");
          
          client.send(JSON.stringify({ 
            type: "response.text", 
            text: response 
          }));
          
          audioChunks = [];
          
        } catch (error) {
          console.error("❌ Error generating response:", error);
          client.send(JSON.stringify({ 
            type: "error", 
            message: "AI response failed: " + error.message 
          }));
        }
      }
    } catch (error) {
      console.error("❌ Error processing message:", error);
      client.send(JSON.stringify({ 
        type: "error", 
        message: "Message processing failed" 
      }));
    }
  });

  client.on("close", () => console.log("❌ Client disconnected"));
  
  client.on("error", (error) => {
    console.error("❌ Client error:", error);
  });
});

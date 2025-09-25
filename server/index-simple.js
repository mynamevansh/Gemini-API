import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import 'dotenv/config';
import path from "path";
import { fileURLToPath } from "url";
import http from "http";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.static(path.join(__dirname, "../public")));


const server = http.createServer(app);

server.listen(3000, () => console.log("Server running on http://localhost:3000"));


const wss = new WebSocketServer({ server });

wss.on("connection", (client) => {
  console.log("Client connected");


  if (!process.env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY not found in environment variables");
    client.send(JSON.stringify({
      type: "error",
      message: "API key not configured"
    }));
    return;
  }

  console.log("✅ WebSocket connection established");


  client.on("message", async (msg) => {
    try {
      const data = JSON.parse(msg);
      console.log("Received from client:", data.type);
      
      if (data.type === "input_audio_buffer.append") {
        console.log("📊 Processing audio chunk...");
      } else if (data.type === "response.create") {
        console.log("🤖 Creating AI response...");
        
        setTimeout(() => {
          client.send(JSON.stringify({
            type: "response.text",
            text: "Hello! I'm your AI assistant. I can hear you but I'm currently in development mode. Voice features are being set up!"
          }));
        }, 1000);
      }
    } catch (error) {
      console.error("Error processing client message:", error);
    }
  });

  client.on("close", () => {
    console.log("Client disconnected");
  });

  client.on("error", (error) => {
    console.error("Client WebSocket error:", error);
  });
});
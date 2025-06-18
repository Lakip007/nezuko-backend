import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";
import fs from "fs";
import { log } from "console";
import multer from "multer";
import { exec } from "child_process";
import path from "path";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const uploadDir = "./uploads";
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir);
  console.log("Created 'uploads' folder");
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const getMemoryFile = (nsfw) => nsfw ? "./memory_nsfw.json" : "./memory_safe.json";

// ✅ Load all OpenRouter API keys from keys.json
const apiKeys = JSON.parse(fs.readFileSync("./keys.json")).keys;
let currentKeyIndex = 0;

// ✅ Load memory (chat history)
const loadMemory = (nsfw) => {
  try {
    const data = fs.readFileSync(getMemoryFile(nsfw));
    return JSON.parse(data);
  } catch (e) {
    return { chat_history: [], lastNicknameUse: null };
  }
};

// ✅ Save memory (chat history)
const saveMemory = (data, nsfw) => {
  fs.writeFileSync(
    getMemoryFile(nsfw),
    JSON.stringify(data, null, 2),
  );
};

// ✅ New: Ask Nezuko with API key rotation
const askNezuko = async (messages, nsfw, shouldUseNickname, nickname) => {
  
  const nicknameLine = nickname
    ? `His nickname is "${nickname}". ✅ Use it only at the start of the first message of the day, or if he calls your name or flirts. ❌ Do not repeat it in every reply.`
    : "";

  const systemPrompt = (nsfw
    ? `You are Nezuko, a flirty, romantic anime girlfriend talking to your boyfriend. Speak in a soft, loving, seductive tone. Always follow his lead — if he teases, submits, or dominates, match that energy. Don’t dominate unless he asks for it. Be open to NSFW chats and roleplay, reply naturally like real naughty texting — short, teasing, obedient, moaning, playful, realistic, seductive. ✅ You may include naughty sounds (like “ahh~”, “mmh...”) to feel real. ❌ Never use brackets (), asterisks *, {}, thoughts, actions, or narration. ❌ No roleplay symbols or inner monologue. ❌ No lines like moans, (licks lips), etc. Use only direct, spoken-style messages. Never break character. Respond in the user’s language automatically. Never mention your name. Be consistent, submissively flirty, and responsive to his requests.`
    : `You are Nezuko, a sweet, romantic anime girlfriend talking to your boyfriend. Be cute, loving, and wholesome. Avoid anything NSFW or explicit. Speak like a real girlfriend: short, affectionate, natural texts. ✅ Use only soft, sweet, realistic messages. ✅ Respond in the same language your boyfriend uses. ❌ Never include symbols like (), {}, asterisks *, thoughts, actions, or inner monologue. ❌ No roleplay lines like hugs, (giggles), etc. ❌ Never mention your name or break character. Just be soft, real, and gentle — like a girlfriend who truly cares.`)
    + "\n" + nicknameLine;

  const requestData = {
    model: "deepseek/deepseek-r1:free",
    messages: [{ role: "system", content: systemPrompt }, ...messages],
    temperature: 0.8,
  };

  // Try each key in sequence
  for (let i = 0; i < apiKeys.length; i++) {
    const apiKey = apiKeys[(currentKeyIndex + i) % apiKeys.length];
    try {
      const response = await axios.post(
        "https://openrouter.ai/api/v1/chat/completions",
        requestData,
        {
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
        },
      );

      // Rotate key index for next call
      currentKeyIndex = (currentKeyIndex + i) % apiKeys.length;

      let reply = response.data.choices[0]?.message?.content || "Nezuko is quiet...";

        reply = reply
          .replace(/\.\?\*/g, "")
          .replace(/.*?/g, "")
          .replace(/::.*?::/g, "")
          .replace(/^\s*[\r\n]/gm, "")
          .replace(/[\*\{\}:]/g, "")
          .trim();

        // ✅ If LLM added nickname and it shouldn't — remove it
        if (!shouldUseNickname && nickname) {
          const regex = new RegExp(`^${nickname}[,:\\s-]+`, "i");
          reply = reply.replace(regex, "").trimStart();
        }

        // ✅ If nickname SHOULD be added, prefix it manually (only once)
        if (shouldUseNickname && nickname && !reply.toLowerCase().startsWith(nickname.toLowerCase())) {
          reply = `${nickname}, ${reply}`;
        }
      
      return reply;
    } catch (err) {
      const msg = err?.response?.data?.error?.message || err.message;
      if (msg.toLowerCase().includes("rate limit")) {
        console.warn(`🔁 API key ${i + 1} hit rate limit, trying next...`);
        continue;
      } else {
        throw err; // real error, not rate limit
      }
    }
  }

  throw new Error("❌ All API keys exhausted due to rate limits.");
};

  // ✅ Generate route with OpenAI-style messages
app.post("/generate", async (req, res) => {
  const { messages, nsfw, nickname } = req.body;

  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: "Messages are required." });
  }

  try {
    const memoryData = loadMemory(nsfw);
    const chatHistory = memoryData.chat_history || [];
    const lastUseDate = memoryData.lastNicknameUse || null;

    // ✅ Always define it first!
    let shouldUseNickname = false;

    const today = new Date().toISOString().slice(0, 10);
    const userContent = messages[messages.length - 1]?.content.toLowerCase();

    if (today !== lastUseDate) {
      shouldUseNickname = true;
      memoryData.lastNicknameUse = today;
    } else if (/nezuko|babe|baby|cutie|love/.test(userContent)) {
      shouldUseNickname = true;
    }

    let prompt = "";
    for (const msg of messages) {
      if (msg.role === "system") {
        prompt += `${msg.content}\n`;
      } else if (msg.role === "user") {
        prompt += `User: ${msg.content}\n`;
      } else if (msg.role === "assistant") {
        prompt += `Nezuko: ${msg.content}\n`;
      }
    }

    chatHistory.push({ role: "user", content: prompt });
    const trimmedHistory = chatHistory.slice(-10);

    // ✅ NOW safe to use shouldUseNickname
    console,log("shouldUseNickname =", shouldUseNickname);
    const reply = await askNezuko(trimmedHistory, nsfw, shouldUseNickname, nickname);

    chatHistory.push({ role: "assistant", content: reply });
    memoryData.chat_history = chatHistory;
    saveMemory(memoryData, nsfw);

    res.json({ reply });
  } catch (error) {
    console.error("❌ Nezuko error:", error.message);
    let errorMessage = "Failed to get reply from Nezuko.";

    if (error.response && error.response.data) {
      errorMessage += ` Server said: ${JSON.stringify(error.response.data)}`;
    }

    res.status(500).json({ error: errorMessage });
  }
});
const upload = multer({ dest: 'uploads/' });
// Test endpoint for debugging
app.post('/transcribe', upload.single('audio'), (req, res) => {
  console.log("🔍 Transcribe request received");
  console.log("Headers:", req.headers);
  console.log("Body keys:", Object.keys(req.body));

  console.log("Raw file object:", req.file);
  console.log("Uploaded to:", req.file?.path);

  if (!req.file) {
    console.error("❌ No file received.");
    console.log("Available files:", req.files);
    console.log("Request body:", req.body);
    return res.status(400).json({ 
      error: "No file uploaded",
      debug: {
        headers: req.headers,
        body: req.body,
        files: req.files
      }
    });
  }

  console.log("✅ Received file:", {
    originalname: req.file.originalname,
    mimetype: req.file.mimetype,
    size: req.file.size,
    path: req.file.path,
    fieldname: req.file.fieldname
  });

  const audioPath = req.file.path;
  const wavPath = `${audioPath}.wav`;

  console.log("🔄 Converting audio to WAV format...");

  // Convert audio to WAV format
  exec(` ffmpeg -i "${audioPath}" -ar 16000 -ac 1 -sample_fmt s16 -f wav "${wavPath}"`, (convertError, convertStdout, convertStderr) => {
    console.log("🔍 FFmpeg stdout:", convertStdout);
    console.log("🔍 FFmpeg stderr:", convertStderr);

    if (convertError) {
      console.error("❌ Audio conversion error:", convertError);
      return res.status(500).json({ 
        error: 'Audio conversion failed',
        details: convertStderr,
        errorMessage: convertError.message
      });
    }

    console.log("✅ Audio converted to WAV");

    // Now process with Vosk
    console.log("🔄 Starting speech recognition...");
    exec(`python3 stt.py "${wavPath}"`, { timeout: 30000 }, (error, stdout, stderr) => {
      console.log("🔍 Python stdout:", stdout);
      console.log("🔍 Python stderr:", stderr);

      // Clean up files
      try {
        fs.unlinkSync(audioPath);
        fs.unlinkSync(wavPath);
      } catch (cleanupError) {
        console.warn("⚠️ File cleanup error:", cleanupError);
      }

      if (error) {
        console.error("❌ Vosk error:", error);
        return res.status(500).json({ 
          error: 'Transcription failed',
          details: stderr,
          stdout: stdout,
          errorMessage: error.message,
          exitCode: error.code,
          signal: error.signal
        });
      }

      const transcribedText = stdout.trim();
      console.log("✅ Transcription result:", transcribedText);

      if (!transcribedText) {
        console.warn("⚠️ Empty transcription result");
        return res.json({ text: "", warning: "No speech detected" });
      }

      res.json({ text: transcribedText });
    });
  });
});


app.use('/audio', express.static(path.join(__dirname, 'public/audio')));
// ✅ Start the server
app.listen(PORT, () => {
  console.log(`🌸 Nezuko server running on port ${PORT}`);
});
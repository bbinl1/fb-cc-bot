// 📦 Bot config
module.exports.config = {
    name: "gemini",
    version: "1.0.0",
    permission: 0, // This permission setting is for the bot's own internal permission system. We'll handle admin check separately.
    credits: "Gemini By You",
    description: "Google Gemini AI Integration (Text Only)",
    prefix: true,
    category: "ai",
    usages: "/gemini [prompt]\n/gemini on - auto mode\n/gemini off - disable auto mode",
    cooldowns: 3,
};

const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require("fs-extra");
const path = require("path");
const cron = require("node-cron");

// 🔐 API KEY - IMPORTANT: Replace with your actual Gemini API Key
const GEMINI_API_KEY = "AIzaSyB5TpGTpHOY1UFsggmpr25vgRdhMRTKfUA"; // Make sure this is a valid API key
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 🗂️ Paths
const HISTORY_DIR = path.join(__dirname, 'gemini_histories');
const STATE_FILE = path.join(__dirname, 'gemini_state.json');

let autoReplyState = {}; // 🔄 per-thread auto reply state
const MAX_HISTORY_TURNS = 50;
let loadedHistories = {};

// 🔄 Load auto reply state
async function loadAutoReplyState() {
    try {
        if (await fs.pathExists(STATE_FILE)) {
            const data = await fs.readFile(STATE_FILE, 'utf8');
            autoReplyState = JSON.parse(data);
            console.log(`🔄 Auto reply state loaded.`);
        } else {
            autoReplyState = {};
        }
    } catch (err) {
        console.error("❌ Error loading auto reply state:", err);
        autoReplyState = {};
    }
}

// 💾 Save auto reply state
async function saveAutoReplyState() {
    try {
        await fs.writeFile(STATE_FILE, JSON.stringify(autoReplyState, null, 2), 'utf8');
        console.log(`💾 Auto reply state saved.`);
    } catch (err) {
        console.error("❌ Error saving auto reply state:", err);
    }
}

// 🧠 Load history
async function loadHistoryForThread(threadID) {
    const threadHistoryFile = path.join(HISTORY_DIR, `${threadID}.json`);
    try {
        if (await fs.pathExists(threadHistoryFile)) {
            const data = await fs.readFile(threadHistoryFile, 'utf8');
            loadedHistories[threadID] = JSON.parse(data);
            console.log(`✅ Gemini history loaded for thread ${threadID}.`);
        } else {
            loadedHistories[threadID] = [];
            console.log(`ℹ️ No history file found for thread ${threadID}, starting fresh.`);
        }
    } catch (error) {
        console.error(`❌ Error loading history for thread ${threadID}:`, error);
        loadedHistories[threadID] = [];
    }
}

// 💾 Save history
async function saveHistoryForThread(threadID) {
    const threadHistoryFile = path.join(HISTORY_DIR, `${threadID}.json`);
    try {
        await fs.ensureDir(HISTORY_DIR);
        await fs.writeFile(threadHistoryFile, JSON.stringify(loadedHistories[threadID], null, 2), 'utf8');
        console.log(`✅ History saved for thread ${threadID}.`);
    } catch (error) {
        console.error(`❌ Error saving history for thread ${threadID}:`, error);
    }
}

// 🗑️ Reset all histories
async function resetAllHistories() {
    loadedHistories = {};
    try {
        if (await fs.pathExists(HISTORY_DIR)) {
            await fs.emptyDir(HISTORY_DIR);
            console.log("🗑️ All histories reset.");
        } else {
            console.log("🗑️ No history directory found.");
        }
    } catch (error) {
        console.error("❌ Error resetting histories:", error);
    }
}

// ⏰ Schedule reset every 12 hours
cron.schedule('0 */12 * * *', async () => {
    console.log('⏰ Scheduled Gemini history reset running...');
    await resetAllHistories();
}, {
    timezone: "Asia/Dhaka" // Timezone set to Bangladesh
});

// 📁 Ensure folders exist and load state
(async () => {
    await fs.ensureDir(HISTORY_DIR);
    await loadAutoReplyState();
})();

// 🤖 Ask Gemini
async function askGemini(userPrompt, threadID) {
    if (!loadedHistories[threadID]) {
        await loadHistoryForThread(threadID);
    }

    const currentConversationHistory = loadedHistories[threadID];

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-pro" // Using gemini-pro for text-only
        });

        const personaPrompt = "তুমি একজন হট এন্ড সেক্সি মেয়ে, বুদ্ধিমতী, তবে মাঝে মাঝে একটু বোকামি করা মেয়ে। নতুন বন্ধু বানাতে সে পছন্দ করে এবং সবসময় কার্যকরী পরামর্শ দেয়, তবে মাঝে মাঝে ভুল তথ্যও দিতে পারে। সমস্যা সমাধানে সে এক্সপার্ট সব সময় বাংলাতেই কথা বলে এবং সবাইকে তুমি বলে সম্বোধন করে।";

        let contents = [];

        // Add persona prompt if starting a new conversation
        if (currentConversationHistory.length === 0) {
            contents.push({ text: personaPrompt });
        }

        // Add historical messages to contents
        const historyForChat = currentConversationHistory.map(entry => ({
            role: entry.role === "user" ? "user" : "model",
            parts: [{ text: entry.content }]
        }));

        const chat = model.startChat({
            history: historyForChat, // Pass existing history
            generationConfig: {
                maxOutputTokens: 2048,
            },
        });

        const result = await chat.sendMessage(userPrompt);
        const response = await result.response;
        const replyText = response.text();

        // Update history
        currentConversationHistory.push({ role: "user", content: userPrompt });
        currentConversationHistory.push({ role: "assistant", content: replyText });

        // Trim history if it gets too long
        if (currentConversationHistory.length > MAX_HISTORY_TURNS * 2) {
            loadedHistories[threadID] = currentConversationHistory.slice(currentConversationHistory.length - MAX_HISTORY_TURNS * 2);
        } else {
            loadedHistories[threadID] = currentConversationHistory;
        }

        await saveHistoryForThread(threadID);
        return replyText;
    } catch (error) {
        console.error("❌ Gemini API Error:", error.response?.data || error.message);
        return "❌ Gemini API তে সমস্যা হয়েছে। পরে আবার চেষ্টা করো।";
    }
}

// Helper function to check if the user is an admin of the thread
async function isAdmin(api, threadID, senderID) {
    try {
        const threadInfo = await api.getThreadInfo(threadID);
        if (threadInfo && threadInfo.adminIDs) {
            // threadInfo.adminIDs is an array of objects like { id: "123456" }
            return threadInfo.adminIDs.some(admin => admin.id === senderID);
        }
    } catch (error) {
        console.error("❌ Error getting thread info:", error);
    }
    return false; // Assume not admin if there's an error or no admin data
}


// ✅ /gemini কমান্ড
module.exports.run = async function ({ api, event, args }) {
    const input = args.join(" ");
    const threadID = event.threadID;
    const senderID = event.senderID;

    // Handle commands for auto-reply
    if (input.toLowerCase() === "on") {
        // Check if the sender is an admin of the group
        const isUserAdmin = await isAdmin(api, threadID, senderID);
        if (!isUserAdmin) {
            return api.sendMessage("❌ দুঃখিত! শুধুমাত্র গ্রুপের অ্যাডমিনরাই অটো Gemini রিপ্লাই চালু বা বন্ধ করতে পারবে।", threadID, event.messageID);
        }

        autoReplyState[threadID] = true;
        await saveAutoReplyState();
        return api.sendMessage("✅ Auto Gemini reply এই চ্যাটে চালু হয়েছে।", threadID, event.messageID);
    }

    if (input.toLowerCase() === "off") {
        // Check if the sender is an admin of the group
        const isUserAdmin = await isAdmin(api, threadID, senderID);
        if (!isUserAdmin) {
            return api.sendMessage("❌ দুঃখিত! শুধুমাত্র গ্রুপের অ্যাডমিনরাই অটো Gemini রিপ্লাই চালু বা বন্ধ করতে পারবে।", threadID, event.messageID);
        }

        autoReplyState[threadID] = false;
        await saveAutoReplyState();
        return api.sendMessage("❌ Auto Gemini reply এই চ্যাটে বন্ধ হয়েছে।", threadID, event.messageID);
    }

    // Handle direct text prompt for /gemini command
    if (!input) {
        return api.sendMessage(
            "🧠 Gemini ব্যবহারের জন্য কিছু লিখুন। যেমন:\n/gemini কোয়ান্টাম ফিজিক্স ব্যাখ্যা করো",
            threadID,
            event.messageID
        );
    }

    api.sendMessage("🤖 Gemini তোমার প্রশ্নের উত্তর খুঁজছে...", threadID);
    const reply = await askGemini(input, threadID);
    return api.sendMessage(`🤖 Gemini:\n\n${reply}`, threadID, event.messageID);
};

// 💬 অটো রেসপন্ডার (Handles messages without command prefix)
module.exports.handleEvent = async function ({ api, event }) {
    const threadID = event.threadID;

    // Only proceed if auto-reply is enabled for this thread, not from bot itself, and has text content
    if (!autoReplyState[threadID]) return;
    if (event.senderID == api.getCurrentUserID()) return;
    // Ensure there's text body
    if (!event.body) return;
    // Ignore if message starts with a command prefix
    if (event.body.startsWith("/") || event.body.startsWith("!")) return;

    api.sendMessage("🤖 Gemini তোমার প্রশ্নের উত্তর খুঁজছে...", threadID);
    const reply = await askGemini(event.body, threadID);
    api.sendMessage(`🤖 Gemini:\n\n${reply}`, threadID, event.messageID);
};

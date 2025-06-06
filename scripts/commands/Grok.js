// 📦 Bot config
module.exports.config = {
    name: "grok",
    version: "1.0.0",
    permission: 0,
    credits: "Grok By Nayan",
    description: "Grok AI Integration",
    prefix: true,
    category: "ai",
    usages: "/grok [prompt]\n/grok on - auto mode\n/grok off - disable auto mode",
    cooldowns: 3,
};

const axios = require("axios");
const fs = require("fs-extra");
const path = require("path");
const cron = require("node-cron");

// 🗂️ Paths
const GROK_HISTORY_DIR = path.join(__dirname, 'grok_histories');

const MAX_GROK_HISTORY_TURNS = 20;
let loadedGrokHistories = {};
let grokAutoReplyState = {}; // On/Off state for each thread (not persisted)

// 🧠 Load Grok history
async function loadGrokHistoryForThread(threadID) {
    const threadHistoryFile = path.join(GROK_HISTORY_DIR, `${threadID}.json`);
    try {
        if (await fs.pathExists(threadHistoryFile)) {
            const data = await fs.readFile(threadHistoryFile, 'utf8');
            loadedGrokHistories[threadID] = JSON.parse(data);
            console.log(`✅ Grok history loaded for thread ${threadID}.`);
        } else {
            loadedGrokHistories[threadID] = [];
            console.log(`ℹ️ No Grok history file found for thread ${threadID}, starting fresh.`);
        }
    } catch (error) {
        console.error(`❌ Error loading Grok history for thread ${threadID}:`, error);
        loadedGrokHistories[threadID] = [];
    }
}

// 💾 Save Grok history
async function saveGrokHistoryForThread(threadID) {
    const threadHistoryFile = path.join(GROK_HISTORY_DIR, `${threadID}.json`);
    try {
        await fs.ensureDir(GROK_HISTORY_DIR);
        await fs.writeFile(threadHistoryFile, JSON.stringify(loadedGrokHistories[threadID], null, 2), 'utf8');
        console.log(`✅ Grok history saved for thread ${threadID}.`);
    } catch (error) {
        console.error(`❌ Error saving Grok history for thread ${threadID}:`, error);
    }
}

// 🗑️ Reset all Grok histories
async function resetAllGrokHistories() {
    loadedGrokHistories = {};
    try {
        if (await fs.pathExists(GROK_HISTORY_DIR)) {
            await fs.emptyDir(GROK_HISTORY_DIR);
            console.log("🗑️ All Grok histories reset.");
        } else {
            console.log("🗑️ No Grok history directory found.");
        }
    } catch (error) {
        console.error("❌ Error resetting Grok histories:", error);
    }
}

// ⏰ Schedule reset every 24 hours (or adjust as needed)
cron.schedule('0 0 * * *', async () => { // Runs daily at midnight (00:00)
    console.log('⏰ Scheduled Grok history reset running...');
    await resetAllGrokHistories();
}, {
    timezone: "Asia/Dhaka"
});

// 📁 Ensure folders exist and load state
(async () => {
    await fs.ensureDir(GROK_HISTORY_DIR);
})();

// 🤖 Ask Grok
async function askGrok(userPrompt, threadID) {
    if (!loadedGrokHistories[threadID]) {
        await loadGrokHistoryForThread(threadID);
    }

    const currentConversationHistory = loadedGrokHistories[threadID];

    try {
        const response = await axios.get(`https://grok-nu.vercel.app/?text=${encodeURIComponent(userPrompt)}`);

        if (!response.data || !response.data.ok || !response.data.msg) {
            console.error("❌ Grok API returned an invalid response:", response.data);
            return "❌ Grok API থেকে কোনো সঠিক উত্তর পাওয়া যায়নি।";
        }

        const replyText = response.data.msg;

        // Add to history
        currentConversationHistory.push({ role: "user", content: userPrompt });
        currentConversationHistory.push({ role: "assistant", content: replyText });

        // Keep history within limits
        if (currentConversationHistory.length > MAX_GROK_HISTORY_TURNS * 2) {
            loadedGrokHistories[threadID] = currentConversationHistory.slice(currentConversationHistory.length - MAX_GROK_HISTORY_TURNS * 2);
        } else {
            loadedGrokHistories[threadID] = currentConversationHistory;
        }

        await saveGrokHistoryForThread(threadID);
        return replyText;

    } catch (error) {
        console.error("❌ Grok API Error:", error.response?.data || error.message);
        return "❌ Grok API তে সমস্যা হয়েছে। পরে আবার চেষ্টা করো।";
    }
}

// Function to check if the sender is a group admin
async function isAdmin(api, threadID, senderID) {
    try {
        const threadInfo = await api.getThreadInfo(threadID);
        return threadInfo.adminIDs.some(adminInfo => adminInfo.id === senderID);
    } catch (error) {
        console.error("❌ Error checking admin status:", error);
        return false;
    }
}

// ✅ /grok কমান্ড
module.exports.run = async function ({ api, event, args }) {
    const input = args.join(" ");
    const threadID = event.threadID;
    const senderID = event.senderID;

    if (!input) {
        return api.sendMessage(
            "🧠 Grok ব্যবহারের জন্য কিছু লিখুন। যেমন:\n/grok Hi there!",
            threadID,
            event.messageID
        );
    }

    if (input.toLowerCase() === "on") {
        if (!await isAdmin(api, threadID, senderID)) {
            return api.sendMessage("⛔ শুধুমাত্র গ্রুপের অ্যাডমিনরা অটো গ্রোক রিপ্লাই চালু করতে পারবে।", threadID, event.messageID);
        }
        grokAutoReplyState[threadID] = true;
        return api.sendMessage("✅ Auto Grok reply এই চ্যাটে চালু হয়েছে।", threadID, event.messageID);
    }

    if (input.toLowerCase() === "off") {
        if (!await isAdmin(api, threadID, senderID)) {
            return api.sendMessage("⛔ শুধুমাত্র গ্রুপের অ্যাডমিনরা অটো গ্রোক রিপ্লাই বন্ধ করতে পারবে।", threadID, event.messageID);
        }
        grokAutoReplyState[threadID] = false;
        return api.sendMessage("❌ Auto Grok reply এই চ্যাটে বন্ধ হয়েছে।", threadID, event.messageID);
    }

    // Only show "Grok is searching..." for direct commands
    api.sendMessage("🤖 Grok তোমার প্রশ্নের উত্তর খুঁজছে...", threadID);
    const reply = await askGrok(input, threadID);
    return api.sendMessage(`🤖 Grok:\n\n${reply}`, threadID, event.messageID);
};

// 💬 অটো রেসপন্ডার
module.exports.handleEvent = async function ({ api, event }) {
    const threadID = event.threadID;

    if (!grokAutoReplyState[threadID]) return;
    if (event.senderID == api.getCurrentUserID()) return;
    if (!event.body || event.body.length < 2) return;
    if (event.body.startsWith("/") || event.body.startsWith("!")) return; // Avoid processing other commands

    const reply = await askGrok(event.body, threadID);
    // No "Grok is searching..." message here for auto-reply
    api.sendMessage(`🤖 Grok:\n\n${reply}`, threadID, event.messageID);
};

// 📦 Bot config
module.exports.config = {
    name: "gemini",
    version: "1.0.0",
    permission: 0,
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
const GEMINI_API_KEY = "AIzaSyB5TpGTpHOY1UFsggmpr25vgRdhMRTKfUA"; 
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

// 🗂️ Paths
const HISTORY_DIR = path.join(__dirname, 'gemini_histories');

let autoReplyState = {}; // 🔄 
const MAX_HISTORY_TURNS = 50;
let loadedHistories = {};

// 🧠 হিস্টরি লোড করুন
async function loadHistoryForThread(threadID) {
    const threadHistoryFile = path.join(HISTORY_DIR, `${threadID}.json`);
    try {
        if (await fs.pathExists(threadHistoryFile)) {
            const data = await fs.readFile(threadHistoryFile, 'utf8');
            loadedHistories[threadID] = JSON.parse(data);
            console.log(`✅ থ্রেড ${threadID} এর জন্য জেমিনি হিস্টরি লোড হয়েছে।`);
        } else {
            loadedHistories[threadID] = [];
            console.log(`ℹ️ থ্রেড ${threadID} এর জন্য কোনো হিস্টরি ফাইল পাওয়া যায়নি, নতুন করে শুরু হচ্ছে।`);
        }
    } catch (error) {
        console.error(`❌ থ্রেড ${threadID} এর জন্য হিস্টরি লোড করতে সমস্যা হয়েছে:`, error);
        loadedHistories[threadID] = [];
    }
}

// 💾 হিস্টরি সেভ করুন
async function saveHistoryForThread(threadID) {
    const threadHistoryFile = path.join(HISTORY_DIR, `${threadID}.json`);
    try {
        await fs.ensureDir(HISTORY_DIR);
        await fs.writeFile(threadHistoryFile, JSON.stringify(loadedHistories[threadID], null, 2), 'utf8');
        console.log(`✅ থ্রেড ${threadID} এর জন্য হিস্টরি সেভ হয়েছে।`);
    } catch (error) {
        console.error(`❌ থ্রেড ${threadID} এর জন্য হিস্টরি সেভ করতে সমস্যা হয়েছে:`, error);
    }
}

// 🗑️ সব হিস্টরি রিসেট করুন
async function resetAllHistories() {
    loadedHistories = {};
    try {
        if (await fs.pathExists(HISTORY_DIR)) {
            await fs.emptyDir(HISTORY_DIR);
            console.log("🗑️ সব হিস্টরি রিসেট হয়েছে।");
        } else {
            console.log("🗑️ কোনো হিস্টরি ডিরেক্টরি পাওয়া যায়নি।");
        }
    } catch (error) {
        console.error("❌ হিস্টরি রিসেট করতে সমস্যা হয়েছে:", error);
    }
}

// ⏰ প্রতি 12 ঘন্টা পর পর রিসেট শিডিউল করুন
cron.schedule('0 */12 * * *', async () => {
    console.log('⏰ শিডিউল করা জেমিনি হিস্টরি রিসেট চলছে...');
    await resetAllHistories();
}, {
    timezone: "Asia/Dhaka" // টাইমজোন বাংলাদেশ সেট করা হয়েছে
});

// 📁 ফোল্ডার বিদ্যমান আছে কিনা নিশ্চিত করুন এবং স্টেট লোড করুন
(async () => {
    await fs.ensureDir(HISTORY_DIR);
    await loadAutoReplyState();
})();

// 🤖 জেমিনিকে প্রশ্ন করুন
async function askGemini(userPrompt, threadID) {
    if (!loadedHistories[threadID]) {
        await loadHistoryForThread(threadID);
    }

    const currentConversationHistory = loadedHistories[threadID];

    try {
        const model = genAI.getGenerativeModel({
            model: "gemini-1.5-flash" // **<-- এখানে পরিবর্তন করা হয়েছে!**
        });

        const personaPrompt = "তুমি একজন হট এন্ড সেক্সি মেয়ে, বুদ্ধিমতী, তবে মাঝে মাঝে একটু বোকামি করা মেয়ে। নতুন বন্ধু বানাতে সে পছন্দ করে এবং সবসময় কার্যকরী পরামর্শ দেয়, তবে মাঝে মাঝে ভুল তথ্যও দিতে পারে। সমস্যা সমাধানে সে এক্সপার্ট সব সময় বাংলাতেই কথা বলে এবং সবাইকে তুমি বলে সম্বোধন করে।";

        // নতুন কথোপকথন শুরু হলে পার্সোনা প্রম্পট যোগ করুন
        if (currentConversationHistory.length === 0) {
            currentConversationHistory.push({ role: "user", content: personaPrompt });
            currentConversationHistory.push({ role: "model", content: "হাই! আমি তোমার সেক্সি জেমিনি। তোমার সাথে কথা বলতে আমি খুবই পছন্দ করি।" }); // পার্সোনার প্রাথমিক প্রতিক্রিয়া
        }

        // চ্যাটের জন্য হিস্টরি প্রস্তুত করুন
        const historyForChat = currentConversationHistory.map(entry => ({
            role: entry.role === "user" ? "user" : "model",
            parts: [{ text: entry.content }]
        }));

        const chat = model.startChat({
            history: historyForChat,
            generationConfig: {
                maxOutputTokens: 2048,
            },
        });

        const result = await chat.sendMessage(userPrompt);
        const response = await result.response;
        const replyText = response.text();

        // হিস্টরি আপডেট করুন
        currentConversationHistory.push({ role: "user", content: userPrompt });
        currentConversationHistory.push({ role: "assistant", content: replyText });

        // হিস্টরি বেশি লম্বা হলে ছাঁটাই করুন
        if (currentConversationHistory.length > MAX_HISTORY_TURNS * 2) {
            loadedHistories[threadID] = currentConversationHistory.slice(currentConversationHistory.length - MAX_HISTORY_TURNS * 2);
        } else {
            loadedHistories[threadID] = currentConversationHistory;
        }

        await saveHistoryForThread(threadID);
        return replyText;
    } catch (error) {
        console.error("❌ জেমিনি এপিআই সমস্যা:", error.response?.data || error.message);
        return "❌ জেমিনি এপিআই তে সমস্যা হয়েছে। পরে আবার চেষ্টা করো।";
    }
}

// ফাংশন: প্রেরক গ্রুপ অ্যাডমিন কিনা তা পরীক্ষা করতে
async function isAdmin(api, threadID, senderID) {
    try {
        const threadInfo = await api.getThreadInfo(threadID);
        return threadInfo.adminIDs.some(adminInfo => adminInfo.id === senderID);
    } catch (error) {
        console.error("❌ অ্যাডমিন স্ট্যাটাস চেক করতে সমস্যা হয়েছে:", error);
        return false;
    }
}

// ✅ /gemini কমান্ড
module.exports.run = async function ({ api, event, args }) {
    const input = args.join(" ");
    const threadID = event.threadID;
    const senderID = event.senderID;

    // অটো-রিপ্লাইয়ের জন্য কমান্ড হ্যান্ডেল করুন
    if (input.toLowerCase() === "on") {
        if (!await isAdmin(api, threadID, senderID)) {
            return api.sendMessage("⛔ শুধুমাত্র গ্রুপের অ্যাডমিনরা অটো Gemini রিপ্লাই চালু করতে পারবে।", threadID, event.messageID);
        }
        autoReplyState[threadID] = true;
        await saveAutoReplyState();
        return api.sendMessage("✅ অটো Gemini রিপ্লাই এই চ্যাটে চালু হয়েছে।", threadID, event.messageID);
    }

    if (input.toLowerCase() === "off") {
        if (!await isAdmin(api, threadID, senderID)) {
            return api.sendMessage("⛔ শুধুমাত্র গ্রুপের অ্যাডমিনরা অটো Gemini রিপ্লাই বন্ধ করতে পারবে।", threadID, event.messageID);
        }
        autoReplyState[threadID] = false;
        await saveAutoReplyState();
        return api.sendMessage("❌ অটো Gemini রিপ্লাই এই চ্যাটে বন্ধ হয়েছে।", threadID, event.messageID);
    }

    // সরাসরি টেক্সট প্রম্পট হ্যান্ডেল করুন /gemini কমান্ডের জন্য
    if (!input) {
        return api.sendMessage(
            "🧠 জেমিনি ব্যবহারের জন্য কিছু লিখুন। যেমন:\n/gemini Explain Quantum Physics",
            threadID,
            event.messageID
        );
    }

    // শুধুমাত্র সরাসরি কমান্ডের জন্য "জেমিনি তোমার প্রশ্নের উত্তর খুঁজছে..." দেখান
    api.sendMessage("🤖 জেমিনি তোমার প্রশ্নের উত্তর খুঁজছে...", threadID);
    const reply = await askGemini(input, threadID);
    return api.sendMessage(`🤖 জেমিনি:\n\n${reply}`, threadID, event.messageID);
};

// 💬 অটো রেসপন্ডার (কমান্ড প্রিফিক্স ছাড়া মেসেজ হ্যান্ডেল করে)
module.exports.handleEvent = async function ({ api, event }) {
    const threadID = event.threadID;

    // শুধুমাত্র তখনই অগ্রসর হোন যদি অটো-রিপ্লাই এই থ্রেডের জন্য সক্রিয় থাকে, বট নিজে মেসেজ না পাঠায় এবং মেসেজে কন্টেন্ট থাকে
    if (!autoReplyState[threadID]) return;
    if (event.senderID == api.getCurrentUserID()) return;
    // নিশ্চিত করুন যে টেক্সট বডি আছে
    if (!event.body || event.body.length < 2) return;
    // যদি মেসেজ কমান্ড প্রিফিক্স দিয়ে শুরু হয়, তাহলে উপেক্ষা করুন
    if (event.body.startsWith("/") || event.body.startsWith("!")) return;

    // অটো-রিপ্লাইয়ের জন্য "জেমিনি তোমার প্রশ্নের উত্তর খুঁজছে..." মেসেজটি এখানে থাকবে না
    const reply = await askGemini(event.body, threadID);
    api.sendMessage(`🤖 জেমিনি:\n\n${reply}`, threadID, event.messageID);
};

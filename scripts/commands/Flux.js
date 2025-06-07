module.exports = {
  config: {
    name: "flux", // কমান্ডের নাম "flux" করা হয়েছে
    version: "1.0.0",
    permission: 0,
    credits: "Tofazzol & Gemini", // ক্রেডিট আপডেট করা হয়েছে
    description: "Generate images from a prompt using Together.xyz FLUX model.",
    prefix: true,
    category: "prefix",
    usages: "flux [prompt]", // শুধুমাত্র প্রম্পট ব্যবহারের জন্য
    cooldowns: 10,
  },

  languages: {
    "vi": {},
    "en": {
      "missing_prompt": 'Please provide a prompt to generate an image. Usage: /flux a futuristic city at sunset',
      "generating_message": "Generating your image using FLUX model, please wait...",
      "error": "An error occurred while generating the image. Please check your API key or try again later.",
      "api_key_missing": "Together.xyz API key is not set. Please set TOGETHER_API_KEY in your environment variables."
    }
  },

  start: async function({ nayan, events, args, lang }) {
    const axios = require("axios");
    const fs = require("fs-extra");

    const TOGETHER_API_KEY = process.env.TOGETHER_API_KEY; // এনভায়রনমেন্ট ভেরিয়েবল থেকে API key নেওয়া

    // API Key চেক করা
    if (!TOGETHER_API_KEY) {
      return nayan.reply(lang('api_key_missing'), events.threadID, events.messageID);
    }

    const prompt = args.join(" ").trim(); // আর্গুমেন্ট থেকে সরাসরি প্রম্পট নেওয়া

    // প্রম্পট খালি থাকলে এরর মেসেজ
    if (!prompt) {
      return nayan.reply(lang('missing_prompt'), events.threadID, events.messageID);
    }

    // তাৎক্ষণিক রিপ্লাই
    nayan.reply(lang('generating_message'), events.threadID, events.messageID);

    try {
      const togetherApiUrl = "https://api.together.xyz/v1/images/generations";
      const payload = {
        prompt: prompt,
        model: "black-forest-labs/FLUX.1-dev", // FLUX মডেল ব্যবহার করা হচ্ছে
        response_format: "b64_json", // base64 এনকোডেড JSON ফরম্যাট
        steps: 25, // জেনারেশনের স্টেপস, প্রয়োজনে বাড়ানো যেতে পারে
        seed: Math.floor(Math.random() * 1000000), // র্যান্ডম সিড
      };

      const response = await axios.post(
        togetherApiUrl,
        payload,
        {
          headers: {
            Authorization: `Bearer ${TOGETHER_API_KEY}`,
            "Content-Type": "application/json",
          },
        }
      );

      // Together.xyz API থেকে প্রাপ্ত base64 ডেটা প্রসেস করা
      // Together.xyz সাধারণত একটি অ্যারেতে একাধিক base64 ইমেজ পাঠায়, এখানে প্রথমটি নেওয়া হচ্ছে।
      const base64Image = response.data.b64_json[0].b64_json;

      if (!base64Image) {
        console.error("No base64 image data found from Together.xyz API.");
        return nayan.reply(lang('error'), events.threadID, events.messageID);
      }

      const path = __dirname + `/cache/flux_result.png`; // একটি মাত্র ইমেজ ফাইল হবে
      fs.writeFileSync(path, Buffer.from(base64Image, 'base64')); // base64 ডেটা থেকে ফাইল তৈরি করা

      nayan.reply({
        attachment: fs.createReadStream(path),
        body: `🔍Imagine Result (FLUX Model)🔍\n\n📝Prompt: ${prompt}`
      }, events.threadID, () => {
        // ইমেজ পাঠানোর পর ক্যাশ ফাইল ডিলিট করা
        fs.unlinkSync(path);
      });

    } catch (error) {
      console.error("Flux command error:", error.response ? error.response.data : error.message);
      let errorMessage = lang('error');
      if (error.response && error.response.status === 401) {
        errorMessage = "Error: Invalid Together.xyz API Key. Please check your key.";
      } else if (error.response && error.response.status === 429) {
        errorMessage = "Error: Too many requests. Please try again after some time (rate limit).";
      } else if (error.response && error.response.data && error.response.data.error) {
          errorMessage = `API Error: ${error.response.data.error}`;
      }
      nayan.reply(errorMessage, events.threadID, events.messageID);
    }
  }
};

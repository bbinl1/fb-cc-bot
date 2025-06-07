module.exports = {
  config: {
    name: "flux",
    version: "1.0.0",
    permission: 0,
    credits: "flux",
    description: "Generate images from a prompt using Together.xyz FLUX model.",
    prefix: true,
    category: "prefix",
    usages: "flux [prompt]",
    cooldowns: 10,
  },

  languages: {
    "vi": {},
    "en": {
      "missing_prompt": 'Please provide a prompt to generate an image. Usage: /flux a futuristic city at sunset',
      "generating_message": "Generating your image using FLUX model, please wait...",
      "error": "An error occurred while generating the image. Please check your API key or try again later.",
      "api_key_missing": "Together.xyz API key is not set. Please set TOGETHER_API_KEY in your environment variables." // এই মেসেজটি অপ্রয়োজনীয় হতে পারে
    }
  },

  start: async function({ nayan, events, args, lang }) {
    const axios = require("axios");
    const fs = require("fs-extra");

    const TOGETHER_API_KEY = "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"; 
    const prompt = args.join(" ").trim();

    if (!prompt) {
      return nayan.reply(lang('missing_prompt'), events.threadID, events.messageID);
    }

    nayan.reply(lang('generating_message'), events.threadID, events.messageID);

    try {
      const togetherApiUrl = "https://api.together.xyz/v1/images/generations";
      const payload = {
        prompt: prompt,
        model: "black-forest-labs/FLUX.1-dev",
        response_format: "b64_json",
        steps: 25,
        seed: Math.floor(Math.random() * 1000000),
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

      const base64Image = response.data.b64_json[0].b64_json;

      if (!base64Image) {
        console.error("No base64 image data found from Together.xyz API.");
        return nayan.reply(lang('error'), events.threadID, events.messageID);
      }

      const path = __dirname + `/cache/flux_result.png`;
      fs.writeFileSync(path, Buffer.from(base64Image, 'base64'));

      nayan.reply({
        attachment: fs.createReadStream(path),
        body: `🔍Imagine Result (FLUX Model)🔍\n\n📝Prompt: ${prompt}`
      }, events.threadID, () => {
        fs.unlinkSync(path);
      });

    } catch (error) {
      console.error("Flux command error:", error.response ? error.response.data : error.message);
      let errorMessage = lang('error');
      if (error.response && error.response.status === 401) {
        errorMessage = "Error: Invalid Together.xyz API Key. Please check your key in the code."; // মেসেজ পরিবর্তন
      } else if (error.response && error.response.status === 429) {
        errorMessage = "Error: Too many requests. Please try again after some time (rate limit).";
      } else if (error.response && error.response.data && error.response.data.error) {
          errorMessage = `API Error: ${error.response.data.error}`;
      }
      nayan.reply(errorMessage, events.threadID, events.messageID);
    }
  }
};

const axios = require("axios");
const chalk = require("chalk");

const API_KEY = process.env.TWOCAPTCHA_KEY;

async function solveRecaptchaV2(pageUrl, siteKey) {
  console.log(chalk.yellow(`[CAPTCHA] Sending ReCaptcha V2 request...`));

  // 1. Kirim Request ke 2Captcha
  const response = await axios.get(`http://2captcha.com/in.php`, {
    params: {
      key: API_KEY,
      method: "userrecaptcha",
      googlekey: siteKey,
      pageurl: pageUrl,
      json: 1,
    },
  });

  if (response.data.status !== 1) {
    throw new Error(`2Captcha Error: ${response.data.request}`);
  }

  const requestId = response.data.request;
  console.log(
    chalk.yellow(`[CAPTCHA] Request ID: ${requestId}. Waiting for solution...`)
  );

  // 2. Polling hasil setiap 5 detik
  while (true) {
    await new Promise((r) => setTimeout(r, 5000)); // Tunggu 5 detik
    const result = await axios.get(`http://2captcha.com/res.php`, {
      params: { key: API_KEY, action: "get", id: requestId, json: 1 },
    });

    if (result.data.status === 1) {
      console.log(chalk.green(`[CAPTCHA] Solved!`));
      return result.data.request; // Ini tokennya
    }

    if (result.data.request !== "CAPCHA_NOT_READY") {
      throw new Error(`2Captcha Failed: ${result.data.request}`);
    }
    process.stdout.write(chalk.dim(".")); // Loading indicator
  }
}

module.exports = { solveRecaptchaV2 };

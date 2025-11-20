const { chromium } = require("playwright");
const fs = require("fs");
const chalk = require("chalk");
const { proxyConfig, siteKeys } = require("./config");
const { solveRecaptchaV2 } = require("./solver");
const { loadSettings } = require("./settings");

// Pastikan folder session & screenshots ada
if (!fs.existsSync("./session")) {
  fs.mkdirSync("./session");
}
if (!fs.existsSync("./screenshots")) {
  fs.mkdirSync("./screenshots");
}

async function loginSingleAccount(account, isRefresh = false) {
  const sessionFile = `./session/${account.email}.json`;
  const settings = loadSettings();

  if (!isRefresh) {
    console.log(chalk.cyan(`[${account.email}] Inisialisasi Browser...`));
    const proxyStatus = settings.useProxy
      ? chalk.green("ON")
      : chalk.red("OFF");
    console.log(
      chalk.dim(
        `   Mode: Headless [${settings.headless}] | Proxy [${proxyStatus}]`
      )
    );
  }

  const browser = await chromium.launch({
    headless: settings.headless,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-features=IsolateOrigins,site-per-process", // Tambahan bypass
    ],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
  };

  if (settings.useProxy) {
    contextOptions.proxy = proxyConfig;
  }

  const context = await browser.newContext(contextOptions);
  let page = null;

  try {
    page = await context.newPage();

    if (!isRefresh)
      console.log(chalk.cyan(`[${account.email}] Mengakses Halaman Login...`));

    // 1. Buka Halaman
    await page.goto("https://antrean.logammulia.com/login", {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });

    // --- [FIX CLOUDFLARE TURNSTILE] ---
    // Cek apakah kita tertahan di halaman "Verifying..." atau "Just a moment..."
    const title = await page.title();
    const isChallenge =
      title.includes("Just a moment") ||
      title.includes("Bot Verification") ||
      (await page.locator('iframe[src*="turnstile"]').count()) > 0;

    if (isChallenge) {
      if (!isRefresh)
        console.log(
          chalk.yellow(`⚠️ Terhadang Cloudflare! Menunggu lolos otomatis...`)
        );

      // Tunggu maksimal 15 detik, biasanya browser asli akan lolos sendiri
      try {
        // Tunggu sampai judul berubah atau elemen username muncul
        await page.waitForFunction(
          () => {
            return document.querySelector("#username") !== null;
          },
          { timeout: 15000 }
        );

        if (!isRefresh) console.log(chalk.green(`✅ Lolos Cloudflare!`));
      } catch (e) {
        // Kalau timeout, coba screenshot buat debug
        if (!isRefresh)
          console.log(
            chalk.red(`❌ Masih nyangkut di Cloudflare. Coba refresh IP Proxy.`)
          );
        await page.screenshot({
          path: `./screenshots/stuck_cloudflare_${account.email}.png`,
        });
        throw new Error("Gagal menembus Cloudflare Challenge.");
      }
    }
    // ----------------------------------

    // 2. Isi Form (Sekarang aman karena Cloudflare sudah lewat)
    if (!isRefresh)
      console.log(
        chalk.cyan(`[${account.email}] Mengisi Username & Password...`)
      );

    // Pastikan elemen ada sebelum ngetik
    await page.waitForSelector("#username", { timeout: 10000 });

    await page.fill("#username", account.email);
    await page.fill("#password", account.password);

    // Centang Remember Me
    if (await page.isVisible("#customCheckb1")) {
      await page.check("#customCheckb1");
    }

    // 3. Handle Captcha (ReCaptcha v2 Login)
    if (!isRefresh)
      console.log(chalk.yellow(`[${account.email}] Solving Captcha Login...`));
    const token = await solveRecaptchaV2(page.url(), siteKeys.login);

    // Inject Token
    await page.evaluate((token) => {
      document.getElementById("g-recaptcha-response").innerHTML = token;
    }, token);

    // 4. Klik Login
    if (!isRefresh) console.log(chalk.blue(`[${account.email}] Klik Login...`));

    await Promise.all([
      page.waitForNavigation({ timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);

    // 5. Validasi Login
    if (
      page.url().includes("/users") ||
      (await page.isVisible('a[href*="logout"]'))
    ) {
      const cookies = await context.cookies();

      if (fs.existsSync(sessionFile)) {
        try {
          fs.unlinkSync(sessionFile);
        } catch (e) {}
      }

      fs.writeFileSync(sessionFile, JSON.stringify(cookies, null, 2));

      if (!isRefresh)
        console.log(
          chalk.green(`[${account.email}] ✅ LOGIN SUKSES! Sesi tersimpan.`)
        );
    } else {
      const errorMsg = await page
        .textContent(".alert")
        .catch(() => "Unknown Error");
      if (page.url().includes("/login")) {
        throw new Error(`Login Gagal. Pesan: ${errorMsg.trim()}`);
      }
      throw new Error(`Unknown Login State. URL: ${page.url()}`);
    }
  } catch (error) {
    console.log(chalk.red(`[${account.email}] ❌ Gagal: ${error.message}`));
    if (page) {
      try {
        await page.screenshot({
          path: `./screenshots/error_login_${account.email}.png`,
        });
      } catch (e) {}
    }
  } finally {
    if (browser) await browser.close();
  }
}

async function loginAllAccounts(accounts) {
  console.log(chalk.blue("\n════ LOGIN SEMUA AKUN ════"));
  for (const acc of accounts) {
    await loginSingleAccount(acc);
  }
  console.log(chalk.blue("════ SELESAI ════"));
}

module.exports = { loginAllAccounts, loginSingleAccount };

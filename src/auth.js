const { chromium } = require("playwright");
const fs = require("fs");
const chalk = require("chalk");
const { proxyConfig, siteKeys } = require("./config");
const { solveRecaptchaV2 } = require("./solver");

const SESSION_PATH = "./session/cookies.json";

async function loginAndSaveSession() {
  console.log(chalk.blue("\n🚀 Memulai Proses Login..."));

  const browser = await chromium.launch({
    headless: process.env.HEADLESS === "true",
    args: ["--disable-blink-features=AutomationControlled"], // Anti-detect basic
  });

  const context = await browser.newContext({
    proxy: proxyConfig,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  try {
    // 1. Buka Halaman Login
    console.log(chalk.cyan("[BROWSER] Mengakses antrean.logammulia.com..."));
    await page.goto("https://antrean.logammulia.com/login", { timeout: 60000 });

    // 2. Cek apakah ada Cloudflare Turnstile (Just a moment...)
    if ((await page.title()) === "Just a moment...") {
      console.log(
        chalk.red(
          "[CLOUDFLARE] Terdeteksi Turnstile! Mencoba bypass otomatis..."
        )
      );
      // Disini biasanya kita butuh delay atau solver Turnstile.
      // Untuk Fase 1, kita tunggu dulu sebentar siapa tahu lewat sendiri pakai proxy bagus.
      await page.waitForTimeout(5000);
    }

    // 3. Isi Form Login
    console.log(chalk.cyan("[ACTION] Input Credential..."));
    await page.fill("#username", process.env.ANTAM_EMAIL);
    await page.fill("#password", process.env.ANTAM_PASS);

    // Centang Remember Me (PENTING!)
    if (await page.isVisible("#customCheckb1")) {
      await page.check("#customCheckb1");
    }

    // 4. Handle Captcha
    console.log(chalk.cyan("[ACTION] Solving Captcha..."));
    const token = await solveRecaptchaV2(page.url(), siteKeys.login);

    // Inject Token ke hidden textarea
    await page.evaluate((token) => {
      document.getElementById("g-recaptcha-response").innerHTML = token;
    }, token);

    console.log(chalk.cyan("[ACTION] Klik Login..."));
    // Terkadang tombol login perlu di-enable manual setelah inject
    await page.click('button[type="submit"]');

    // 5. Validasi Login Berhasil
    await page.waitForURL("**/users", { timeout: 30000 });
    console.log(chalk.greenBright("✅ LOGIN BERHASIL! Masuk ke Dashboard."));

    // 6. Simpan Session
    const cookies = await context.cookies();
    fs.writeFileSync(SESSION_PATH, JSON.stringify(cookies, null, 2));
    console.log(chalk.green(`💾 Session tersimpan di ${SESSION_PATH}`));
  } catch (error) {
    console.error(chalk.red("\n❌ Terjadi Kesalahan:"), error.message);
    // Screenshot kalau error biar tau kenapa
    await page.screenshot({ path: "error_login.png" });
    console.log(
      chalk.yellow("📸 Screenshot error disimpan sebagai error_login.png")
    );
  } finally {
    await browser.close();
  }
}

async function checkSession() {
  if (!fs.existsSync(SESSION_PATH)) {
    console.log(
      chalk.red("❌ File session tidak ditemukan. Silakan Login dulu.")
    );
    return;
  }

  console.log(chalk.blue("🔄 Mengecek validitas sesi..."));
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ proxy: proxyConfig });

  // Load Cookies
  const cookies = JSON.parse(fs.readFileSync(SESSION_PATH, "utf-8"));
  await context.addCookies(cookies);

  const page = await context.newPage();
  await page.goto("https://antrean.logammulia.com/users");

  if (page.url().includes("/users")) {
    console.log(chalk.greenBright("✅ Sesi Masih VALID! Siap War."));
  } else {
    console.log(
      chalk.red("❌ Sesi EXPIRED atau Invalid. Silakan Login ulang.")
    );
  }
  await browser.close();
}

module.exports = { loginAndSaveSession, checkSession };

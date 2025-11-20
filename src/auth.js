const { chromium } = require("playwright");
const fs = require("fs");
const chalk = require("chalk");
const { proxyConfig, siteKeys } = require("./config");
const { solveRecaptchaV2 } = require("./solver");
const { loadSettings } = require("./settings");

// Pastikan folder session & screenshots ada
if (!fs.existsSync("./session")) fs.mkdirSync("./session");
if (!fs.existsSync("./screenshots")) fs.mkdirSync("./screenshots");

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
      "--disable-features=IsolateOrigins,site-per-process",
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

    await page.goto("https://antrean.logammulia.com/login", {
      timeout: 60000,
      waitUntil: "domcontentloaded",
    });

    // --- [ZONE 1: BYPASS "BOT VERIFICATION" / CLOUDFLARE] ---
    // Cek apakah kita tertahan di halaman verifikasi
    const title = await page.title();
    const isBlocked =
      title.includes("Just a moment") || title.includes("Bot Verification");

    if (isBlocked) {
      console.log(chalk.yellow(`⚠️ Terhadang Halaman Verifikasi (IP Check).`));

      // 1. Cek apakah ada ReCaptcha (Kotak Centang)
      try {
        // Cari iframe captcha
        const frameElement = await page.waitForSelector(
          'iframe[src*="recaptcha"]',
          { timeout: 10000 }
        );

        if (frameElement) {
          console.log(
            chalk.blue("🤖 Mencoba klik checkbox 'I am not a robot'...")
          );
          const frame = await frameElement.contentFrame();
          const checkbox = await frame.$(".recaptcha-checkbox-border");

          if (checkbox) {
            await checkbox.click();
            console.log(chalk.green("✅ Checkbox diklik. Menunggu hasil..."));
            await page.waitForTimeout(2000);
          }

          // Cek apakah lolos atau minta puzzle
          const isStillBlocked = await page.title();
          if (isStillBlocked.includes("Bot Verification")) {
            console.log(
              chalk.magenta("🧩 Muncul Puzzle Gambar! Mencoba solver...")
            );

            // Ambil SiteKey dari URL iframe
            const frameUrl = await frameElement.getAttribute("src");
            const urlParams = new URLSearchParams(frameUrl.split("?")[1]);
            const siteKey = urlParams.get("k");

            if (siteKey) {
              const token = await solveRecaptchaV2(page.url(), siteKey);
              // Inject Token
              await page.evaluate((t) => {
                document.getElementById("g-recaptcha-response").innerHTML = t;
                // Coba submit form otomatis (biasanya ada form tersembunyi)
                document.querySelector("form")?.submit();
              }, token);
              console.log(chalk.green("✅ Token Injected."));
            } else {
              console.log(
                chalk.red("❌ Gagal ambil SiteKey. Mohon selesaikan manual.")
              );
            }
          }
        }
      } catch (e) {
        console.log(
          chalk.dim(
            "   (Tidak ada checkbox klik, menunggu cloudflare putar otomatis...)"
          )
        );
      }

      // Tunggu sampai elemen Login Asli muncul
      console.log(
        chalk.yellow("⏳ Menunggu masuk halaman login asli... (Max 30s)")
      );
      try {
        await page.waitForSelector("#username", { timeout: 30000 });
        console.log(chalk.green("✅ BERHASIL MASUK LOGIN!"));
      } catch (e) {
        throw new Error(
          "Gagal menembus verifikasi. Coba ganti IP Proxy atau login manual."
        );
      }
    }
    // ---------------------------------------------------------

    // 2. Isi Form Login (Sekarang sudah pasti di halaman login)
    if (!isRefresh)
      console.log(chalk.cyan(`[${account.email}] Mengisi Form...`));

    await page.fill("#username", account.email);
    await page.fill("#password", account.password);

    if (await page.isVisible("#customCheckb1")) {
      await page.check("#customCheckb1");
    }

    // 3. Handle Captcha Login (ReCaptcha v2 Form)
    if (!isRefresh)
      console.log(chalk.yellow(`[${account.email}] Solving Captcha Login...`));
    const tokenLogin = await solveRecaptchaV2(page.url(), siteKeys.login);

    await page.evaluate((token) => {
      document.getElementById("g-recaptcha-response").innerHTML = token;
    }, tokenLogin);

    // 4. Klik Login
    if (!isRefresh)
      console.log(chalk.blue(`[${account.email}] Submit Login...`));

    await Promise.all([
      page.waitForNavigation({ timeout: 60000 }).catch(() => {}),
      page.click('button[type="submit"]'),
    ]);

    // 5. Validasi
    if (
      page.url().includes("/users") ||
      (await page.isVisible('a[href*="logout"]'))
    ) {
      const cookies = await context.cookies();
      if (fs.existsSync(sessionFile))
        try {
          fs.unlinkSync(sessionFile);
        } catch (e) {}
      fs.writeFileSync(sessionFile, JSON.stringify(cookies, null, 2));

      if (!isRefresh)
        console.log(chalk.green(`[${account.email}] ✅ LOGIN SUKSES!`));
    } else {
      const errorMsg = await page
        .textContent(".alert")
        .catch(() => "Unknown Error");
      throw new Error(`Login Gagal: ${errorMsg.trim()}`);
    }
  } catch (error) {
    console.log(chalk.red(`[${account.email}] ❌ Gagal: ${error.message}`));
    if (page)
      try {
        await page.screenshot({
          path: `./screenshots/error_login_${account.email}.png`,
        });
      } catch (e) {}
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

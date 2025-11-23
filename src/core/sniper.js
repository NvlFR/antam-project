const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const { proxyConfig, getSiteName, siteKeys } = require("../../config/config");
const { loadSettings } = require("../data/settings");
const { solveRecaptchaV2 } = require("../utils/solver");
const { ensureSessionValid } = require("../auth/sessionGuard");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startSniperMode(account, targetSiteId) {
  console.clear();
  console.log(chalk.bgRed.white.bold(" 🎯 SNIPER MODE: ANTI-CRASH EDITION "));
  console.log(
    chalk.dim(`Target: ${getSiteName(targetSiteId)} | Akun: ${account.email}`)
  );

  await ensureSessionValid(account);
  const sessionFile = `./session/${account.email}.json`;
  if (!fs.existsSync(sessionFile))
    return console.log(chalk.red("Session hilang!"));

  const settings = loadSettings();
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

  const browser = await chromium.launch({
    headless: false,
    args: [
      "--disable-blink-features=AutomationControlled",
      "--disable-background-timer-throttling",
      "--disable-renderer-backgrounding",
    ],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1000, height: 700 },
    extraHTTPHeaders: {
      Referer: "https://antrean.logammulia.com/users",
      Origin: "https://antrean.logammulia.com",
    },
  };
  if (settings.useProxy) contextOptions.proxy = proxyConfig;

  const context = await browser.newContext(contextOptions);
  await context.addCookies(cookies);
  const page = await context.newPage();

  // Block gambar biar ringan
  await page.route("**/*.{png,jpg,jpeg,svg,css,woff,woff2,ico}", (route) =>
    route.abort()
  );

  let targetUrl = "";
  let preSolvedCaptcha = null;
  let isSolving = false; // FLAG PENTING: Supaya gak spam captcha

  try {
    // --- STEP 1: PREPARATION ---
    console.log(chalk.cyan("🔄 Masuk ke Posisi Tembak..."));
    await page.goto("https://antrean.logammulia.com/users", {
      waitUntil: "domcontentloaded",
    });

    // Ambil Token URL
    await page.goto("https://antrean.logammulia.com/antrean");
    try {
      await page.waitForSelector("select#site", { timeout: 10000 });
      await page.selectOption("select#site", targetSiteId);
      await page.waitForTimeout(500);
      const tokenUrl = await page.inputValue("input#t");
      if (!tokenUrl) throw new Error("Gagal dapat token URL.");
      targetUrl = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${tokenUrl}`;
    } catch (e) {
      console.log(chalk.red("❌ Gagal di persiapan awal. Cek IP/Koneksi."));
      await browser.close();
      return;
    }

    console.log(chalk.yellow(`🚀 Standby di Halaman Butik...`));
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

    // --- STEP 2: PARSING WAKTU ---
    const bodyText = await page.innerText("body");
    const timeMatch = bodyText.match(/Pukul\s+(\d{2}:\d{2})/);

    let targetTime = new Date();
    if (timeMatch) {
      const jamBuka = timeMatch[1];
      const [h, m] = jamBuka.split(":");
      targetTime.setHours(parseInt(h), parseInt(m), 0, 0);
      console.log(chalk.greenBright(`📅 Target Lock: ${jamBuka} WIB`));
    } else {
      console.log(chalk.red("⚠️ Jam tidak terdeteksi. Mode Manual/Test."));
      // Kalau tes, set 1 menit dari sekarang
      targetTime.setMinutes(targetTime.getMinutes() + 1);
    }

    // --- STEP 3: WAITING LOOP ---
    console.log(chalk.blue("\n⏳ MEMULAI COUNTDOWN..."));
    let lastRefresh = Date.now();

    while (true) {
      const now = new Date();
      const diffSec = Math.floor((targetTime - now) / 1000);

      if (diffSec > 0) {
        process.stdout.write(
          `\r⏰ T - ${diffSec}s | Captcha: ${preSolvedCaptcha ? "✅" : "❌"}   `
        );
      }

      // Keep Alive Refresh (Setiap 45 detik jika waktu > 2 menit)
      if (diffSec > 120 && Date.now() - lastRefresh > 45000) {
        process.stdout.write(chalk.cyan("\n♻️ Keep-Alive Refresh...\n"));
        try {
          await page.reload({ waitUntil: "domcontentloaded" });
        } catch (e) {}
        lastRefresh = Date.now();
      }

      // PRE-SOLVE CAPTCHA (Sekali saja!)
      if (diffSec <= 50 && diffSec > 0 && !preSolvedCaptcha && !isSolving) {
        isSolving = true; // Kunci biar gak double request
        console.log(chalk.yellow("\n\n🧩 [PRE-SOLVE] Request Captcha..."));
        solveRecaptchaV2(page.url(), siteKeys.antrean)
          .then((token) => {
            preSolvedCaptcha = token;
            console.log(chalk.green("\n✅ Captcha Tersimpan!"));
          })
          .catch((e) => {
            console.log("\nGagal pre-solve, akan coba lagi nanti.");
            isSolving = false; // Buka kunci kalau gagal
          });
      }

      // START BURST (Di detik -3 biar aman)
      if (diffSec <= 3) {
        console.log(chalk.magenta.bold("\n\n🔥 BURST MODE ACTIVATED!!!"));
        break;
      }
      await delay(1000);
    }

    // --- STEP 4: ATTACK LOOP ---
    let attempts = 0;
    const maxAttempts = 200; // Kita spam terus

    while (attempts < maxAttempts) {
      try {
        const currentUrl = page.url();

        // --- 1. PANIC HANDLER: KICKED TO LOGIN ---
        // Kalau apes banget ditendang ke login, ya sudah game over.
        // Login ulang kelamaan. Kita stop aja biar gak error.
        if (currentUrl.includes("login")) {
          console.log(chalk.bgRed(" 💀 SESI HANGUS SAAT PERANG! GAME OVER. "));
          break;
        }

        // --- 2. RECOVERY HANDLER: KICKED TO HOME/USERS ---
        // Kalau mental ke Home, LANGSUNG balik kanan, GAK PERLU LOGIN
        if (!currentUrl.includes("site=")) {
          console.log(
            chalk.yellow(`⚠️ Mental ke ${currentUrl}. RE-ENTRY CEPAT!`)
          );

          // Trik: Goto tanpa nunggu loading full (biar cepet)
          // Kita cuma butuh request terkirim agar server sadar kita mau ke antrean
          await page.goto(targetUrl, { timeout: 5000, waitUntil: "commit" });

          // Lanjut ke iterasi loop berikutnya untuk cek slot
          continue;
        }

        // --- 3. NORMAL RELOAD ---
        // Kalau posisi sudah benar di halaman antrean, baru kita reload cari slot
        try {
          await page.reload({ waitUntil: "domcontentloaded", timeout: 3000 });
        } catch (e) {
          // Abaikan timeout reload, lanjut cek elemen
        }

        // --- 4. CEK SLOT (Fast Evaluate) ---
        const slotFound = await page
          .evaluate(() => {
            const select = document.querySelector("select#wakda");
            if (!select) return null;
            const options = Array.from(select.options).filter(
              (o) => !o.disabled && o.value !== ""
            );
            return options.length > 0 ? options[0].value : null;
          })
          .catch(() => null);

        if (slotFound) {
          console.log(chalk.bgGreen.black(` ✅ SLOT MUNCUL: ${slotFound} `));

          await page.selectOption("select#wakda", slotFound);

          if (!preSolvedCaptcha) {
            console.log(chalk.red("⚠️ Captcha telat! Solving dadakan..."));
            preSolvedCaptcha = await solveRecaptchaV2(
              page.url(),
              siteKeys.antrean
            );
          }

          await page.evaluate((token) => {
            const el = document.getElementById("g-recaptcha-response");
            if (el) el.innerHTML = token;
          }, preSolvedCaptcha);

          console.log(chalk.magenta("🚀 FIRE!!!"));

          // Klik Submit tanpa await navigation (Fire and Forget)
          await page.click('button[type="submit"]');

          // Tunggu sebentar untuk screenshot hasil
          try {
            await page.waitForTimeout(3000);
          } catch (e) {}

          if (page.url().includes("success") || page.url().includes("tiket")) {
            console.log(
              chalk.bgGreen.white("\n 🎉 JACKPOT! TIKET DAPAT! 🎉 \n")
            );
            await page.screenshot({
              path: `./screenshots/WIN_${Date.now()}.png`,
            });
          } else {
            console.log(chalk.red("\n❌ Belum rezeki/Gagal."));
            await page.screenshot({
              path: `./screenshots/RESULT_${Date.now()}.png`,
            });
          }
          break; // SELESAI
        } else {
          process.stdout.write(chalk.gray("."));
        }
      } catch (e) {
        process.stdout.write(chalk.yellow("R"));
      }

      attempts++;
      if (attempts >= maxAttempts) console.log(chalk.red("\n❌ Waktu habis."));
    }
  } catch (error) {
    console.error(chalk.red(`\n❌ SYSTEM CRASH: ${error.message}`));
  } finally {
    console.log(chalk.dim("Selesai."));
  }
}

module.exports = { startSniperMode };

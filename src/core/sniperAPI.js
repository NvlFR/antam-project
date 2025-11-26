const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const { proxyConfig, getSiteName, siteKeys } = require("../../config/config");
const { loadSettings } = require("../data/settings");
const { solveRecaptchaV2 } = require("../utils/solver");
const { ensureSessionValid } = require("../auth/sessionGuard");
const { sendTelegramMsg } = require("../utils/telegram");
const { getTimeOffset } = require("../utils/ntp"); // Import NTP

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DB_WAKDA_PATH = "./database/wakda.json";

async function startSniperAPI(account, targetSiteId) {
  console.clear();
  console.log(chalk.bgRed.white.bold(" 🚀 SNIPER API: GATLING GUN MODE "));
  console.log(
    chalk.dim(`Target: ${getSiteName(targetSiteId)} | Akun: ${account.email}`)
  );

  // 1. Sync Waktu
  const timeOffset = await getTimeOffset();

  // 2. Cek Sesi
  await ensureSessionValid(account);
  const sessionFile = `./session/${account.email}.json`;
  if (!fs.existsSync(sessionFile))
    return console.log(chalk.red("❌ Session hilang! Login dulu."));

  const settings = loadSettings();
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

  // 3. Launch Browser
  const browser = await chromium.launch({
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 720 },
    extraHTTPHeaders: {
      Referer: "https://antrean.logammulia.com/antrean",
      Origin: "https://antrean.logammulia.com",
    },
  };
  if (settings.useProxy) contextOptions.proxy = proxyConfig;

  const context = await browser.newContext(contextOptions);
  await context.addCookies(cookies);
  const page = await context.newPage();

  let targetUrl = "";
  let tokenUrl = "";
  let csrfToken = "";
  let preSolvedCaptcha = null;
  let isSolving = false;

  // --- VARIABEL TARGET PELURU ---
  let targetWakdaList = [];

  try {
    console.log(chalk.cyan("🔄 Masuk ke Dashboard..."));
    await page.goto("https://antrean.logammulia.com/antrean", {
      waitUntil: "domcontentloaded",
    });

    if (page.url().includes("login")) {
      await performEmergencyLogin(page, account);
    }

    // --- [FITUR BARU: AUTO SCRAPE WAKDA LIVE] ---
    console.log(chalk.yellow("🕵️ Scanning Wakda ID terbaru di halaman..."));
    try {
      await page.waitForSelector("select#site", { timeout: 15000 });
      await page.selectOption("select#site", targetSiteId);
      await page.waitForTimeout(500);
      tokenUrl = await page.inputValue("input#t");

      // Pindah ke halaman cabang
      targetUrl = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${tokenUrl}`;
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

      // Scrape Wakda Langsung
      const scrapedWakdas = await page.evaluate(() => {
        const select = document.querySelector("select#wakda");
        if (!select) return [];
        // Ambil semua value kecuali kosong
        return Array.from(select.options)
          .map((o) => o.value)
          .filter((v) => v !== "");
      });

      if (scrapedWakdas.length > 0) {
        targetWakdaList = scrapedWakdas;
        console.log(
          chalk.green(
            `✅ Wakda ID Live ditemukan: [${targetWakdaList.join(", ")}]`
          )
        );

        // Update Database JSON (Biar tersimpan buat next run)
        try {
          let dbData = {};
          if (fs.existsSync(DB_WAKDA_PATH))
            dbData = JSON.parse(fs.readFileSync(DB_WAKDA_PATH, "utf-8"));
          dbData[targetSiteId] = scrapedWakdas;
          fs.writeFileSync(DB_WAKDA_PATH, JSON.stringify(dbData, null, 2));
        } catch (e) {}
      } else {
        console.log(
          chalk.yellow(
            "⚠️ Wakda kosong (Belum buka). Menggunakan Fallback DB/Hardcode."
          )
        );
        // Fallback Logic Lama (DB JSON -> Hardcode)
        // ... (Kode lama load DB/Hardcode ditaruh di sini) ...
        // Biar simple, kita anggap kalau live kosong, kita pakai Brute Force 1-50
        targetWakdaList = Array.from({ length: 50 }, (_, i) => String(i + 1));
      }
    } catch (e) {
      console.log(chalk.red("❌ Gagal Infiltrasi."));
      await browser.close();
      return;
    }

    if (!tokenUrl) throw new Error("Token URL kosong.");

    csrfToken = await getCsrfToken(page, context);
    console.log(chalk.green(`✅ CSRF: ${csrfToken.substring(0, 10)}...`));

    // --- PARSING WAKTU ---
    const bodyText = await page.innerText("body");
    const timeMatch = bodyText.match(/Pukul\s+(\d{2}:\d{2})/);
    let targetTime = new Date();
    let jamString = "UNKNOWN";

    if (timeMatch) {
      jamString = timeMatch[1];
      const [h, m] = jamString.split(":");
      targetTime.setHours(parseInt(h), parseInt(m), 0, 0);
      console.log(chalk.greenBright(`📅 Target Lock: ${jamString} WIB`));
    } else {
      console.log(chalk.red("⚠️ Jam manual +1 menit."));
      targetTime.setMinutes(targetTime.getMinutes() + 1);
      jamString = `${targetTime.getHours()}:${targetTime.getMinutes()}`;
    }

    console.log(chalk.blue("\n⏳ COUNTDOWN TO GATLING GUN..."));
    let lastHeartbeat = Date.now();

    while (true) {
      // KOREKSI WAKTU DENGAN NTP OFFSET
      const now = new Date(Date.now() + timeOffset);
      const diffSec = Math.floor((targetTime - now) / 1000);

      // Karena kita mau burst start di -200ms, kita cek milliseconds juga
      const diffMs = targetTime - now;

      if (diffSec > 0)
        process.stdout.write(
          `\r⏰ T - ${diffSec}s | Captcha: ${
            preSolvedCaptcha ? "✅" : isSolving ? "⏳" : "❌"
          } `
        );

      // Heartbeat Logic (Sama)
      if (diffSec > 60 && Date.now() - lastHeartbeat > 30000) {
        try {
          await page.reload({ waitUntil: "domcontentloaded" });
          if (page.url().includes("login"))
            await performEmergencyLogin(page, account);
          csrfToken = await getCsrfToken(page, context);
        } catch (e) {}
        lastHeartbeat = Date.now();
      }

      // Pre-Solve (Sama)
      if (diffSec <= 100 && diffSec > 0 && !preSolvedCaptcha && !isSolving) {
        isSolving = true;
        console.log(chalk.yellow("\n\n🧩 Pre-Solving Captcha..."));
        solveRecaptchaV2(page.url(), siteKeys.antrean)
          .then((t) => {
            preSolvedCaptcha = t;
            console.log(chalk.green("\n✅ Captcha Ready!"));
          })
          .catch((e) => {
            isSolving = false;
          });
      }

      // --- GATLING GUN TRIGGER (Mulai 200ms sebelum jam) ---
      if (diffMs <= 200) {
        console.log(
          chalk.magenta.bold("\n\n🚀 GATLING GUN ACTIVATED !!! 💥💥💥")
        );

        if (!preSolvedCaptcha) {
          console.log("⚠️ Darurat: Solve on-fly...");
          preSolvedCaptcha = await solveRecaptchaV2(
            page.url(),
            siteKeys.antrean
          );
        }

        // --- STRATEGI GATLING GUN ---
        // Kita kirim request beruntun dengan jeda 50-100ms
        const burstCount = 5; // 5 Rentetan
        const burstDelay = 100; // Jeda antar rentetan (ms)

        const allPromises = [];

        for (let i = 0; i < burstCount; i++) {
          // Setiap rentetan menembak SEMUA Target Wakda secara paralel
          console.log(chalk.yellow(`   🔥 BURST #${i + 1} Firing...`));

          const wavePromises = targetWakdaList.map((wakdaId) => {
            return shootRequest(
              page,
              csrfToken,
              wakdaId,
              targetSiteId,
              jamString,
              tokenUrl,
              preSolvedCaptcha,
              targetUrl
            );
          });

          allPromises.push(...wavePromises);

          // Tunggu jeda sebelum rentetan berikutnya
          await delay(burstDelay);
        }

        // Tunggu semua peluru mendarat
        const results = await Promise.all(allPromises);

        // Cek apakah ada yang kena
        const hit = results.find((r) => r.success);

        // VALIDASI AKHIR
        console.log(chalk.cyan("\n🏁 Validasi Akhir..."));
        await page.goto(targetUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });
        await page.screenshot({
          path: `./screenshots/GATLING_RESULT_${Date.now()}.png`,
        });

        if (hit) {
          console.log(
            chalk.bgGreen.white.bold(
              ` 🎉 GATLING GUN HIT! WAKDA ${hit.id} TEMBUS! 🎉 `
            )
          );
          sendTelegramMsg(
            `🎉 <b>GATLING GUN WIN!</b>\nAkun: ${account.email}\nWakda: ${hit.id}`
          );
        } else {
          console.log(chalk.red("❌ Semua peluru meleset/penuh."));
        }

        break;
      }
      await delay(50); // Loop check lebih cepat (50ms)
    }
  } catch (error) {
    console.error(chalk.red(`CRASH: ${error.message}`));
  } finally {
    console.log("Selesai.");
  }
}

// Helper Tembak (Dipisah biar rapi)
async function shootRequest(
  page,
  csrf,
  wakda,
  branch,
  jam,
  token,
  captcha,
  referer
) {
  // Kita pakai Injection Fetch (Paling Aman)
  return await page.evaluate(
    async (data) => {
      try {
        const formData = new URLSearchParams();
        formData.append("csrf_test_name", data.csrf);
        formData.append("wakda", data.wakda);
        formData.append("id_cabang", data.branch);
        formData.append("jam_slot", data.jam);
        formData.append("waktu", "");
        formData.append("token", data.token);
        formData.append("g-recaptcha-response", data.captcha);

        const response = await fetch(
          "https://antrean.logammulia.com/antrean-ambil",
          {
            method: "POST",
            body: formData,
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
          }
        );

        if (response.status === 200) {
          const text = await response.text();
          if (
            !text.includes("penuh") &&
            !text.includes("Gagal") &&
            !text.includes("Habis")
          ) {
            return { success: true, id: data.wakda };
          }
        }
        return { success: false, id: data.wakda };
      } catch (e) {
        return { success: false, id: data.wakda };
      }
    },
    { csrf, wakda, branch, jam, token, captcha }
  );
}

async function getCsrfToken(page, context) {
  const currentCookies = await context.cookies();
  const csrfCookie = currentCookies.find(
    (c) => c.name === "csrf_cookie_name" || c.name === "csrf_test_name"
  );
  if (csrfCookie) return csrfCookie.value;
  return await page.inputValue('input[name="csrf_test_name"]').catch(() => "");
}

async function performEmergencyLogin(page, account) {
  try {
    await page.waitForSelector("#username", { timeout: 5000 });
    await page.fill("#username", account.email);
    await page.fill("#password", account.password);
    const t = await solveRecaptchaV2(page.url(), siteKeys.login);
    await page.evaluate((tk) => {
      document.getElementById("g-recaptcha-response").innerHTML = tk;
    }, t);
    await page.click('button[type="submit"]');
    await page.waitForNavigation();
    console.log(chalk.green("✅ Re-Login Berhasil."));
  } catch (e) {
    console.log(chalk.red("❌ Gagal Re-Login Darurat: " + e.message));
  }
}

module.exports = { startSniperAPI };

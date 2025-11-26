const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const path = require("path");
const { proxyConfig, getSiteName, siteKeys } = require("../../config/config");
const { loadSettings } = require("../data/settings");
const { solveRecaptchaV2 } = require("../utils/solver");
const { ensureSessionValid } = require("../auth/sessionGuard");
const { sendTelegramMsg } = require("../utils/telegram");
const { getTimeOffset } = require("../utils/ntp");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DB_WAKDA_PATH = "./database/wakda.json";

// Helper: Simpan Log Data Mentah
function saveDebugData(label, data, ext = "html") {
  const logDir = "./logs/debug_dumps";
  if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

  const filename = `${label}_${Date.now()}.${ext}`;
  fs.writeFileSync(path.join(logDir, filename), data);
  // console.log(chalk.gray(`   💾 Data tersimpan: ${filename}`));
  return filename;
}

async function startSniperAPI(account, targetSiteId) {
  console.clear();
  console.log(
    chalk.bgRed.white.bold(" 🚀 SNIPER API: BLACK BOX RECORDER MODE ")
  );
  console.log(
    chalk.dim(`Target: ${getSiteName(targetSiteId)} | Akun: ${account.email}`)
  );

  const timeOffset = await getTimeOffset();
  await ensureSessionValid(account);

  const sessionFile = `./session/${account.email}.json`;
  if (!fs.existsSync(sessionFile))
    return console.log(chalk.red("❌ Session hilang!"));

  const settings = loadSettings();
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

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
  let targetWakdaList = [];

  try {
    console.log(chalk.cyan("🔄 Masuk ke Dashboard..."));
    await page.goto("https://antrean.logammulia.com/antrean", {
      waitUntil: "domcontentloaded",
    });

    if (page.url().includes("login"))
      await performEmergencyLogin(page, account);

    console.log(chalk.yellow("🕵️ Scanning Wakda ID..."));
    try {
      await page.waitForSelector("select#site", { timeout: 15000 });
      await page.selectOption("select#site", targetSiteId);
      await page.waitForTimeout(500);
      tokenUrl = await page.inputValue("input#t");

      targetUrl = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${tokenUrl}`;
      await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

      const scrapedWakdas = await page.evaluate(() => {
        const select = document.querySelector("select#wakda");
        if (!select) return [];
        return Array.from(select.options)
          .map((o) => o.value)
          .filter((v) => v !== "");
      });

      if (scrapedWakdas.length > 0) {
        targetWakdaList = scrapedWakdas;
        console.log(
          chalk.green(`✅ Wakda Live: [${targetWakdaList.join(", ")}]`)
        );
        // Update DB
        try {
          let dbData = {};
          if (fs.existsSync(DB_WAKDA_PATH))
            dbData = JSON.parse(fs.readFileSync(DB_WAKDA_PATH, "utf-8"));
          dbData[targetSiteId] = scrapedWakdas;
          fs.writeFileSync(DB_WAKDA_PATH, JSON.stringify(dbData, null, 2));
        } catch (e) {}
      } else {
        console.log(chalk.yellow("⚠️ Wakda kosong. Menggunakan Default 1-50."));
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
      jamString = `${targetTime
        .getHours()
        .toString()
        .padStart(2, "0")}:${targetTime
        .getMinutes()
        .toString()
        .padStart(2, "0")}`;
    }

    console.log(chalk.blue("\n⏳ COUNTDOWN..."));
    let lastHeartbeat = Date.now();

    while (true) {
      const now = new Date(Date.now() + timeOffset);
      const diffSec = Math.floor((targetTime - now) / 1000);
      const diffMs = targetTime - now;

      if (diffSec > 0)
        process.stdout.write(
          `\r⏰ T - ${diffSec}s | Captcha: ${preSolvedCaptcha ? "✅" : "❌"}   `
        );

      // Heartbeat
      if (diffSec > 60 && Date.now() - lastHeartbeat > 30000) {
        try {
          await page.reload({ waitUntil: "domcontentloaded" });
          if (page.url().includes("login"))
            await performEmergencyLogin(page, account);
          csrfToken = await getCsrfToken(page, context);
        } catch (e) {}
        lastHeartbeat = Date.now();
      }

      // Pre-Solve
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

      // --- GATLING GUN ---
      if (diffMs <= 200) {
        console.log(
          chalk.magenta.bold("\n\n🚀 GATLING GUN: RECORDING EVERYTHING !!!")
        );

        if (!preSolvedCaptcha)
          preSolvedCaptcha = await solveRecaptchaV2(
            page.url(),
            siteKeys.antrean
          );

        const burstCount = 5;
        const burstDelay = 100;

        const allPromises = [];

        for (let i = 0; i < burstCount; i++) {
          console.log(chalk.yellow(`   🔥 BURST #${i + 1} Firing...`));

          const wavePromises = targetWakdaList.map((wakdaId) => {
            return shootRequestAndReturnData(
              page,
              csrfToken,
              wakdaId,
              targetSiteId,
              jamString,
              tokenUrl,
              preSolvedCaptcha
            );
          });

          allPromises.push(...wavePromises);
          await delay(burstDelay);
        }

        // Tunggu semua selesai dan kumpulkan data
        const rawResults = await Promise.all(allPromises);

        // Filter hasil
        const hit = rawResults.find((r) => r.success);

        // LOGGING DATA MENTAH
        // Kita simpan 1 sampel respon sukses atau gagal pertama buat analisis
        if (rawResults.length > 0) {
          const sample = hit || rawResults[0];
          saveDebugData(`API_RESPONSE_${sample.id}`, sample.body, "html");
        }

        // DUMP HTML HALAMAN AKHIR
        console.log(chalk.cyan("\n🏁 Saving Final State..."));
        await page.goto(targetUrl, {
          waitUntil: "networkidle",
          timeout: 30000,
        });
        const finalHtml = await page.content();
        const finalFile = saveDebugData("FINAL_PAGE", finalHtml, "html");
        await page.screenshot({
          path: `./screenshots/GATLING_RESULT_${Date.now()}.png`,
        });

        if (hit) {
          console.log(
            chalk.bgGreen.white.bold(
              ` 🎉 INDIKASI SUKSES! Wakda ${hit.id} Tembus. `
            )
          );
          sendTelegramMsg(
            `🎉 <b>INDIKASI HIT!</b>\nWakda: ${hit.id}\nCek file: logs/debug_dumps`
          );
        } else {
          console.log(
            chalk.red("❌ Tidak ada respon positif. Cek logs/debug_dumps.")
          );
        }

        break;
      }
      await delay(50);
    }
  } catch (error) {
    console.error(chalk.red(`CRASH: ${error.message}`));
  } finally {
    console.log("Selesai.");
  }
}

async function shootRequestAndReturnData(
  page,
  csrf,
  wakda,
  branch,
  jam,
  token,
  captcha
) {
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

        const text = await response.text();
        const isSuccess =
          response.status === 200 &&
          !text.includes("penuh") &&
          !text.includes("Gagal") &&
          !text.includes("Habis") &&
          !text.includes("Login");

        return {
          success: isSuccess,
          id: data.wakda,
          body: text, // Kembalikan body text ke Node.js
          status: response.status,
        };
      } catch (e) {
        return {
          success: false,
          id: data.wakda,
          body: "Network Error: " + e.message,
          status: 0,
        };
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

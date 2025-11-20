const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const { proxyConfig, getSiteName, siteKeys } = require("./config");
const { loadSettings } = require("./settings");
const { solveRecaptchaV2 } = require("./solver");
const { ensureSessionValid } = require("./sessionGuard");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startSniperAPI(account, targetSiteId) {
  console.clear();
  console.log(chalk.bgRed.white.bold(" 🚀 SNIPER API: RESPONSE READER MODE "));
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

  try {
    // --- STEP 1: INFILTRASI ---
    console.log(chalk.cyan("🔄 Mengumpulkan Data Intel..."));
    await page.goto("https://antrean.logammulia.com/antrean", {
      waitUntil: "domcontentloaded",
    });

    try {
      await page.waitForSelector("select#site", { timeout: 15000 });
      await page.selectOption("select#site", targetSiteId);
      await page.waitForTimeout(500);
      tokenUrl = await page.inputValue("input#t");
    } catch (e) {
      console.log(chalk.red("❌ Dropdown error."));
      await browser.close();
      return;
    }

    if (!tokenUrl) throw new Error("Token URL kosong.");

    const currentCookies = await context.cookies();
    const csrfCookie = currentCookies.find(
      (c) => c.name === "csrf_cookie_name" || c.name === "csrf_test_name"
    );
    if (csrfCookie) {
      csrfToken = csrfCookie.value;
      console.log(
        chalk.green(`✅ CSRF Token: ${csrfToken.substring(0, 10)}...`)
      );
    } else {
      csrfToken = await page
        .inputValue('input[name="csrf_test_name"]')
        .catch(() => null);
      if (!csrfToken) throw new Error("CSRF Token missing.");
    }

    targetUrl = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${tokenUrl}`;
    console.log(chalk.yellow(`🚀 Standby di Halaman Target...`));
    await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

    // --- STEP 2: PARSING WAKTU ---
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
      console.log(chalk.red("⚠️ Jam manual: +1 menit."));
      targetTime.setMinutes(targetTime.getMinutes() + 1);
      jamString = `${targetTime.getHours()}:${targetTime.getMinutes()}`;
    }

    // --- STEP 3: WAITING ---
    console.log(chalk.blue("\n⏳ COUNTDOWN TO API LAUNCH..."));

    while (true) {
      const now = new Date();
      const diffSec = Math.floor((targetTime - now) / 1000);

      if (diffSec > 0) {
        process.stdout.write(
          `\r⏰ T - ${diffSec}s | Captcha: ${preSolvedCaptcha ? "✅" : "❌"} `
        );
      }

      if (diffSec > 120 && diffSec % 60 === 0) {
        await page.reload({ waitUntil: "domcontentloaded" });
        const c = await context.cookies();
        const cc = c.find((x) => x.name === "csrf_cookie_name");
        if (cc) csrfToken = cc.value;
      }

      if (diffSec <= 45 && diffSec > 0 && !preSolvedCaptcha) {
        console.log(chalk.yellow("\n🧩 Pre-Solving Captcha..."));
        solveRecaptchaV2(page.url(), siteKeys.antrean).then((t) => {
          preSolvedCaptcha = t;
          console.log(chalk.green("\n✅ Captcha Ready!"));
        });
      }

      // --- THE KILL SHOT (Detik 0) ---
      if (diffSec <= 0) {
        console.log(chalk.magenta.bold("\n\n🚀 LAUNCHING API MISSILES!!!"));

        if (!preSolvedCaptcha) {
          preSolvedCaptcha = await solveRecaptchaV2(
            page.url(),
            siteKeys.antrean
          );
        }

        const requests = [];
        const slotGuessIds = ["1", "2", "3", "4", "5"];

        for (const wakdaId of slotGuessIds) {
          const formattedJam =
            jamString.length === 5 ? `${jamString}:00` : jamString;
          const formData = {
            csrf_test_name: csrfToken,
            wakda: wakdaId,
            id_cabang: targetSiteId,
            jam_slot: formattedJam,
            waktu: "",
            token: tokenUrl,
            "g-recaptcha-response": preSolvedCaptcha,
          };

          requests.push(
            context.request
              .post("https://antrean.logammulia.com/antrean-ambil", {
                form: formData,
                headers: { Referer: targetUrl },
              })
              .then(async (response) => {
                const status = response.status();
                // Baca respon text/json dari server
                const rawBody = await response.text();

                // --- ANALISIS RESPON (MIRIP LOG BOT TEMANMU) ---
                if (status === 200) {
                  // Kalau sukses, server biasanya kirim JSON atau HTML Popup
                  // Kita cari kata kunci positif
                  if (
                    !rawBody.includes("penuh") &&
                    !rawBody.includes("Gagal")
                  ) {
                    console.log(
                      chalk.bgGreen.black(
                        `\n ✅ HIT SLOT ${wakdaId}: SUCCESS! `
                      )
                    );

                    // Coba parse JSON kalau bisa
                    try {
                      const json = JSON.parse(rawBody);
                      console.log(chalk.green("📩 SERVER RESPONSE:"), json);
                      if (json.nomor_antrean) {
                        console.log(
                          chalk.bgYellow.black(
                            ` 🎫 NOMOR TIKET: ${json.nomor_antrean} `
                          )
                        );
                      }
                    } catch (e) {
                      // Kalau bukan JSON (HTML), print sebagian
                      console.log(
                        chalk.green("📩 RAW RESPONSE:"),
                        rawBody.substring(0, 150) + "..."
                      );
                    }
                    return true;
                  }
                }
                return false;
              })
              .catch(() => false)
          );
        }

        console.log(chalk.yellow("🔥 Sending 5 Concurrent Requests..."));
        const results = await Promise.all(requests);

        // --- SETELAH MENEMBAK ---
        // Kita TIDAK PERLU ke /riwayat kalau tidak ada.
        // Kita refresh halaman saat ini saja, atau cek Dashboard.

        console.log(
          chalk.cyan("\n🏁 Mengecek status di Dashboard (/users)...")
        );
        await page.goto("https://antrean.logammulia.com/users", {
          waitUntil: "domcontentloaded",
        });

        // Screenshot Dashboard (Biasanya tiket aktif muncul di sini)
        await page.screenshot({
          path: `./screenshots/DASHBOARD_RESULT_${Date.now()}.png`,
        });

        if (results.includes(true)) {
          console.log(
            chalk.green.bold("🎉🎉 INDIKASI SUKSES DARI RESPON SERVER! 🎉🎉")
          );
        } else {
          console.log(
            chalk.yellow(
              "⚠️ Respon server tidak meyakinkan. Cek manual akun Anda."
            )
          );
        }

        break;
      }
      await delay(1000);
    }
  } catch (error) {
    console.error(chalk.red(`CRASH: ${error.message}`));
    if (page) await page.screenshot({ path: `./screenshots/crash_api.png` });
  } finally {
    console.log("Selesai.");
  }
}

module.exports = { startSniperAPI };

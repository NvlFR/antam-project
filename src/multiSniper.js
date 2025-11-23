const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const { proxyConfig, getSiteName, siteKeys } = require("./config");
const { loadSettings } = require("./settings");
const { solveRecaptchaV2 } = require("./solver");
const { sendTelegramMsg } = require("./telegram"); // Tambah Notifikasi

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const DB_WAKDA_PATH = "./database/wakda.json";

async function startMultiSniper(selectedAccounts, targetSiteId) {
  console.clear();
  console.log(
    chalk.bgRed.white.bold(` 🚀 MULTI-ACCOUNT: CENTRALIZED DB & NOTIF `)
  );
  console.log(chalk.dim(`Target: ${getSiteName(targetSiteId)}`));

  const settings = loadSettings();

  // --- LOAD WAKDA DARI DATABASE ---
  let wakdaMap = {};
  try {
    if (fs.existsSync(DB_WAKDA_PATH)) {
      wakdaMap = JSON.parse(fs.readFileSync(DB_WAKDA_PATH, "utf-8"));
    }
  } catch (e) {}

  let targetWakdaList = wakdaMap[targetSiteId];

  // Fallback ke Hardcode Darurat jika DB kosong (opsional)
  if (!targetWakdaList) {
    const emergencyMap = {
      6: ["1", "2", "3", "4", "5"],
      3: ["11", "12"],
      8: ["45", "32"],
      19: ["44"],
      16: ["49"],
      17: ["43"],
      20: ["47"],
      21: ["48"],
      23: ["46"],
      1: ["1", "2"],
      11: ["1", "2"],
      10: ["1", "2"],
    };
    targetWakdaList = emergencyMap[targetSiteId];
  }

  if (!targetWakdaList) {
    console.log(
      chalk.yellow(`⚠️ ID Wakda tidak ada. Mode Brute Force (1-50).`)
    );
    targetWakdaList = Array.from({ length: 50 }, (_, i) => String(i + 1));
  } else {
    console.log(chalk.cyan(`🎯 Target Wakda: [${targetWakdaList.join(", ")}]`));
  }
  // --------------------------------

  const agents = [];
  console.log(chalk.cyan("\n🛠️  Mempersiapkan Pasukan..."));

  for (const account of selectedAccounts) {
    console.log(chalk.yellow(`   👉 Menyiapkan Agen: ${account.email}...`));
    const sessionFile = `./session/${account.email}.json`;
    if (!fs.existsSync(sessionFile)) {
      console.log(chalk.red(`      ❌ Sesi tidak ada. Skip.`));
      continue;
    }

    try {
      const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));
      const browser = await chromium.launch({
        headless: settings.headless,
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

      agents.push({
        account,
        browser,
        context,
        page,
        tokenUrl: null,
        csrfToken: null,
        preSolvedCaptcha: null,
        status: "INIT",
      });
    } catch (e) {
      console.log(chalk.red(`      ❌ Gagal launch: ${e.message}`));
    }
  }

  console.log(chalk.green(`\n✅ ${agents.length} Agen Siap.`));

  // --- FASE 2: INFILTRASI ---
  await Promise.all(
    agents.map(async (agent) => {
      try {
        const { page } = agent;
        await page.goto("https://antrean.logammulia.com/antrean", {
          waitUntil: "domcontentloaded",
        });

        await page.waitForSelector("select#site", { timeout: 20000 });
        await page.selectOption("select#site", targetSiteId);
        await page.waitForTimeout(500);
        agent.tokenUrl = await page.inputValue("input#t");

        const c = await agent.context.cookies();
        const cc = c.find(
          (x) => x.name === "csrf_cookie_name" || x.name === "csrf_test_name"
        );
        if (cc) agent.csrfToken = cc.value;

        const targetUrl = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${agent.tokenUrl}`;
        await page.goto(targetUrl, { waitUntil: "domcontentloaded" });

        agent.status = "READY";
        console.log(chalk.green(`   ✅ ${agent.account.email}: READY`));
      } catch (e) {
        agent.status = "ERROR";
        console.log(
          chalk.red(`   ❌ ${agent.account.email}: Error (${e.message})`)
        );
      }
    })
  );

  // --- FASE 3: WAITING ---
  const validAgent = agents.find((a) => a.status === "READY");
  if (!validAgent) return;

  const bodyText = await validAgent.page.innerText("body");
  const timeMatch = bodyText.match(/Pukul\s+(\d{2}:\d{2})/);
  let targetTime = new Date();
  let jamString = "UNKNOWN";

  if (timeMatch) {
    jamString = timeMatch[1];
    const [h, m] = jamString.split(":");
    targetTime.setHours(parseInt(h), parseInt(m), 0, 0);
    console.log(
      chalk.bgBlue.white.bold(`\n 📅 TARGET WAKTU: ${jamString} WIB `)
    );
  } else {
    console.log(chalk.red("⚠️ Jam manual +1 menit."));
    targetTime.setMinutes(targetTime.getMinutes() + 1);
    jamString = `${targetTime.getHours()}:${targetTime.getMinutes()}`;
  }

  let lastHeartbeat = Date.now();
  let isCaptchaSolving = false;

  while (true) {
    const now = new Date();
    const diffSec = Math.floor((targetTime - now) / 1000);

    if (diffSec > 0) {
      process.stdout.write(
        `\r⏰ T - ${diffSec}s | Agen Aktif: ${
          agents.filter((a) => a.status === "READY").length
        } `
      );
    }

    // Heartbeat
    if (diffSec > 60 && Date.now() - lastHeartbeat > 60000) {
      console.log(chalk.cyan("\n💓 Heartbeat..."));
      await Promise.all(
        agents.map(async (agent) => {
          if (agent.status !== "READY") return;
          try {
            await agent.page.reload({ waitUntil: "domcontentloaded" });
            const c = await agent.context.cookies();
            const cc = c.find((x) => x.name === "csrf_cookie_name");
            if (cc) agent.csrfToken = cc.value;
          } catch (e) {}
        })
      );
      lastHeartbeat = Date.now();
    }

    // Pre-Solve Captcha
    if (diffSec <= 45 && diffSec > 0 && !isCaptchaSolving) {
      isCaptchaSolving = true;
      console.log(
        chalk.yellow("\n\n🧩 Memerintahkan Agen untuk Solve Captcha...")
      );
      await Promise.all(
        agents.map(async (agent) => {
          if (agent.status !== "READY") return;
          try {
            agent.preSolvedCaptcha = await solveRecaptchaV2(
              agent.page.url(),
              siteKeys.antrean
            );
            process.stdout.write(chalk.green("."));
          } catch (e) {}
        })
      );
      console.log(chalk.green("\n✅ Captcha Phase Selesai."));
    }

    // --- FIRE ---
    if (diffSec <= 0) {
      console.log(
        chalk.magenta.bold("\n\n🔥🔥🔥 FIRE ALL BATTERIES!!! 🔥🔥🔥")
      );

      const formattedJam =
        jamString.length === 5 ? `${jamString}:00` : jamString;

      const allAttacks = agents.map(async (agent) => {
        if (agent.status !== "READY" || !agent.preSolvedCaptcha) return;

        const agentRequests = targetWakdaList.map((wakdaId) => {
          return agent.context.request
            .post("https://antrean.logammulia.com/antrean-ambil", {
              form: {
                csrf_test_name: agent.csrfToken,
                wakda: wakdaId,
                id_cabang: targetSiteId,
                jam_slot: formattedJam,
                waktu: "",
                token: agent.tokenUrl,
                "g-recaptcha-response": agent.preSolvedCaptcha,
              },
              headers: { Referer: agent.page.url() },
            })
            .then(async (res) => {
              const text = await res.text();
              if (
                res.status() === 200 &&
                !text.includes("penuh") &&
                !text.includes("Gagal") &&
                !text.includes("Habis")
              ) {
                console.log(
                  chalk.bgGreen.black(
                    ` 🏆 ${agent.account.email}: HIT WAKDA ${wakdaId}! `
                  )
                );

                // NOTIFIKASI TELEGRAM MULTI
                sendTelegramMsg(
                  `🏆 <b>MULTI-HIT SUCCESS!</b>\nAkun: ${agent.account.email}\nWakda: ${wakdaId}`
                );

                try {
                  await agent.page.goto(
                    "https://antrean.logammulia.com/riwayat"
                  );
                  await agent.page.screenshot({
                    path: `./screenshots/WIN_${agent.account.email}.png`,
                  });
                } catch (e) {}
              }
            })
            .catch(() => {});
        });

        await Promise.all(agentRequests);
      });

      await Promise.all(allAttacks);
      console.log(chalk.cyan("\n🏁 Serangan Selesai."));
      break;
    }

    await delay(1000);
  }

  console.log("Menunggu 30 detik...");
  await delay(30000);
}

module.exports = { startMultiSniper };

const { chromium } = require("playwright");
const chalk = require("chalk");
const fs = require("fs");
const inquirer = require("inquirer");
const { proxyConfig, getSiteName } = require("./config");
const { loadSettings } = require("./settings");
const { loadAccounts } = require("./accountManager");
const { executeWarSingle } = require("./warExecutor");

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function startAutoMonitor() {
  console.clear();
  console.log(chalk.blue("\n📡 MONITOR OTOMATIS & AUTO WAR"));

  // 1. Persiapan Akun
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    console.log(chalk.red("❌ Tidak ada akun! Tambah dulu."));
    return;
  }

  // Pilih Akun "Eksekutor" (Yang akan dipakai buat War)
  const { selectedAccountIndex } = await inquirer.prompt([
    {
      type: "list",
      name: "selectedAccountIndex",
      message: "Pilih Akun Eksekutor:",
      choices: accounts.map((acc, idx) => ({
        name: `${idx + 1}. ${acc.email} (${acc.branch})`,
        value: idx,
      })),
    },
  ]);
  const executorAccount = accounts[selectedAccountIndex];

  // Pilih Target Cabang (Bisa beda dengan cabang default akun)
  // Kita ambil ID cabang default akun sebagai rekomendasi
  const defaultSiteId = executorAccount.branch;

  const { targetSiteId } = await inquirer.prompt([
    {
      type: "input",
      name: "targetSiteId",
      message: "Masukkan ID Cabang Target Monitor:",
      default: defaultSiteId,
      validate: (val) => (val ? true : "Wajib diisi!"),
    },
  ]);

  console.log(
    chalk.yellow(`\n🚀 MEMULAI MONITORING UNTUK: ${getSiteName(targetSiteId)}`)
  );
  console.log(chalk.dim(`   Eksekutor: ${executorAccount.email}`));
  console.log(chalk.dim(`   Tekan Ctrl+C untuk berhenti.\n`));

  // Mulai Loop Abadi
  const settings = loadSettings();
  let attempt = 1;

  while (true) {
    const now = new Date().toLocaleTimeString();
    process.stdout.write(
      `[${now}] #${attempt} Cek ${getSiteName(targetSiteId)}... `
    );

    try {
      // --- FASE 1: CEK KUOTA CEPAT ---
      // Kita gunakan browser headless khusus monitoring (biar ringan)
      const hasQuota = await quickCheckQuota(
        executorAccount,
        targetSiteId,
        settings
      );

      if (hasQuota) {
        console.log(chalk.green.bold(" ✅ ADA KUOTA! GASKEUN WAR!!! 🔥"));

        // --- FASE 2: EKSEKUSI WAR ---
        // Langsung panggil fungsi War yang sudah kita buat sebelumnya
        await executeWarSingle(executorAccount, targetSiteId);

        console.log(
          chalk.green("\n🏁 Proses War Selesai. Keluar dari Monitor.")
        );
        break; // Berhenti looping setelah war
      } else {
        process.stdout.write(chalk.red("KOSONG\n"));
      }
    } catch (error) {
      process.stdout.write(chalk.red(`ERROR: ${error.message}\n`));
    }

    // Delay Interval
    const interval = (settings.checkInterval || 5) * 1000;
    await delay(interval);
    attempt++;
  }
}

// Fungsi Cek Kuota "Ringan" (Khusus Monitor)
// Mirip dengan checkQuotaAll tapi hanya untuk 1 cabang dan return boolean
async function quickCheckQuota(account, targetSiteId, settings) {
  const sessionFile = `./session/${account.email}.json`;
  if (!fs.existsSync(sessionFile)) throw new Error("Sesi hilang");
  const cookies = JSON.parse(fs.readFileSync(sessionFile, "utf-8"));

  const browser = await chromium.launch({
    headless: true, // Selalu headless biar cepet
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const contextOptions = {
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    extraHTTPHeaders: { Referer: "https://antrean.logammulia.com/users" },
  };
  if (settings.useProxy) contextOptions.proxy = proxyConfig;

  const context = await browser.newContext(contextOptions);
  await context.addCookies(cookies);
  const page = await context.newPage();

  try {
    // Navigasi Cerdas: Langsung ke dashboard -> Antrean (sekali aja di awal sesi browser)
    await page.goto("https://antrean.logammulia.com/antrean");

    // Jika mental ke login, return false (dianggap error/kosong)
    if (page.url().includes("login")) return false;

    // Extract token live dulu (wajib karena token dinamis)
    // Tapi karena kita cuma pantau 1 cabang, kita bisa optimize:
    // Pilih dropdown targetSiteId -> Ambil Token -> Goto URL

    // Tunggu dropdown
    await page.waitForSelector("select#site", { timeout: 20000 });

    // Pilih Cabang
    await page.selectOption("select#site", targetSiteId);
    await page.waitForTimeout(200); // Tunggu input hidden terisi
    const token = await page.inputValue("input#t");

    if (!token) return false; // Gagal dapat token

    // Goto URL Antrean Cabang
    const url = `https://antrean.logammulia.com/antrean?site=${targetSiteId}&t=${token}`;
    await page.goto(url, { waitUntil: "domcontentloaded" });

    // Scrape Slot
    const hasSlot = await page.evaluate(() => {
      const select = document.querySelector("select#wakda");
      if (!select) return false; // Gak ada dropdown jam = tutup

      // Cek opsi yang enabled
      const options = Array.from(select.options);
      const available = options.filter((o) => !o.disabled && o.value !== "");
      return available.length > 0;
    });

    return hasSlot;
  } catch (e) {
    // console.log(e); // Debug
    return false;
  } finally {
    await browser.close();
  }
}

module.exports = { startAutoMonitor };

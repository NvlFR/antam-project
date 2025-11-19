const { chromium } = require("playwright");
const chalk = require("chalk");
const Table = require("cli-table3");
const { proxyConfig, secretMap, getSiteName } = require("./config");

// Fungsi helper untuk bikin delay random (biar gak robot banget)
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function checkQuotaAll(accounts) {
  console.clear();
  console.log(
    chalk.blue(
      `\n[${new Date().toLocaleTimeString()}] 🔎 Memulai Pengecekan Kuota...`
    )
  );
  console.log(
    chalk.dim(
      "Mohon tunggu, sedang memindai butik... (Tekan Ctrl+C untuk stop paksa)\n"
    )
  );

  // 1. Setup Tabel
  const table = new Table({
    head: [
      chalk.white.bold("NO"),
      chalk.white.bold("CABANG"),
      chalk.white.bold("STATUS / SESI"),
      chalk.white.bold("SLOT WAKTU"),
    ],
    colWidths: [5, 30, 20, 40],
    wordWrap: true,
  });

  // 2. Tentukan Target Butik
  // Kita ambil dari secretMap (Semua Butik) agar persis screenshot cli-2.jpeg
  // Kalau mau cepat, bisa diganti jadi loop 'accounts' saja.
  const targetSiteIds = Object.keys(secretMap);

  // 3. Launch Browser (Satu instance browser untuk semua cek biar hemat RAM)
  const browser = await chromium.launch({
    headless: true,
    args: ["--disable-blink-features=AutomationControlled"],
  });

  const context = await browser.newContext({
    proxy: proxyConfig,
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  });

  const page = await context.newPage();

  // 4. Looping Pengecekan
  let no = 1;
  for (const siteId of targetSiteIds) {
    const siteName = getSiteName(siteId);
    const token = secretMap[siteId];
    const url = `https://antrean.logammulia.com/antrean?site=${siteId}&t=${token}`;

    process.stdout.write(chalk.yellow(`⏳ Mengecek ${siteName}... `));

    try {
      // Goto dengan timeout cepat (15 detik) biar gak lama nunggu kalau loading
      await page.goto(url, { timeout: 15000, waitUntil: "domcontentloaded" });

      // Cek Token Validitas (Kalau token secretMap salah/expired)
      if (page.url().includes("/antrean/index")) {
        // Redirect ke home berarti gagal
        process.stdout.write(chalk.red("❌ (Token Salah/Expired)\n"));
        table.push([no++, siteName, chalk.red("ERROR TOKEN"), "-"]);
        continue;
      }

      // Scrape Opsi Waktu
      // Kita cari elemen <select id="wakda">
      const slotData = await page.evaluate(() => {
        const select = document.querySelector("select#wakda");
        const fullText = document.body.innerText;

        if (!select) {
          // Cek indikator lain
          if (fullText.includes("Penuh")) return "FULL";
          if (fullText.includes("Tutup")) return "CLOSED";
          return "UNKNOWN";
        }

        const options = Array.from(select.options).filter(
          (o) => o.value !== ""
        );
        return options.map((o) => ({
          text: o.innerText.trim(),
          disabled: o.disabled,
        }));
      });

      // Formatting Data untuk Tabel
      let statusDisplay = "";
      let slotDisplay = "";

      if (slotData === "FULL") {
        statusDisplay = chalk.red("❌ PENUH");
        slotDisplay = chalk.dim("Tidak ada slot");
      } else if (slotData === "CLOSED") {
        statusDisplay = chalk.red("⛔ TUTUP");
        slotDisplay = chalk.dim("Antrean belum buka");
      } else if (slotData === "UNKNOWN") {
        statusDisplay = chalk.yellow("⚠️  GANGGUAN");
        slotDisplay = "-";
      } else if (Array.isArray(slotData)) {
        // Cek ketersediaan
        const available = slotData.filter((s) => !s.disabled);

        if (available.length > 0) {
          statusDisplay = chalk.greenBright("✅ ADA KUOTA!");
          // Tampilkan slot yang ada
          slotDisplay = available.map((s) => chalk.green(s.text)).join("\n");
        } else {
          statusDisplay = chalk.red("❌ HABIS");
          slotDisplay = slotData
            .map((s) => chalk.dim(s.text))
            .join("\n")
            .substring(0, 100); // Potong kalau kepanjangan
        }
      }

      // Masukkan ke row tabel
      table.push([no++, siteName, statusDisplay, slotDisplay]);
      process.stdout.write(chalk.green("Done.\n"));
    } catch (e) {
      process.stdout.write(chalk.red("Timeout/Error\n"));
      table.push([no++, siteName, chalk.red("TIMEOUT"), "-"]);
    }

    // Kasih napas dikit biar Cloudflare gak ngamuk
    await delay(1000);
  }

  await browser.close();

  // 5. Tampilkan Tabel Final
  console.clear();
  console.log(
    chalk.blue.bold(
      `\n=== HASIL PENGECEKAN TERAKHIR [${new Date().toLocaleTimeString()}] ===`
    )
  );
  console.log(table.toString());
  console.log(chalk.dim("\nTips: Data diambil realtime dari server Antam."));
}

module.exports = { checkQuotaAll };

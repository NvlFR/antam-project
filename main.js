const inquirer = require("inquirer");
const chalk = require("chalk");
const { drawHeader } = require("./src/ui");
const {
  addAccount,
  listAccounts,
  loadAccounts,
} = require("./src/accountManager");
const { loginAllAccounts } = require("./src/auth");
const { checkQuotaAll } = require("./src/war");
const { manageSettings, loadSettings } = require("./src/settings");
const { testProxy } = require("./src/proxyTester");
const { startAutoMonitor } = require("./src/autoMonitor");
const { startSniperMode } = require("./src/sniper");
const { startSniperAPI } = require("./src/sniperAPI");
const { scrapeWakdaIDs } = require("./src/wakdaScraper");
const { startMultiSniper } = require("./src/multiSniper");
const { secretMap, getSiteName } = require("./src/config");

// --- HELPER: TAMPILKAN DAFTAR CABANG (2 KOLOM) ---
function showBranchList() {
  console.log(chalk.yellow("DAFTAR CABANG TERSEDIA:"));
  const siteIds = Object.keys(secretMap).sort(
    (a, b) => parseInt(a) - parseInt(b)
  ); // Urutkan angka

  // Tampilkan 2 kolom biar hemat tempat
  for (let i = 0; i < siteIds.length; i += 2) {
    const id1 = siteIds[i];
    const name1 = getSiteName(id1).replace("Butik Emas LM - ", "");
    const str1 = `[${id1}] ${name1}`;

    const id2 = siteIds[i + 1];
    let str2 = "";
    if (id2) {
      const name2 = getSiteName(id2).replace("Butik Emas LM - ", "");
      str2 = `[${id2}] ${name2}`;
    }

    // Print kolom rapi
    console.log(chalk.cyan(`${str1.padEnd(35)} ${str2}`));
  }
  console.log(chalk.gray("──────────────────────────────────────────────────"));
}

async function main() {
  console.clear();

  const config = loadSettings();
  const headlessStatus = config.headless ? chalk.green("ON") : chalk.red("OFF");
  const proxyStatus = config.useProxy
    ? chalk.green("AKTIF")
    : chalk.red("MATI");

  drawHeader("BOT ANTAM - PLAYWRIGHT FULL AUTO");
  console.log(
    chalk.dim(
      `Info: Headless [${headlessStatus}] | Proxy [${proxyStatus}] | Interval [${config.checkInterval}s]\n`
    )
  );

  console.log(chalk.white("1. Login Semua Akun"));
  console.log(chalk.white("2. Cek Kuota & Restok"));
  console.log(chalk.white("3. SNIPER MODE (Single & Multi)"));
  console.log(chalk.white("4. Tambah Akun"));
  console.log(chalk.white("5. Cek & Hapus Akun"));
  console.log(chalk.white("6. Monitor Otomatis"));
  console.log(chalk.white("7. Pengaturan Bot"));
  console.log(chalk.magenta("8. Scrape Wakda ID (INTEL)"));
  console.log(chalk.white("T. Test Proxy"));
  console.log(chalk.gray("──────────────────────────────"));
  console.log(chalk.red("0. Keluar"));
  console.log("");

  const answer = await inquirer.prompt([
    {
      type: "input",
      name: "menu",
      message: "Pilih menu:",
      validate: (val) => (val ? true : "Harap masukkan angka!"),
    },
  ]);

  switch (answer.menu.trim()) {
    case "1":
      const accountsLogin = loadAccounts();
      if (accountsLogin.length === 0) {
        console.log(chalk.red("⚠️  Belum ada akun! Tambah dulu di menu 4."));
      } else {
        await loginAllAccounts(accountsLogin);
      }
      await pause();
      break;

    case "2":
      await checkQuotaAll();
      await pause();
      break;

    case "3":
      const accountsWar = loadAccounts();
      if (accountsWar.length === 0) {
        console.log(chalk.red("⚠️  Belum ada akun! Tambah dulu."));
        await pause();
        break;
      }

      // 1. Pilih Strategi
      const { strategy } = await inquirer.prompt([
        {
          type: "list",
          name: "strategy",
          message: "Pilih Strategi Perang:",
          choices: [
            {
              name: "🔫 Single Sniper (1 Akun - Presisi Tinggi)",
              value: "single",
            },
            {
              name: "💣 Multi-Account Cluster (Serangan Massal)",
              value: "multi",
            },
          ],
        },
      ]);

      if (strategy === "single") {
        // --- SINGLE SNIPER ---
        const { selectedAccountIndex } = await inquirer.prompt([
          {
            type: "list",
            name: "selectedAccountIndex",
            message: "Pilih Akun Sniper:",
            choices: accountsWar.map((acc, idx) => ({
              name: `${acc.email} (${getSiteName(acc.branch).replace(
                "Butik Emas LM - ",
                ""
              )})`,
              value: idx,
            })),
          },
        ]);
        const sniperAccount = accountsWar[selectedAccountIndex];

        // TAMPILKAN LIST MANUAL
        showBranchList();

        // INPUT ANGKA MANUAL
        const { branchId } = await inquirer.prompt([
          {
            type: "input", // UBAH JADI INPUT
            name: "branchId",
            message: "Masukkan ID Cabang Target (Lihat list di atas):",
            default: sniperAccount.branch, // Default ke cabang akun
            validate: (val) =>
              secretMap[val] ? true : "ID Cabang tidak valid!",
          },
        ]);

        const { mode } = await inquirer.prompt([
          {
            type: "list",
            name: "mode",
            message: "Pilih Metode Teknis:",
            choices: [
              { name: "API Hybrid (Disarankan: Cepat & Stabil)", value: "api" },
              {
                name: "Browser Sniper (Visual, Lebih Lambat)",
                value: "browser",
              },
            ],
          },
        ]);

        if (mode === "browser") {
          await startSniperMode(sniperAccount, branchId);
        } else {
          await startSniperAPI(sniperAccount, branchId);
        }
      } else {
        // --- MULTI ACCOUNT ---
        const { selectedIndices } = await inquirer.prompt([
          {
            type: "checkbox",
            name: "selectedIndices",
            message: "Pilih Pasukan (Spasi untuk pilih):",
            choices: accountsWar.map((acc, idx) => ({
              name: `${acc.email} [${getSiteName(acc.branch).replace(
                "Butik Emas LM - ",
                ""
              )}]`,
              value: idx,
            })),
            validate: (a) => (a.length < 1 ? "Pilih minimal 1 akun" : true),
          },
        ]);

        const selectedAccounts = selectedIndices.map((idx) => accountsWar[idx]);

        // TAMPILKAN LIST MANUAL
        showBranchList();

        const { branchIdMulti } = await inquirer.prompt([
          {
            type: "input",
            name: "branchIdMulti",
            message: "Masukkan ID Cabang Target (Serangan Bersama):",
            validate: (val) =>
              secretMap[val] ? true : "ID Cabang tidak valid!",
          },
        ]);

        await startMultiSniper(selectedAccounts, branchIdMulti);
      }

      await pause();
      break;

    case "4":
      await addAccount();
      break;

    case "5":
      console.clear();
      drawHeader("DAFTAR AKUN");
      listAccounts();
      await pause();
      break;

    case "6":
      // Update untuk Monitor Otomatis juga biar konsisten (List -> Input)
      // Tapi logic-nya ada di dalam autoMonitor.js,
      // Untuk sekarang biarkan dulu, atau kamu mau ubah juga?
      await startAutoMonitor();
      await pause();
      break;

    case "7":
      await manageSettings();
      break;

    case "8":
      await scrapeWakdaIDs();
      await pause();
      break;

    case "t":
    case "T":
      await testProxy();
      await pause();
      break;

    case "0":
      console.log("Bye bye!");
      process.exit(0);
      break;

    default:
      console.log(chalk.red("❌ Menu tidak valid! Masukkan angka 0-8."));
      await pause();
      break;
  }

  main();
}

async function pause() {
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    readline.question(chalk.dim("\nTekan Enter untuk kembali..."), () => {
      readline.close();
      resolve();
    });
  });
}

main();

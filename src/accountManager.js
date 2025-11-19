const fs = require("fs");
const inquirer = require("inquirer");
const chalk = require("chalk");
const { secretMap, getSiteName } = require("./config");

const DB_PATH = "./database/accounts.json";

function loadAccounts() {
  if (!fs.existsSync(DB_PATH)) {
    // Pastikan folder database ada dulu
    if (!fs.existsSync("./database")) fs.mkdirSync("./database");
    fs.writeFileSync(DB_PATH, "[]");
  }
  return JSON.parse(fs.readFileSync(DB_PATH));
}

function saveAccounts(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

// UPDATE: Tampilan list manual, input ID manual
async function addAccount() {
  console.clear();
  console.log(chalk.blue("════ TAMBAH AKUN BARU ════"));

  // Tampilkan Daftar ID Cabang
  console.log(chalk.yellow("Daftar ID Butik:"));
  const siteIds = Object.keys(secretMap);

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
    console.log(`${str1.padEnd(35)} ${str2}`);
  }
  console.log(chalk.dim("──────────────────────────────"));

  const answers = await inquirer.prompt([
    {
      type: "input",
      name: "branchId",
      message: "Masukkan ID Butik (contoh: 3):",
      validate: (val) =>
        secretMap[val] ? true : "ID Butik tidak valid/tidak terdaftar!",
    },
    {
      type: "input",
      name: "email",
      message: "Masukkan Email/No HP:",
      validate: (val) => (val.length > 5 ? true : "Email/HP terlalu pendek"),
    },
    {
      type: "password", // Tetap password input tapi manual text
      name: "password",
      message: "Masukkan Password:",
      mask: "*",
    },
  ]);

  const accounts = loadAccounts();
  // Cek duplikat
  const isExist = accounts.find(
    (a) => a.email === answers.email && a.branch === answers.branchId
  );
  if (isExist) {
    console.log(chalk.red("\n❌ Akun tersebut sudah ada di database!"));
  } else {
    accounts.push({
      email: answers.email,
      password: answers.password,
      branch: answers.branchId,
      status: "Belum Login",
    });
    saveAccounts(accounts);
    console.log(chalk.green("\n✅ Akun berhasil ditambahkan!"));
  }

  // Pause sebentar sebelum balik ke menu
  await new Promise((resolve) => setTimeout(resolve, 1500));
}

function listAccounts() {
  const accounts = loadAccounts();
  if (accounts.length === 0) {
    console.log(chalk.yellow("Belum ada akun yang terdaftar."));
    return;
  }

  accounts.forEach((acc, index) => {
    const passMask = acc.password.substring(0, 3) + "*****";
    const siteName = getSiteName(acc.branch).replace("Butik Emas LM - ", "");
    console.log(
      `${index + 1}. ${chalk.bold(siteName)} -> ${chalk.cyan(acc.email)}`
    );
  });
}

module.exports = { addAccount, listAccounts, loadAccounts };

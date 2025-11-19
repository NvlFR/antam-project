const inquirer = require("inquirer");
const chalk = require("chalk");
const { loginAndSaveSession, checkSession } = require("./src/auth");

async function main() {
  // Clear console biar bersih
  console.clear();
  console.log(
    chalk.yellow.bold(`
    ==========================================
       🤖 ANTAM BOT WARRIOR - CLI VERSION
       Created by: Gemini & User
    ==========================================
    `)
  );

  const answers = await inquirer.prompt([
    {
      type: "list",
      name: "action",
      message: "Pilih Menu:",
      choices: [
        { name: "🔑 Login & Simpan Sesi Baru", value: "login" },
        { name: "🛡️  Cek Status Sesi", value: "check" },
        {
          name: "⚔️  Mulai War (Coming Soon)",
          value: "war",
          disabled: "Fase 2",
        },
        { name: "❌ Keluar", value: "exit" },
      ],
    },
  ]);

  switch (answers.action) {
    case "login":
      await loginAndSaveSession();
      break;
    case "check":
      await checkSession();
      break;
    case "exit":
      console.log("Bye bye!");
      process.exit(0);
  }

  // Balik ke menu setelah selesai
  console.log("\nTekan Enter untuk kembali ke menu...");
  const readline = require("readline").createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  readline.question("", () => {
    readline.close();
    main();
  });
}

main();

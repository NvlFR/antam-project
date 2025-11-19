const chalk = require("chalk");

const drawHeader = (title) => {
  const width = 60;
  const text = ` ${title} `;
  const padStart = Math.floor((width - text.length) / 2);
  const padEnd = width - text.length - padStart;

  console.log(chalk.white.bold("═".repeat(width)));
  console.log(
    chalk.white.bold("=".repeat(padStart) + text + "=".repeat(padEnd))
  );
  console.log(chalk.white.bold("═".repeat(width)));
};

const drawSubHeader = (title) => {
  console.log(chalk.cyan(`\n─── ${title} ───`));
};

module.exports = { drawHeader, drawSubHeader };

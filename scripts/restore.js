import { config } from "../server/config.js";
import { restoreBackup } from "../server/backup.js";
if (!process.argv[2] || !process.argv[3])
  throw new Error(
    "Uso: npm run restore -- backups/arquivo.scbackup data/restaurado-novo",
  );
console.log(
  "Banco restaurado:",
  restoreBackup(config(), process.argv[2], process.argv[3]),
);

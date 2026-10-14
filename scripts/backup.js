import { config } from "../server/config.js";
import { openStore } from "../server/store.js";
import { backupStore } from "../server/backup.js";
const s = openStore(config());
try {
  console.log(
    backupStore(s, process.argv[2] || `backups/backup-${Date.now()}.scbackup`),
  );
} finally {
  s.close();
}

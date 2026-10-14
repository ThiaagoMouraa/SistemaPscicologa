import { config } from "../server/config.js";
import { openStore } from "../server/store.js";
const s = openStore(config());
console.log(
  "Migrações aplicadas:",
  s.db.prepare("SELECT version FROM migrations").all(),
);
s.close();

import { config } from "./config.js";
import { createApp } from "./app.js";
const c = config(),
  { app, store } = createApp(c);
const server = app.listen(c.port, c.host, () =>
  console.log(
    `Consultório Samira Costa — ${c.url} | ${c.mode}. ${c.mail === "local" ? "Códigos de demonstração aparecem neste terminal." : "E-mail SMTP ativado."}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );

const startedAt = Date.now();
console.log("TaskSpeck Strata process started");

const { createApp } = await import("./create-app.js");
const { loadConfig } = await import("./config.js");

const config = loadConfig();
const app = await createApp(config);
const { startMaintenance } = await import("./maintenance.js");
const server = app.listen(config.port, "0.0.0.0", () => {
  console.log(`TaskSpeck Strata is running at ${config.publicBaseUrl} (port ${config.port}, ${Date.now() - startedAt}ms)`);
  startMaintenance({ db: app.locals.db, mail: app.locals.mail, config });
});
server.on("error", (error) => {
  console.error(`TaskSpeck Strata could not listen on port ${config.port}: ${error.message}`);
  process.exit(1);
});

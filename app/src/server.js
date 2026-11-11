import { createApp } from "./create-app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const app = await createApp(config);
app.listen(config.port, () => {
  console.log(`TaskSpeck Strata is running at ${config.publicBaseUrl}`);
});

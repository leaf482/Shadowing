import { createApp } from "./createApp.js";
import { PORT } from "./lib/env.js";

const app = await createApp();

export default app;

if (!process.env.AWS_EXECUTION_ENV) {
  app.listen(PORT, "127.0.0.1", () => {
    console.log(`Server listening on 127.0.0.1:${PORT}`);
  });
}

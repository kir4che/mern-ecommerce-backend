import "dotenv/config";
import app from "./app";
import { connectDB } from "./config/db";
import { startCancelExpiredOrdersJob } from "./jobs/cancelExpiredOrders";

const port = process.env.PORT || 8080;
const isDev = process.env.NODE_ENV !== "production";

async function start() {
  try {
    await connectDB();
    app.listen(port, () => {
      if (isDev)
        console.log(`[INFO] Server started on http://localhost:${port}`);
    });
    startCancelExpiredOrdersJob();
  } catch (err: unknown) {
    console.error("[ERROR] Failed to start server", err);
    process.exit(1);
  }
}

void start();

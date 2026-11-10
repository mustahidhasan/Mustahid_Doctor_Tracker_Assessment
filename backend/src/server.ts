import "dotenv/config";
import { app } from "./app";
import { connectDB } from "./config/db";

const PORT = Number(process.env.PORT || 5000);

async function startServer() {
  try {
    await connectDB();

    app.listen(PORT, () => {
      console.log(`Backend running at http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Backend startup failed:", error);
    process.exit(1);
  }
}

startServer();
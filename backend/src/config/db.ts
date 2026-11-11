import mongoose from "mongoose";

let connecting: Promise<typeof mongoose> | null = null;

/**
 * Connects once and reuses the connection. In serverless functions (Vercel) the module stays
 * loaded between invocations on a warm instance, so later requests skip the handshake; concurrent
 * cold-start requests share one in-flight connection attempt. A failed attempt is not cached.
 */
export async function connectDB(): Promise<void> {
  if (mongoose.connection.readyState === 1) return;
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is missing from backend/.env");

  // Only an in-flight attempt is shared; once settled, readyState decides (so a dropped or closed
  // connection is re-established and a failed attempt is retried on the next request).
  connecting ??= mongoose.connect(uri, { serverSelectionTimeoutMS: 10000, maxPoolSize: 10 })
    .then((instance) => {
      console.log(`MongoDB connected: ${instance.connection.name}`);
      return instance;
    })
    .finally(() => { connecting = null; });
  await connecting;
}

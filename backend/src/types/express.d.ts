declare global {
  namespace Express {
    interface Request {
      auth?: { userId: string; role: "admin"; name: string; email: string };
    }
  }
}

export {};

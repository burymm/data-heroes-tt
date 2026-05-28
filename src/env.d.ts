declare global {
  namespace NodeJS {
    interface ProcessEnv {
      DATABASE_URL?: string;
      PORT?: string;
      LOG_LEVEL?: string;
      NODE_ENV?: string;
    }
  }
}

export {};

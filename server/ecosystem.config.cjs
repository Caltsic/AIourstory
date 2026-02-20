module.exports = {
  apps: [
    {
      name: "aistory-api",
      cwd: "/opt/aistory/ai-story-game/server",
      script: "dist/index.js",
      instances: 1,
      exec_mode: "fork",
      max_memory_restart: "512M",
      env: {
        NODE_ENV: "production",
      },
      out_file: "/opt/aistory/logs/aistory-api.out.log",
      error_file: "/opt/aistory/logs/aistory-api.err.log",
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};

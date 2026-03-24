module.exports = {
  apps: [
    {
      name: "shadowing",
      script: "server/index.js",
      interpreter: "node",
      // Restart automatically if it crashes
      autorestart: true,
      // Restart if memory exceeds 300 MB
      max_memory_restart: "300M",
      env_production: {
        NODE_ENV: "production",
        PORT: 3000,
      },
    },
  ],
};

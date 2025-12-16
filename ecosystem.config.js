module.exports = {
  apps: [{
    name: 'transport-backend',
    script: 'backend/server.js',
    cwd: '/var/www/my-transport-app',
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 5000
    },
    error_file: '/root/.pm2/logs/transport-backend-error.log',
    out_file: '/root/.pm2/logs/transport-backend-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};


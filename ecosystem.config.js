// Load environment variables from backend/.env
const path = require('path');
const os = require('os');

const projectRoot = __dirname;
require('dotenv').config({ path: path.join(projectRoot, 'backend', '.env') });

const pm2LogDir = path.join(os.homedir(), '.pm2', 'logs');

module.exports = {
  apps: [{
    name: 'transport-backend',
    script: path.join(projectRoot, 'backend', 'server.js'),
    cwd: projectRoot,
    instances: 1,
    exec_mode: 'fork',
    watch: false,
    max_memory_restart: '1G',
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3000
    },
    error_file: path.join(pm2LogDir, 'transport-backend-error.log'),
    out_file: path.join(pm2LogDir, 'transport-backend-out.log'),
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};


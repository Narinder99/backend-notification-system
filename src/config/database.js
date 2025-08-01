const { Pool } = require('pg');

const pool = new Pool({
  user: 'notification_system',
  host: 'dpg-d26d5kfdiees7391gg4g-a.oregon-postgres.render.com',
  database: 'notification_system_bkwx',
  password: 'Sw1eYLxkiypvLmmPIUNU1tCmObjJJF9w',
  port: 5432,
  ssl: {
    rejectUnauthorized: false
  }
});

module.exports = pool; 
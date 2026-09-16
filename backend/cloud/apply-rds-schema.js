'use strict';
const fs = require('node:fs');
const path = require('node:path');

// Shared by API startup and the offline data importer. All SQL comes from our
// checked-in schema, not request data. DDL is not wrapped in a fake transaction:
// MySQL implicitly commits DDL. Back up and rehearse legacy upgrades separately.
async function applyRdsSchema(connection) {
  const schema = fs.readFileSync(path.join(__dirname, 'rds-schema.sql'), 'utf8');
  for (const sql of schema.split(';').map(s => s.trim()).filter(Boolean)) {
    await connection.query(sql);
  }
  // MySQL 8 does not support MariaDB's ADD COLUMN IF NOT EXISTS syntax.
  const [columns] = await connection.execute(`SELECT 1 AS present FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'chat_members' AND COLUMN_NAME = 'role'`);
  if (columns.length === 0) {
    try {
      await connection.query("ALTER TABLE chat_members ADD COLUMN role VARCHAR(16) NOT NULL DEFAULT 'member'");
    } catch (error) {
      // Two application instances may start together. Ignore only this race;
      // permission failures or any other schema failure must block startup.
      if (error.code !== 'ER_DUP_FIELDNAME') throw error;
    }
  }
}

module.exports = { applyRdsSchema };

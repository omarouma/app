'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const source = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf8');
assert.match(source, /db = IS_PRODUCTION \? null : new DB\(DB_PATH\)/);
assert.match(source, /db = await MySqlDB\.connect\(process\.env\)/);
assert.match(source, /await db\.migrate\(\)/);
assert.match(source, /database: IS_PRODUCTION \? 'rds-mysql' : 'sqlite'/);
assert.match(source, /const SELF_REGISTRATION_ENABLED = enabled\('ENABLE_SELF_REGISTRATION'\)/);
assert.match(source, /await handleWsMessage\(ws, userId, raw\)/);
assert.match(source, /app\.get\('\/ready'/);
assert.match(source, /media: ossStore \? 'oss' :/);
assert.doesNotMatch(source, /oss-configured/);
assert.doesNotMatch(source, /const db = new DB\(DB_PATH\)/);
console.log('  PASS production runtime selects RDS and development selects SQLite');

'use strict';
// Offline test adapter for environments with Node 24 but no native addon.
// Never loaded by normal startup and expressly forbidden in production.
if (process.env.NODE_ENV !== 'test' || process.env.GAGA_TEST_SQLITE_COMPAT !== '1') {
  throw new Error('SQLite compatibility adapter is test-only');
}
const {DatabaseSync} = require('node:sqlite');
const Module = require('node:module');
class TestDatabase {
  constructor(file) { this.raw = new DatabaseSync(file); }
  exec(sql) { return this.raw.exec(sql); }
  prepare(sql) { return this.raw.prepare(sql); }
  pragma(sql) { return this.raw.prepare(`PRAGMA ${sql}`).all(); }
  close() { this.raw.close(); }
  transaction(fn) { return (...args) => {
    this.raw.exec('BEGIN IMMEDIATE');
    try { const result = fn(...args); this.raw.exec('COMMIT'); return result; }
    catch (error) { this.raw.exec('ROLLBACK'); throw error; }
  }; }
}
const original = Module._load;
Module._load = function(name, parent, isMain) {
  return name === 'better-sqlite3' ? TestDatabase : original.call(this, name, parent, isMain);
};

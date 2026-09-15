'use strict';
const fs = require('fs');
const crypto = require('crypto');
const SQLite = require('better-sqlite3');
const mysql = require('mysql2/promise');
const { applyRdsSchema } = require('./apply-rds-schema');

const source = process.env.SQLITE_SOURCE_PATH;
if (!source || !fs.existsSync(source)) throw new Error('SQLITE_SOURCE_PATH_not_found');
for (const key of ['RDS_HOST','RDS_DATABASE','RDS_USER','RDS_PASSWORD']) if (!process.env[key]) throw new Error(`${key}_missing`);
const order = ['users','contacts','friend_requests','chats','chat_members','messages','refresh_sessions','devices','calls','media','blocks','reports'];
const pk = {users:'id',contacts:null,friend_requests:'id',chats:'id',chat_members:null,messages:'id',refresh_sessions:'id',devices:'id',calls:'id',media:'id',blocks:null,reports:'id'};

(async () => {
  const sqlite = new SQLite(source,{readonly:true});
  const db = await mysql.createConnection({host:process.env.RDS_HOST,port:Number(process.env.RDS_PORT||3306),
    user:process.env.RDS_USER,password:process.env.RDS_PASSWORD,database:process.env.RDS_DATABASE,
    ssl:String(process.env.RDS_SSL).toLowerCase()==='true'?{rejectUnauthorized:true}:undefined,
    multipleStatements:true});
  const counts = {};
  try {
    await applyRdsSchema(db);
    await db.beginTransaction();
    for (const table of order) {
      const exists = sqlite.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table);
      if (!exists) { counts[table]=0; continue; }
      const rows = sqlite.prepare(`SELECT * FROM ${table}`).all();
      for (const original of rows) {
        const row = {...original};
        if (table==='devices') row.push_token_hash=crypto.createHash('sha256').update(row.push_token).digest('hex');
        const cols=Object.keys(row), marks=cols.map(()=>'?').join(',');
        const update=cols.filter(c=>c!==pk[table]).map(c=>`${c}=VALUES(${c})`).join(',');
        const sql=`INSERT INTO ${table} (${cols.join(',')}) VALUES (${marks})${update?` ON DUPLICATE KEY UPDATE ${update}`:''}`;
        await db.execute(sql,cols.map(c=>row[c]));
      }
      counts[table]=rows.length;
    }
    await db.commit(); console.log(JSON.stringify({migrated:true,counts}));
  } catch (error) { await db.rollback(); throw error; }
  finally { sqlite.close(); await db.end(); }
})().catch(error=>{console.error(JSON.stringify({migrated:false,error:error.code||error.message}));process.exit(1);});

'use strict';
const required = ['RDS_HOST','RDS_DATABASE','RDS_USER','RDS_PASSWORD','REDIS_URL',
  'OSS_REGION','OSS_BUCKET','OSS_ACCESS_KEY_ID','OSS_ACCESS_KEY_SECRET','PUBLIC_BASE',
  'JWT_SECRET','TURN_HOST','TURN_SECRET','FIREBASE_SERVICE_ACCOUNT_JSON'];
const missing = required.filter(k => !process.env[k] || /^(replace|set-)/i.test(process.env[k]));
if (missing.length) {
  console.error(JSON.stringify({ready:false,error:'missing_runtime_secrets',missing}));
  process.exit(2);
}

const mysql = require('mysql2/promise');
const Redis = require('ioredis');
const OSS = require('ali-oss');

(async () => {
  const status = { rds:false, redis:false, oss:false };
  let db, redis;
  try {
    db = await mysql.createConnection({host:process.env.RDS_HOST,port:Number(process.env.RDS_PORT||3306),
      user:process.env.RDS_USER,password:process.env.RDS_PASSWORD,database:process.env.RDS_DATABASE,
      ssl:String(process.env.RDS_SSL).toLowerCase()==='true'?{rejectUnauthorized:true}:undefined,
      connectTimeout:8000});
    await db.query('SELECT 1'); status.rds=true;
    redis = new Redis(process.env.REDIS_URL,{lazyConnect:true,connectTimeout:8000,maxRetriesPerRequest:1});
    await redis.connect(); status.redis=(await redis.ping())==='PONG';
    const oss = new OSS({region:process.env.OSS_REGION,bucket:process.env.OSS_BUCKET,
      accessKeyId:process.env.OSS_ACCESS_KEY_ID,accessKeySecret:process.env.OSS_ACCESS_KEY_SECRET,
      secure:true,timeout:8000});
    await oss.getBucketInfo(process.env.OSS_BUCKET); status.oss=true;
    console.log(JSON.stringify({ready:Object.values(status).every(Boolean),services:status}));
    process.exit(Object.values(status).every(Boolean)?0:1);
  } catch (error) {
    console.error(JSON.stringify({ready:false,services:status,error:error.code||error.name})); process.exit(1);
  } finally {
    if (redis) redis.disconnect(); if (db) await db.end();
  }
})();

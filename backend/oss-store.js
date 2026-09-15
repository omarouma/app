'use strict';
const crypto = require('crypto');

class OssStore {
  constructor(env = process.env, client = null) {
    if (client) { this.client = client; return; }
    const OSS = require('ali-oss');
    this.client = new OSS({
      region: env.OSS_REGION, endpoint: env.OSS_ENDPOINT || undefined,
      bucket: env.OSS_BUCKET, accessKeyId: env.OSS_ACCESS_KEY_ID,
      accessKeySecret: env.OSS_ACCESS_KEY_SECRET, secure: true, timeout: 10000
    });
  }
  uploadTicket(userId, mime) {
    const ext = ({'image/jpeg':'jpg','image/png':'png','image/webp':'webp','video/mp4':'mp4',
      'audio/mpeg':'mp3','audio/mp4':'m4a','audio/ogg':'ogg','audio/webm':'webm','application/pdf':'pdf'})[mime] || 'bin';
    const date = new Date().toISOString().slice(0,10).replaceAll('-','/');
    const objectKey = `media/${date}/${userId}/${crypto.randomUUID()}.${ext}`;
    const uploadUrl = this.client.signatureUrl(objectKey, { method:'PUT', expires:300,
      'Content-Type': mime });
    return { objectKey, uploadUrl };
  }
  async exists(objectKey) { await this.client.head(objectKey); return true; }
  async verifyUpload(objectKey, size, mime) {
    const {res} = await this.client.head(objectKey);
    const headers = res?.headers || {};
    if (Number(headers['content-length']) !== Number(size) ||
        String(headers['content-type'] || '').split(';')[0].toLowerCase() !== mime) {
      throw Object.assign(new Error('Upload does not match its ticket'), {code:'UPLOAD_MISMATCH'});
    }
    return true;
  }
  downloadUrl(objectKey) { return this.client.signatureUrl(objectKey, { method:'GET', expires:300 }); }
}
module.exports = { OssStore };

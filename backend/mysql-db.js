'use strict';
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { applyRdsSchema } = require('./cloud/apply-rds-schema');

const newId = () => crypto.randomBytes(12).toString('hex');
const now = () => Date.now();
const first = result => result[0][0] || null;

class MySqlDB {
  constructor(pool) { this.pool = pool; }
  static async connect(env = process.env) {
    const pool = mysql.createPool({
      host:env.RDS_HOST, port:Number(env.RDS_PORT || 3306), database:env.RDS_DATABASE,
      user:env.RDS_USER, password:env.RDS_PASSWORD,
      ssl:String(env.RDS_SSL).toLowerCase()==='true' ? {rejectUnauthorized:true} : undefined,
      waitForConnections:true, connectionLimit:Number(env.RDS_POOL_SIZE || 20), queueLimit:100,
      enableKeepAlive:true, keepAliveInitialDelay:10000, charset:'utf8mb4'
      ,connectTimeout:8000
    });
    await pool.query('SELECT 1');
    return new MySqlDB(pool);
  }
  async migrate() {
    const connection = await this.pool.getConnection();
    try {
      await applyRdsSchema(connection);
    } finally { connection.release(); }
  }
  async close() { await this.pool.end(); }
  async insertUser(u) { await this.pool.execute(`INSERT INTO users
    (id,phone,username,display_name,password,avatar_url,bio,verified,last_seen,created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?)`,[u.id,u.phone,u.username,u.display_name,u.password,u.avatar_url,u.bio,u.verified?1:0,now(),now()]); }
  async userById(id) { return first(await this.pool.execute('SELECT * FROM users WHERE id=?',[id])); }
  async userByPhone(v) { return first(await this.pool.execute('SELECT * FROM users WHERE phone=?',[String(v)])); }
  async userByUsername(v) { return first(await this.pool.execute('SELECT * FROM users WHERE username=?',[String(v)])); }
  async updateUser(id,u) { await this.pool.execute('UPDATE users SET display_name=?,bio=?,avatar_url=? WHERE id=?',[u.display_name,u.bio,u.avatar_url,id]); }
  async setLastSeen(id) { await this.pool.execute('UPDATE users SET last_seen=? WHERE id=?',[now(),id]); }
  async searchUsers(user,q,limit=30) { const [r]=await this.pool.execute(`SELECT id,username,display_name,avatar_url,verified FROM users u
    WHERE u.id<>? AND (u.username LIKE ? OR u.display_name LIKE ?) AND NOT EXISTS (SELECT 1 FROM blocks b
    WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?))
    ORDER BY u.verified DESC,u.display_name LIMIT ?`,[user,`%${q}%`,`%${q}%`,user,user,Number(limit)]);return r; }
  async addContact(a,b) { const c=await this.pool.getConnection(); try { await c.beginTransaction();
    await c.execute('INSERT IGNORE INTO contacts (a_id,b_id,created_at) VALUES (?,?,?)',[a,b,now()]);
    await c.execute('INSERT IGNORE INTO contacts (a_id,b_id,created_at) VALUES (?,?,?)',[b,a,now()]); await c.commit();
  } catch(e){await c.rollback();throw e;} finally{c.release();} }
  async removeContact(a,b) { await this.pool.execute('DELETE FROM contacts WHERE (a_id=? AND b_id=?) OR (a_id=? AND b_id=?)',[a,b,b,a]); }
  async contactsFor(id) { const [rows]=await this.pool.execute(`SELECT u.id,u.username,u.display_name,u.avatar_url,u.verified,u.last_seen
    FROM contacts c JOIN users u ON u.id=c.b_id WHERE c.a_id=? ORDER BY u.display_name`,[id]);
    return rows.map(x=>({...x,verified:!!x.verified,online:now()-Number(x.last_seen||0)<70000})); }
  async friendRequestByPair(a,b) { return first(await this.pool.execute(`SELECT * FROM friend_requests WHERE status='pending'
    AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?)) LIMIT 1`,[a,b,b,a])); }
  async createFriendRequest(from,to) { if(first(await this.pool.execute('SELECT 1 ok FROM contacts WHERE a_id=? AND b_id=?',[from,to])))return {state:'already_contact'};
    const existing=await this.friendRequestByPair(from,to);if(existing)return {state:'pending',request:existing};
    const row={id:newId(),from_id:from,to_id:to,status:'pending',created_at:now(),updated_at:now()};
    await this.pool.execute('INSERT INTO friend_requests (id,from_id,to_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?)',Object.values(row));
    return {state:'created',request:row}; }
  async friendRequestsFor(user) { const [rows]=await this.pool.execute(`SELECT r.*,u.username,u.display_name,u.avatar_url,u.verified,
    CASE WHEN r.to_id=? THEN 'incoming' ELSE 'outgoing' END direction FROM friend_requests r
    JOIN users u ON u.id=CASE WHEN r.to_id=? THEN r.from_id ELSE r.to_id END
    WHERE (r.from_id=? OR r.to_id=?) AND r.status='pending' ORDER BY r.created_at DESC`,[user,user,user,user]);return rows; }
  async acceptFriendRequest(id,user) { const c=await this.pool.getConnection();try{await c.beginTransaction();
    const [rows]=await c.execute("SELECT * FROM friend_requests WHERE id=? AND to_id=? AND status='pending' FOR UPDATE",[id,user]);
    const row=rows[0];if(!row){await c.rollback();return null;}await c.execute("UPDATE friend_requests SET status='accepted',updated_at=? WHERE id=?",[now(),id]);
    await c.execute('INSERT IGNORE INTO contacts (a_id,b_id,created_at) VALUES (?,?,?),(?,?,?)',[row.from_id,row.to_id,now(),row.to_id,row.from_id,now()]);
    await c.commit();return row;}catch(e){await c.rollback();throw e;}finally{c.release();} }
  async rejectFriendRequest(id,user) { const [r]=await this.pool.execute("UPDATE friend_requests SET status='rejected',updated_at=? WHERE id=? AND to_id=? AND status='pending'",[now(),id,user]);return r.affectedRows===1; }
  async isBlockedEither(a,b) { return !!first(await this.pool.execute(`SELECT 1 ok FROM blocks WHERE
    (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1`,[a,b,b,a])); }
  async blockUser(blocker,blocked) { const c=await this.pool.getConnection();try{await c.beginTransaction();
    await c.execute('INSERT IGNORE INTO blocks (blocker_id,blocked_id,created_at) VALUES (?,?,?)',[blocker,blocked,now()]);
    await c.execute('DELETE FROM contacts WHERE (a_id=? AND b_id=?) OR (a_id=? AND b_id=?)',[blocker,blocked,blocked,blocker]);
    await c.execute("UPDATE friend_requests SET status='rejected',updated_at=? WHERE status='pending' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))",[now(),blocker,blocked,blocked,blocker]);
    await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();} }
  async unblockUser(blocker,blocked) { const [r]=await this.pool.execute('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?',[blocker,blocked]);return r.affectedRows===1; }
  async blockedUsersFor(user) { const [r]=await this.pool.execute(`SELECT u.id,u.username,u.display_name,u.avatar_url,b.created_at
    FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=? ORDER BY b.created_at DESC`,[user]);return r; }
  async createReport(reporter,reported,category,details) { const row={id:newId(),reporter_id:reporter,reported_id:reported,category,details,status:'open',created_at:now(),reviewed_at:null};
    await this.pool.execute('INSERT INTO reports (id,reporter_id,reported_id,category,details,status,created_at) VALUES (?,?,?,?,?,?,?)',[row.id,reporter,reported,category,details,row.status,row.created_at]);return row; }
  async exportUserData(user) { const u=await this.userById(user); const safe=u?{id:u.id,phone:u.phone,username:u.username,display_name:u.display_name,avatar_url:u.avatar_url,bio:u.bio,verified:!!u.verified,created_at:u.created_at}:null;
    const [sent]=await this.pool.execute('SELECT id,chat_id,text,attachment_url,attachment_type,created_at FROM messages WHERE sender_id=? ORDER BY created_at',[user]);
    const [reports]=await this.pool.execute('SELECT id,reported_id,category,details,status,created_at,reviewed_at FROM reports WHERE reporter_id=? ORDER BY created_at',[user]);
    return {exported_at:now(),user:safe,contacts:await this.contactsFor(user),friend_requests:await this.friendRequestsFor(user),chats:await this.chatsFor(user),sent_messages:sent,submitted_reports:reports,blocked_users:await this.blockedUsersFor(user)}; }
  async deleteUserAccount(user) { const c=await this.pool.getConnection();try{await c.beginTransaction();
    await c.execute('DELETE FROM reports WHERE reporter_id=? OR reported_id=?',[user,user]);
    await c.execute('DELETE FROM calls WHERE caller_id=? OR callee_id=?',[user,user]);
    await c.execute('DELETE FROM messages WHERE sender_id=?',[user]);
    await c.execute('DELETE FROM contacts WHERE a_id=? OR b_id=?',[user,user]);
    await c.execute('DELETE FROM chat_members WHERE user_id=?',[user]);
    await c.execute('DELETE FROM refresh_sessions WHERE user_id=?',[user]);
    await c.execute('DELETE FROM users WHERE id=?',[user]);
    await c.execute('DELETE FROM chats WHERE id NOT IN (SELECT chat_id FROM chat_members)');
    await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();} }
  async chatById(id) { return first(await this.pool.execute('SELECT * FROM chats WHERE id=?',[id])); }
  async isMember(chat,user) { return !!first(await this.pool.execute('SELECT 1 ok FROM chat_members WHERE chat_id=? AND user_id=?',[chat,user])); }
  async members(chat) { const [r]=await this.pool.execute('SELECT user_id FROM chat_members WHERE chat_id=?',[chat]); return r.map(x=>x.user_id); }
  async chatFor(user,chat) { const [rows]=await this.pool.execute(`SELECT c.id,c.type,COALESCE(c.title,peer.display_name,'Chat') title,
    peer.avatar_url,peer.id peer_id,cm.last_read_at,
    (SELECT text FROM messages WHERE chat_id=c.id ORDER BY created_at DESC LIMIT 1) last_message,
    (SELECT created_at FROM messages WHERE chat_id=c.id ORDER BY created_at DESC LIMIT 1) last_message_at,
    (SELECT COUNT(*) FROM messages WHERE chat_id=c.id AND created_at>cm.last_read_at AND sender_id<>?) unread
    FROM chats c JOIN chat_members cm ON cm.chat_id=c.id AND cm.user_id=?
    LEFT JOIN chat_members pm ON pm.chat_id=c.id AND pm.user_id<>? AND c.type='dm'
    LEFT JOIN users peer ON peer.id=pm.user_id WHERE c.id=? LIMIT 1`,[user,user,user,chat]); return rows[0]||null; }
  async findOrCreateDm(a,b) { const [rows]=await this.pool.execute(`SELECT c.id FROM chats c
    JOIN chat_members x ON x.chat_id=c.id AND x.user_id=? JOIN chat_members y ON y.chat_id=c.id AND y.user_id=?
    WHERE c.type='dm' LIMIT 1`,[a,b]); if(rows[0]) return this.chatFor(a,rows[0].id);
    const id=newId(), c=await this.pool.getConnection(); try{await c.beginTransaction();
      await c.execute('INSERT INTO chats (id,type,title,created_by,created_at) VALUES (?,\'dm\',NULL,?,?)',[id,a,now()]);
      await c.execute('INSERT INTO chat_members (chat_id,user_id,last_read_at) VALUES (?,?,?),(?,?,0)',[id,a,now(),id,b]);
      await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();} return this.chatFor(a,id); }
  async createGroup(owner,title,members) { const id=newId(),c=await this.pool.getConnection();try{await c.beginTransaction();
    await c.execute("INSERT INTO chats (id,type,title,created_by,created_at) VALUES (?,'group',?,?,?)",[id,title,owner,now()]);
    await c.execute("INSERT INTO chat_members (chat_id,user_id,last_read_at,role) VALUES (?,?,?,'owner')",[id,owner,now()]);
    for(const member of members) await c.execute("INSERT IGNORE INTO chat_members (chat_id,user_id,last_read_at,role) VALUES (?,?,0,'member')",[id,member]);
    await c.commit();}catch(e){await c.rollback();throw e;}finally{c.release();}return this.chatFor(owner,id); }
  async groupDetails(chat,user) { if(!await this.isMember(chat,user))return null;const base=await this.chatById(chat);if(!base||base.type!=='group')return null;
    const [members]=await this.pool.execute(`SELECT u.id,u.username,u.display_name,u.avatar_url,cm.role FROM chat_members cm
      JOIN users u ON u.id=cm.user_id WHERE cm.chat_id=? ORDER BY cm.role='owner' DESC,u.display_name`,[chat]);return {...base,members}; }
  async isGroupOwner(chat,user) { return !!first(await this.pool.execute("SELECT 1 ok FROM chat_members WHERE chat_id=? AND user_id=? AND role='owner'",[chat,user])); }
  async addGroupMember(chat,user) { await this.pool.execute("INSERT IGNORE INTO chat_members (chat_id,user_id,last_read_at,role) VALUES (?,?,0,'member')",[chat,user]); }
  async removeGroupMember(chat,user) { await this.pool.execute("DELETE FROM chat_members WHERE chat_id=? AND user_id=? AND role<>'owner'",[chat,user]); }
  async updateGroupTitle(chat,title) { await this.pool.execute('UPDATE chats SET title=? WHERE id=?',[title,chat]); }
  async chatsFor(user) { const [rows]=await this.pool.execute(`SELECT c.id,c.type,COALESCE(c.title,peer.display_name,'Chat') title,
    peer.avatar_url,peer.id peer_id,
    (SELECT text FROM messages WHERE chat_id=c.id ORDER BY created_at DESC LIMIT 1) last_message,
    (SELECT created_at FROM messages WHERE chat_id=c.id ORDER BY created_at DESC LIMIT 1) last_message_at,
    (SELECT COUNT(*) FROM messages WHERE chat_id=c.id AND created_at>cm.last_read_at AND sender_id<>?) unread
    FROM chats c JOIN chat_members cm ON cm.chat_id=c.id AND cm.user_id=?
    LEFT JOIN chat_members pm ON pm.chat_id=c.id AND pm.user_id<>? AND c.type='dm' LEFT JOIN users peer ON peer.id=pm.user_id
    ORDER BY COALESCE(last_message_at,c.created_at) DESC`,[user,user,user]); return rows; }
  async messages(chat,before,limit) { const [rows]=await this.pool.execute(`SELECT m.*,u.display_name sender_name,u.avatar_url sender_avatar
    FROM messages m JOIN users u ON u.id=m.sender_id WHERE m.chat_id=? AND m.created_at<? ORDER BY m.created_at DESC LIMIT ?`,
    [chat,before,Number(limit)]); return rows.reverse(); }
  async insertMessage(chat,sender,text,url,type,clientId) { if(clientId){const existing=first(await this.pool.execute(
    'SELECT * FROM messages WHERE chat_id=? AND sender_id=? AND client_message_id=?',[chat,sender,clientId]));
    if(existing)return {message:existing,inserted:false};} const row={id:newId(),chat_id:chat,sender_id:sender,text,
      attachment_url:url,attachment_type:type,client_message_id:clientId||null,created_at:now()};
    try {
      await this.pool.execute(`INSERT INTO messages (id,chat_id,sender_id,text,attachment_url,attachment_type,client_message_id,created_at)
        VALUES (?,?,?,?,?,?,?,?)`,Object.values(row));
      return {message:row,inserted:true};
    } catch (error) {
      // The unique index, not the preflight SELECT, arbitrates concurrent sends.
      if (clientId && error.code === 'ER_DUP_ENTRY') {
        const existing = first(await this.pool.execute(
          'SELECT * FROM messages WHERE chat_id=? AND sender_id=? AND client_message_id=?',[chat,sender,clientId]));
        if (existing) return {message:existing,inserted:false};
      }
      throw error;
    } }
  async searchMessages(user,q,limit=50) { const [r]=await this.pool.execute(`SELECT m.id,m.chat_id,m.sender_id,m.text,m.attachment_type,m.created_at,c.type,c.title
    FROM messages m JOIN chat_members cm ON cm.chat_id=m.chat_id AND cm.user_id=? JOIN chats c ON c.id=m.chat_id
    WHERE m.text LIKE ? ORDER BY m.created_at DESC LIMIT ?`,[user,`%${q}%`,Number(limit)]);return r; }
  async deleteOwnMessage(chat,message,user) { const [r]=await this.pool.execute('DELETE FROM messages WHERE id=? AND chat_id=? AND sender_id=?',[message,chat,user]);return r.affectedRows===1; }
  async markRead(chat,user) { await this.pool.execute('UPDATE chat_members SET last_read_at=? WHERE chat_id=? AND user_id=?',[now(),chat,user]); }
  async deleteChat(chat,user) { await this.pool.execute('DELETE FROM chat_members WHERE chat_id=? AND user_id=?',[chat,user]); }
  async createRefreshSession(s) { await this.pool.execute(`INSERT INTO refresh_sessions
    (id,user_id,family_id,token_hash,expires_at,revoked_at,replaced_by,created_at) VALUES (?,?,?,?,?,NULL,NULL,?)`,
    [s.id,s.userId,s.familyId,s.tokenHash,s.expiresAt,now()]); }
  async refreshSessionByHash(h) { return first(await this.pool.execute('SELECT * FROM refresh_sessions WHERE token_hash=?',[h])); }
  async sessionById(id) { return first(await this.pool.execute('SELECT * FROM refresh_sessions WHERE id=?',[id])); }
  async isSessionActive(id,user) { return !!first(await this.pool.execute(`SELECT 1 ok FROM refresh_sessions
    WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?`,[id,user,now()])); }
  async rotateRefreshSession(oldId,s) { const c=await this.pool.getConnection();try{await c.beginTransaction();
    const [r]=await c.execute('UPDATE refresh_sessions SET revoked_at=?,replaced_by=? WHERE id=? AND revoked_at IS NULL AND expires_at>?',[now(),s.id,oldId,now()]);
    if(r.affectedRows!==1){await c.rollback();return false;} await c.execute(`INSERT INTO refresh_sessions
      (id,user_id,family_id,token_hash,expires_at,created_at) VALUES (?,?,?,?,?,?)`,[s.id,s.userId,s.familyId,s.tokenHash,s.expiresAt,now()]);
    await c.commit();return true;}catch(e){await c.rollback();throw e;}finally{c.release();} }
  async revokeSessionFamily(f) { await this.pool.execute('UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at,?) WHERE family_id=?',[now(),f]); }
  async revokeFamilyBySession(id,user) { const s=first(await this.pool.execute('SELECT family_id FROM refresh_sessions WHERE id=? AND user_id=?',[id,user]));if(s)await this.revokeSessionFamily(s.family_id); }
  async upsertDevice(user,d) { const id=newId(),hash=crypto.createHash('sha256').update(d.pushToken).digest('hex');
    await this.pool.execute(`INSERT INTO devices (id,user_id,platform,push_token,push_token_hash,device_name,updated_at) VALUES (?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE user_id=VALUES(user_id),platform=VALUES(platform),device_name=VALUES(device_name),updated_at=VALUES(updated_at)`,
      [id,user,d.platform,d.pushToken,hash,d.deviceName,now()]); return {id,platform:d.platform,device_name:d.deviceName,updated_at:now()}; }
  async removeDevice(user,token) { const [r]=await this.pool.execute('DELETE FROM devices WHERE user_id=? AND push_token_hash=?',
    [user,crypto.createHash('sha256').update(token).digest('hex')]);return r.affectedRows>0; }
  async deviceTokensFor(user) { const [r]=await this.pool.execute('SELECT push_token FROM devices WHERE user_id=? ORDER BY updated_at DESC',[user]);return r.map(x=>x.push_token); }
  async insertMedia(m) { await this.pool.execute(`INSERT INTO media (id,owner_id,object_key,mime,size,status,created_at)
    VALUES (?,?,?,?,?,'pending',?)`,[m.id,m.ownerId,m.objectKey,m.mime,m.size,now()]); }
  async mediaById(id) { return first(await this.pool.execute('SELECT * FROM media WHERE id=?',[id])); }
  async canReadMedia(id,user,canonicalUrl) {
    const row = first(await this.pool.execute(`SELECT 1 ok FROM media m
      WHERE m.id=? AND m.status='ready' AND (m.owner_id=? OR EXISTS (
        SELECT 1 FROM messages msg JOIN chat_members cm ON cm.chat_id=msg.chat_id AND cm.user_id=?
        WHERE msg.attachment_url=?
      ) OR EXISTS (SELECT 1 FROM users u WHERE u.avatar_url=?)) LIMIT 1`,[id,user,user,canonicalUrl,canonicalUrl]));
    return !!row;
  }
  async markMediaReady(id,user) { const [r]=await this.pool.execute("UPDATE media SET status='ready' WHERE id=? AND owner_id=? AND status='pending'",[id,user]);return r.affectedRows===1; }
  async insertCall(caller,callee,video) { const row={id:newId(),caller_id:caller,callee_id:callee,video:video?1:0,status:'ringing',created_at:now(),ended_at:null};
    await this.pool.execute('INSERT INTO calls (id,caller_id,callee_id,video,status,created_at) VALUES (?,?,?,?,?,?)',
      [row.id,caller,callee,row.video,row.status,row.created_at]);return row; }
  async callById(id) { return first(await this.pool.execute('SELECT * FROM calls WHERE id=?',[id])); }
  async endCall(id) { await this.pool.execute("UPDATE calls SET status='ended',ended_at=? WHERE id=?",[now(),id]); }
  async callsFor(user,limit=100) { const [r]=await this.pool.execute(`SELECT c.*,CASE WHEN c.caller_id=? THEN c.callee_id ELSE c.caller_id END peer_id,
    u.display_name peer_name,u.avatar_url peer_avatar FROM calls c JOIN users u ON u.id=CASE WHEN c.caller_id=? THEN c.callee_id ELSE c.caller_id END
    WHERE c.caller_id=? OR c.callee_id=? ORDER BY c.created_at DESC LIMIT ?`,[user,user,user,user,Number(limit)]);return r; }
}
module.exports={MySqlDB};

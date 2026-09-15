// GaGaChat backend — SQLite persistence layer (better-sqlite3)
const Database = require('better-sqlite3');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, 'gagachat.db');
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

function newId() { return crypto.randomBytes(12).toString('hex'); }
function now() { return Date.now(); }

// ---------- scrypt password hashing (memory-hard, per-user salt) ----------
const SCRYPT_N = 16384, SCRYPT_r = 8, SCRYPT_p = 1, SCRYPT_KEYLEN = 32;
function scryptHash(password) {
  const salt = crypto.randomBytes(16);
  const key = crypto.scryptSync(String(password), salt, SCRYPT_KEYLEN, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
  return 's2$' + salt.toString('base64') + '$' + key.toString('base64');
}
function scryptVerify(password, stored) {
  try {
    const [tag, saltB64, keyB64] = String(stored).split('$');
    if (tag !== 's2') return false;
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');
    const actual = crypto.scryptSync(String(password), salt, expected.length, { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p });
    return crypto.timingSafeEqual(expected, actual);
  } catch (e) { return false; }
}

class DB {
  constructor(dbPath) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.migrate();
  }
  migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        phone TEXT UNIQUE NOT NULL,
        username TEXT UNIQUE NOT NULL,
        display_name TEXT NOT NULL,
        password TEXT NOT NULL,
        avatar_url TEXT,
        bio TEXT,
        verified INTEGER DEFAULT 0,
        last_seen INTEGER DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS contacts (
        a_id TEXT NOT NULL REFERENCES users(id),
        b_id TEXT NOT NULL REFERENCES users(id),
        created_at INTEGER NOT NULL,
        PRIMARY KEY (a_id, b_id)
      );
      CREATE TABLE IF NOT EXISTS friend_requests (
        id TEXT PRIMARY KEY,
        from_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        to_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        CHECK (from_id <> to_id)
      );
      DROP INDEX IF EXISTS idx_friend_request_pair;
      CREATE INDEX IF NOT EXISTS idx_friend_request_pair
        ON friend_requests(from_id, to_id, status);
      CREATE INDEX IF NOT EXISTS idx_friend_requests_incoming
        ON friend_requests(to_id, status, created_at);
      CREATE TABLE IF NOT EXISTS chats (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL DEFAULT 'dm',
        title TEXT,
        created_by TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS chat_members (
        chat_id TEXT NOT NULL REFERENCES chats(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        last_read_at INTEGER DEFAULT 0,
        role TEXT NOT NULL DEFAULT 'member',
        PRIMARY KEY (chat_id, user_id)
      );
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        chat_id TEXT NOT NULL REFERENCES chats(id),
        sender_id TEXT NOT NULL REFERENCES users(id),
        text TEXT,
        attachment_url TEXT,
        attachment_type TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_messages_chat ON messages(chat_id, created_at);
      CREATE TABLE IF NOT EXISTS wallets (
        user_id TEXT PRIMARY KEY REFERENCES users(id),
        balance REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS wallet_tx (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        kind TEXT NOT NULL,
        amount REAL NOT NULL,
        balance REAL NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_wallet_tx ON wallet_tx(user_id, created_at);
      CREATE TABLE IF NOT EXISTS calls (
        id TEXT PRIMARY KEY,
        caller_id TEXT NOT NULL REFERENCES users(id),
        callee_id TEXT NOT NULL REFERENCES users(id),
        video INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'ringing',
        created_at INTEGER NOT NULL,
        ended_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_calls_callee ON calls(callee_id, created_at);
      CREATE TABLE IF NOT EXISTS refresh_sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id),
        family_id TEXT NOT NULL,
        token_hash TEXT UNIQUE NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER,
        replaced_by TEXT,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_refresh_user ON refresh_sessions(user_id, created_at);
      CREATE INDEX IF NOT EXISTS idx_refresh_family ON refresh_sessions(family_id);
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        platform TEXT NOT NULL,
        push_token TEXT UNIQUE NOT NULL,
        device_name TEXT,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_devices_user ON devices(user_id, updated_at);
      CREATE TABLE IF NOT EXISTS media (
        id TEXT PRIMARY KEY,
        owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        object_key TEXT UNIQUE NOT NULL,
        mime TEXT NOT NULL,
        size INTEGER NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_media_owner ON media(owner_id, created_at);
      CREATE TABLE IF NOT EXISTS blocks (
        blocker_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        blocked_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (blocker_id, blocked_id), CHECK (blocker_id <> blocked_id)
      );
      CREATE TABLE IF NOT EXISTS reports (
        id TEXT PRIMARY KEY,
        reporter_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        reported_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category TEXT NOT NULL, details TEXT, status TEXT NOT NULL DEFAULT 'open',
        created_at INTEGER NOT NULL, reviewed_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status, created_at);
    `);

    // Safe in-place migration for databases created by v3.0.0.
    const messageColumns = this.db.prepare('PRAGMA table_info(messages)').all();
    if (!messageColumns.some(column => column.name === 'client_message_id')) {
      this.db.exec('ALTER TABLE messages ADD COLUMN client_message_id TEXT');
    }
    this.db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_client_id
      ON messages(chat_id, sender_id, client_message_id)
      WHERE client_message_id IS NOT NULL
    `);
    const memberColumns = this.db.prepare('PRAGMA table_info(chat_members)').all();
    if (!memberColumns.some(column => column.name === 'role')) {
      this.db.exec("ALTER TABLE chat_members ADD COLUMN role TEXT NOT NULL DEFAULT 'member'");
    }
  }

  // ---------- users ----------
  insertUser({ id, phone, username, display_name, password, avatar_url, bio, verified }) {
    this.db.prepare('INSERT INTO users (id, phone, username, display_name, password, avatar_url, bio, verified, last_seen, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
      .run(id, phone, username, display_name, password, avatar_url, bio, verified ? 1 : 0, now(), now());
  }
  userById(id) { return this.db.prepare('SELECT * FROM users WHERE id=?').get(id); }
  userByPhone(phone) { return this.db.prepare('SELECT * FROM users WHERE phone=?').get(String(phone)); }
  userByUsername(username) { return this.db.prepare('SELECT * FROM users WHERE username=?').get(String(username)); }
  updateUser(id, { display_name, bio, avatar_url }) {
    this.db.prepare('UPDATE users SET display_name=?, bio=?, avatar_url=? WHERE id=?')
      .run(display_name, bio, avatar_url, id);
  }
  setLastSeen(userId) { this.db.prepare('UPDATE users SET last_seen=? WHERE id=?').run(now(), userId); }
  searchUsers(userId, query, limit=30) {
    return this.db.prepare(`SELECT id,username,display_name,avatar_url,verified FROM users u
      WHERE u.id<>? AND (u.username LIKE ? OR u.display_name LIKE ?)
      AND NOT EXISTS (SELECT 1 FROM blocks b WHERE (b.blocker_id=? AND b.blocked_id=u.id) OR (b.blocker_id=u.id AND b.blocked_id=?))
      ORDER BY u.verified DESC,u.display_name LIMIT ?`).all(userId,`%${query}%`,`%${query}%`,userId,userId,limit);
  }

  // ---------- contacts ----------
  addContact(aId, bId) {
    this.db.prepare('INSERT OR IGNORE INTO contacts (a_id, b_id, created_at) VALUES (?,?,?)').run(aId, bId, now());
    this.db.prepare('INSERT OR IGNORE INTO contacts (a_id, b_id, created_at) VALUES (?,?,?)').run(bId, aId, now());
  }
  removeContact(aId, bId) {
    this.db.prepare('DELETE FROM contacts WHERE a_id=? AND b_id=?').run(aId, bId);
    this.db.prepare('DELETE FROM contacts WHERE a_id=? AND b_id=?').run(bId, aId);
  }
  contactsFor(userId) {
    const r = this.db.prepare(`
      SELECT u.id, u.username, u.display_name, u.avatar_url, u.verified, u.last_seen
      FROM contacts c JOIN users u ON u.id = c.b_id
      WHERE c.a_id = ? ORDER BY u.display_name`).all(userId);
    return r.map(x => ({
      id: x.id, username: x.username, display_name: x.display_name,
      avatar_url: x.avatar_url, verified: !!x.verified,
      online: now() - (x.last_seen || 0) < 70000
    }));
  }
  friendRequestByPair(aId, bId) {
    return this.db.prepare(`SELECT * FROM friend_requests WHERE status='pending'
      AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?)) LIMIT 1`).get(aId,bId,bId,aId);
  }
  createFriendRequest(fromId, toId) {
    if (this.db.prepare('SELECT 1 FROM contacts WHERE a_id=? AND b_id=?').get(fromId,toId)) return { state:'already_contact' };
    const existing = this.friendRequestByPair(fromId,toId);
    if (existing) return { state:'pending', request:existing };
    const row={id:newId(),from_id:fromId,to_id:toId,status:'pending',created_at:now(),updated_at:now()};
    this.db.prepare('INSERT INTO friend_requests (id,from_id,to_id,status,created_at,updated_at) VALUES (?,?,?,?,?,?)')
      .run(row.id,row.from_id,row.to_id,row.status,row.created_at,row.updated_at);
    return { state:'created', request:row };
  }
  friendRequestsFor(userId) {
    return this.db.prepare(`SELECT r.*, u.username, u.display_name, u.avatar_url, u.verified,
      CASE WHEN r.to_id=? THEN 'incoming' ELSE 'outgoing' END direction
      FROM friend_requests r JOIN users u ON u.id=CASE WHEN r.to_id=? THEN r.from_id ELSE r.to_id END
      WHERE (r.from_id=? OR r.to_id=?) AND r.status='pending' ORDER BY r.created_at DESC`)
      .all(userId,userId,userId,userId);
  }
  acceptFriendRequest(id, userId) {
    const tx=this.db.transaction(()=>{const row=this.db.prepare("SELECT * FROM friend_requests WHERE id=? AND to_id=? AND status='pending'").get(id,userId);
      if(!row)return null; this.db.prepare("UPDATE friend_requests SET status='accepted',updated_at=? WHERE id=?").run(now(),id);
      this.addContact(row.from_id,row.to_id); return row;}); return tx();
  }
  rejectFriendRequest(id, userId) {
    const result=this.db.prepare("UPDATE friend_requests SET status='rejected',updated_at=? WHERE id=? AND to_id=? AND status='pending'").run(now(),id,userId);
    return result.changes===1;
  }

  // ---------- trust, safety and account rights ----------
  isBlockedEither(aId, bId) {
    return !!this.db.prepare(`SELECT 1 FROM blocks WHERE
      (blocker_id=? AND blocked_id=?) OR (blocker_id=? AND blocked_id=?) LIMIT 1`)
      .get(aId,bId,bId,aId);
  }
  blockUser(blockerId, blockedId) {
    const tx=this.db.transaction(()=>{
      this.db.prepare('INSERT OR IGNORE INTO blocks (blocker_id,blocked_id,created_at) VALUES (?,?,?)')
        .run(blockerId,blockedId,now());
      this.db.prepare('DELETE FROM contacts WHERE (a_id=? AND b_id=?) OR (a_id=? AND b_id=?)')
        .run(blockerId,blockedId,blockedId,blockerId);
      this.db.prepare("UPDATE friend_requests SET status='rejected',updated_at=? WHERE status='pending' AND ((from_id=? AND to_id=?) OR (from_id=? AND to_id=?))")
        .run(now(),blockerId,blockedId,blockedId,blockerId);
    }); tx();
  }
  unblockUser(blockerId, blockedId) {
    return this.db.prepare('DELETE FROM blocks WHERE blocker_id=? AND blocked_id=?').run(blockerId,blockedId).changes===1;
  }
  blockedUsersFor(userId) {
    return this.db.prepare(`SELECT u.id,u.username,u.display_name,u.avatar_url,b.created_at
      FROM blocks b JOIN users u ON u.id=b.blocked_id WHERE b.blocker_id=? ORDER BY b.created_at DESC`).all(userId);
  }
  createReport(reporterId, reportedId, category, details) {
    const row={id:newId(),reporter_id:reporterId,reported_id:reportedId,category,details,status:'open',created_at:now(),reviewed_at:null};
    this.db.prepare('INSERT INTO reports (id,reporter_id,reported_id,category,details,status,created_at) VALUES (?,?,?,?,?,?,?)')
      .run(row.id,row.reporter_id,row.reported_id,row.category,row.details,row.status,row.created_at);
    return row;
  }
  exportUserData(userId) {
    const user=this.userById(userId);
    const safeUser=user ? {id:user.id,phone:user.phone,username:user.username,display_name:user.display_name,
      avatar_url:user.avatar_url,bio:user.bio,verified:!!user.verified,created_at:user.created_at} : null;
    return { exported_at:now(), user:safeUser,
      contacts:this.contactsFor(userId), friend_requests:this.friendRequestsFor(userId),
      chats:this.chatsFor(userId),
      sent_messages:this.db.prepare('SELECT id,chat_id,text,attachment_url,attachment_type,created_at FROM messages WHERE sender_id=? ORDER BY created_at').all(userId),
      submitted_reports:this.db.prepare('SELECT id,reported_id,category,details,status,created_at,reviewed_at FROM reports WHERE reporter_id=? ORDER BY created_at').all(userId),
      blocked_users:this.blockedUsersFor(userId) };
  }
  deleteUserAccount(userId) {
    const tx=this.db.transaction(()=>{
      this.db.prepare('DELETE FROM reports WHERE reporter_id=? OR reported_id=?').run(userId,userId);
      this.db.prepare('DELETE FROM calls WHERE caller_id=? OR callee_id=?').run(userId,userId);
      this.db.prepare('DELETE FROM messages WHERE sender_id=?').run(userId);
      this.db.prepare('DELETE FROM contacts WHERE a_id=? OR b_id=?').run(userId,userId);
      this.db.prepare('DELETE FROM chat_members WHERE user_id=?').run(userId);
      this.db.prepare('DELETE FROM wallet_tx WHERE user_id=?').run(userId);
      this.db.prepare('DELETE FROM wallets WHERE user_id=?').run(userId);
      this.db.prepare('DELETE FROM refresh_sessions WHERE user_id=?').run(userId);
      this.db.prepare('DELETE FROM users WHERE id=?').run(userId);
      this.db.prepare('DELETE FROM chats WHERE id NOT IN (SELECT DISTINCT chat_id FROM chat_members)').run();
    }); tx();
  }

  // ---------- chats ----------
  chatById(id) { return this.db.prepare('SELECT * FROM chats WHERE id=?').get(id); }
  // Single-chat projection shaped identically to chatsFor() rows
  chatFor(userId, chatId) {
    const row = this.db.prepare(`
      SELECT c.id, c.type, c.title, c.created_at,
             m.last_read_at,
             (SELECT COUNT(*) FROM messages msg
                WHERE msg.chat_id = c.id
                  AND msg.created_at > m.last_read_at
                  AND msg.sender_id != ?) AS unread,
             (SELECT text FROM messages msg WHERE msg.chat_id=c.id
                ORDER BY msg.created_at DESC LIMIT 1) AS last_message,
             (SELECT created_at FROM messages msg WHERE msg.chat_id=c.id
                ORDER BY msg.created_at DESC LIMIT 1) AS last_message_at,
             (SELECT display_name FROM users u JOIN chat_members cm ON cm.user_id=u.id
                WHERE cm.chat_id=c.id AND cm.user_id != ? LIMIT 1) AS peer_name,
             (SELECT avatar_url FROM users u JOIN chat_members cm ON cm.user_id=u.id
                WHERE cm.chat_id=c.id AND cm.user_id != ? LIMIT 1) AS avatar_url,
             (SELECT id FROM users u JOIN chat_members cm ON cm.user_id=u.id
                WHERE cm.chat_id=c.id AND cm.user_id != ? LIMIT 1) AS peer_id
      FROM chats c
      JOIN chat_members m ON m.chat_id = c.id AND m.user_id = ?
      WHERE c.id = ?`).get(userId, userId, userId, userId, userId, chatId);
    if (!row) return null;
    return {
      id: row.id, type: row.type, title: row.title || row.peer_name || 'Chat',
      avatar_url: row.avatar_url, peer_id: row.peer_id,
      last_message: row.last_message, last_message_at: row.last_message_at,
      unread: row.unread, verified: false
    };
  }
  isMember(chatId, userId) {
    return !!this.db.prepare('SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=?').get(chatId, userId);
  }
  members(chatId) {
    return this.db.prepare('SELECT user_id FROM chat_members WHERE chat_id=?').all(chatId).map(r => r.user_id);
  }
  findOrCreateDm(a, b) {
    const row = this.db.prepare(`
      SELECT c.id FROM chats c
      JOIN chat_members m1 ON m1.chat_id=c.id AND m1.user_id=?
      JOIN chat_members m2 ON m2.chat_id=c.id AND m2.user_id=?
      WHERE c.type='dm' LIMIT 1`).get(a, b);
    if (row) return this.chatFor(a, row.id);
    const id = newId();
    this.db.prepare(`INSERT INTO chats (id, type, title, created_by, created_at) VALUES (?,?,?,?,?)`)
      .run(id, 'dm', null, a, now());
    this.db.prepare('INSERT INTO chat_members (chat_id, user_id, last_read_at) VALUES (?,?,?)').run(id, a, now());
    this.db.prepare('INSERT INTO chat_members (chat_id, user_id, last_read_at) VALUES (?,?,?)').run(id, b, 0);
    return this.chatFor(a, id);
  }
  createGroup(ownerId, title, memberIds) {
    const tx=this.db.transaction(()=>{const id=newId();
      this.db.prepare("INSERT INTO chats (id,type,title,created_by,created_at) VALUES (?,'group',?,?,?)").run(id,title,ownerId,now());
      this.db.prepare("INSERT INTO chat_members (chat_id,user_id,last_read_at,role) VALUES (?,?,?,'owner')").run(id,ownerId,now());
      const add=this.db.prepare("INSERT OR IGNORE INTO chat_members (chat_id,user_id,last_read_at,role) VALUES (?,?,0,'member')");
      for(const member of memberIds) add.run(id,member); return this.chatFor(ownerId,id);}); return tx();
  }
  groupDetails(chatId, userId) {
    if(!this.isMember(chatId,userId)) return null; const chat=this.chatById(chatId); if(!chat||chat.type!=='group')return null;
    return {...chat,members:this.db.prepare(`SELECT u.id,u.username,u.display_name,u.avatar_url,cm.role
      FROM chat_members cm JOIN users u ON u.id=cm.user_id WHERE cm.chat_id=? ORDER BY cm.role='owner' DESC,u.display_name`).all(chatId)};
  }
  isGroupOwner(chatId,userId) { return !!this.db.prepare("SELECT 1 FROM chat_members WHERE chat_id=? AND user_id=? AND role='owner'").get(chatId,userId); }
  addGroupMember(chatId,userId) { this.db.prepare("INSERT OR IGNORE INTO chat_members (chat_id,user_id,last_read_at,role) VALUES (?,?,0,'member')").run(chatId,userId); }
  removeGroupMember(chatId,userId) { this.db.prepare("DELETE FROM chat_members WHERE chat_id=? AND user_id=? AND role<>'owner'").run(chatId,userId); }
  updateGroupTitle(chatId,title) { this.db.prepare('UPDATE chats SET title=? WHERE id=?').run(title,chatId); }
  chatsFor(userId) {
    const rows = this.db.prepare(`
      SELECT c.id, c.type, c.title, c.created_at,
             m.last_read_at,
             (SELECT COUNT(*) FROM messages msg
                WHERE msg.chat_id = c.id
                  AND msg.created_at > m.last_read_at
                  AND msg.sender_id != ?) AS unread,
             (SELECT text FROM messages msg WHERE msg.chat_id=c.id
                ORDER BY msg.created_at DESC LIMIT 1) AS last_message,
             (SELECT created_at FROM messages msg WHERE msg.chat_id=c.id
                ORDER BY msg.created_at DESC LIMIT 1) AS last_message_at,
             (SELECT display_name FROM users u JOIN chat_members cm ON cm.user_id=u.id
                WHERE cm.chat_id=c.id AND cm.user_id != ? LIMIT 1) AS peer_name,
             (SELECT avatar_url FROM users u JOIN chat_members cm ON cm.user_id=u.id
                WHERE cm.chat_id=c.id AND cm.user_id != ? LIMIT 1) AS avatar_url,
             (SELECT id FROM users u JOIN chat_members cm ON cm.user_id=u.id
                WHERE cm.chat_id=c.id AND cm.user_id != ? LIMIT 1) AS peer_id
      FROM chats c
      JOIN chat_members m ON m.chat_id = c.id AND m.user_id = ?
      ORDER BY COALESCE(last_message_at, c.created_at) DESC`).all(userId, userId, userId, userId, userId);
    return rows.map(r => ({
      id: r.id, type: r.type, title: r.title || r.peer_name || 'Chat',
      avatar_url: r.avatar_url, peer_id: r.peer_id,
      last_message: r.last_message, last_message_at: r.last_message_at,
      unread: r.unread, verified: false
    }));
  }
  messages(chatId, before, limit) {
    const rows = this.db.prepare(`
      SELECT m.*, u.display_name AS sender_name
      FROM messages m JOIN users u ON u.id = m.sender_id
      WHERE m.chat_id = ? AND m.created_at <= ?
      ORDER BY m.created_at DESC LIMIT ?`).all(chatId, before, limit);
    return rows.reverse().map(r => ({
      id: r.id, chat_id: r.chat_id, sender_id: r.sender_id,
      sender_name: r.sender_name, text: r.text,
      attachment_url: r.attachment_url, attachment_type: r.attachment_type,
      client_message_id: r.client_message_id,
      created_at: r.created_at
    }));
  }
  insertMessage(chatId, senderId, text, attachmentUrl, attachmentType, clientMessageId) {
    const normalizedClientId = clientMessageId ? String(clientMessageId).slice(0, 100) : null;
    if (normalizedClientId) {
      const existing = this.db.prepare(
        'SELECT * FROM messages WHERE chat_id=? AND sender_id=? AND client_message_id=?'
      ).get(chatId, senderId, normalizedClientId);
      if (existing) return { message: existing, inserted: false };
    }
    const id = newId();
    const t = now();
    try {
      this.db.prepare(`INSERT INTO messages
        (id, chat_id, sender_id, text, attachment_url, attachment_type, client_message_id, created_at)
        VALUES (?,?,?,?,?,?,?,?)`)
        .run(id, chatId, senderId, text, attachmentUrl, attachmentType, normalizedClientId, t);
      return {
        message: {
          id, chat_id: chatId, sender_id: senderId, text,
          attachment_url: attachmentUrl, attachment_type: attachmentType,
          client_message_id: normalizedClientId, created_at: t
        },
        inserted: true
      };
    } catch (error) {
      if (normalizedClientId && String(error.code || '').startsWith('SQLITE_CONSTRAINT')) {
        const existing = this.db.prepare(
          'SELECT * FROM messages WHERE chat_id=? AND sender_id=? AND client_message_id=?'
        ).get(chatId, senderId, normalizedClientId);
        if (existing) return { message: existing, inserted: false };
      }
      throw error;
    }
  }
  searchMessages(userId, query, limit=50) {
    return this.db.prepare(`SELECT m.id,m.chat_id,m.sender_id,m.text,m.attachment_type,m.created_at,c.type,c.title
      FROM messages m JOIN chat_members cm ON cm.chat_id=m.chat_id AND cm.user_id=? JOIN chats c ON c.id=m.chat_id
      WHERE m.text LIKE ? ORDER BY m.created_at DESC LIMIT ?`).all(userId,`%${query}%`,limit);
  }
  deleteOwnMessage(chatId,messageId,userId) {
    return this.db.prepare('DELETE FROM messages WHERE id=? AND chat_id=? AND sender_id=?').run(messageId,chatId,userId).changes===1;
  }
  markRead(chatId, userId) {
    this.db.prepare('UPDATE chat_members SET last_read_at=? WHERE chat_id=? AND user_id=?').run(now(), chatId, userId);
  }
  deleteChat(chatId, userId) {
    if (!this.isMember(chatId, userId)) return;
    this.db.prepare('DELETE FROM chat_members WHERE chat_id=?').run(chatId);
    this.db.prepare('DELETE FROM messages WHERE chat_id=?').run(chatId);
    this.db.prepare('DELETE FROM chats WHERE id=?').run(chatId);
  }

  // ---------- wallet ----------
  walletCreate(userId, initialBalance) {
    this.db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance, created_at) VALUES (?,?,?)')
      .run(userId, initialBalance || 0, now());
    if (initialBalance) {
      this.db.prepare('INSERT INTO wallet_tx (id, user_id, kind, amount, balance, created_at) VALUES (?,?,?,?,?,?)')
        .run(newId(), userId, 'bonus', initialBalance, initialBalance, now());
    }
  }
  walletInfo(userId) {
    this.db.prepare('INSERT OR IGNORE INTO wallets (user_id, balance, created_at) VALUES (?,?,?)')
      .run(userId, 0, now());
    const r = this.db.prepare('SELECT balance FROM wallets WHERE user_id=?').get(userId);
    return { balance: r ? r.balance : 0, symbol: 'GAGA', rate_usd: 0.01 };
  }
  walletHistory(userId) {
    return this.db.prepare('SELECT id, kind, amount, balance, created_at FROM wallet_tx WHERE user_id=? ORDER BY created_at DESC LIMIT 100').all(userId);
  }
  walletTx(userId, kind, amount) {
    const txn = this.db.transaction(() => {
      const info = this.walletInfo(userId);
      const balance = Math.round((info.balance + amount) * 100) / 100;
      if (balance < 0) throw new Error('insufficient_funds');
      this.db.prepare('UPDATE wallets SET balance=? WHERE user_id=?').run(balance, userId);
      const row = { id: newId(), user_id: userId, kind, amount, balance, created_at: now() };
      this.db.prepare('INSERT INTO wallet_tx (id, user_id, kind, amount, balance, created_at) VALUES (?,?,?,?,?,?)')
        .run(row.id, row.user_id, row.kind, row.amount, row.balance, row.created_at);
      return { balance, row };
    });
    return txn();
  }
  walletTransfer(fromId, toId, amount) {
    const txn = this.db.transaction(() => {
      const from = this.walletInfo(fromId);
      if (from.balance < amount) throw new Error('insufficient_funds');
      const fromBalance = Math.round((from.balance - amount) * 100) / 100;
      const to = this.walletInfo(toId);
      const toBalance = Math.round((to.balance + amount) * 100) / 100;
      this.db.prepare('UPDATE wallets SET balance=? WHERE user_id=?').run(fromBalance, fromId);
      this.db.prepare('UPDATE wallets SET balance=? WHERE user_id=?').run(toBalance, toId);
      const t = now();
      const fromRow = { id: newId(), user_id: fromId, kind: 'send', amount: -amount, balance: fromBalance, created_at: t };
      const toRow = { id: newId(), user_id: toId, kind: 'receive', amount, balance: toBalance, created_at: t };
      this.db.prepare('INSERT INTO wallet_tx (id, user_id, kind, amount, balance, created_at) VALUES (?,?,?,?,?,?)')
        .run(fromRow.id, fromRow.user_id, fromRow.kind, fromRow.amount, fromRow.balance, t);
      this.db.prepare('INSERT INTO wallet_tx (id, user_id, kind, amount, balance, created_at) VALUES (?,?,?,?,?,?)')
        .run(toRow.id, toRow.user_id, toRow.kind, toRow.amount, toRow.balance, t);
      return { from_balance: fromBalance, to_balance: toBalance, row: fromRow };
    });
    return txn();
  }

  // ---------- refresh sessions ----------
  createRefreshSession({ id, userId, familyId, tokenHash, expiresAt }) {
    this.db.prepare(`INSERT INTO refresh_sessions
      (id, user_id, family_id, token_hash, expires_at, revoked_at, replaced_by, created_at)
      VALUES (?,?,?,?,?,NULL,NULL,?)`)
      .run(id, userId, familyId, tokenHash, expiresAt, now());
  }
  refreshSessionByHash(tokenHash) {
    return this.db.prepare('SELECT * FROM refresh_sessions WHERE token_hash=?').get(tokenHash);
  }
  sessionById(id) {
    return this.db.prepare('SELECT * FROM refresh_sessions WHERE id=?').get(id);
  }
  isSessionActive(id, userId) {
    const row = this.db.prepare(`SELECT 1 FROM refresh_sessions
      WHERE id=? AND user_id=? AND revoked_at IS NULL AND expires_at>?`).get(id, userId, now());
    return !!row;
  }
  rotateRefreshSession(oldId, replacement) {
    const tx = this.db.transaction(() => {
      const old = this.sessionById(oldId);
      if (!old || old.revoked_at || old.expires_at <= now()) return false;
      const changed = this.db.prepare(`UPDATE refresh_sessions
        SET revoked_at=?, replaced_by=? WHERE id=? AND revoked_at IS NULL`)
        .run(now(), replacement.id, oldId);
      if (changed.changes !== 1) return false;
      this.createRefreshSession(replacement);
      return true;
    });
    return tx();
  }
  revokeSessionFamily(familyId) {
    this.db.prepare(`UPDATE refresh_sessions SET revoked_at=COALESCE(revoked_at, ?)
      WHERE family_id=?`).run(now(), familyId);
  }
  revokeFamilyBySession(id, userId) {
    const session = this.db.prepare(
      'SELECT family_id FROM refresh_sessions WHERE id=? AND user_id=?'
    ).get(id, userId);
    if (session) this.revokeSessionFamily(session.family_id);
  }
  revokeByRefreshHash(tokenHash, userId) {
    const session = this.db.prepare(
      'SELECT family_id FROM refresh_sessions WHERE token_hash=? AND user_id=?'
    ).get(tokenHash, userId);
    if (session) this.revokeSessionFamily(session.family_id);
  }

  // ---------- push devices ----------
  upsertDevice(userId, { platform, pushToken, deviceName }) {
    const existing = this.db.prepare('SELECT id FROM devices WHERE push_token=?').get(pushToken);
    const id = existing ? existing.id : newId();
    this.db.prepare(`INSERT INTO devices (id, user_id, platform, push_token, device_name, updated_at)
      VALUES (?,?,?,?,?,?)
      ON CONFLICT(push_token) DO UPDATE SET
        user_id=excluded.user_id, platform=excluded.platform,
        device_name=excluded.device_name, updated_at=excluded.updated_at`)
      .run(id, userId, platform, pushToken, deviceName, now());
    return this.db.prepare('SELECT id, platform, device_name, updated_at FROM devices WHERE id=?').get(id);
  }
  removeDevice(userId, pushToken) {
    return this.db.prepare('DELETE FROM devices WHERE user_id=? AND push_token=?').run(userId, pushToken).changes > 0;
  }
  deviceTokensFor(userId) {
    return this.db.prepare('SELECT push_token FROM devices WHERE user_id=? ORDER BY updated_at DESC').all(userId)
      .map(row => row.push_token);
  }

  // ---------- private media ----------
  insertMedia({ id, ownerId, objectKey, mime, size }) {
    this.db.prepare(`INSERT INTO media (id, owner_id, object_key, mime, size, status, created_at)
      VALUES (?,?,?,?,?,'pending',?)`).run(id, ownerId, objectKey, mime, size, now());
  }
  mediaById(id) { return this.db.prepare('SELECT * FROM media WHERE id=?').get(id); }
  canReadMedia(id, user, canonicalUrl) {
    return !!this.db.prepare(`SELECT 1 FROM media m WHERE m.id=? AND m.status='ready'
      AND (m.owner_id=? OR EXISTS (SELECT 1 FROM messages msg
        JOIN chat_members cm ON cm.chat_id=msg.chat_id AND cm.user_id=?
        WHERE msg.attachment_url=?) OR EXISTS (SELECT 1 FROM users u WHERE u.avatar_url=?)) LIMIT 1`)
      .get(id, user, user, canonicalUrl, canonicalUrl);
  }
  markMediaReady(id, ownerId) {
    return this.db.prepare("UPDATE media SET status='ready' WHERE id=? AND owner_id=? AND status='pending'")
      .run(id, ownerId).changes === 1;
  }

  // ---------- calls ----------
  insertCall(callerId, calleeId, video) {
    const id = newId();
    this.db.prepare('INSERT INTO calls (id, caller_id, callee_id, video, status, created_at) VALUES (?,?,?,?,?,?)')
      .run(id, callerId, calleeId, video ? 1 : 0, 'ringing', now());
    return this.callById(id);
  }
  callById(id) { return this.db.prepare('SELECT * FROM calls WHERE id=?').get(id); }
  endCall(id) {
    this.db.prepare("UPDATE calls SET status='ended', ended_at=? WHERE id=?").run(now(), id);
  }
  callsFor(userId, limit=100) {
    return this.db.prepare(`SELECT c.*,CASE WHEN c.caller_id=? THEN c.callee_id ELSE c.caller_id END peer_id,
      u.display_name peer_name,u.avatar_url peer_avatar FROM calls c JOIN users u ON u.id=CASE WHEN c.caller_id=? THEN c.callee_id ELSE c.caller_id END
      WHERE c.caller_id=? OR c.callee_id=? ORDER BY c.created_at DESC LIMIT ?`).all(userId,userId,userId,userId,limit);
  }
}

module.exports = { DB, scryptHash, scryptVerify, newId, now };

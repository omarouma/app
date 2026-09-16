CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(48) PRIMARY KEY, phone VARCHAR(20) NOT NULL UNIQUE,
  username VARCHAR(24) NOT NULL UNIQUE, display_name VARCHAR(64) NOT NULL,
  password VARCHAR(255) NOT NULL, avatar_url VARCHAR(512), bio VARCHAR(280),
  verified BOOLEAN NOT NULL DEFAULT FALSE, last_seen BIGINT NOT NULL DEFAULT 0,
  created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS contacts (
  a_id VARCHAR(48) NOT NULL, b_id VARCHAR(48) NOT NULL, created_at BIGINT NOT NULL,
  PRIMARY KEY(a_id,b_id), FOREIGN KEY(a_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(b_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS friend_requests (
  id VARCHAR(48) PRIMARY KEY, from_id VARCHAR(48) NOT NULL, to_id VARCHAR(48) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending', created_at BIGINT NOT NULL, updated_at BIGINT NOT NULL,
  KEY idx_friend_request_pair(from_id,to_id,status),
  KEY idx_friend_requests_incoming(to_id,status,created_at),
  FOREIGN KEY(from_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(to_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (from_id <> to_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS chats (
  id VARCHAR(48) PRIMARY KEY, type VARCHAR(16) NOT NULL DEFAULT 'dm', title VARCHAR(128),
  created_by VARCHAR(48), created_at BIGINT NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS chat_members (
  chat_id VARCHAR(48) NOT NULL, user_id VARCHAR(48) NOT NULL, last_read_at BIGINT NOT NULL DEFAULT 0,
  role VARCHAR(16) NOT NULL DEFAULT 'member',
  PRIMARY KEY(chat_id,user_id), FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR(48) PRIMARY KEY, chat_id VARCHAR(48) NOT NULL, sender_id VARCHAR(48) NOT NULL,
  text TEXT, attachment_url VARCHAR(1024), attachment_type VARCHAR(64),
  client_message_id VARCHAR(128), created_at BIGINT NOT NULL,
  UNIQUE KEY uq_message_client(chat_id,sender_id,client_message_id),
  KEY idx_messages_chat(chat_id,created_at),
  FOREIGN KEY(chat_id) REFERENCES chats(id) ON DELETE CASCADE,
  FOREIGN KEY(sender_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS refresh_sessions (
  id VARCHAR(48) PRIMARY KEY, user_id VARCHAR(48) NOT NULL, family_id VARCHAR(48) NOT NULL,
  token_hash CHAR(64) NOT NULL UNIQUE, expires_at BIGINT NOT NULL, revoked_at BIGINT,
  replaced_by VARCHAR(48), created_at BIGINT NOT NULL,
  KEY idx_refresh_user(user_id,created_at), KEY idx_refresh_family(family_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS devices (
  id VARCHAR(48) PRIMARY KEY, user_id VARCHAR(48) NOT NULL, platform VARCHAR(16) NOT NULL,
  push_token VARCHAR(4096) NOT NULL, push_token_hash CHAR(64) NOT NULL UNIQUE,
  device_name VARCHAR(120), updated_at BIGINT NOT NULL, KEY idx_devices_user(user_id,updated_at),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS calls (
  id VARCHAR(48) PRIMARY KEY, caller_id VARCHAR(48) NOT NULL, callee_id VARCHAR(48) NOT NULL,
  video BOOLEAN NOT NULL DEFAULT FALSE, status VARCHAR(20) NOT NULL DEFAULT 'ringing',
  created_at BIGINT NOT NULL, ended_at BIGINT, KEY idx_calls_callee(callee_id,created_at),
  FOREIGN KEY(caller_id) REFERENCES users(id), FOREIGN KEY(callee_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS media (
  id VARCHAR(48) PRIMARY KEY, owner_id VARCHAR(48) NOT NULL,
  object_key VARCHAR(512) NOT NULL UNIQUE, mime VARCHAR(64) NOT NULL,
  size BIGINT NOT NULL, status VARCHAR(16) NOT NULL DEFAULT 'pending', created_at BIGINT NOT NULL,
  KEY idx_media_owner(owner_id,created_at),
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS blocks (
  blocker_id VARCHAR(48) NOT NULL, blocked_id VARCHAR(48) NOT NULL, created_at BIGINT NOT NULL,
  PRIMARY KEY(blocker_id,blocked_id),
  FOREIGN KEY(blocker_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(blocked_id) REFERENCES users(id) ON DELETE CASCADE,
  CHECK (blocker_id <> blocked_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS reports (
  id VARCHAR(48) PRIMARY KEY, reporter_id VARCHAR(48) NOT NULL, reported_id VARCHAR(48) NOT NULL,
  category VARCHAR(32) NOT NULL, details VARCHAR(1000), status VARCHAR(16) NOT NULL DEFAULT 'open',
  created_at BIGINT NOT NULL, reviewed_at BIGINT, KEY idx_reports_status(status,created_at),
  FOREIGN KEY(reporter_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(reported_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

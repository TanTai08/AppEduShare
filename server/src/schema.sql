PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS users (
 id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
 password_hash TEXT NOT NULL, school TEXT NOT NULL, area TEXT NOT NULL,
 role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS sessions (
 token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS listings (
 id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 description TEXT NOT NULL, subject TEXT NOT NULL, school TEXT NOT NULL, area TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('sell','exchange','free')),
 price INTEGER NOT NULL DEFAULT 0 CHECK(price>=0), condition TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','reserved','completed','hidden')),
 moderated INTEGER NOT NULL DEFAULT 0 CHECK(moderated IN (0,1)),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS favorites (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 listing_id TEXT NOT NULL REFERENCES listings(id) ON DELETE CASCADE,
 PRIMARY KEY(user_id,listing_id)
);
CREATE TABLE IF NOT EXISTS transactions (
 id TEXT PRIMARY KEY, listing_id TEXT NOT NULL REFERENCES listings(id),
 buyer_id TEXT NOT NULL REFERENCES users(id), seller_id TEXT NOT NULL REFERENCES users(id),
 offered_listing_id TEXT REFERENCES listings(id), note TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','completed','cancelled')),
 buyer_confirmed INTEGER NOT NULL DEFAULT 0, seller_confirmed INTEGER NOT NULL DEFAULT 0,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 CHECK(buyer_id<>seller_id), CHECK(offered_listing_id IS NULL OR offered_listing_id<>listing_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS unique_open_request ON transactions(listing_id,buyer_id) WHERE status IN ('pending','accepted');
CREATE INDEX IF NOT EXISTS listings_location ON listings(status,area,school);
CREATE INDEX IF NOT EXISTS tx_buyer ON transactions(buyer_id);
CREATE INDEX IF NOT EXISTS tx_seller ON transactions(seller_id);
CREATE TABLE IF NOT EXISTS messages (
 id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL REFERENCES transactions(id),
 sender_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS messages_conversation ON messages(transaction_id,created_at);
CREATE TABLE IF NOT EXISTS reviews (
 id TEXT PRIMARY KEY, transaction_id TEXT NOT NULL REFERENCES transactions(id),
 author_id TEXT NOT NULL REFERENCES users(id), target_id TEXT NOT NULL REFERENCES users(id),
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
 UNIQUE(transaction_id,author_id)
);
CREATE TABLE IF NOT EXISTS reports (
 id TEXT PRIMARY KEY, reporter_id TEXT NOT NULL REFERENCES users(id),
 listing_id TEXT NOT NULL REFERENCES listings(id), reason TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE TABLE IF NOT EXISTS notifications (
 id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 transaction_id TEXT REFERENCES transactions(id), read_at TEXT,
 created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

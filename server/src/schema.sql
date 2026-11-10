-- PostgreSQL 17+. Applied once by versioned migrations (src/migrate.js).
CREATE TABLE users (
 id UUID PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL,
 password_hash TEXT NOT NULL, school TEXT NOT NULL, area TEXT NOT NULL,
 bio TEXT NOT NULL DEFAULT '', role TEXT NOT NULL DEFAULT 'student' CHECK(role IN ('student','admin')),
 points INTEGER NOT NULL DEFAULT 0 CHECK(points >= 0), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX users_email_ci ON users(lower(email));
CREATE TABLE sessions (
 token_hash TEXT PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 expires_at BIGINT NOT NULL
);
CREATE TABLE listings (
 id UUID PRIMARY KEY, owner_id UUID NOT NULL REFERENCES users(id), title TEXT NOT NULL,
 description TEXT NOT NULL, subject TEXT NOT NULL, school TEXT NOT NULL, area TEXT NOT NULL,
 kind TEXT NOT NULL CHECK(kind IN ('sell','exchange','free')), price INTEGER NOT NULL CHECK(price >= 0),
 point_cost INTEGER NOT NULL DEFAULT 0 CHECK(point_cost >= 0), condition TEXT NOT NULL,
 pickup_label TEXT NOT NULL DEFAULT '', latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','reserved','completed','hidden')),
 moderated BOOLEAN NOT NULL DEFAULT false, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 CHECK((latitude IS NULL AND longitude IS NULL) OR (latitude IS NOT NULL AND longitude IS NOT NULL AND latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
 CHECK((kind='sell' AND price>=1000 AND point_cost=0) OR (kind='exchange' AND price=0 AND point_cost=0) OR (kind='free' AND price=0))
);
CREATE INDEX listings_location ON listings(status,area,school);
CREATE TABLE favorites (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 listing_id UUID NOT NULL REFERENCES listings(id), PRIMARY KEY(user_id,listing_id)
);
CREATE TABLE conversations (
 id UUID PRIMARY KEY, listing_id UUID NOT NULL REFERENCES listings(id),
 buyer_id UUID NOT NULL REFERENCES users(id), seller_id UUID NOT NULL REFERENCES users(id),
 buyer_read_at TIMESTAMPTZ NOT NULL DEFAULT now(), seller_read_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(listing_id,buyer_id), CHECK(buyer_id<>seller_id)
);
CREATE TABLE transactions (
 id UUID PRIMARY KEY, listing_id UUID NOT NULL REFERENCES listings(id), buyer_id UUID NOT NULL REFERENCES users(id),
 seller_id UUID NOT NULL REFERENCES users(id), offered_listing_id UUID REFERENCES listings(id),
 conversation_id UUID NOT NULL REFERENCES conversations(id), kind TEXT NOT NULL CHECK(kind IN ('sell','exchange','free')),
 price INTEGER NOT NULL CHECK(price>=0), point_cost INTEGER NOT NULL CHECK(point_cost>=0), points_spent INTEGER NOT NULL DEFAULT 0 CHECK(points_spent>=0),
 note TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','accepted','completed','cancelled')),
 buyer_confirmed BOOLEAN NOT NULL DEFAULT false, seller_confirmed BOOLEAN NOT NULL DEFAULT false,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), completed_at TIMESTAMPTZ,
 CHECK(buyer_id<>seller_id), CHECK(offered_listing_id IS NULL OR offered_listing_id<>listing_id)
);
CREATE UNIQUE INDEX unique_open_request ON transactions(listing_id,buyer_id) WHERE status IN ('pending','accepted');
CREATE INDEX tx_buyer ON transactions(buyer_id);
CREATE INDEX tx_seller ON transactions(seller_id);
CREATE TABLE messages (
 id UUID PRIMARY KEY, seq BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
 conversation_id UUID NOT NULL REFERENCES conversations(id), sender_id UUID NOT NULL REFERENCES users(id),
 body TEXT NOT NULL CHECK(length(body) BETWEEN 1 AND 2000), client_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(sender_id,client_id)
);
CREATE INDEX messages_cursor ON messages(conversation_id,seq DESC);
CREATE TABLE reviews (
 id UUID PRIMARY KEY, transaction_id UUID NOT NULL REFERENCES transactions(id),
 author_id UUID NOT NULL REFERENCES users(id), target_id UUID NOT NULL REFERENCES users(id),
 rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now(), UNIQUE(transaction_id,author_id), CHECK(author_id<>target_id)
);
CREATE TABLE reports (
 id UUID PRIMARY KEY, reporter_id UUID NOT NULL REFERENCES users(id), listing_id UUID NOT NULL REFERENCES listings(id),
 reason TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE notifications (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), body TEXT NOT NULL,
 transaction_id UUID REFERENCES transactions(id), read_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE point_ledger (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), transaction_id UUID REFERENCES transactions(id),
 reason TEXT NOT NULL CHECK(reason IN ('earn','redeem','refund','demo')), delta INTEGER NOT NULL CHECK(delta<>0),
 balance_after INTEGER NOT NULL CHECK(balance_after>=0), note TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
 UNIQUE(user_id,transaction_id,reason)
);
CREATE UNIQUE INDEX demo_credit_once ON point_ledger(user_id) WHERE reason='demo';
CREATE INDEX point_history ON point_ledger(user_id,created_at DESC);
CREATE TABLE support_tickets (
 id UUID PRIMARY KEY, user_id UUID NOT NULL REFERENCES users(id), subject TEXT NOT NULL,
 status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE support_messages (
 id UUID PRIMARY KEY, ticket_id UUID NOT NULL REFERENCES support_tickets(id), sender_id UUID NOT NULL REFERENCES users(id),
 body TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE audit_logs (
 id UUID PRIMARY KEY, actor_id UUID NOT NULL REFERENCES users(id), action TEXT NOT NULL, target_id UUID NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

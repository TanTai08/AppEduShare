CREATE TABLE listing_images (
 id UUID PRIMARY KEY,
 owner_id UUID NOT NULL REFERENCES users(id),
 listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
 position INTEGER NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 4),
 mime_type TEXT NOT NULL DEFAULT 'image/jpeg' CHECK(mime_type='image/jpeg'),
 width INTEGER NOT NULL CHECK(width>0), height INTEGER NOT NULL CHECK(height>0),
 data BYTEA NOT NULL CHECK(octet_length(data)<=2097152),
 thumbnail BYTEA NOT NULL CHECK(octet_length(thumbnail)<=262144),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX listing_images_order ON listing_images(listing_id,position) WHERE listing_id IS NOT NULL;
CREATE INDEX listing_images_pending ON listing_images(owner_id,created_at) WHERE listing_id IS NULL;

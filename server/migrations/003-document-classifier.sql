ALTER TABLE listings ADD COLUMN category TEXT NOT NULL DEFAULT ''
 CHECK(category IN ('','cntt','toan','ngoai_ngu','kinh_te','ky_thuat','hoa_sinh','luat','xa_hoi'));
CREATE INDEX listings_category ON listings(category) WHERE status='active';
CREATE TABLE ai_classifications (
 id UUID PRIMARY KEY,
 user_id UUID NOT NULL REFERENCES users(id),
 listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
 input_hash TEXT NOT NULL,
 model_version TEXT NOT NULL,
 predicted_category TEXT CHECK(predicted_category IN ('cntt','toan','ngoai_ngu','kinh_te','ky_thuat','hoa_sinh','luat','xa_hoi')),
 suggestions JSONB NOT NULL,
 abstained BOOLEAN NOT NULL,
 confirmed_category TEXT CHECK(confirmed_category IN ('cntt','toan','ngoai_ngu','kinh_te','ky_thuat','hoa_sinh','luat','xa_hoi')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ai_classifications_owner ON ai_classifications(user_id,created_at);
COMMENT ON TABLE ai_classifications IS 'Model suggestions and user-confirmed labels; user feedback is not verified ground truth. Inputs stored only as SHA-256.';

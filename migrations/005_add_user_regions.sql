CREATE TABLE IF NOT EXISTS user_regions (
    user_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    region_id INT NOT NULL REFERENCES regions(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, region_id)
);
ALTER TABLE user_regions
DROP CONSTRAINT user_regions_region_id_fkey;

ALTER TABLE user_regions
ADD CONSTRAINT user_regions_region_id_fkey
FOREIGN KEY (region_id)
REFERENCES regions(id)
ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_user_regions_region_id
ON user_regions(region_id);


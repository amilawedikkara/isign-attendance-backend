ALTER TABLE verification_sessions
ADD COLUMN IF NOT EXISTS gps_latitude DECIMAL(10, 7),
ADD COLUMN IF NOT EXISTS gps_longitude DECIMAL(10, 7),
ADD COLUMN IF NOT EXISTS gps_accuracy DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS gps_distance_meters DECIMAL(10, 2),
ADD COLUMN IF NOT EXISTS gps_within_allowed_radius BOOLEAN;

ALTER TABLE verification_sessions
ADD COLUMN IF NOT EXISTS verification_status VARCHAR(20) DEFAULT 'PENDING'
CHECK (verification_status IN ('PENDING', 'VERIFIED', 'FAILED'));

ALTER TABLE verification_sessions
ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;


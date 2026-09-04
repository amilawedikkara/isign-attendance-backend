ALTER TABLE attendance_records
ADD COLUMN verification_status VARCHAR(20)
DEFAULT 'PENDING'
CHECK (verification_status IN ('VERIFIED', 'PENDING', 'FAILED'));

ALTER TABLE service_locations
ADD COLUMN latitude DECIMAL(10, 7),
ADD COLUMN longitude DECIMAL(10, 7);
ALTER TABLE verification_sessions
ADD COLUMN attendance_type VARCHAR(20)
CHECK (attendance_type IN ('CHECK_IN', 'CHECK_OUT'));

ALTER TABLE verification_sessions
ADD COLUMN roster_id INT REFERENCES rosters(id);

ALTER TABLE verification_sessions
ADD COLUMN required_steps TEXT[];

ALTER TABLE verification_sessions
ADD COLUMN session_status VARCHAR(20) DEFAULT 'ACTIVE'
CHECK (session_status IN ('ACTIVE', 'EXPIRED', 'COMPLETED', 'CANCELLED'));

ALTER TABLE verification_sessions
ADD COLUMN secret_code_attempts INT DEFAULT 0;

ALTER TABLE verification_sessions
ADD COLUMN max_secret_code_attempts INT DEFAULT 3;

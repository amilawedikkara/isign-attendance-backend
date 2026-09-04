CREATE TABLE IF NOT EXISTS attendance_corrections (
    id SERIAL PRIMARY KEY,

    attendance_record_id INT NOT NULL UNIQUE REFERENCES attendance_records(id),

    original_check_in_time TIMESTAMPTZ,
    original_check_out_time TIMESTAMPTZ,
    original_status_id INT,

    corrected_check_in_time TIMESTAMPTZ,
    corrected_check_out_time TIMESTAMPTZ,

    correction_reason TEXT NOT NULL,
    corrected_by_user_id INT NOT NULL REFERENCES users(id),

    created_at TIMESTAMPTZ DEFAULT NOW()
);
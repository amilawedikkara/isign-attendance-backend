CREATE TABLE IF NOT EXISTS employee_face_enrollments (
    id SERIAL PRIMARY KEY,

    employee_id INT NOT NULL UNIQUE REFERENCES employees(id) ON DELETE CASCADE,

    image_path TEXT NOT NULL,

    biometric_status VARCHAR(20) DEFAULT 'ACTIVE'
    CHECK (biometric_status IN ('ACTIVE', 'PENDING', 'FAILED')),

    quality_score DECIMAL(5, 2),

    enrolled_by INT REFERENCES users(id),

    enrolled_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
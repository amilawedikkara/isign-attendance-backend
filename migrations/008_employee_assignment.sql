CREATE TABLE IF NOT EXISTS employee_temporary_assignments (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    original_location_id INT NOT NULL REFERENCES service_locations(id),
    temporary_location_id INT NOT NULL REFERENCES service_locations(id),
    assignment_start_time TIMESTAMPTZ NOT NULL,
    assignment_end_time TIMESTAMPTZ NOT NULL,
    assignment_reason TEXT,
    assignment_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee_location_assignments (
    id SERIAL PRIMARY KEY,
    employee_id INT NOT NULL REFERENCES employees(id),
    previous_location_id INT REFERENCES service_locations(id),
    new_location_id INT NOT NULL REFERENCES service_locations(id),
    assignment_type VARCHAR(20) NOT NULL,
    assignment_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
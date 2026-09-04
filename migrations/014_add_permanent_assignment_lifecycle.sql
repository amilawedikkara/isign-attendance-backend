ALTER TABLE employee_location_assignments
ADD COLUMN assignment_start_time TIMESTAMPTZ,
ADD COLUMN assignment_end_time TIMESTAMPTZ,
ADD COLUMN assignment_active BOOLEAN DEFAULT TRUE;

-- update exisign rows
UPDATE employee_location_assignments
SET assignment_start_time = created_at
WHERE assignment_start_time IS NULL;

-- start time required
ALTER TABLE employee_location_assignments
ALTER COLUMN assignment_start_time SET NOT NULL;
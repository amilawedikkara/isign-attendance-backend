INSERT INTO designations (designation_name)
VALUES
('EMT'),
('Pilot')
ON CONFLICT (designation_name) DO NOTHING;
-- Roles
INSERT INTO roles (role_name) VALUES
('Administrator'),
('EME Area Manager'),
('Regional Manager')
ON CONFLICT (role_name) DO NOTHING;


-- Employee Statuses
INSERT INTO employee_statuses (status_name) VALUES
('Active'),
('Inactive')
ON CONFLICT (status_name) DO NOTHING;


-- Attendance Statuses
-- Present/Late/Absent are daily result statuses.
-- CHECKED_IN/CHECKED_OUT are temporary prototype duty record states.
-- See docs/prototype-known-issues.md before changing this.
INSERT INTO attendance_statuses (status_name) VALUES
('Present'),
('Late'),
('Absent'),
('CHECKED_IN'),
('CHECKED_OUT')
ON CONFLICT (status_name) DO NOTHING;


-- Roster Statuses
INSERT INTO roster_statuses (status_name) VALUES
('Scheduled'),
('Completed'),
('Cancelled')
ON CONFLICT (status_name) DO NOTHING;


-- Device Statuses
INSERT INTO device_statuses (status_name) VALUES
('Active'),
('Inactive'),
('Disabled')
ON CONFLICT (status_name) DO NOTHING;


-- Regions
INSERT INTO regions (region_name) VALUES
('Western Province'),
('Central Province'),
('Southern Province')
ON CONFLICT (region_name) DO NOTHING;


-- Designations
INSERT INTO designations (designation_name) VALUES
('Paramedic'),
('Driver'),
('Supervisor')
ON CONFLICT (designation_name) DO NOTHING;


-- Permissions
INSERT INTO permissions (permission_code, description) VALUES
('VIEW_ATTENDANCE', 'Can view attendance'),
('EDIT_ATTENDANCE', 'Can edit attendance'),
('MANAGE_EMPLOYEES', 'Can manage employees'),
('MANAGE_ROSTERS', 'Can manage rosters')
ON CONFLICT (permission_code) DO NOTHING;

-- I HAVE TO ADD FOLLOWING SEEDED DATA TO LIVE DATABASE

-- Service Locations
INSERT INTO service_locations
(location_name, region_id, location_code)
VALUES
('Colombo Branch', 1, 'COL001'),
('Kandy Branch', 2, 'KAN001'),
('Galle Branch', 3, 'GAL001')
ON CONFLICT (location_code) DO NOTHING;

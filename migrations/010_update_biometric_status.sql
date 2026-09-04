ALTER TABLE employees
DROP CONSTRAINT employees_biometric_status_check;

ALTER TABLE employees
ADD CONSTRAINT employees_biometric_status_check
CHECK (biometric_status IN ('PENDING', 'ACTIVE', 'FAILED'));
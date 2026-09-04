ALTER TABLE employees
ADD COLUMN secret_code_hash TEXT;

ALTER TABLE employees
RENAME COLUMN employee_code TO gid;

ALTER TABLE employees
ADD COLUMN employee_code VARCHAR(50);

ALTER TABLE employees
ADD CONSTRAINT employees_employee_code_unique UNIQUE (employee_code);

ALTER TABLE employees
ADD COLUMN gender VARCHAR(10)
CHECK (gender IN ('Male', 'Female', 'Other'));

ALTER TABLE employees
ADD COLUMN profile_image_url TEXT;


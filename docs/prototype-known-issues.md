# Prototype Known Issues and Temporary Fixes

## 1. Attendance status table mixes two meanings

### Current state

The `attendance_statuses` table currently contains daily attendance result statuses:

- Present

- Late

- Absent

The verified Duty In / Duty Out prototype backend also expects duty record state statuses:

- CHECKED_IN

- CHECKED_OUT

### Why this temporary fix exists

The verified check-in/check-out prototype stores `status_id` on `attendance_records`.

The backend currently looks for `CHECKED_IN` during verified check-in and `CHECKED_OUT` during verified check-out.

Without these rows, verified check-in/check-out can fail with:

- CHECKED_IN status not configured

- CHECKED_OUT status not configured

### Temporary prototype fix

Add the missing rows:

INSERT INTO attendance_statuses (status_name)

VALUES ('CHECKED_IN'), ('CHECKED_OUT')

ON CONFLICT (status_name) DO NOTHING;

### Risk

This mixes two different meanings in one table:

- Daily attendance result: Present, Late, Absent

- Duty record state: CHECKED_IN, CHECKED_OUT

### Future cleanup

Split these concepts later.

Recommended future design:

- attendance_record_statuses: CHECKED_IN, CHECKED_OUT

- attendance_day_statuses: Present, Late, Absent

Or add clearer fields to attendance_records:

- duty_status

- attendance_result

### Prototype acceptance

Acceptable for prototype only because it unblocks verified Duty In / Duty Out without a larger schema redesign.

This must be cleaned up before production hardening.

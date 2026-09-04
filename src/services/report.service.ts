import pool from "../config/db";

export const getAttendanceSummaryService = async (
  start_date: string,
  end_date: string,
  location_id?: string
) => {
  const values: any[] = [start_date, end_date];

  let locationFilter = "";

  if (location_id) {
    values.push(location_id);
    locationFilter = `AND r.location_id = $${values.length}`;
  }

  const result = await pool.query(
    `
    WITH roster_attendance AS (
      SELECT
        r.id AS roster_id,
        r.employee_id,
        r.location_id,
        r.shift_start_time,
        r.shift_end_time,
        MIN(ar.check_in_time) AS check_in_time
      FROM rosters r

      LEFT JOIN roster_statuses rs
        ON rs.id = r.status_id

      LEFT JOIN attendance_records ar
        ON ar.employee_id = r.employee_id
        AND ar.location_id = r.location_id
        AND ar.check_in_time <= r.shift_end_time
        AND (
          ar.check_out_time IS NULL
          OR ar.check_out_time >= r.shift_start_time
        )

      WHERE r.shift_start_time >= $1::date
        AND r.shift_start_time < ($2::date + INTERVAL '1 day')
        AND COALESCE(rs.status_name, '') <> 'Cancelled'
        ${locationFilter}

      GROUP BY
        r.id,
        r.employee_id,
        r.location_id,
        r.shift_start_time,
        r.shift_end_time
    )

    SELECT
      COUNT(*)::int AS total_records,

      COUNT(*) FILTER (
        WHERE check_in_time IS NOT NULL
          AND check_in_time <= shift_start_time
      )::int AS present,

      COUNT(*) FILTER (
        WHERE check_in_time IS NULL
      )::int AS absent,

      COUNT(*) FILTER (
        WHERE check_in_time IS NOT NULL
          AND check_in_time > shift_start_time
      )::int AS late

    FROM roster_attendance
    `,
    values
  );

  const summary = result.rows[0];

  const attended = summary.present + summary.late;

  const attendanceRate =
    summary.total_records > 0
      ? Number(
          ((attended / summary.total_records) * 100).toFixed(1)
        )
      : 0;

  return {
    total_records: summary.total_records,
    present: summary.present,
    absent: summary.absent,
    late: summary.late,
    attendance_rate: attendanceRate,
  };
};

export const getAttendanceTrendsService = async (
  start_date: string,
  end_date: string,
  location_id?: string
) => {
  const values: any[] = [start_date, end_date];

  let locationFilter = "";

  if (location_id) {
    values.push(location_id);
    locationFilter = `AND r.location_id = $${values.length}`;
  }

  const result = await pool.query(
    `
    WITH roster_attendance AS (
      SELECT
        r.id AS roster_id,
        r.employee_id,
        r.location_id,
        r.shift_start_time,
        r.shift_end_time,
        MIN(ar.check_in_time) AS check_in_time
      FROM rosters r

      LEFT JOIN roster_statuses rs
        ON rs.id = r.status_id

      LEFT JOIN attendance_records ar
        ON ar.employee_id = r.employee_id
        AND ar.location_id = r.location_id
        AND ar.check_in_time <= r.shift_end_time
        AND (
          ar.check_out_time IS NULL
          OR ar.check_out_time >= r.shift_start_time
        )

      WHERE r.shift_start_time >= $1::date
        AND r.shift_start_time < ($2::date + INTERVAL '1 day')
        AND COALESCE(rs.status_name, '') <> 'Cancelled'
        ${locationFilter}

      GROUP BY
        r.id,
        r.employee_id,
        r.location_id,
        r.shift_start_time,
        r.shift_end_time
    )

    SELECT
      TO_CHAR(shift_start_time, 'YYYY-MM-DD') AS date,

      COUNT(*) FILTER (
        WHERE check_in_time IS NOT NULL
          AND check_in_time <= shift_start_time
      )::int AS present,

      COUNT(*) FILTER (
        WHERE check_in_time IS NULL
      )::int AS absent,

      COUNT(*) FILTER (
        WHERE check_in_time IS NOT NULL
          AND check_in_time > shift_start_time
      )::int AS late

    FROM roster_attendance

    GROUP BY TO_CHAR(shift_start_time, 'YYYY-MM-DD')

    ORDER BY TO_CHAR(shift_start_time, 'YYYY-MM-DD') ASC
    `,
    values
  );

  return result.rows;
};

export const getLateAbsenteeismService = async (
  start_date: string,
  end_date: string,
  location_id?: string,
  employee_id?: string
) => {
  const values: any[] = [start_date, end_date];

  let locationFilter = "";
  let employeeFilter = "";

  if (location_id) {
    values.push(location_id);
    locationFilter = `AND r.location_id = $${values.length}`;
  }

  if (employee_id) {
    values.push(employee_id);
    employeeFilter = `AND r.employee_id = $${values.length}`;
  }

  const result = await pool.query(
    `
    WITH roster_attendance AS (
      SELECT
        r.id AS roster_id,
        r.employee_id,
        e.full_name AS employee_name,
        r.location_id,
        r.shift_start_time,
        r.shift_end_time,
        MIN(ar.check_in_time) AS check_in_time

      FROM rosters r

      JOIN employees e
        ON e.id = r.employee_id

      LEFT JOIN roster_statuses rs
        ON rs.id = r.status_id

      LEFT JOIN attendance_records ar
        ON ar.employee_id = r.employee_id
        AND ar.location_id = r.location_id
        AND ar.check_in_time <= r.shift_end_time
        AND (
          ar.check_out_time IS NULL
          OR ar.check_out_time >= r.shift_start_time
        )

      WHERE r.shift_start_time >= $1::date
        AND r.shift_start_time < ($2::date + INTERVAL '1 day')
        AND COALESCE(rs.status_name, '') <> 'Cancelled'
        ${locationFilter}
        ${employeeFilter}

      GROUP BY
        r.id,
        r.employee_id,
        e.full_name,
        r.location_id,
        r.shift_start_time,
        r.shift_end_time
    )

    SELECT
      employee_id,
      employee_name,
      location_id,

      COUNT(*) FILTER (
        WHERE check_in_time IS NOT NULL
          AND check_in_time > shift_start_time
      )::int AS late_count,

      COUNT(*) FILTER (
        WHERE check_in_time IS NULL
      )::int AS absence_count

    FROM roster_attendance

    GROUP BY
      employee_id,
      employee_name,
      location_id

    HAVING
      COUNT(*) FILTER (
        WHERE check_in_time IS NOT NULL
          AND check_in_time > shift_start_time
      ) > 0

      OR

      COUNT(*) FILTER (
        WHERE check_in_time IS NULL
      ) > 0

    ORDER BY employee_name ASC, location_id ASC
    `,
    values
  );

  return result.rows;
};


export const getRegionalPerformanceService = async (
  start_date: string,
  end_date: string
) => {
  const result = await pool.query(
    `
    WITH roster_attendance AS (
      SELECT
        r.id AS roster_id,
        sl.region_id,
        rg.region_name,
        r.shift_start_time,
        r.shift_end_time,
        MIN(ar.check_in_time) AS check_in_time

      FROM rosters r

      JOIN service_locations sl
        ON sl.id = r.location_id

      JOIN regions rg
        ON rg.id = sl.region_id

      LEFT JOIN roster_statuses rs
        ON rs.id = r.status_id

      LEFT JOIN attendance_records ar
        ON ar.employee_id = r.employee_id
        AND ar.location_id = r.location_id
        AND ar.check_in_time <= r.shift_end_time
        AND (
          ar.check_out_time IS NULL
          OR ar.check_out_time >= r.shift_start_time
        )

      WHERE r.shift_start_time >= $1::date
        AND r.shift_start_time < ($2::date + INTERVAL '1 day')
        AND COALESCE(rs.status_name, '') <> 'Cancelled'

      GROUP BY
        r.id,
        sl.region_id,
        rg.region_name,
        r.shift_start_time,
        r.shift_end_time
    )

    SELECT
      region_id,
      region_name,

      ROUND(
        (
          COUNT(*) FILTER (
            WHERE check_in_time IS NOT NULL
          )::numeric
          /
          NULLIF(COUNT(*), 0)
        ) * 100,
        1
      )::float AS attendance_rate,

      COUNT(*) FILTER (
        WHERE check_in_time IS NOT NULL
          AND check_in_time > shift_start_time
      )::int AS late_count,

      COUNT(*) FILTER (
        WHERE check_in_time IS NULL
      )::int AS absence_count

    FROM roster_attendance

    GROUP BY
      region_id,
      region_name

    ORDER BY region_name ASC
    `,
    [start_date, end_date]
  );

  return result.rows;
};
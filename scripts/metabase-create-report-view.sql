-- View گزارش‌گیری برای Metabase (یک‌بار روی سرور اجرا کنید)
-- sudo -u postgres psql -d transport_app -f scripts/metabase-create-report-view.sql

CREATE OR REPLACE VIEW v_freight_report AS
SELECT
  fa.id AS announcement_id,
  fa.announcement_code,
  fa.line_type,
  fa.vehicle_type,
  fa.assignment_type,
  fa.status,
  fa.origin_city,
  fa.loading_date,
  fa.created_at,
  fa.assigned_driver_id,
  fa.assigned_vehicle_id,
  fa.total_freight_cost,
  fd.id AS destination_id,
  fd.city AS destination_city,
  fd.freight_cost AS destination_freight_cost,
  fd.tonnage,
  fd.representative_name,
  CASE
    WHEN fa.assignment_type = 'company' THEN 'شرکتی'
    WHEN fa.assignment_type = 'personal' THEN 'شخصی'
    ELSE COALESCE(fa.assignment_type, 'نامشخص')
  END AS assignment_type_label,
  CASE
    WHEN fa.assigned_driver_id IS NOT NULL
      AND fa.status NOT IN ('Cancelled', 'Draft')
    THEN TRUE
    ELSE FALSE
  END AS is_assigned
FROM freight_announcements fa
LEFT JOIN freight_destinations fd
  ON fd.freight_announcement_id = fa.id;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_reader') THEN
    GRANT SELECT ON v_freight_report TO metabase_reader;
  END IF;
END $$;

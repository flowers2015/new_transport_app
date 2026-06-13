-- Viewهای BI برای Metabase — یک‌بار روی سرور اجرا کنید
-- sudo -u postgres psql -d transport_app -f scripts/metabase-create-bi-views.sql
--
-- پیش‌نیاز: scripts/metabase-create-report-view.sql (v_freight_report)
--           scripts/metabase-create-reader.sql (metabase_reader)

-- =============================================================================
-- 1) v_driver_tour_cost_report — مالی تور (قطعی بدون پورسانت + پورسانت بعد بستن دوره)
-- =============================================================================
CREATE OR REPLACE VIEW v_driver_tour_cost_report AS
WITH base AS (
  SELECT
    dc.id AS calculation_id,
    dc.driver_id,
    d.employee_id,
    d.name AS driver_name,
    dc.announcement_id,
    fa.announcement_code,
    fa.origin_city,
    fa.line_type,
    COALESCE(fa.vehicle_type, dc.vehicle_code) AS vehicle_type,
    fa.assignment_type,
    CASE
      WHEN fa.assignment_type = 'company' THEN 'شرکتی'
      WHEN fa.assignment_type = 'personal' THEN 'شخصی'
      ELSE COALESCE(fa.assignment_type, 'نامشخص')
    END AS assignment_type_label,
    fa.status AS announcement_status,
    dc.bill_of_lading_number,
    dc.bill_of_lading_date,
    fa.loading_date,
    dc.queue_type,
    dc.commission_status,
    dc.period_id,
    fp.period_name,
    fp.status AS period_status,
    dc.is_paid,
    COALESCE(
      dc.total_kilometers,
      COALESCE(dc.approved_kilometers, 0)
        + COALESCE(dc.excess_kilometers, 0)
        + COALESCE(dc.depot_total_mileage, 0)
    ) AS total_kilometers,
    COALESCE(dc.approved_kilometers, 0) AS approved_kilometers,
    COALESCE(dc.excess_kilometers, 0) AS excess_kilometers,
    COALESCE(dc.depot_total_mileage, 0) AS depot_total_mileage,
    COALESCE(dc.bill_of_lading_cost, 0) AS bill_of_lading_cost,
    COALESCE(dc.food_cost, 0) AS food_cost,
    COALESCE(dc.fuel_cost, 0) AS fuel_cost,
    COALESCE(dc.toll_cost, 0) AS toll_cost,
    COALESCE(dc.return_cargo_cost, 0) AS return_cargo_cost,
    COALESCE(dc.return_inter_branch_cargo_cost, 0) AS return_inter_branch_cargo_cost,
    COALESCE(dc.return_bill_of_lading_cost, 0) AS return_bill_of_lading_cost,
    COALESCE(dc.multi_unload_cost, 0) AS multi_unload_cost,
    COALESCE(dc.excess_mission_cost, 0) AS excess_mission_cost,
    COALESCE(dc.fixed_allowance, 0) AS fixed_allowance,
    COALESCE(dc.depot_cargo_handling_cost, 0) AS depot_cargo_handling_cost,
    COALESCE(dc.depot_kilometer_rate, 0) AS depot_kilometer_rate,
    COALESCE(dc.depot_mission_cost, 0) AS depot_mission_cost,
    COALESCE(dc.tour_cost, 0) AS tour_cost_preview,
    COALESCE(dc.total_cost, 0) AS total_cost_raw,
    COALESCE(dc.helper_driver_allowance, 0)
      + COALESCE(dc.helper_driver_food_cost, 0)
      + COALESCE(dc.helper_driver_excess_mission_cost, 0) AS helper_driver_cost,
    dc.destinations,
    COALESCE(fa.finance_disposition, '') AS finance_disposition,
    (dc.total_cost IS NOT NULL AND dc.total_cost > 0) AS is_tour_cost_recorded,
    (fa.assignment_type = 'company'
      AND fa.status = 'Finalized'
      AND COALESCE(fa.finance_disposition, '') <> 'rejected') AS is_finance_eligible
  FROM driver_calculations dc
  JOIN freight_announcements fa ON fa.id = dc.announcement_id
  LEFT JOIN drivers d ON d.id = dc.driver_id
  LEFT JOIN financial_periods fp ON fp.id = dc.period_id
)
SELECT
  b.*,
  -- هزینه تور قطعی (همان صورتحساب — بدون tour_cost پورسانتی)
  (
    b.bill_of_lading_cost + b.food_cost + b.fuel_cost + b.toll_cost
    + b.return_cargo_cost + b.return_inter_branch_cargo_cost + b.return_bill_of_lading_cost
    + b.multi_unload_cost + b.excess_mission_cost + b.fixed_allowance
    + b.depot_cargo_handling_cost + b.depot_kilometer_rate + b.depot_mission_cost
  ) AS tour_cost_certain,
  -- پورسانت قطعی فقط بعد بستن دوره
  CASE
    WHEN b.commission_status IN ('commission_calculated', 'paid')
      AND b.queue_type = 'fixed_allowance'
      THEN b.fixed_allowance
    WHEN b.commission_status IN ('commission_calculated', 'paid')
      AND b.queue_type <> 'fixed_allowance'
      THEN b.tour_cost_preview
    ELSE NULL
  END AS commission_certain,
  CASE
    WHEN b.commission_status IN ('commission_calculated', 'paid') THEN 'قطعی'
    WHEN b.commission_status IN ('recorded') OR b.commission_status IS NULL THEN 'دوره_باز'
    ELSE b.commission_status
  END AS commission_certainty_label,
  CASE
    WHEN b.is_paid THEN 'پرداخت_تور'
    WHEN b.is_tour_cost_recorded THEN 'ثبت_شده'
    ELSE 'نامشخص'
  END AS payment_stage_label
FROM base b;

-- =============================================================================
-- 2) v_freight_ops_report — عملیات / برنامه‌ریزی (تخصیص، لاین، شرکتی/شخصی)
-- =============================================================================
CREATE OR REPLACE VIEW v_freight_ops_report AS
SELECT
  fa.id AS announcement_id,
  fa.announcement_code,
  fa.line_type,
  fa.vehicle_type,
  fa.assignment_type,
  CASE
    WHEN fa.assignment_type = 'company' THEN 'شرکتی'
    WHEN fa.assignment_type = 'personal' THEN 'شخصی'
    ELSE COALESCE(fa.assignment_type, 'نامشخص')
  END AS assignment_type_label,
  fa.status,
  fa.origin_city,
  fa.loading_date,
  fa.created_at,
  fa.assignment_finalized_at,
  (fa.assignment_finalized_at IS NOT NULL) AS is_assignment_finalized,
  fa.assigned_driver_id,
  fa.assigned_vehicle_id,
  fd.id AS destination_id,
  fd.city AS destination_city,
  fd.freight_cost AS destination_freight_cost,
  fd.tonnage,
  fd.representative_name,
  CONCAT(fa.origin_city, ' → ', fd.city) AS route_line,
  COALESCE(fa.finance_disposition, '') AS finance_disposition,
  (fa.assignment_type = 'company'
    AND fa.status = 'Finalized'
    AND COALESCE(fa.finance_disposition, '') <> 'rejected') AS is_company_finance_ready,
  (fa.assignment_type = 'personal'
    AND COALESCE(fd.freight_cost, 0) > 0) AS is_personal_freight_recorded
FROM freight_announcements fa
LEFT JOIN freight_destinations fd ON fd.freight_announcement_id = fa.id
WHERE fa.status NOT IN ('Cancelled', 'Draft');

-- =============================================================================
-- 3) v_route_cost_summary — تجمیع مسیر × خودرو × شرکتی/شخصی (فقط تور ثبت‌شده)
-- =============================================================================
CREATE OR REPLACE VIEW v_route_cost_summary AS
SELECT
  COALESCE(v.origin_city, 'نامشخص') AS origin_city,
  COALESCE(
    NULLIF(TRIM(SPLIT_PART(v.destinations, ',', 1)), ''),
    'نامشخص'
  ) AS primary_destination_city,
  v.line_type,
  v.vehicle_type,
  v.assignment_type_label,
  COUNT(*) AS tour_count,
  SUM(v.total_kilometers) AS sum_kilometers,
  SUM(v.tour_cost_certain) AS sum_tour_cost_certain,
  SUM(v.commission_certain) AS sum_commission_certain,
  SUM(CASE WHEN v.is_paid THEN v.tour_cost_certain ELSE 0 END) AS sum_paid_tour_cost,
  ROUND(AVG(v.tour_cost_certain)) AS avg_tour_cost_certain
FROM v_driver_tour_cost_report v
WHERE v.is_tour_cost_recorded
  AND v.is_finance_eligible
GROUP BY
  v.origin_city,
  COALESCE(NULLIF(TRIM(SPLIT_PART(v.destinations, ',', 1)), ''), 'نامشخص'),
  v.line_type,
  v.vehicle_type,
  v.assignment_type_label;

-- =============================================================================
-- 4) v_commission_period_summary — دوره بسته، سطح راننده
-- =============================================================================
CREATE OR REPLACE VIEW v_commission_period_summary AS
SELECT
  fp.id AS period_id,
  fp.period_name,
  fp.start_date,
  fp.end_date,
  fp.status AS period_status,
  v.driver_id,
  v.employee_id,
  v.driver_name,
  COUNT(*) AS tour_count,
  SUM(v.total_kilometers) AS sum_kilometers,
  SUM(v.tour_cost_certain) AS sum_tour_cost_certain,
  SUM(v.commission_certain) AS sum_commission_certain,
  SUM(v.food_cost) AS sum_food,
  SUM(v.fuel_cost) AS sum_fuel,
  SUM(v.toll_cost) AS sum_toll,
  SUM(v.bill_of_lading_cost) AS sum_bill_of_lading,
  SUM(v.depot_cargo_handling_cost + v.depot_kilometer_rate + v.depot_mission_cost) AS sum_depot_costs,
  ROUND(
    100.0 * SUM(v.fuel_cost) / NULLIF(SUM(v.tour_cost_certain), 0),
    2
  ) AS pct_fuel_of_tour_cost,
  ROUND(
    100.0 * SUM(v.food_cost) / NULLIF(SUM(v.tour_cost_certain), 0),
    2
  ) AS pct_food_of_tour_cost
FROM v_driver_tour_cost_report v
JOIN financial_periods fp ON fp.id = v.period_id
WHERE fp.status = 'closed'
  AND v.commission_status IN ('commission_calculated', 'paid')
GROUP BY
  fp.id, fp.period_name, fp.start_date, fp.end_date, fp.status,
  v.driver_id, v.employee_id, v.driver_name;

-- =============================================================================
-- دسترسی metabase_reader
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'metabase_reader') THEN
    GRANT SELECT ON v_driver_tour_cost_report TO metabase_reader;
    GRANT SELECT ON v_freight_ops_report TO metabase_reader;
    GRANT SELECT ON v_route_cost_summary TO metabase_reader;
    GRANT SELECT ON v_commission_period_summary TO metabase_reader;
  END IF;
END $$;

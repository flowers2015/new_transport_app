-- کاربر فقط-خواندنی برای Apache Superset (روی سرور با psql اجرا کنید)
-- قبل از اجرا رمز را عوض کنید.

DO $$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'superset_reader') THEN
    CREATE USER superset_reader WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';
  END IF;
END
$$;

GRANT CONNECT ON DATABASE transport_app TO superset_reader;
GRANT USAGE ON SCHEMA public TO superset_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO superset_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO superset_reader;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO superset_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO superset_reader;

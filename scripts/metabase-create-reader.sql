-- کاربر فقط-خواندنی برای Metabase (روی سرور با psql اجرا کنید)
-- قبل از اجرا رمز را عوض کنید.

CREATE USER metabase_reader WITH PASSWORD 'CHANGE_ME_STRONG_PASSWORD';

GRANT CONNECT ON DATABASE transport_app TO metabase_reader;
GRANT USAGE ON SCHEMA public TO metabase_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO metabase_reader;
GRANT SELECT ON ALL SEQUENCES IN SCHEMA public TO metabase_reader;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON TABLES TO metabase_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT ON SEQUENCES TO metabase_reader;

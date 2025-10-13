-- Enable UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$ BEGIN
  CREATE TYPE user_role_enum AS ENUM (
    'admin',
    'planner',
    'planner_manager',
    'transport_user',
    'personal_transport_user',
    'finance',
    'central_finance',
    'transport_finance',
    'workshop',
    'transport',
    'warehouse',
    'merchant',
    'docs',
    'accident',
    'allocation',
    'insurance'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE repair_status_enum AS ENUM ('New', 'Diagnosing', 'AwaitingPart', 'InProgress', 'OnHold', 'Completed', 'Delivered', 'Closed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE freight_line_type_enum AS ENUM ('Main', 'Intermediate', 'Final');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE freight_announcement_status_enum AS ENUM ('Draft', 'PendingManagerApproval', 'Rejected', 'PendingPersonalAssignment', 'PendingCompanyAssignment', 'Assigned', 'InTransit', 'Finalized', 'Cancelled', 'ReAnnounced');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE invoice_status_enum AS ENUM ('Pending', 'Paid', 'Overdue');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS branches (
    id VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    location TEXT
);

CREATE TABLE IF NOT EXISTS drivers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255),
    license_number VARCHAR(255) UNIQUE NOT NULL
);


CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(255) PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    full_name VARCHAR(255),
    role user_role_enum NOT NULL,
    branch_id VARCHAR(255) REFERENCES branches(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vin VARCHAR(255) UNIQUE NOT NULL,
    plate_number JSONB NOT NULL,
    make VARCHAR(255),
    model VARCHAR(255),
    year INT,
    owner_history JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS repair_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    technician_id VARCHAR(255) NOT NULL REFERENCES users(id),
    status repair_status_enum NOT NULL DEFAULT 'New',
    description TEXT,
    start_date TIMESTAMPTZ,
    completion_date TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS freight_announcements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    origin VARCHAR(255),
    destinations JSONB,
    driver_id UUID REFERENCES drivers(id),
    vehicle_id UUID REFERENCES vehicles(id),
    status freight_announcement_status_enum NOT NULL DEFAULT 'Draft',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS announcement_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID NOT NULL REFERENCES freight_announcements(id),
    changed_by_user_id VARCHAR(255) NOT NULL REFERENCES users(id),
    change_description TEXT,
    changed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id VARCHAR(255) REFERENCES users(id),
    action VARCHAR(255) NOT NULL,
    table_name VARCHAR(255),
    record_id UUID,
    details TEXT,
    "timestamp" TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS parts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    part_number VARCHAR(255) UNIQUE,
    stock INTEGER DEFAULT 0,
    unit_price DECIMAL(10,2),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS part_usages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repair_order_id UUID NOT NULL REFERENCES repair_orders(id),
    part_id UUID NOT NULL REFERENCES parts(id),
    quantity_used INTEGER NOT NULL,
    usage_date TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    contact_info JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS outsourcing_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repair_order_id UUID NOT NULL REFERENCES repair_orders(id),
    supplier_id UUID NOT NULL REFERENCES suppliers(id),
    status VARCHAR(50) DEFAULT 'Pending',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repair_order_id UUID REFERENCES repair_orders(id),
    vehicle_id UUID NOT NULL REFERENCES vehicles(id),
    total_amount DECIMAL(10,2) NOT NULL,
    status invoice_status_enum DEFAULT 'Pending',
    issued_at TIMESTAMPTZ DEFAULT NOW(),
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL,
    message TEXT,
    type VARCHAR(50),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

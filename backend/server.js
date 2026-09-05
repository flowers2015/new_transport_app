require('dotenv').config();
const express = require('express');
const cors = require('cors');
const compression = require('compression');
const path = require('path');
const pool = require('./db'); // Import the pool

// Import routes
const authRoutes = require('./routes/authRoutes');
const repairOrderRoutes = require('./routes/repairOrderRoutes');
const freightRoutes = require('./routes/freightRoutes');
const vehicleRoutes = require('./routes/vehicleRoutes');
const alertRoutes = require('./routes/alertRoutes');
const invoiceRoutes = require('./routes/invoiceRoutes');
const technicianRoutes = require('./routes/technicianRoutes');
const driverRoutes = require('./routes/driverRoutes');
const partRoutes = require('./routes/partRoutes');
const branchRoutes = require('./routes/branchRoutes');
const supplierRoutes = require('./routes/supplierRoutes');
const fuelCardRoutes = require('./routes/fuelCardRoutes');
const trafficFineRoutes = require('./routes/trafficFineRoutes');
const vehiclePermitRoutes = require('./routes/vehiclePermitRoutes');
const roleRoutes = require('./routes/roleRoutes');
const personalDriverRoutes = require('./routes/personalDriverRoutes');
const personalVehicleRoutes = require('./routes/personalVehicleRoutes');
const dispatchRoutes = require('./routes/dispatchRoutes');
const freightTransactionRoutes = require('./routes/freightTransactionRoutes');
const driverCalculationRoutes = require('./routes/driverCalculationRoutes');
const allowanceRegulationRoutes = require('./routes/allowanceRegulationRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const userManagementRoutes = require('./routes/userManagementRoutes');
const vehicleSpecsRoutes = require('./routes/vehicleSpecsRoutes');
const financialPeriodRoutes = require('./routes/financialPeriodRoutes');
const finalizePermissionRoutes = require('./routes/finalizePermissionRoutes');
const planningManagerApprovalPermissionRoutes = require('./routes/planningManagerApprovalPermissionRoutes');
const realtimeRoutes = require('./routes/realtimeRoutes');
const cityRoutes = require('./routes/cityRoutes');
const warehouseRoutes = require('./routes/warehouseRoutes');
const baleRoutes = require('./routes/baleRoutes');
const supportTicketRoutes = require('./routes/supportTicketRoutes');
const reportsRoutes = require('./routes/reportsRoutes');
const integrationRoutes = require('./routes/integrationRoutes');
const { authenticateToken, authorizeRole } = require('./middleware/authMiddleware');
const { searchCompanyVehicles } = require('./controllers/vehicleController');

const vehicleSearchRoles = [
  'admin',
  'transport',
  'transport_user',
  'personal_transport_user',
  'transport_finance',
  'planner',
  'planner_manager',
  'sales_expert',
  'finance',
  'central_finance',
];

const app = express();

// Compression middleware - باید قبل از routes اضافه شود
app.use(compression({
  level: 6, // سطح فشرده‌سازی (1-9، 6 بهینه است)
  filter: (req, res) => {
    if (req.headers['x-no-compression']) {
      return false;
    }
    // SSE با compression و chunked encoding پشت nginx قطع می‌شود
    if (req.path && String(req.path).includes('/realtime/sse')) {
      return false;
    }
    return compression.filter(req, res);
  }
}));

// Middleware
// تنظیمات CORS: 
// - در development: localhost:5173 (Vite) و سایر پورت‌های localhost
// - در production: IP سرور و localhost (برای دسترسی داخلی)
// همیشه localhost:5173 را در لیست قرار می‌دهیم (در production استفاده نمی‌شود)
const corsOrigins = [
  'http://localhost:5173',  // Vite dev server (development)
  'http://localhost:3000',  // Backend
  'http://localhost',       // بدون پورت
  'http://127.0.0.1:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1',
  'http://51.178.41.12'     // IP سرور (production)
];

app.use(cors({
  origin: corsOrigins,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
})); // Enable CORS for all routes

app.use(express.json({ limit: '4mb' })); // گزارش بله (تصویر base64) و payloadهای بزرگ‌تر

// Set security headers (only in production, relaxed for development)
app.use((req, res, next) => {
  // In development, use relaxed CSP to allow Tailwind CDN
  if (process.env.NODE_ENV !== 'production') {
    // Relaxed CSP for development - allows Tailwind CDN with eval
    res.setHeader('Content-Security-Policy', 
      "default-src 'self' 'unsafe-inline' 'unsafe-eval' data: blob:; " +
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://aistudiocdn.com http://localhost:*; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://cdn.tailwindcss.com; " +
      "font-src 'self' data: https://fonts.gstatic.com; " +
      "img-src 'self' data: blob: https:; " +
      "connect-src 'self' 'unsafe-inline' http://localhost:* https://aistudiocdn.com https://cdn.tailwindcss.com; " +
      "frame-src 'self' https:; " +
      "object-src 'none'; " +
      "base-uri 'self';"
    );
  } else {
    // Stricter CSP for production
    res.setHeader('Content-Security-Policy', 
      "default-src 'self'; " +
      "script-src 'self' 'unsafe-inline' https://aistudiocdn.com; " +
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
      "font-src 'self' https://fonts.gstatic.com; " +
      "img-src 'self' data: https:; " +
      "connect-src 'self' https://aistudiocdn.com;"
    );
  }
  
  // Prevent CORB issues - allow cross-origin resources
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin || '*');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  
  next();
});

// API Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/repair-orders', repairOrderRoutes);
app.use('/api/v1/freight-announcements', freightRoutes);
app.use('/api/v1/freight-transactions', freightTransactionRoutes);
// قبل از router خودرو — جلوگیری از تداخل با /:id روی سرورهای با کد قدیمی
app.get(
  '/api/v1/vehicles/search',
  authenticateToken,
  authorizeRole(vehicleSearchRoles),
  searchCompanyVehicles
);
app.use('/api/v1/vehicles', vehicleRoutes);
app.use('/api/v1/alerts', alertRoutes);
app.use('/api/v1/invoices', invoiceRoutes);
app.use('/api/v1/technicians', technicianRoutes);
app.use('/api/v1/drivers', driverRoutes);
app.use('/api/v1/parts', partRoutes);
app.use('/api/v1/branches', branchRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/fuel-cards', fuelCardRoutes);
app.use('/api/v1/traffic-fines', trafficFineRoutes);
app.use('/api/v1/vehicle-permits', vehiclePermitRoutes);
app.use('/api/v1/roles', roleRoutes);
app.use('/api/v1/personal-drivers', personalDriverRoutes);
app.use('/api/v1/personal-vehicles', personalVehicleRoutes);
app.use('/api/v1/dispatch', dispatchRoutes);
app.use('/api/v1/driver-calculations', driverCalculationRoutes);
app.use('/api/v1/allowance-regulations', allowanceRegulationRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/admin', userManagementRoutes);
app.use('/api/v1/carriers', require('./routes/carrierRoutes'));
app.use('/api/v1/vehicle-specs', vehicleSpecsRoutes);
app.use('/api/v1/financial', financialPeriodRoutes);
app.use('/api/v1/finalize-permissions', finalizePermissionRoutes);
app.use('/api/v1/freight-intake-locks', require('./routes/freightIntakeLockRoutes'));
app.use('/api/v1/planning-manager-approval-permissions', planningManagerApprovalPermissionRoutes);
app.use('/api/v1/realtime', realtimeRoutes);
app.use('/api/v1/warehouses', warehouseRoutes);
app.use('/api/v1/cities', cityRoutes);
app.use('/api/v1/bale', baleRoutes);
app.use('/api/v1/support-tickets', supportTicketRoutes);
app.use('/api/v1/reports', reportsRoutes);
// لایه بیرونی یکپارچه‌سازی (فقط‌خواندنی — جدا از API داخلی)
app.use('/api/v1/integrations', integrationRoutes);
// منابع GPS (ادمین) — جدا از مدیریت منابع؛ خاموش با GPS_ADMIN_ENABLED=false
app.use('/api/v1/gps-resources', require('./routes/gpsResourceRoutes'));
app.use('/api/v1/gps-finance', require('./routes/gpsFinanceRoutes'));
app.use('/api/v1/gps-live', require('./routes/gpsLiveRoutes'));

// Serve uploaded files - با پشتیبانی از پوشه‌های شعبه
app.use('/uploads/freight-transactions', express.static(path.join(__dirname, 'uploads', 'freight-transactions')));
app.use('/uploads/regulations', express.static(path.join(__dirname, 'uploads', 'regulations')));
app.use('/uploads/bale-reports', express.static(path.join(__dirname, 'uploads', 'bale-reports')));

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Backend is running');
});

// ایجاد جداول مورد نیاز در startup — پشت‌سرهم (جلوگیری از deadlock)
async function runStartupMigrations() {
  const steps = [
    { name: 'admin_actions', fn: require('./migrations/create_admin_actions_table').createAdminActionsTable },
    { name: 'fix_loading_date', fn: require('./migrations/fix_loading_date_column') },
    { name: 'driver_vehicle_columns', fn: require('./migrations/add_driver_vehicle_columns_to_freight') },
    { name: 'vehicle_specifications', fn: require('./migrations/create_vehicle_specifications_table') },
    { name: 'delivery_date_columns', fn: require('./migrations/add_delivery_date_columns') },
    { name: 'created_by_user_id', fn: require('./migrations/add_created_by_user_id') },
    { name: 'regulation_id_mileage', fn: require('./migrations/add_regulation_id_to_mileage') },
    { name: 'must_change_password', fn: require('./migrations/add_must_change_password').runMigration },
    { name: 'bale_tables', fn: require('./migrations/create_bale_tables') },
    { name: 'bale_report_recipients', fn: require('./migrations/add_bale_report_recipients') },
    { name: 'carrier_name', fn: require('./migrations/add_carrier_name_column') },
    { name: 'carrier_handoff', fn: require('./migrations/add_carrier_handoff') },
    { name: 'tariff_freight_cost', fn: require('./migrations/add_tariff_freight_cost') },
    { name: 'bale_ambient_notify_seq', fn: require('./migrations/add_bale_ambient_notify_seq') },
    { name: 'vehicle_code', fn: require('./migrations/add_vehicle_code_column') },
    { name: 'support_tickets', fn: require('./migrations/create_support_tickets_table') },
    { name: 'destination_original_creator', fn: require('./migrations/add_destination_original_creator') },
    { name: 'destination_cargo_value', fn: require('./migrations/add_destination_cargo_value') },
    { name: 'destination_block_fields', fn: require('./migrations/add_destination_block_fields') },
    { name: 'announcement_week_day', fn: require('./migrations/add_announcement_week_day') },
    { name: 'dairy_arrangement_state', fn: require('./migrations/create_dairy_arrangement_state') },
    { name: 'freight_intake_locks', fn: require('./migrations/create_freight_intake_locks') },
    { name: 'gps_resources', fn: require('./migrations/create_gps_resources_tables') },
    { name: 'gps_tour_snapshots', fn: require('./migrations/create_gps_tour_snapshots') },
    { name: 'gps_tours_summary', fn: require('./migrations/create_gps_tours_summary_tables') },
    { name: 'mileage_gps_track', fn: require('./migrations/add_mileage_gps_track') },
    { name: 'gps_ingest_tables', fn: require('./migrations/create_gps_ingest_tables') },
    { name: 'gps_tour_detail_fuel_events', fn: require('./migrations/add_gps_tour_detail_fuel_events') },
    { name: 'inspector_role', fn: require('./migrations/add_inspector_role') },
    { name: 'warehouses', fn: require('./migrations/create_warehouses_table') },
    { name: 'user_warehouse_assignments', fn: require('./migrations/create_user_warehouse_assignments') },
    { name: 'warehouse_loading_columns', fn: require('./migrations/add_warehouse_loading_columns') },
    { name: 'warehouse_keeper_role', fn: require('./migrations/add_warehouse_keeper_role') },
    { name: 'branch_finance_manager_auditor_roles', fn: require('./migrations/add_branch_finance_manager_and_auditor_roles') },
  ];

  for (const step of steps) {
    try {
      await step.fn();
    } catch (err) {
      console.error(`❌ [Server] migration failed (${step.name}):`, err?.message || err);
    }
  }
}

const PORT = process.env.PORT || 3000;

(async () => {
  await runStartupMigrations();

  const baleSessionEngine = require('./services/bale/baleSessionEngine');
  const { startBalePolling } = require('./services/bale/balePolling');
  if (process.env.BALE_BOT_TOKEN) {
    baleSessionEngine.ensureTickTimer();
    startBalePolling();
  }

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    require('./services/gpsIngestScheduler').startGpsIngestScheduler();
  });
})().catch((err) => {
  console.error('❌ [Server] startup failed:', err?.message || err);
  process.exit(1);
});

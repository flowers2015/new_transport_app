require('dotenv').config();
const express = require('express');
const cors = require('cors');
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

const app = express();

// Middleware
app.use(cors({
  origin: true, // Allow all origins in development
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
})); // Enable CORS for all routes
app.use(express.json());

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

// Health check endpoint
app.get('/', (req, res) => {
  res.send('Backend is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

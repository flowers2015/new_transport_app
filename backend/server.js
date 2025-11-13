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
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

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

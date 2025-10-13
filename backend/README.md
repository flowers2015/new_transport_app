# Transport App Backend

This is the backend API for the Transport Management Application.

## Setup Instructions

### 1. Install Dependencies
```bash
npm install
```

### 2. Database Setup
1. Make sure PostgreSQL is running
2. Create a database for the application
3. Run the complete schema and sample data:
```bash
npm run setup
```

Or manually:
```bash
psql -d your_database_name -f models/complete_schema.sql
psql -d your_database_name -f complete_sample_data.sql
```

### 3. Environment Variables
Create a `.env` file in the backend directory with:
```
DB_HOST=localhost
DB_PORT=5432
DB_NAME=your_database_name
DB_USER=your_username
DB_PASSWORD=your_password
JWT_SECRET=your_jwt_secret_key
PORT=3000
```

### 4. Run the Application
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### Authentication
- `POST /api/v1/auth/login` - User login

### Repair Orders
- `GET /api/v1/repair-orders` - Get all repair orders
- `GET /api/v1/repair-orders/:id` - Get repair order by ID
- `GET /api/v1/repair-orders/my-orders` - Get technician's assigned orders
- `GET /api/v1/repair-orders/:id/part-usages` - Get part usages for an order
- `POST /api/v1/repair-orders/:id/part-usages` - Add part usage to an order
- `POST /api/v1/repair-orders/:id/outsourcing-requests` - Create outsourcing request
- `POST /api/v1/repair-orders/:id/assign-technician` - Assign technician to order
- `PATCH /api/v1/repair-orders/:id/status` - Update order status

### Vehicles
- `GET /api/v1/vehicles` - Get all vehicles with branch info
- `GET /api/v1/vehicles/:id` - Get vehicle by ID

### Freight Announcements
- `GET /api/v1/freight-announcements` - Get all freight announcements with destinations
- `GET /api/v1/freight-announcements/:id` - Get freight announcement by ID
- `POST /api/v1/freight-announcements/:id/approve` - Approve announcement
- `POST /api/v1/freight-announcements/:id/reject` - Reject announcement
- `PUT /api/v1/freight-announcements/:id/assignment` - Assign vehicle and driver

### Alerts
- `GET /api/v1/alerts` - Get all active alerts
- `GET /api/v1/alerts/:id` - Get alert by ID

### Invoices
- `GET /api/v1/invoices` - Get all invoices with vehicle info
- `GET /api/v1/invoices/:id` - Get invoice by ID

### Technicians
- `GET /api/v1/technicians` - Get all technicians
- `GET /api/v1/technicians/:id` - Get technician by ID

### Drivers
- `GET /api/v1/drivers` - Get all drivers
- `GET /api/v1/drivers/:id` - Get driver by ID

### Parts
- `GET /api/v1/parts` - Get all parts
- `GET /api/v1/parts/:id` - Get part by ID

### Branches
- `GET /api/v1/branches` - Get all branches
- `GET /api/v1/branches/:id` - Get branch by ID

### Suppliers
- `GET /api/v1/suppliers` - Get all suppliers
- `GET /api/v1/suppliers/:id` - Get supplier by ID

### Fuel Cards
- `GET /api/v1/fuel-cards` - Get all fuel card requests
- `GET /api/v1/fuel-cards/:id` - Get fuel card request by ID

### Traffic Fines
- `GET /api/v1/traffic-fines` - Get all traffic fines
- `GET /api/v1/traffic-fines/:id` - Get traffic fine by ID

### Vehicle Permits
- `GET /api/v1/vehicle-permits` - Get all vehicle permits
- `GET /api/v1/vehicle-permits/:id` - Get vehicle permit by ID

## Sample Login Credentials
- Username: `admin`
- Password: `password123`

## Database Schema
The application uses PostgreSQL with a comprehensive schema including:

### Core Tables
- `users` - User accounts and authentication
- `branches` - Branch locations and management
- `vehicles` - Complete vehicle fleet information
- `vehicle_owner_history` - Vehicle ownership history
- `drivers` - Driver and personnel information
- `technicians` - Repair technicians

### Repair & Inventory
- `repair_orders` - Repair order management
- `parts` - Inventory parts with stock levels
- `part_usages` - Parts used in repair orders
- `suppliers` - Supplier information
- `outsourcing_requests` - Outsourcing requests

### Freight & Logistics
- `freight_announcements` - Freight transportation announcements
- `freight_destinations` - Destination details for each announcement
- `freight_announcement_history` - Status change history
- `freight_transactions` - Financial transactions for freight

### Financial Management
- `invoices` - Invoice management
- `invoice_items` - Invoice line items
- `purchase_orders` - Purchase order management
- `purchase_order_items` - Purchase order line items

### Additional Features
- `accident_reports` - Complete accident reporting with all details
- `insurance_policies` - Comprehensive insurance policy management
- `vehicle_allocations` - Vehicle allocation between branches with items
- `vehicle_allocation_items` - Detailed allocation items
- `fuel_card_requests` - Fuel card request management
- `traffic_fines` - Traffic fine tracking
- `vehicle_permits` - Vehicle permit and inspection management
- `support_tickets` - Support ticket system
- `audit_logs` - Complete audit trail
- `alerts` - System alerts and notifications

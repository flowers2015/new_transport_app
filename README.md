# Transport Management Application

A comprehensive transport and repair management system with React frontend and Node.js backend.

## Features

- **User Authentication**: Role-based access control
- **Repair Order Management**: Complete repair workflow management
- **Vehicle Management**: Vehicle tracking and information
- **Freight Announcements**: Transportation logistics management
- **Inventory Management**: Parts and supplies tracking
- **Invoice Management**: Billing and payment tracking
- **Alert System**: Real-time notifications
- **Audit Trail**: Complete activity logging

## Tech Stack

### Frontend
- React 19
- TypeScript
- Vite
- Tailwind CSS

### Backend
- Node.js
- Express.js
- PostgreSQL
- JWT Authentication
- bcrypt for password hashing

## Quick Start

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (v12 or higher)
- npm or yarn

### 1. Clone the Repository
```bash
git clone <repository-url>
cd transport-app
```

### 2. Backend Setup
```bash
cd backend
npm install

# Create .env file with your database credentials
cp .env.example .env
# Edit .env with your database settings

# Setup database
npm run setup

# Start backend server
npm run dev
```

### 3. Frontend Setup
```bash
cd frontend
npm install

# Start frontend development server
npm run dev
```

### 4. Access the Application
- Frontend: http://localhost:5173
- Backend API: http://localhost:3000

## Default Login Credentials
- Username: `admin`
- Password: `password123`

## Project Structure

```
transport-app/
├── backend/
│   ├── controllers/     # API controllers
│   ├── middleware/      # Authentication & logging middleware
│   ├── models/         # Database schema
│   ├── routes/         # API routes
│   ├── services/       # Business logic services
│   ├── server.js       # Main server file
│   └── setup.js        # Database setup script
├── frontend/
│   ├── components/     # React components
│   ├── types/          # TypeScript type definitions
│   ├── utils/          # Utility functions
│   └── App.tsx         # Main app component
└── README.md
```

## API Documentation

### Authentication
- `POST /api/v1/auth/login` - User login

### Repair Orders
- `GET /api/v1/repair-orders` - Get all repair orders
- `GET /api/v1/repair-orders/:id` - Get repair order by ID
- `POST /api/v1/repair-orders/:id/part-usages` - Add part usage
- `PATCH /api/v1/repair-orders/:id/status` - Update status

### Vehicles
- `GET /api/v1/vehicles` - Get all vehicles
- `GET /api/v1/vehicles/:id` - Get vehicle by ID

### Freight Announcements
- `GET /api/v1/freight-announcements` - Get all announcements
- `POST /api/v1/freight-announcements/:id/approve` - Approve announcement
- `POST /api/v1/freight-announcements/:id/reject` - Reject announcement

## Database Schema

The application uses PostgreSQL with a comprehensive schema including:

### Core Management
- **Users & Authentication** - Role-based access control
- **Branches** - Multi-location management
- **Vehicles** - Complete fleet management with ownership history
- **Drivers & Technicians** - Personnel management

### Operations
- **Repair Orders** - Complete maintenance workflow
- **Parts & Inventory** - Stock management with suppliers
- **Freight Announcements** - Transportation logistics
- **Financial Management** - Invoices, transactions, purchase orders

### Additional Features
- **Insurance & Accidents** - Policy and incident management
- **Vehicle Allocations** - Inter-branch transfers
- **Support Tickets** - Customer service system
- **Audit Logs** - Complete activity tracking
- **Alerts** - Real-time notifications
- Alerts & Notifications

## Development

### Backend Development
```bash
cd backend
npm run dev  # Starts with nodemon for auto-reload
```

### Frontend Development
```bash
cd frontend
npm run dev  # Starts Vite dev server
```

### Database Management
```bash
cd backend
npm run setup  # Recreate database with sample data
```

## Production Deployment

### Backend
```bash
cd backend
npm install --production
npm start
```

### Frontend
```bash
cd frontend
npm run build
# Serve the dist/ folder with your web server
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

This project is licensed under the MIT License.

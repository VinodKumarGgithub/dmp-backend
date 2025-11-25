# Clinical Backend API

A robust, multi-tenant REST API backend built with Node.js and Express.

## Technologies Used

### Core Framework
- **Node.js**: JavaScript runtime environment
- **Express 5.1.0**: Fast, unopinionated web framework
- **Sequelize 6.37.7**: Promise-based ORM for database operations

### Database
- **MySQL2 3.11.3**: MySQL database driver
- **Sequelize**: Supports MySQL and MSSQL (SQL Server) databases

### Authentication & Security
- **jsonwebtoken 9.0.2**: JWT token generation and verification
- **bcryptjs 3.0.2**: Password hashing and encryption
- **helmet 8.1.0**: Security headers middleware
- **cors 2.8.5**: Cross-Origin Resource Sharing configuration
- **xss-clean 0.1.4**: XSS attack prevention

### Validation & Utilities
- **Joi 18.0.1**: Schema validation library
- **uuid 11.1.0**: Unique identifier generation
- **dayjs 1.11.14**: Date manipulation library
- **cls-hooked 4.2.2**: Continuation-local storage for async context

### Logging & Monitoring
- **winston 3.17.0**: Logging library
- **morgan 1.10.1**: HTTP request logger middleware

### Performance
- **compression 1.8.1**: Response compression middleware
- **on-headers 1.1.0**: Execute callback when response headers are set

### Development Tools
- **nodemon 3.1.10**: Development server with auto-reload
- **cross-env 10.0.0**: Cross-platform environment variable setting
- **dotenv 17.2.3**: Environment variable management
- **ESLint 9.34.0**: Code linting
- **Jest 30.1.0**: Testing framework
- **supertest 7.1.4**: HTTP assertion library for testing

## Installation & Setup

### Prerequisites
- Node.js (v16 or higher recommended)
- npm or yarn package manager
- MySQL or MSSQL database server

### Installation Steps

1. **Navigate to the backend directory:**
   ```bash
   cd clinical-backend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   Create a `.env` file in the root directory:
   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development
   CORS_ORIGIN=http://localhost:5173

   # Master Database Configuration
   MASTER_DB_URL=mysql://username:password@localhost:3306/master_db

   # JWT Configuration
   JWT_SECRET=your-secret-key-here
   JWT_EXPIRES_IN=24h

   # Logging
   LOG_LEVEL=info
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Start the production server:**
   ```bash
   npm start
   ```

## Scripts

- `npm run dev` - Start development server with nodemon (auto-reload)
- `npm start` - Start production server
- `npm test` - Run tests with Jest
- `npm run seed:admin` - Seed initial admin user


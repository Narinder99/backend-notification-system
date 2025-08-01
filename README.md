# Notification System Backend

A Node.js Express backend for the notification system with real-time SSE support.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file in the root directory with the following variables:
```
PORT=3001
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Database configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=notification_system
DB_USER=postgres
DB_PASSWORD=password
```

3. Set up PostgreSQL database:
   - Create a database named `notification_system`
   - Run the schema from `database/schema.sql`

4. Start the server:
```bash
# Development mode
npm run dev

# Production mode
npm start
```

## API Endpoints

### SSE (Server-Sent Events)
- `GET /api/sse/:userId` - Connect to real-time notifications

### Notifications
- `GET /api/notifications/:userId` - Get user notifications
- `PUT /api/notifications/:userId/:notificationId/seen` - Mark notification as seen
- `POST /api/notifications` - Create notification

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:userId` - Get specific user
- `POST /api/users` - Create user
- `PUT /api/users/:userId/status` - Update user online status

### Follow/Unfollow
- `POST /api/follow` - Follow a user
- `POST /api/unfollow` - Unfollow a user

### Monitoring
- `GET /api/connections` - Get SSE connection count
- `GET /health` - Health check 
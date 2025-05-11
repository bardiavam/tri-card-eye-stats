# Credit Card Checker Application

A web application for checking credit cards with a server-side API to avoid CORS issues.

## Features

- Check credit cards in the format `xxxxxxxxxxxxxxxx|mm|yy|cvv`
- Support for proxy configuration
- User authentication with username and password (required to use the checker)
- Server-side API for card checking with authentication protection
- Display detailed results including status, message, and amount
- Download cards by status (charged, 3DS, declined)
- Debug information for troubleshooting

## Setup Instructions

### Prerequisites

- Node.js (v14 or higher)
- npm or yarn

### Installation

1. Clone the repository:
   ```
   git clone <repository-url>
   cd tri-card-eye-stats
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file in the root directory with your Supabase credentials:
   ```
   VITE_SUPABASE_URL=your-supabase-url
   VITE_SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_URL=your-supabase-url
   SUPABASE_ANON_KEY=your-supabase-anon-key
   SUPABASE_SERVICE_KEY=your-supabase-service-role-key
   ```

   Note: The `VITE_` prefixed variables are used by the frontend, while the non-prefixed variables are used by the server. The service role key is required for the server to bypass Row Level Security when recording card check results.

### Running the Application

#### Development Mode

1. Start the server and frontend in development mode:
   ```
   npm run dev
   ```

2. In a separate terminal, start the Express server:
   ```
   npm run start
   ```

3. Open your browser and navigate to `http://localhost:5173`

#### Production Mode

1. Build the frontend:
   ```
   npm run build
   ```

2. Start the Express server which will serve the built frontend:
   ```
   npm run start
   ```

3. Open your browser and navigate to `http://localhost:3000`

### Deploying to a VPS

1. Clone the repository on your VPS:
   ```
   git clone <repository-url>
   cd tri-card-eye-stats
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Create a `.env` file with your Supabase credentials.

4. Build the frontend and start the server:
   ```
   npm run deploy
   ```

5. For production deployment, consider using a process manager like PM2:
   ```
   npm install -g pm2
   pm2 start server.cjs
   ```

6. Set up a reverse proxy with Nginx or Apache to serve your application on port 80/443.

## API Endpoints

### POST /api/check-card

Checks a single credit card. Requires authentication.

**Request Headers:**
```
Authorization: Bearer <your-supabase-jwt-token>
```

**Request Body:**
```json
{
  "cardData": "4111111111111111|05|28|123",
  "siteUrl": "https://example.com",
  "proxy": "ip:port:username:password"
}
```

**Response:**
```json
{
  "amount": "1.00",
  "card": "4111111111111111|05|28|123",
  "response": "Card charged successfully",
  "result": "CHARGED"
}
```

### POST /api/check-cards

Checks multiple credit cards. Requires authentication.

**Request Headers:**
```
Authorization: Bearer <your-supabase-jwt-token>
```

**Request Body:**
```json
{
  "cards": [
    "4111111111111111|05|28|123",
    "4222222222222222|06|29|456"
  ],
  "siteUrl": "https://example.com",
  "proxy": "ip:port:username:password"
}
```

**Response:**
```json
{
  "results": [
    {
      "card": "4111111111111111|05|28|123",
      "amount": "1.00",
      "response": "Card charged successfully",
      "result": "CHARGED"
    },
    {
      "card": "4222222222222222|06|29|456",
      "response": "3DS authentication required",
      "result": "3DS"
    }
  ]
}
```

### GET /api/auth/verify

Verifies if the user is authenticated.

**Request Headers:**
```
Authorization: Bearer <your-supabase-jwt-token>
```

**Response:**
```json
{
  "authenticated": true,
  "user": {
    "id": "user-id",
    "email": "user@example.com",
    "username": "username"
  }
}
```

## Authentication

The card checker functionality is protected by authentication. Users must be logged in to use the card checker. The authentication flow works as follows:

1. Users log in through the Supabase authentication system
2. The frontend obtains a JWT token from Supabase
3. The token is included in all API requests to the server
4. The server verifies the token with Supabase before processing requests
5. If the token is invalid or missing, the server returns a 401 Unauthorized error

### Setting Up Authentication

1. Create a Supabase account and project at [supabase.com](https://supabase.com)
2. Enable email/password authentication in your Supabase project
3. Create users in your Supabase project
4. Set the Supabase URL and anon key in your environment variables:
   ```
   SUPABASE_URL=your-supabase-url
   SUPABASE_ANON_KEY=your-supabase-anon-key
   ```

## Troubleshooting

- If you encounter CORS issues in development, make sure both the frontend and server are running.
- For proxy issues, verify the proxy format is correct: `ip:port:username:password`.
- Check the browser console and server logs for detailed error messages.
- Use the Debug button in the UI to see raw API responses.
- For authentication issues, make sure your Supabase credentials are correct and the user is logged in.
- If you see "Authentication required" errors, ensure you're logged in and your session is valid.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

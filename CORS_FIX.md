# CORS Configuration Fix

## Problem
CORS errors when frontend (`https://house-me.vercel.app`) tries to access backend (`https://house-me-server.vercel.app`).

## Solution Applied

Updated `backend/src/main.ts` with comprehensive CORS configuration:

1. **Allowed Origins**: Configured to allow requests from:
   - `https://house-me.vercel.app` (production frontend)
   - `https://house-me-server.vercel.app` (backend domain)
   - Local development origins

2. **CORS Options**:
   - `credentials: true` - Allows cookies and authentication headers
   - All HTTP methods (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD)
   - Comprehensive allowed headers including Authorization
   - Preflight handling with 204 status
   - 24-hour cache for preflight requests

## Environment Variables

Set in Vercel dashboard for the backend project:

```
ALLOWED_ORIGINS=https://house-me.vercel.app,https://house-me-server.vercel.app
NODE_ENV=production
```

## Testing

After deployment, test with:
```bash
curl -X OPTIONS https://house-me-server.vercel.app/auth/login \
  -H "Origin: https://house-me.vercel.app" \
  -H "Access-Control-Request-Method: POST" \
  -v
```

Should return 204 with CORS headers.

## Additional Notes

- In development mode, all origins are allowed for easier testing
- The origin function properly handles requests with no origin (server-to-server)
- Console warnings are logged for blocked origins in production


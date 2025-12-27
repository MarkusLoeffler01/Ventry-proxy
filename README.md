# Google OAuth Relay Service

This service provides a centralized authentication mechanism for dynamic CI/CD preview environments (e.g., `pr-112.ventry.com`). It handles the Google OAuth 2.0 handshake and issues a secure, root-domain session cookie that is valid across all matching subdomains.

## Why this exists

Google OAuth requires pre-registered Redirect URIs and does **not** support wildcards (e.g., `https://*.ventry.m-loeffler.de/callback`). This makes it impossible to directly authenticate users on dynamic preview URLs like `pr-123-ventry.m-loeffler.de`.

This service acts as a "relay":
1.  It initiates the OAuth flow from a known, fixed domain (e.g., `auth.ventry.m-loeffler.de`).
2.  It validates the user with Google.
3.  It sets a signed JWT cookie on the **root domain** (`.ventry.m-loeffler.de`).
4.  It safely redirects the user back to their specific PR environment.

## Workflow

1.  **User Visit**: A user visits a protected PR environment (e.g., `https://pr-123-ventry.m-loeffler.de`).
2.  **Redirect to Auth**: The PR environment (or ingress/middleware) detects a missing session and redirects the user to this service:
    ```
    https://auth.ventry.m-loeffler.de/api/auth/google?to=pr-123
    ```
3.  **Google Handshake**: This service validates the `to` parameter, generates a secure `state` token, and forwards the user to Google.
4.  **Callback**: Google redirects back to `https://auth.ventry.m-loeffler.de/api/auth/callback/google`.
5.  **Session Creation**: 
    - The service verifies the OAuth state and code.
    - It creates a JWT containing the user's profile.
    - It sets a `HttpOnly` cookie named `auth_session` on the domain `.ventry.m-loeffler.de`.
6.  **Final Redirect**: The service redirects the user back to `https://pr-123-ventry.m-loeffler.de/`.
7.  **Access**: The PR environment can now read the `auth_session` cookie to identify the user.

## Configuration

Create a `.env` file in the root directory:

```env
# Server Port
PORT=3009

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# The Public URL of this Auth Service
REDIRECT_BASE_URL=https://auth.ventry.m-loeffler.de

# Cookie Settings
# Must start with a dot (.) to support subdomains
COOKIE_DOMAIN=.ventry.m-loeffler.de
JWT_SECRET=your-secure-random-string
NODE_ENV=production
```

## API Endpoints

### `GET /api/auth/google`

Initiates the login flow.

**Query Parameters:**
*   `to` (Required): The target environment identifier. Must match the format `pr-\d+` (e.g., `pr-123`).

**Example:**
```bash
GET /api/auth/google?to=pr-112
```

### `GET /api/auth/callback/google`

The callback URL registered in the Google Cloud Console.

## Security Features

*   **Open Redirect Protection**: The `to` parameter is strictly validated against a regex (`/^pr-\d+$/`). The service *only* redirects to constructed URLs using this ID (e.g., `https://${to}-ventry.m-loeffler.de`), preventing redirection to arbitrary external domains.
*   **CSRF Protection**: Uses the OAuth `state` parameter combined with a short-lived `httpOnly` cookie (Double Submit Cookie pattern) to ensure the callback originated from this service.
*   **Cookie Security**:
    *   `HttpOnly`: Prevents client-side scripts from accessing the token (mitigates XSS).
    *   `Secure`: Ensures cookies are only sent over HTTPS.
    *   `SameSite=Lax`: Provides reasonable protection against CSRF while allowing the cookie to be sent during top-level navigations.

## Integration Guide for PR Environments

Your application running on `pr-*.ventry.m-loeffler.de` simply needs to check for the `auth_session` cookie.

**Node.js / Express Example:**

```typescript
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

app.use(cookieParser());

app.use((req, res, next) => {
  const token = req.cookies.auth_session;

  if (!token) {
    // Redirect to the central auth service
    // Extract 'pr-123' from the current hostname
    const prId = req.hostname.split("-")[0] + "-" + req.hostname.split("-")[1]; 
    return res.redirect(`https://auth.ventry.m-loeffler.de/api/auth/google?to=${prId}`);
  }

  try {
    const user = jwt.verify(token, process.env.JWT_SECRET);
    req.user = user;
    next();
  } catch (err) {
    // Invalid token
    return res.redirect(`https://auth.ventry.m-loeffler.de/api/auth/google?to=...`);
  }
});
```

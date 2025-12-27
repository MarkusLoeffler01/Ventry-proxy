import axios from "axios";
import env from "dotenv";
import express from "express";
import queryString from "querystring";
import z from "zod";
import cookieParser from "cookie-parser";
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { GoogleCallbackSchema, StateSchema, ToParam } from "./zod.ts";

env.config();

const app = express();
app.use(cookieParser());

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID!;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET!;
const REDIRECT_BASE_URL = process.env.REDIRECT_BASE_URL!; // e.g., https://auth.ventry.m-loeffler.de
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const COOKIE_DOMAIN = process.env.COOKIE_DOMAIN || ".ventry.m-loeffler.de";

// Ensure redirects go to the correct callback path without query params
const GOOGLE_REDIRECT_URI = `${REDIRECT_BASE_URL}/api/auth/callback/google`;

app.get("/", (_req, res) => {
    res.send("Ventry Auth Service");
});

app.get("/api/auth/google", (req, res) => {
    // 1. Validate 'to' parameter (Strict Open Redirect Prevention)
    const to = ToParam.safeParse(req.query.to);
    if (!to.success) {
        return res.status(400).json({ error: "Invalid target environment", details: z.prettifyError ? z.prettifyError(to.error) : to.error });
    }

    // 2. Generate Nonce and State (State Parameter Handling)
    const nonce = crypto.randomBytes(16).toString("hex");
    const stateJson = JSON.stringify({ to: to.data, nonce });
    const state = Buffer.from(stateJson).toString("base64");

    // 3. Set secure, httpOnly cookie for state verification
    res.cookie("oauth_state", nonce, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 300000 // 5 minutes
    });

    const params = queryString.stringify({
        client_id: GOOGLE_CLIENT_ID,
        response_type: "code",
        scope: "openid email profile",
        access_type: "online",
        prompt: "consent",
        state: state,
        redirect_uri: GOOGLE_REDIRECT_URI
    });

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}`);
});

app.get("/api/auth/callback/google", async (req, res) => {
    const queryParams = new URLSearchParams(req.query as any).toString();
    const destination = req.cookies['ventry_destination'] || 'ventry';
    const targetUrl = `https://${destination}.m-loeffler.de/api/auth/callback/google?${queryParams}`;

    try {
        const response = await axios.get(targetUrl, {
            headers: {
                ...req.headers,
                host: `${destination}.m-loeffler.de`
            },
            validateStatus: () => true,
            maxRedirects: 0
        });

        // Forward all headers (especially set-cookie)
        Object.entries(response.headers).forEach(([key, value]) => {
            if (value) res.setHeader(key, value);
        });

        res.status(response.status).send(response.data);
    } catch (error) {
        console.error("Proxy error:", error);
        res.status(500).send("Authentication Proxy Error");
    }
});

app.get("/api/auth/callback/github", async (req, res) => {
    const queryParams = new URLSearchParams(req.query as any).toString();
    const destination = req.cookies['ventry_destination'] || 'ventry';
    const targetUrl = `https://${destination}.m-loeffler.de/api/auth/callback/github?${queryParams}`;

    console.log(`Proxying GitHub Callback: -> ${targetUrl}`);

    try {
        // We use axios to "call" the actual ventry instance
        const response = await axios.get(targetUrl, {
            headers: {
                ...req.headers,
                host: `${destination}.m-loeffler.de`
            },
            validateStatus: () => true,
            maxRedirects: 0 // Don't follow redirects, we want to pass them to the browser
        });

        // Forward headers (Set-Cookie is critical here)
        Object.entries(response.headers).forEach(([key, value]) => {
            if (value) res.setHeader(key, value);
        });

        // Clear the destination cookie on the root domain
        res.clearCookie("ventry_destination", { domain: ".m-loeffler.de" });

        res.status(response.status).send(response.data);
    } catch (error) {
        console.error("Proxy error:", error);
        res.status(500).send("Authentication Proxy Error");
    }
});


const PORT = process.env.PORT || 3009;
app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});

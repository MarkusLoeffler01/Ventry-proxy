import axios from "axios";
import env from "dotenv";
import express from "express";
import queryString from "querystring";
import z from "zod";
import { GoogleCallbackSchema, ToParam } from "./zod.ts";

env.config();

const app = express();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const REDIRECT_BASE = process.env.REDIRECT_BASE_URL;



app.get("/", (_req, res) => {
    res.send("Hello, World!");
});


app.get("/api/auth/google", (req, res) => {
    const to = ToParam.safeParse(req.query.to);
    if(!to.success) return res.status(400).json({ error: z.prettifyError(to.error) });

    const redirectUri = `${REDIRECT_BASE}?to=${to.data}`;

    const params = queryString.stringify({
        client_id: GOOGLE_CLIENT_ID,
        response_type: "code",
        scope: "openid email profile https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
        access_type: "online",
        prompt: "consent",
        state: crypto.randomUUID()
    })

    res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params}&redirect_uri=${encodeURIComponent(redirectUri)}`);

});


app.get("/api/auth/callback/google", async (req, res) => {
    const parsed = GoogleCallbackSchema.safeParse(req.query);
    if(!parsed.success) return res.status(400).json({ error: z.prettifyError(parsed.error) });

    const { code, to } = parsed.data;

    if(!to) {
        return res.status(400).send("Missing 'to' parameter - cannot map to PR");
    }

    try {
        const tokenRes = await axios.post(
            "https://oauth2.googleapis.com/token",
            queryString.stringify({
                code,
                client_id: GOOGLE_CLIENT_ID,
                client_secret: GOOGLE_CLIENT_SECRET,
                redirect_uri: `${REDIRECT_BASE}?to=${to}`,
                grant_type: "authorization_code"
            }),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded"
                }
            }
        );

        const tokens = tokenRes.data;

        const target = `https://${to}-ventry.m-loeffler.de/api/auth/callback/google?${queryString.stringify(tokens)}`;
        console.log(`Forwarding OAuth result to ${target}`);
        res.redirect(target);
    } catch(err: unknown) {
        if(typeof err === "object" && err !== null && "response" in err && err.response) {
            if("data" in (err as any).response) {
                console.error("Token exchange failed", (err as any).response.data);
            }
        }
        res.status(500).send("OAuth token exchange failed");
    }
});

app.listen(3009, () => {
    console.log("Server is running on http://localhost:3000");
});
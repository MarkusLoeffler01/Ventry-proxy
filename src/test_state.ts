import crypto from "crypto";

const to = "pr-123";
const nonce = crypto.randomBytes(16).toString("hex");
const stateJson = JSON.stringify({ to, nonce });
const state = Buffer.from(stateJson).toString("base64");

console.log("Nonce:", nonce);
console.log("State JSON:", stateJson);
console.log("State Base64:", state);

// Decode check
const decodedJson = Buffer.from(state, "base64").toString("utf-8");
console.log("Decoded JSON:", decodedJson);

// User's failing state
const userState = "hpFNTOt6TytJJokZDykBPgmDvvL4cbma";
try {
    const userDecoded = Buffer.from(userState, "base64").toString("utf-8");
    console.log("User State Decoded (Raw):", userDecoded);
    const userJson = JSON.parse(userDecoded);
    console.log("User State Parsed:", userJson);
} catch (e) {
    console.error("Failed to parse user state:", e.message);
}

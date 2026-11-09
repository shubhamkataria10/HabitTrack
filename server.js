const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = 3000;
const DATA_DIR = path.join(__dirname, "data");
const ACCOUNTS_DIR = path.join(DATA_DIR, "accounts");
const USERS_FILE = path.join(DATA_DIR, "users.json");
const LEGACY_FILES = {
    habitTrackDailyHabits: "habits.json",
    habitTrackExercises: "exercises.json"
};
const DEFAULTS = {
    habitTrackUser: {},
    habitTrackDailyHabits: {},
    habitTrackExercises: [],
    habitTrackFeedback: []
};
const SESSION_SECRET = process.env.HABITTRACK_SECRET || "habittrack-local-demo-change-this-secret";
const SESSION_COOKIE = "habittrack_session";
const SESSION_MAX_AGE = 7 * 24 * 60 * 60 * 1000;

fs.mkdirSync(ACCOUNTS_DIR, { recursive: true });
app.use(express.json({ limit: "1mb" }));
app.use((req, res, next) => {
    if (req.path.startsWith("/data/") || ["/server.js", "/package.json", "/package-lock.json"].includes(req.path)) {
        return res.sendStatus(404);
    }
    next();
});

function readJSON(file, fallback) {
    try { return JSON.parse(fs.readFileSync(file, "utf8")); }
    catch { return fallback; }
}
function writeJSON(file, value) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const temp = file + ".tmp";
    fs.writeFileSync(temp, JSON.stringify(value, null, 4));
    fs.renameSync(temp, file);
}
function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}
function accountFile(email) {
    const id = crypto.createHash("sha256").update(normalizeEmail(email)).digest("hex");
    return path.join(ACCOUNTS_DIR, `${id}.json`);
}
function readUsers() {
    const value = readJSON(USERS_FILE, []);
    if (Array.isArray(value)) return value;
    if (value && value.email) return [{ email: normalizeEmail(value.email), name: value.name || "", salt: null, passwordHash: null, legacy: true }];
    return [];
}
function writeUsers(users) { writeJSON(USERS_FILE, users); }
function findUser(email) { return readUsers().find(user => user.email === normalizeEmail(email)); }
function readAccountData(email) {
    return readJSON(accountFile(email), { ...DEFAULTS, habitTrackUser: {} });
}
function writeAccountData(email, data) { writeJSON(accountFile(email), data); }
function hashPassword(password, salt) {
    return crypto.scryptSync(password, salt, 64).toString("hex");
}
function safeEqual(a, b) {
    const left = Buffer.from(String(a || ""), "hex");
    const right = Buffer.from(String(b || ""), "hex");
    return left.length === right.length && left.length > 0 && crypto.timingSafeEqual(left, right);
}
function makeSession(email) {
    const payload = Buffer.from(JSON.stringify({ email, expires: Date.now() + SESSION_MAX_AGE })).toString("base64url");
    const signature = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    return `${payload}.${signature}`;
}
function getSessionEmail(req) {
    const cookie = req.headers.cookie || "";
    const token = cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`${SESSION_COOKIE}=`))?.slice(SESSION_COOKIE.length + 1);
    if (!token) return null;
    const [payload, signature] = token.split(".");
    if (!payload || !signature) return null;
    const expected = crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
    if (signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
    try {
        const session = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        return session.expires > Date.now() && findUser(session.email) ? session.email : null;
    } catch { return null; }
}
function requireLogin(req, res, next) {
    const email = getSessionEmail(req);
    if (!email) return res.status(401).json({ error: "Please log in to continue." });
    req.userEmail = email;
    next();
}
function setSession(res, email) {
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=${makeSession(email)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_MAX_AGE / 1000}`);
}

// Preserve the existing single-account data in its original email account.
(function migrateExistingData() {
    const users = readUsers();
    if (!users.length) return;
    users.forEach(user => {
        const file = accountFile(user.email);
        if (fs.existsSync(file)) return;
        const oldUser = readJSON(USERS_FILE, {});
        const data = {
            habitTrackUser: { ...(oldUser && !Array.isArray(oldUser) ? oldUser : {}), email: user.email, name: user.name || oldUser.name || "" },
            habitTrackDailyHabits: readJSON(path.join(DATA_DIR, LEGACY_FILES.habitTrackDailyHabits), {}),
            habitTrackExercises: readJSON(path.join(DATA_DIR, LEGACY_FILES.habitTrackExercises), []),
            habitTrackFeedback: []
        };
        writeAccountData(user.email, data);
    });
    if (!Array.isArray(readJSON(USERS_FILE, null))) writeUsers(users);
})();

app.post("/api/auth/signup", (req, res) => {
    const name = String(req.body.name || "").trim();
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6) {
        return res.status(400).json({ error: "Enter a valid name, email, and password of at least 6 characters." });
    }
    const users = readUsers();
    let user = users.find(item => item.email === email);
    if (user && user.passwordHash) return res.status(409).json({ error: "An account with this email already exists. Please log in." });
    const salt = crypto.randomBytes(16).toString("hex");
    if (user) {
        // Claim the previous data-only account using its original email.
        user.name = name || user.name;
        user.salt = salt;
        user.passwordHash = hashPassword(password, salt);
        user.legacy = false;
    } else {
        user = { email, name, salt, passwordHash: hashPassword(password, salt), legacy: false };
        users.push(user);
        writeAccountData(email, {
            habitTrackUser: { name, email },
            habitTrackDailyHabits: {},
            habitTrackExercises: [],
            habitTrackFeedback: []
        });
    }
    writeUsers(users);
    const data = readAccountData(email);
    data.habitTrackUser = { ...(data.habitTrackUser || {}), name, email };
    writeAccountData(email, data);
    setSession(res, email);
    res.json({ message: "Account created successfully." });
});

app.post("/api/auth/login", (req, res) => {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");
    const user = findUser(email);
    if (!user) return res.status(401).json({ error: "No account found with this email. Please sign up first." });
    if (!user.passwordHash) return res.status(401).json({ error: "This is your previous HabitTrack account. Create an account using this same email to set a password and keep your saved progress." });
    if (!safeEqual(hashPassword(password, user.salt), user.passwordHash)) {
        return res.status(401).json({ error: "Incorrect email or password." });
    }
    setSession(res, email);
    res.json({ message: "Login successful." });
});

app.post("/api/auth/logout", (req, res) => {
    res.setHeader("Set-Cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
    res.json({ message: "Logged out successfully." });
});

app.get("/api/me", requireLogin, (req, res) => {
    const user = findUser(req.userEmail);
    res.json({ user: { name: user.name, email: user.email } });
});

app.get("/api/data", requireLogin, (req, res) => {
    res.json({ data: readAccountData(req.userEmail) });
});

app.put("/api/data/:key", requireLogin, (req, res) => {
    const allowed = ["habitTrackUser", "habitTrackDailyHabits", "habitTrackExercises"];
    const key = req.params.key;
    if (!allowed.includes(key)) return res.status(400).json({ error: "Unknown or restricted data collection." });
    const data = readAccountData(req.userEmail);
    data[key] = req.body;
    if (key === "habitTrackUser") data[key] = { ...(req.body || {}), email: req.userEmail };
    writeAccountData(req.userEmail, data);
    if (key === "habitTrackUser") {
        const users = readUsers();
        const user = users.find(item => item.email === req.userEmail);
        if (user && data[key].name) { user.name = data[key].name; writeUsers(users); }
    }
    res.json({ message: "Data saved successfully." });
});

// Feedback is a shared site-level collection and does not contain habit progress.
app.post("/api/feedback", (req, res) => {
    const file = path.join(DATA_DIR, "feedback.json");
    const feedback = readJSON(file, []);
    feedback.push(req.body);
    writeJSON(file, feedback);
    res.json({ message: "Feedback saved successfully." });
});

app.get("/api/health", (req, res) => res.json({ status: "HabitTrack server is running" }));
app.use(express.static(__dirname));

app.listen(PORT, () => console.log(`HabitTrack is running at http://localhost:${PORT}`));

HABITTRACK - LOCAL SETUP

1. Install Node.js (LTS) on your computer.
2. Open this project folder in VS Code.
3. Open Terminal > New Terminal.
4. Run: npm install
5. Run: npm start
6. Open: http://localhost:3000

ACCOUNT AND DATA NOTES
- Create an account with your name, email, and a password of at least 6 characters.
- Each email has its own habits, exercises, profile, and progress data.
- The previous saved HabitTrack data is preserved for the email already present in data/users.json.
- To attach a password to that old account for the first time, use Create Account with the SAME email address. This claims the existing data; it does not erase it.
- After that, log in normally with that email and password.
- Use Logout before switching to another account.
- Account records and account-specific data are stored under data/ (the accounts folder is created automatically on first server start).
- Do not edit or share the data/accounts files publicly. Passwords are stored as salted password hashes, not plain text.

IMPORTANT
This is a local college-project demonstration. For a public production website, use HTTPS, a strong HABITTRACK_SECRET environment variable, database-backed accounts, rate limiting, and a production-grade session/authentication setup.

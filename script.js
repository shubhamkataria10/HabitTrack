/* ==========================================
   HABITTRACK - COMMON JAVASCRIPT
   ========================================== */

// 1. STORAGE KEYS

const HABIT_KEY = "habitTrackDailyHabits";
const EXERCISE_KEY = "habitTrackExercises";
const USER_KEY = "habitTrackUser";
const FEEDBACK_KEY = "habitTrackFeedback";

const STORAGE_KEYS = [
    HABIT_KEY, EXERCISE_KEY, USER_KEY, FEEDBACK_KEY
];

const DEFAULT_HABITS = [
    "Drink Water",
    "Exercise",
    "Read",
    "Meditation",
    "Sleep Early",
    "Healthy Food"
];

const CATEGORIES = {
    "Drink Water": "Health",
    "Exercise": "Fitness",
    "Read": "Study",
    "Meditation": "Mindfulness",
    "Sleep Early": "Health",
    "Healthy Food": "Health"
};


// 2. STORAGE FUNCTIONS

function getData(key, fallback = {}) {
    try {
        return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
        return fallback;
    }
}

async function saveData(key, value) {
    localStorage.setItem(key, JSON.stringify(value));

    try {
        let response;
        if (key === FEEDBACK_KEY) {
            response = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(value[value.length - 1])
            });
        } else {
            response = await fetch(`/api/data/${encodeURIComponent(key)}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(value)
            });
        }
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.error || "Save failed");
        }
    } catch (error) {
        console.error("Storage error:", error);
        alert(error.message || "Unable to save data. Please log in again.");
    }
}

function setupLogoutLink() {
    // Use the Logout link already present in the HTML navbar.
    const logoutLink = document.querySelector(
        'nav a.navbtn[href="index.html"], nav a.navbtn[href="login.html"]'
    );

    if (!logoutLink || logoutLink.dataset.logoutReady === "true") return;

    logoutLink.dataset.logoutReady = "true";

    logoutLink.addEventListener("click", async event => {
        event.preventDefault();

        try {
            await fetch("/api/auth/logout", { method: "POST" });
        } finally {
            STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
            window.location.href = "login.html";
        }
    });
}

async function initializeStorage() {
    const page = window.location.pathname.split("/").pop() || "index.html";
    const publicPages = ["index.html", "login.html", "feedback.html"];
    if (publicPages.includes(page)) return true;

    try {
        const meResponse = await fetch("/api/me");
        if (!meResponse.ok) {
            STORAGE_KEYS.forEach(key => localStorage.removeItem(key));
            window.location.href = "login.html";
            return false;
        }

        const response = await fetch("/api/data");
        if (!response.ok) throw new Error("Could not load your account data.");
        const result = await response.json();

        STORAGE_KEYS.forEach(key => {
            const value = result.data?.[key] ?? (key === EXERCISE_KEY || key === FEEDBACK_KEY ? [] : {});
            localStorage.setItem(key, JSON.stringify(value));
        });
        setupLogoutLink();
        return true;
    } catch (error) {
        console.error(error);
        alert("Unable to load your account. Please start the server using npm start and log in again.");
        window.location.href = "login.html";
        return false;
    }
}

// 3. DATE AND HABIT FUNCTIONS

function todayKey(date = new Date()) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");

    return `${year}-${month}-${day}`;
}

function getTodayHabits() {
    return getData(HABIT_KEY, {})[todayKey()] || {};
}

async function saveTodayHabits(completed) {
    const all = getData(HABIT_KEY, {});
    all[todayKey()] = completed;

    await saveData(HABIT_KEY, all);
}

function getActiveHabits() {
    const user = getData(USER_KEY, {});
    const removed = user.removedHabits || [];

    const exercises = getData(EXERCISE_KEY, []).map(e => e.name);

    return [...new Set([
        ...DEFAULT_HABITS.filter(h => !removed.includes(h)),
        ...exercises
    ])];
}

function getCompletedCount() {
    const completed = getTodayHabits();

    return getActiveHabits().filter(name => completed[name]).length;
}

function calculateStreak() {
    const all = getData(HABIT_KEY, {});
    const today = new Date();

    // Allow yesterday's streak to continue if today is not completed yet.
    if (!Object.values(all[todayKey(today)] || {}).some(Boolean)) {
        today.setDate(today.getDate() - 1);
    }

    let streak = 0;

    while (Object.values(all[todayKey(today)] || {}).some(Boolean)) {
        streak++;
        today.setDate(today.getDate() - 1);
    }

    return streak;
}


// 4. HABITS PAGE

function createRemoveButton() {
    const button = document.createElement("button");

    button.type = "button";
    button.className = "remove-habit-btn";
    button.textContent = "Remove Habit";

    return button;
}

function displayCustomHabits() {
    const grid = document.querySelector(".habit-grid");
    if (!grid) return;

    grid.querySelectorAll("[data-custom-habit]").forEach(card => card.remove());

    const exercises = getData(EXERCISE_KEY, []);
    const completed = getTodayHabits();

    exercises.forEach(exercise => {
        const type = (exercise.type || "").toLowerCase();

        CATEGORIES[exercise.name] =
            type.includes("study") ? "Study" :
            type.includes("mind") ? "Mindfulness" :
            type.includes("health") ? "Health" : "Fitness";

        const card = document.createElement("div");
        card.className = "habit-card";
        card.dataset.customHabit = "true";

        const heading = document.createElement("h3");
        heading.textContent = exercise.name;

        const description = document.createElement("p");
        description.textContent =
            `${exercise.type} · ${exercise.duration} minutes · ${exercise.schedule}`;

        const notes = document.createElement("p");
        notes.className = "streak";
        notes.textContent = exercise.notes || "Personal exercise";

        const button = document.createElement("button");
        button.className = "habit-btn";

        button.textContent = completed[exercise.name]
            ? "Completed ✓" : "Mark as Done ✓";

        button.classList.toggle("completed", !!completed[exercise.name]);

        card.append(
            heading, description, notes, button, createRemoveButton()
        );

        grid.appendChild(card);
    });
}

function initializeHabitsPage() {
    const grid = document.querySelector(".habit-grid");
    if (!grid) return;

    const removed = getData(USER_KEY, {}).removedHabits || [];

    grid.querySelectorAll(".habit-card").forEach(card => {
        const name = card.querySelector("h3")?.textContent.trim();

        if (removed.includes(name)) {
            card.remove();
        } else {
            card.dataset.defaultHabit = "true";

            if (!card.querySelector(".remove-habit-btn")) {
                card.appendChild(createRemoveButton());
            }
        }
    });

    displayCustomHabits();

    grid.querySelectorAll(".habit-card").forEach(card => {
        const name = card.querySelector("h3")?.textContent.trim();
        const button = card.querySelector(".habit-btn");

        if (!name || !button) return;

        const done = !!getTodayHabits()[name];

        button.textContent = done ? "Completed ✓" : "Mark as Done ✓";
        button.classList.toggle("completed", done);
    });

    grid.addEventListener("click", async event => {
        const remove = event.target.closest(".remove-habit-btn");

        if (remove) {
            const card = remove.closest(".habit-card");
            const name = card?.querySelector("h3")?.textContent.trim();

            if (!name || !confirm(`Remove ${name}?`)) return;

            if (card.dataset.customHabit) {
                const exercises = getData(EXERCISE_KEY, []);

                await saveData(
                    EXERCISE_KEY,
                    exercises.filter(e => e.name !== name)
                );
            } else {
                const user = getData(USER_KEY, {});
                const removed = user.removedHabits || [];

                if (!removed.includes(name)) removed.push(name);

                await saveData(USER_KEY, {
                    ...user,
                    removedHabits: removed
                });
            }

            const all = getData(HABIT_KEY, {});

            Object.values(all).forEach(day => delete day[name]);

            await saveData(HABIT_KEY, all);

            card.remove();
            updateAllPages();
            return;
        }

        const button = event.target.closest(".habit-btn");
        if (!button) return;

        const card = button.closest(".habit-card");
        const name = card?.querySelector("h3")?.textContent.trim();

        if (!name) return;

        const completed = getTodayHabits();
        completed[name] = !completed[name];

        await saveTodayHabits(completed);

        button.textContent = completed[name]
            ? "Completed ✓" : "Mark as Done ✓";

        button.classList.toggle("completed", completed[name]);

        updateAllPages();
    });

    // Category filtering
    document.querySelectorAll(".category").forEach(button => {
        button.addEventListener("click", () => {
            document.querySelectorAll(".category").forEach(item =>
                item.classList.remove("active")
            );

            button.classList.add("active");

            const selected = button.textContent.trim();

            grid.querySelectorAll(".habit-card").forEach(card => {
                const name = card.querySelector("h3")?.textContent.trim();
                const type = CATEGORIES[name] ||
                    getData(EXERCISE_KEY, []).find(e => e.name === name)?.type;

                card.style.display =
                    selected === "All" || type === selected ? "" : "none";
            });
        });
    });
}


// 5. ADD EXERCISE PAGE

function initializeExerciseForm() {
    const form = document.querySelector(".new-form");
    if (!form || !document.querySelector('input[type="number"]')) return;

    const button = form.querySelector('button[type="button"]');
    if (!button) return;

    button.addEventListener("click", async () => {
        const name = form.querySelector('input[type="text"]')?.value.trim();
        const duration = Number(
            form.querySelector('input[type="number"]')?.value
        );

        const selects = form.querySelectorAll("select");
        const type = selects[0]?.value || "";
        const schedule = selects[1]?.value || "";
        const notes = form.querySelector("textarea")?.value.trim() || "";

        if (!name || !type || !duration || duration < 1 || !schedule) {
            alert("Please fill in all required exercise details.");
            return;
        }

        const exercises = getData(EXERCISE_KEY, []);

        const duplicate = [
            ...DEFAULT_HABITS,
            ...exercises.map(e => e.name)
        ].some(item => item.toLowerCase() === name.toLowerCase());

        if (duplicate) {
            alert("This habit already exists.");
            return;
        }

        exercises.push({ name, type, duration, schedule, notes });

        await saveData(EXERCISE_KEY, exercises);

        form.reset();
        alert("Exercise added successfully!");
    });
}


// 6. PROFILE PAGE

function updateProfile() {
    const profile = document.querySelector(".personal-bar");
    if (!profile) return;

    const user = getData(USER_KEY, {});
    const heading = profile.querySelector("h2");
    const paragraphs = profile.querySelectorAll("p");

    if (heading) heading.textContent = user.name || "HabitTrack Member";

    if (paragraphs[1]) paragraphs[1].textContent =
        user.email || "Add your email";

    if (paragraphs[2]) paragraphs[2].textContent =
        user.location || "Location not added";

    if (paragraphs[3]) paragraphs[3].textContent =
        user.age ? `Age: ${user.age}` : "Age: Not added";

    // Keep the fitness goal identical in both profile sections.
    const fitnessGoal = user.goal ||
        "Build a healthy lifestyle through daily exercise.";

    const headings = profile.querySelectorAll("h3");

    if (headings[0]?.nextElementSibling) {
        headings[0].nextElementSibling.textContent = fitnessGoal;
    }

    const goalCardText = document.querySelector(".goal-card p");

    if (goalCardText) {
        goalCardText.textContent = fitnessGoal;
    }

    if (headings[1]?.nextElementSibling) {
        headings[1].nextElementSibling.textContent =
            user.motto || "Consistency is the key to success.";
    }

    const avatar = profile.querySelector(".avatar");

    if (avatar) {
        avatar.textContent = user.name
            ? user.name.charAt(0).toUpperCase()
            : "👤";
    }
}

function displayProfileExercises() {
    const list = document.querySelector("#profile-exercise-list") ||
        document.querySelector(".profile-content .task-list");

    if (!list) return;

    const exercises = getData(EXERCISE_KEY, []);
    const completed = getTodayHabits();

    list.replaceChildren();

    if (!exercises.length) {
        const message = document.createElement("p");
        message.textContent = "No exercises added yet.";
        list.appendChild(message);
        return;
    }

    exercises.forEach(exercise => {
        const row = document.createElement("div");
        row.className = "task-row";

        const details = document.createElement("div");
        const heading = document.createElement("h3");
        const description = document.createElement("p");
        const status = document.createElement("span");

        heading.textContent = exercise.name;
        description.textContent =
            `${exercise.duration} minutes · ${exercise.type} · ${exercise.schedule}`;

        status.className = "task-status";
        status.textContent = completed[exercise.name]
            ? "Completed" : "Pending";

        status.classList.add(
            completed[exercise.name] ? "completed" : "pending"
        );

        details.append(heading, description);
        row.append(details, status);
        list.appendChild(row);
    });
}

function initializeProfileEdit() {
    const profile = document.querySelector(".personal-bar");
    const editLink = profile?.querySelector('a[href="#edit-profile"]');

    if (!profile || !editLink) return;

    editLink.addEventListener("click", event => {
        event.preventDefault();

        if (document.querySelector("#profile-edit-form")) return;

        const user = getData(USER_KEY, {});
        const form = document.createElement("form");

        form.id = "profile-edit-form";
        form.className = "new-form";

        const fields = [
            ["name", "Full Name"],
            ["email", "Email Address"],
            ["location", "Location"],
            ["age", "Age"],
            ["goal", "Fitness Goal"],
            ["motto", "My Motto"]
        ];

        fields.forEach(([name, label]) => {
            const wrapper = document.createElement("div");
            const fieldLabel = document.createElement("label");
            const input = document.createElement("input");

            fieldLabel.textContent = label;
            input.name = name;
            input.value = user[name] || "";
            input.required = ["name", "email"].includes(name);
            input.type = name === "email" ? "email" :
                name === "age" ? "number" : "text";

            wrapper.append(fieldLabel, input);
            form.appendChild(wrapper);
        });

        const save = document.createElement("button");
        save.type = "submit";
        save.textContent = "Save Changes";

        const cancel = document.createElement("button");
        cancel.type = "button";
        cancel.textContent = "Cancel";

        form.append(save, cancel);
        editLink.after(form);

        cancel.addEventListener("click", () => form.remove());

        form.addEventListener("submit", async event => {
            event.preventDefault();

            const updated = Object.fromEntries(
                fields.map(([name]) => [
                    name, form.elements[name].value.trim()
                ])
            );

            if (
                updated.name.length < 2 ||
                !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updated.email) ||
                (updated.age && Number(updated.age) < 0)
            ) {
                alert("Please enter valid profile details.");
                return;
            }

            await saveData(USER_KEY, { ...user, ...updated });

            form.remove();
            updateProfile();

            alert("Profile updated successfully!");
        });
    });
}


// 7. WEEKLY PROGRESS

function getWeeklyData() {
    const all = getData(HABIT_KEY, {});
    const names = getActiveHabits();
    const result = [];

    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);

        const day = all[todayKey(date)] || {};
        const completed = names.filter(name => day[name]).length;

        result.push({
            day: date.toLocaleDateString("en", { weekday: "short" }),
            completed,
            total: names.length,
            percentage: names.length
                ? Math.round(completed / names.length * 100) : 0
        });
    }

    return result;
}

function updateProgress() {
    const names = getActiveHabits();
    const completed = getCompletedCount();
    const total = names.length;
    const percentage = total
        ? Math.round(completed / total * 100) : 0;

    // Today's progress
    const layout = document.querySelector(".progress-layout");

    if (layout) {
        const card = layout.querySelectorAll(".new-card")[1];

        if (card) {
            const description = card.querySelector(".muted");
            const bar = card.querySelector(".progress");
            const heading = card.querySelector("h3");

            if (description) {
                description.textContent =
                    `${completed} out of ${total} habits completed`;
            }

            if (bar) bar.style.width = percentage + "%";
            if (heading) heading.textContent = percentage + "% Completed";
        }
    }

    // Weekly chart
    const chart = document.querySelector(".weekly-chart");

    if (chart) {
        chart.replaceChildren();

        getWeeklyData().forEach(day => {
            const column = document.createElement("div");
            const bar = document.createElement("span");
            const label = document.createElement("small");

            bar.style.height = day.percentage + "%";
            bar.style.display = "block";
            bar.style.minHeight = day.percentage ? "4px" : "0";
            bar.title = `${day.completed} of ${day.total} completed`;

            label.textContent = day.day;

            column.append(bar, label);
            chart.appendChild(column);
        });
    }

    // Progress statistics
    const weekly = getWeeklyData();
    const weeklyCompleted = weekly.reduce(
        (sum, day) => sum + day.completed, 0
    );
    const weeklyTotal = weekly.reduce(
        (sum, day) => sum + day.total, 0
    );

    const average = weeklyTotal
        ? Math.round(weeklyCompleted / weeklyTotal * 100) : 0;

    document.querySelectorAll(".stats .stat-card").forEach(card => {
        const label = card.querySelector("p")?.textContent.toLowerCase();
        const value = card.querySelector("h3");

        if (!label || !value) return;

        if (label.includes("weekly completion")) {
            value.textContent = average + "%";
        }

        if (label.includes("habits completed")) {
            value.textContent = weeklyCompleted;
        }

        if (label.includes("current streak")) {
            value.textContent = calculateStreak() + " Days";
        }
    });
}


// PROFILE PAGE STATISTICS

function updateProfileStats() {
    const profileContent = document.querySelector(".profile-content");
    if (!profileContent) return;

    const habits = getActiveHabits();

    // Total habits completed during the last 7 days
    const weeklyCompleted = getWeeklyData().reduce(
        (sum, day) => sum + day.completed, 0
    );

    // Habits completed and pending today
    const todayCompleted = getCompletedCount();
    const pendingToday = Math.max(0, habits.length - todayCompleted);

    const cards = profileContent.querySelectorAll(".stat-card");

    // Completed habits this week
    if (cards[0]?.querySelector("h3")) {
        cards[0].querySelector("h3").textContent = weeklyCompleted;
    }

    // Pending habits today
    if (cards[1]?.querySelector("h3")) {
        cards[1].querySelector("h3").textContent = pendingToday;
    }

    // Current streak
    if (cards[2]?.querySelector("h3")) {
        cards[2].querySelector("h3").textContent =
            calculateStreak() + " Days";
    }
}


// 8. DASHBOARD PAGE

function updateDashboard() {
    const user = getData(USER_KEY, {});
    const greeting = document.querySelector(
        "#dashboard-greeting, .dashboard-head h1"
    );

    if (greeting) {
        greeting.textContent = user.name
            ? `Welcome, ${user.name}!`
            : "Welcome to Your Daily Planner";
    }


    const habits = getActiveHabits();
    const completed = getCompletedCount();
    const pending = habits.length - completed;

    const setText = (id, value) => {
        const element = document.getElementById(id);
        if (element) element.textContent = value;
    };

    setText("dash-total", habits.length);
    setText("dash-completed", completed);
    setText("dash-pending", pending);
    setText("dash-streak", calculateStreak() + " Days");

    const bar = document.querySelector("#dashboard-progress-bar");
    const progressText = document.querySelector("#dashboard-progress-text");

    const percentage = habits.length
        ? Math.round(completed / habits.length * 100) : 0;

    if (bar) bar.style.width = percentage + "%";
    if (progressText) progressText.textContent = percentage + "% completed";

    // Dashboard habit list
    const habitList = document.querySelector("#dashboard-habit-list");

    if (habitList) {
        habitList.replaceChildren();

        habits.forEach(name => {
            const item = document.createElement("p");
            item.textContent =
                `${getTodayHabits()[name] ? "✓" : "○"} ${name}`;
            habitList.appendChild(item);
        });
    }

    // Dashboard exercise list
    const exerciseList = document.querySelector("#dashboard-exercise-list");

    if (exerciseList) {
        exerciseList.replaceChildren();

        const exercises = getData(EXERCISE_KEY, []);

        if (!exercises.length) {
            exerciseList.textContent = "No exercises added yet.";
        }

        exercises.forEach(exercise => {
            const item = document.createElement("p");
            item.textContent =
                `${exercise.name} · ${exercise.duration} minutes`;
            exerciseList.appendChild(item);
        });
    }
}


// 9. LOGIN AND SIGNUP

function initializeAuth() {
    document.querySelectorAll(".form-box form").forEach(form => {
        form.addEventListener("submit", async event => {
            event.preventDefault();
            const inputs = form.querySelectorAll("input");
            const signup = !!form.closest(".signup");
            const name = signup ? inputs[0]?.value.trim() : "";
            const email = inputs[signup ? 1 : 0]?.value.trim().toLowerCase() || "";
            const password = inputs[signup ? 2 : 1]?.value || "";

            if (signup && name.length < 2) return alert("Enter your full name.");
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return alert("Enter a valid email address.");
            if (password.length < 6) return alert("Password must contain at least 6 characters.");
            if (signup) {
                const terms = form.querySelector('input[type="checkbox"]');
                if (terms && !terms.checked) return alert("Please accept the Terms and Conditions.");
            }

            const endpoint = signup ? "/api/auth/signup" : "/api/auth/login";
            const payload = signup ? { name, email, password } : { email, password };
            const button = form.querySelector('button[type="submit"]');
            if (button) button.disabled = true;
            try {
                const response = await fetch(endpoint, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                const result = await response.json();
                if (!response.ok) throw new Error(result.error || "Authentication failed.");
                window.location.href = "dashboard.html";
            } catch (error) {
                alert(error.message);
            } finally {
                if (button) button.disabled = false;
            }
        });
    });
}

// 10. FEEDBACK PAGE

function initializeFeedback() {
    const form = document.querySelector(".feedback-form");
    if (!form) return;

    form.addEventListener("submit", async event => {
        event.preventDefault();

        const fields = form.querySelectorAll("input, select, textarea");

        const feedback = {
            name: fields[0]?.value.trim(),
            email: fields[1]?.value.trim(),
            type: fields[2]?.value,
            message: fields[3]?.value.trim(),
            date: new Date().toLocaleString()
        };

        if (!feedback.name || !feedback.email || !feedback.message) {
            alert("Please complete all required fields.");
            return;
        }

        try {
            const response = await fetch("/api/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(feedback)
            });
            if (!response.ok) throw new Error("Feedback could not be saved.");
            form.reset();
        } catch (error) {
            alert(error.message);
            return;
        }

        form.reset();
        alert("Thank you for your feedback!");
    });
}


// 11. REFRESH ALL PAGE DATA

function updateAllPages() {
    updateDashboard();
    updateProgress();
    updateProfile();
    updateProfileStats();
    displayProfileExercises();
}


// 12. START THE APPLICATION

document.addEventListener("DOMContentLoaded", async () => {
    const ready = await initializeStorage();
    initializeAuth();
    initializeFeedback();
    if (!ready) return;

    initializeHabitsPage();
    initializeExerciseForm();
    initializeProfileEdit();
    updateAllPages();
});
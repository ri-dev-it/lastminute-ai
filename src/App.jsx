import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import {
  BarChart3,
  Bot,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Code2,
  Flame,
  Lightbulb,
  Mic2,
  Moon,
  PenLine,
  Plus,
  Quote,
  Search,
  Sparkles,
  Sun,
  Target,
  Timer,
  UserRound,
} from "lucide-react";
import Login from "./assets/login.jsx";
import SignUp from "./assets/signin.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { fallbackRecommendation, generateNextMove } from "./services/geminiService.js";

const seedTasks = [
  {
    id: 1,
    title: "Submit Google Hackathon proposal",
    category: "Hackathon",
    deadline: "2026-06-29T22:30",
    effort: 90,
    impact: "High",
    status: "In progress",
  },
  {
    id: 2,
    title: "Record 2 minute demo walkthrough",
    category: "Demo",
    deadline: "2026-06-30T09:00",
    effort: 45,
    impact: "High",
    status: "Queued",
  },
  {
    id: 3,
    title: "Polish pitch deck problem slide",
    category: "Pitch",
    deadline: "2026-06-30T14:00",
    effort: 35,
    impact: "Medium",
    status: "Queued",
  },
];

const impactScore = { High: 3, Medium: 2, Low: 1 };

const categoryMeta = {
  Hackathon: { icon: Code2, label: "Build" },
  Demo: { icon: Mic2, label: "Demo" },
  Pitch: { icon: PenLine, label: "Pitch" },
  Personal: { icon: UserRound, label: "Personal" },
};

function hoursUntil(deadline) {
  return (new Date(deadline).getTime() - Date.now()) / 36e5;
}

function getRisk(deadline) {
  const hours = hoursUntil(deadline);
  if (hours < 0) return "Overdue";
  if (hours <= 4) return "Critical";
  if (hours <= 24) return "Watch";
  return "Stable";
}

function getPriority(task) {
  const hours = Math.max(hoursUntil(task.deadline), 0.5);
  return Math.round((impactScore[task.impact] * 120) / hours + task.effort / 8);
}

function formatDeadline(deadline) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(deadline));
}

function isDueToday(deadline) {
  const today = new Date();
  const date = new Date(deadline);

  return (
    date.getFullYear() === today.getFullYear() &&
    date.getMonth() === today.getMonth() &&
    date.getDate() === today.getDate()
  );
}

function ThemeToggle({ theme, onToggle }) {
  const isDark = theme === "dark";
  const Icon = isDark ? Sun : Moon;

  return (
    <button
      className="icon-button"
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${isDark ? "light" : "dark"} mode`}
      title={`Switch to ${isDark ? "light" : "dark"} mode`}
    >
      <Icon size={19} strokeWidth={2.2} />
    </button>
  );
}

function TaskIcon({ category }) {
  const Icon = categoryMeta[category]?.icon || ClipboardList;

  return (
    <span className="task-icon" aria-hidden="true">
      <Icon size={18} strokeWidth={2.2} />
    </span>
  );
}

function Dashboard({ theme, onToggleTheme }) {
  const { currentUser, logout } = useAuth();
  const [tasks, setTasks] = useState(seedTasks);
  const [aiRecommendation, setAiRecommendation] = useState(fallbackRecommendation);
  const [isAnalyzingTasks, setIsAnalyzingTasks] = useState(false);
  const [aiError, setAiError] = useState("");
  const [form, setForm] = useState({
    title: "",
    category: "Hackathon",
    deadline: "",
    effort: "30",
    impact: "High",
  });

  const rankedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const priorityDelta = getPriority(b) - getPriority(a);
        return priorityDelta || new Date(a.deadline) - new Date(b.deadline);
      }),
    [tasks],
  );

  const todayTasks = rankedTasks.filter((task) => isDueToday(task.deadline));
  const topTask = rankedTasks[0];
  const criticalTasks = tasks.filter((task) =>
    ["Critical", "Overdue"].includes(getRisk(task.deadline)),
  );
  const totalEffort = tasks.reduce((sum, task) => sum + Number(task.effort), 0);
  const averagePriority = Math.round(
    rankedTasks.reduce((sum, task) => sum + getPriority(task), 0) / rankedTasks.length,
  );
  const productivityScore = Math.min(
    98,
    Math.max(42, Math.round(84 + tasks.length * 2 - criticalTasks.length * 8)),
  );
  const streakDays = 6;

  const upcomingTasks = rankedTasks.filter((task) => !isDueToday(task.deadline)).slice(0, 4);
  const userName = currentUser?.displayName || currentUser?.email?.split("@")[0] || "Riya";
  const userInitial = userName.charAt(0).toUpperCase();

  useEffect(() => {
    let isCurrent = true;
    const debounceId = window.setTimeout(async () => {
      try {
        setIsAnalyzingTasks(true);
        setAiError("");
        const recommendation = await generateNextMove(rankedTasks);

        if (isCurrent) {
          setAiRecommendation(recommendation);
        }
      } catch {
        if (isCurrent) {
          setAiError("Unable to generate AI recommendation.");
          setAiRecommendation(fallbackRecommendation);
        }
      } finally {
        if (isCurrent) {
          setIsAnalyzingTasks(false);
        }
      }
    }, 650);

    return () => {
      isCurrent = false;
      window.clearTimeout(debounceId);
    };
  }, [rankedTasks]);

  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    if (!form.title.trim() || !form.deadline) return;

    setTasks((current) => [
      ...current,
      {
        id: crypto.randomUUID(),
        title: form.title.trim(),
        category: form.category,
        deadline: form.deadline,
        effort: Number(form.effort),
        impact: form.impact,
        status: "Queued",
      },
    ]);
    setForm({ title: "", category: "Hackathon", deadline: "", effort: "30", impact: "High" });
  }

  async function handleLogout() {
    await logout();
  }

  return (
    <main className="app-shell">
      <nav className="topbar">
        <Link to="/dashboard" className="brand" aria-label="LastMinute AI dashboard">
          <span className="brand-mark">
            <Sparkles size={20} strokeWidth={2.4} />
          </span>
          <span>LastMinute AI</span>
        </Link>

        <label className="search-box" aria-label="Search tasks">
          <Search size={18} strokeWidth={2.1} />
          <input type="search" placeholder="Search tasks, deadlines, priorities..." />
        </label>

        <div className="topbar-actions">
          <ThemeToggle theme={theme} onToggle={onToggleTheme} />
          <div className="user-menu" aria-label="Signed in user">
            {currentUser?.photoURL ? (
              <img src={currentUser.photoURL} alt={userName} />
            ) : (
              <span className="avatar">{userInitial}</span>
            )}
            <span>{userName}</span>
          </div>
          <button className="logout-button" type="button" onClick={handleLogout}>
            Logout
          </button>
        </div>
      </nav>

      <section className="hero-summary">
        <div className="hero-greeting">
          <span className="subtle-label">Workspace</span>
          <h1>Good Morning, {userName} 👋</h1>
          <p>Here is the calm version of everything trying to become urgent today.</p>
        </div>

        <div className="hero-stats" aria-label="Today overview">
          <article className="stat-card score-stat">
            <div className="score-ring" style={{ "--score": `${productivityScore * 3.6}deg` }}>
              <strong>{productivityScore}</strong>
            </div>
            <div>
              <span>Productivity</span>
              <p>Score today</p>
            </div>
          </article>
          <article className="stat-card">
            <CalendarClock size={22} />
            <div>
              <strong>{todayTasks.length}</strong>
              <p>Due today</p>
            </div>
          </article>
          <article className="stat-card">
            <Flame size={22} />
            <div>
              <strong>{streakDays} days</strong>
              <p>Focus streak</p>
            </div>
          </article>
        </div>
      </section>

      <section className="content-grid">
        <div className="main-column">
          <form className="card task-composer" id="task-form" onSubmit={handleSubmit}>
            <div className="card-header">
              <div>
                <span className="subtle-label">Task input</span>
                <h2>Add a deadline</h2>
              </div>
              <Plus size={21} />
            </div>

            <label>
              Task name
              <input
                type="text"
                value={form.title}
                onChange={(event) => updateForm("title", event.target.value)}
                placeholder="e.g. Finish Gemini API flow"
              />
            </label>

            <div className="form-row">
              <label>
                Category
                <select
                  value={form.category}
                  onChange={(event) => updateForm("category", event.target.value)}
                >
                  <option>Hackathon</option>
                  <option>Demo</option>
                  <option>Pitch</option>
                  <option>Personal</option>
                </select>
              </label>
              <label>
                Impact
                <select
                  value={form.impact}
                  onChange={(event) => updateForm("impact", event.target.value)}
                >
                  <option>High</option>
                  <option>Medium</option>
                  <option>Low</option>
                </select>
              </label>
            </div>

            <div className="form-row">
              <label>
                Deadline
                <input
                  type="datetime-local"
                  value={form.deadline}
                  onChange={(event) => updateForm("deadline", event.target.value)}
                />
              </label>
              <label>
                Effort minutes
                <input
                  type="number"
                  min="10"
                  step="5"
                  value={form.effort}
                  onChange={(event) => updateForm("effort", event.target.value)}
                />
              </label>
            </div>

            <button type="submit">
              <Plus size={18} />
              Add task
            </button>
          </form>

          <section className="card" id="tasks">
            <div className="card-header">
              <div>
                <span className="subtle-label">Today</span>
                <h2>Priority tasks</h2>
              </div>
              <Target size={22} />
            </div>

            <div className="task-stack">
              {rankedTasks.slice(0, 4).map((task) => (
                <article className="task-item" key={task.id}>
                  <TaskIcon category={task.category} />
                  <div className="task-body">
                    <div className="task-title-row">
                      <h3>{task.title}</h3>
                      <span className={`risk-pill ${getRisk(task.deadline).toLowerCase()}`}>
                        {getRisk(task.deadline)}
                      </span>
                    </div>
                    <p>
                      {categoryMeta[task.category]?.label || task.category} · {task.status} ·{" "}
                      {formatDeadline(task.deadline)}
                    </p>
                    <div className="progress-track">
                      <span style={{ width: `${Math.min(100, task.effort)}%` }} />
                    </div>
                  </div>
                  <strong className="priority-score">{getPriority(task)}</strong>
                </article>
              ))}
            </div>
          </section>

          <section className="card">
            <div className="card-header">
              <div>
                <span className="subtle-label">Calendar</span>
                <h2>Upcoming deadlines</h2>
              </div>
              <Timer size={22} />
            </div>

            <div className="deadline-list">
              {(upcomingTasks.length ? upcomingTasks : rankedTasks).slice(0, 4).map((task) => (
                <article className="deadline-item" key={task.id}>
                  <TaskIcon category={task.category} />
                  <div>
                    <h3>{task.title}</h3>
                    <p>{formatDeadline(task.deadline)}</p>
                  </div>
                  <span>{task.effort}m</span>
                </article>
              ))}
            </div>
          </section>
        </div>

        <aside className="side-column">
          <section className="card assistant-card" id="priority">
            <div className="card-header">
              <div>
                <span className="subtle-label">AI assistant</span>
                <h2>Next move</h2>
              </div>
              <Bot size={23} />
            </div>
            {topTask && (
              <div className="assistant-message">
                <span className="assistant-chip">{getRisk(topTask.deadline)} risk</span>
                {isAnalyzingTasks ? (
                  <>
                    <span className="loader" />
                    <p>Analyzing your tasks...</p>
                  </>
                ) : aiError ? (
                  <p>{aiError}</p>
                ) : (
                  <>
                    <h3>{aiRecommendation.priorityTask}</h3>
                    <p>{aiRecommendation.reason}</p>
                    <p>
                      <strong>Focus:</strong> {aiRecommendation.focusTime}
                    </p>
                    <p>
                      <strong>Next:</strong> {aiRecommendation.nextAction}
                    </p>
                    <p>
                      <strong>Tip:</strong> {aiRecommendation.productivityTip}
                    </p>
                  </>
                )}
              </div>
            )}
          </section>

          <section className="card analytics-card" id="analytics">
            <div className="card-header">
              <div>
                <span className="subtle-label">Analytics</span>
                <h2>Workload</h2>
              </div>
              <BarChart3 size={22} />
            </div>

            <div className="analytics-row">
              <span>Total tasks</span>
              <strong>{tasks.length}</strong>
            </div>
            <div className="analytics-row">
              <span>Critical risks</span>
              <strong>{criticalTasks.length}</strong>
            </div>
            <div className="analytics-row">
              <span>Focus minutes</span>
              <strong>{totalEffort}</strong>
            </div>
            <div className="analytics-row">
              <span>Average priority</span>
              <strong>{averagePriority || 0}</strong>
            </div>
          </section>

          <section className="card quote-card">
            <Quote size={24} />
            <p>
              Do the next visible thing. Momentum usually arrives after the first honest
              twenty minutes.
            </p>
            <span>Daily motivation</span>
          </section>

          <section className="card mini-plan">
            <div className="card-header">
              <div>
                <span className="subtle-label">Plan</span>
                <h2>Focus block</h2>
              </div>
              <Lightbulb size={22} />
            </div>
            <div className="mini-plan-item">
              <CheckCircle2 size={18} />
              <p>45 minutes on the top priority</p>
            </div>
            <div className="mini-plan-item">
              <CheckCircle2 size={18} />
              <p>10 minutes to clean up blockers</p>
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function ProtectedRoute({ children }) {
  const { currentUser, loading } = useAuth();

  if (loading) {
    return (
      <main className="auth-page">
        <section className="auth-card loading-card">
          <span className="loader" />
          <p className="subtle-label">Loading</p>
          <h1>Preparing your workspace.</h1>
        </section>
      </main>
    );
  }

  if (!currentUser) {
    return <Navigate to="/login" replace />;
  }

  return children;
}

export default function App() {
  const [theme, setTheme] = useState(() => localStorage.getItem("lastminute-theme") || "dark");

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("lastminute-theme", theme);
  }, [theme]);

  function toggleTheme() {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }

  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard theme={theme} onToggleTheme={toggleTheme} />
          </ProtectedRoute>
        }
      />
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<SignUp />} />
      <Route
        path="*"
        element={
          <main className="auth-page">
            <section className="auth-card">
              <p className="subtle-label">404</p>
              <h1>That page is not on the plan.</h1>
              <NavLink className="primary-action" to="/dashboard">
                Back to dashboard
              </NavLink>
            </section>
          </main>
        }
      />
    </Routes>
  );
}

import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, NavLink, Route, Routes } from "react-router-dom";
import {
  AlertTriangle,
  BarChart3,
  Bell,
  Bot,
  CalendarClock,
  CalendarDays,
  ChevronDown,
  CheckCircle2,
  ClipboardList,
  Clock,
  Code2,
  Flame,
  Home,
  Lightbulb,
  ListTodo,
  LogOut,
  Menu,
  Moon,
  Palette,
  PenLine,
  Plus,
  Quote,
  Search,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Target,
  Timer,
  Trash2,
  Trophy,
  User,
  X,
} from "lucide-react";
import Login from "./assets/login.jsx";
import SignUp from "./assets/signin.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { useTasks } from "./hooks/useTasks.js";
import { generateAiPriority } from "./services/aiPrioritizer.js";
import { fallbackRecommendation, generateNextMove } from "./services/geminiService.js";

const priorityScore = { High: 3, Medium: 2, Low: 1 };

const taskTypes = [
  { key: "job", label: "Jobs & Internships", shortLabel: "Job / Internship", icon: Code2 },
  {
    key: "hackathon",
    label: "Hackathons & Competitions",
    shortLabel: "Hackathon / Competition",
    icon: Trophy,
  },
  { key: "meeting", label: "Meetings & Events", shortLabel: "Meeting / Event", icon: CalendarDays },
  { key: "personal", label: "Personal Tasks", shortLabel: "Personal Task", icon: Home },
];

const categoryMeta = taskTypes.reduce((meta, type) => {
  meta[type.key] = type;
  return meta;
}, {});

const jobStatuses = [
  "Applied",
  "OA Received",
  "Interview Scheduled",
  "Rejected",
  "Offer Received",
];

const priorityOptions = ["High", "Medium", "Low"];

const emptyForms = {
  job: {
    company: "",
    role: "",
    status: "Applied",
    deadline: "",
    interviewDate: "",
    notes: "",
    subtasksText: "",
    priority: "High",
  },
  hackathon: {
    competitionName: "",
    teamName: "",
    round: "",
    deadline: "",
    githubLink: "",
    demoLink: "",
    notes: "",
    subtasksText: "",
    priority: "High",
  },
  meeting: {
    title: "",
    date: "",
    time: "",
    description: "",
    reminder: "",
    priority: "Medium",
  },
  personal: {
    title: "",
    description: "",
    deadline: "",
    duration: "",
    priority: "Medium",
    subtasksText: "",
  },
};

function hoursUntil(deadline) {
  if (!deadline) return Number.POSITIVE_INFINITY;
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
  return Math.round((priorityScore[task.priority] * 120) / hours + task.effort / 8);
}

function formatDeadline(deadline) {
  if (!deadline) return "No deadline";
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(deadline));
}

function isDueToday(deadline) {
  if (!deadline) return false;
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

function getTaskTitle(task) {
  if (task.type === "job") return `${task.company} ${task.role}`.trim() || task.title;
  if (task.type === "hackathon") return task.competitionName || task.title;
  return task.title;
}

function getTaskSubtitle(task) {
  if (task.type === "job") {
    return [task.status, task.deadline && `Deadline: ${formatDeadline(task.deadline)}`]
      .filter(Boolean)
      .join(" - ");
  }

  if (task.type === "hackathon") {
    return [
      task.round && `Round: ${task.round}`,
      task.deadline && `Deadline: ${formatDeadline(task.deadline)}`,
    ]
      .filter(Boolean)
      .join(" - ");
  }

  if (task.type === "meeting") {
    return [formatDeadline(task.deadline), task.reminder].filter(Boolean).join(" - ");
  }

  return [task.priority && `Priority: ${task.priority}`, task.duration && `Duration: ${task.duration}`]
    .filter(Boolean)
    .join(" - ");
}

function getTaskSearchText(task) {
  return [
    getTaskTitle(task),
    getTaskSubtitle(task),
    task.company,
    task.role,
    task.competitionName,
    task.teamName,
    task.description,
    task.notes,
    task.priority,
    task.status,
    task.round,
    ...(task.subtasks || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function parseSubtasks(text) {
  return text
    .split("\n")
    .map((item) => item.replace(/^[-*]\s*/, "").trim())
    .filter(Boolean);
}

function taskToForm(task) {
  return {
    ...emptyForms[task.type],
    ...task,
    subtasksText: (task.subtasks || []).join("\n"),
  };
}

function formToTask(type, form, editingTask) {
  const base = {
    id: editingTask?.id || crypto.randomUUID(),
    type,
    priority: form.priority,
    effort: type === "hackathon" ? 90 : type === "job" ? 60 : 30,
    completed: editingTask?.completed || false,
  };

  if (type === "job") {
    return {
      ...base,
      company: form.company.trim(),
      role: form.role.trim(),
      title: `${form.company} ${form.role}`.trim(),
      status: form.status,
      deadline: form.deadline,
      interviewDate: form.interviewDate,
      notes: form.notes.trim(),
      subtasks: parseSubtasks(form.subtasksText),
    };
  }

  if (type === "hackathon") {
    return {
      ...base,
      competitionName: form.competitionName.trim(),
      teamName: form.teamName.trim(),
      title: form.competitionName.trim(),
      round: form.round.trim(),
      deadline: form.deadline,
      githubLink: form.githubLink.trim(),
      demoLink: form.demoLink.trim(),
      notes: form.notes.trim(),
      subtasks: parseSubtasks(form.subtasksText),
    };
  }

  if (type === "meeting") {
    return {
      ...base,
      title: form.title.trim(),
      date: form.date,
      time: form.time,
      deadline: form.date && form.time ? `${form.date}T${form.time}` : "",
      description: form.description.trim(),
      reminder: form.reminder.trim(),
    };
  }

  return {
    ...base,
    title: form.title.trim(),
    description: form.description.trim(),
    deadline: form.deadline,
    duration: form.duration.trim(),
    subtasks: parseSubtasks(form.subtasksText),
  };
}

function isFormValid(type, form) {
  if (type === "job") return form.company.trim() && form.role.trim() && form.deadline;
  if (type === "hackathon") return form.competitionName.trim() && form.deadline;
  if (type === "meeting") return form.title.trim() && form.date && form.time;
  return form.title.trim();
}

function formatConfidence(confidence) {
  const value = String(confidence || "").trim();
  if (!value) return "";
  return value.endsWith("%") ? value : `${value}%`;
}

function AddTaskModal({ editingTask, onClose, onSave }) {
  const [selectedType, setSelectedType] = useState(editingTask?.type || "");
  const [forms, setForms] = useState(() => ({
    ...emptyForms,
    ...(editingTask ? { [editingTask.type]: taskToForm(editingTask) } : {}),
  }));
  const form = selectedType ? forms[selectedType] : null;

  function handleCategoryChange(value) {
    setSelectedType(value);
  }

  function updateField(field, value) {
    setForms((current) => ({
      ...current,
      [selectedType]: { ...current[selectedType], [field]: value },
    }));
  }

  function handleSubmit(event) {
    event.preventDefault();
    console.log("FORM SUBMITTED");
    if (!selectedType || !isFormValid(selectedType, form)) {
      console.log("Task form validation failed:", { selectedType, form });
      return;
    }
    const taskData = formToTask(selectedType, form, editingTask);
    console.log(taskData);
    onSave(taskData);
  }

  return (
    <div className="modal-backdrop" role="presentation">
      <form className="card task-modal" onSubmit={handleSubmit}>
        <div className="card-header">
          <div>
            <span className="subtle-label">{editingTask ? "Edit task" : "Add task"}</span>
            <h2>{selectedType ? categoryMeta[selectedType].shortLabel : "Create task"}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <label>
          Category
          <select
            required
            value={selectedType}
            onChange={(event) => handleCategoryChange(event.target.value)}
          >
            <option value="">Select category</option>
            {taskTypes.map((type) => (
              <option key={type.key} value={type.key}>
                {type.label}
              </option>
            ))}
          </select>
        </label>

        {selectedType && (
          <>
            {selectedType === "job" && (
              <>
                <div className="form-row">
                  <label>
                    Company
                    <input value={form.company} onChange={(event) => updateField("company", event.target.value)} />
                  </label>
                  <label>
                    Role
                    <input value={form.role} onChange={(event) => updateField("role", event.target.value)} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Status
                    <select value={form.status} onChange={(event) => updateField("status", event.target.value)}>
                      {jobStatuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Priority
                    <select value={form.priority} onChange={(event) => updateField("priority", event.target.value)}>
                      {priorityOptions.map((priority) => (
                        <option key={priority}>{priority}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Deadline
                    <input type="datetime-local" value={form.deadline} onChange={(event) => updateField("deadline", event.target.value)} />
                  </label>
                  <label>
                    Interview date
                    <input type="datetime-local" value={form.interviewDate} onChange={(event) => updateField("interviewDate", event.target.value)} />
                  </label>
                </div>
              </>
            )}

            {selectedType === "hackathon" && (
              <>
                <div className="form-row">
                  <label>
                    Competition name
                    <input value={form.competitionName} onChange={(event) => updateField("competitionName", event.target.value)} />
                  </label>
                  <label>
                    Team name
                    <input value={form.teamName} onChange={(event) => updateField("teamName", event.target.value)} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Round
                    <input value={form.round} onChange={(event) => updateField("round", event.target.value)} />
                  </label>
                  <label>
                    Deadline
                    <input type="datetime-local" value={form.deadline} onChange={(event) => updateField("deadline", event.target.value)} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    GitHub link
                    <input value={form.githubLink} onChange={(event) => updateField("githubLink", event.target.value)} />
                  </label>
                  <label>
                    Demo link
                    <input value={form.demoLink} onChange={(event) => updateField("demoLink", event.target.value)} />
                  </label>
                </div>
              </>
            )}

            {selectedType === "meeting" && (
              <>
                <label>
                  Title
                  <input value={form.title} onChange={(event) => updateField("title", event.target.value)} />
                </label>
                <div className="form-row">
                  <label>
                    Date
                    <input type="date" value={form.date} onChange={(event) => updateField("date", event.target.value)} />
                  </label>
                  <label>
                    Time
                    <input type="time" value={form.time} onChange={(event) => updateField("time", event.target.value)} />
                  </label>
                </div>
                <label>
                  Reminder
                  <input value={form.reminder} onChange={(event) => updateField("reminder", event.target.value)} />
                </label>
              </>
            )}

            {selectedType === "personal" && (
              <>
                <label>
                  Title
                  <input value={form.title} onChange={(event) => updateField("title", event.target.value)} />
                </label>
                <div className="form-row">
                  <label>
                    Deadline
                    <input type="datetime-local" value={form.deadline} onChange={(event) => updateField("deadline", event.target.value)} />
                  </label>
                  <label>
                    Duration
                    <input value={form.duration} onChange={(event) => updateField("duration", event.target.value)} />
                  </label>
                </div>
              </>
            )}

            {selectedType !== "meeting" && (
              <label>
                Subtasks
                <textarea
                  value={form.subtasksText}
                  onChange={(event) => updateField("subtasksText", event.target.value)}
                  placeholder="One task per line"
                />
              </label>
            )}

            {(selectedType === "meeting" || selectedType === "personal") && (
              <label>
                Description
                <textarea
                  value={form.description}
                  onChange={(event) => updateField("description", event.target.value)}
                />
              </label>
            )}

            {(selectedType === "job" || selectedType === "hackathon") && (
              <label>
                Notes
                <textarea value={form.notes} onChange={(event) => updateField("notes", event.target.value)} />
              </label>
            )}

            {selectedType !== "job" && (
              <label>
                Priority
                <select value={form.priority} onChange={(event) => updateField("priority", event.target.value)}>
                  {priorityOptions.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </label>
            )}

          </>
        )}

        <div className="modal-actions">
          <button className="secondary-action" type="button" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={!selectedType || !isFormValid(selectedType, form)}>
            <Plus size={18} />
            {editingTask ? "Save changes" : "Add task"}
          </button>
        </div>
      </form>
    </div>
  );
}

function TaskCard({ task, onEdit, onDelete, onToggleComplete }) {
  return (
    <article className={`task-item opportunity-card ${task.completed ? "completed" : ""}`}>
      <TaskIcon category={task.type} />
      <div className="task-body">
        <div className="task-title-row">
          <h3>{getTaskTitle(task)}</h3>
          <span className={`risk-pill ${getRisk(task.deadline).toLowerCase()}`}>
            {task.completed ? "Done" : getRisk(task.deadline)}
          </span>
        </div>
        <p>{getTaskSubtitle(task)}</p>
        {(task.notes || task.description) && <p>{task.notes || task.description}</p>}
        {task.subtasks?.length > 0 && (
          <ul className="subtask-list">
            {task.subtasks.map((subtask) => (
              <li key={subtask}>{subtask}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="task-actions">
        <strong className="priority-score">{task.priority}</strong>
        <button type="button" onClick={() => onToggleComplete(task.id)} aria-label="Complete task">
          <CheckCircle2 size={17} />
        </button>
        <button type="button" onClick={() => onEdit(task)} aria-label="Edit task">
          <PenLine size={17} />
        </button>
        <button type="button" onClick={() => onDelete(task.id)} aria-label="Delete task">
          <Trash2 size={17} />
        </button>
      </div>
    </article>
  );
}

function CategorySection({ type, tasks, collapsed, onToggle, ...cardActions }) {
  const Icon = type.icon;
  const activeCount = tasks.filter((task) => !task.completed).length;

  return (
    <section className="category-section">
      <button className="category-header" type="button" onClick={() => onToggle(type.key)}>
        <span className="category-title">
          <Icon size={21} />
          {type.label}
        </span>
        <span className="category-count">{activeCount} active</span>
        <ChevronDown className={collapsed ? "" : "open"} size={20} />
      </button>

      {!collapsed && (
        <div className="task-stack">
          {tasks.length ? (
            tasks.map((task) => <TaskCard key={task.id} task={task} {...cardActions} />)
          ) : (
            <p className="empty-category">No tasks added yet</p>
          )}
        </div>
      )}
    </section>
  );
}

function AiPrioritizerModal({ status, result, error, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="card task-modal ai-prioritizer-modal" aria-live="polite">
        <div className="card-header">
          <div>
            <span className="subtle-label">AI Prioritizer</span>
            <h2>AI Prioritizer</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {status === "empty" && (
          <p className="ai-prioritizer-message">
            No tasks available to prioritize. Create your first task to receive AI recommendations.
          </p>
        )}

        {status === "loading" && (
          <div className="ai-prioritizer-loading">
            <span className="loader" />
            <p>Analyzing your workload...</p>
          </div>
        )}

        {status === "error" && (
          <p className="form-error">
            {error || "No tasks available to prioritize. Create your first task to receive AI recommendations."}
          </p>
        )}

        {status === "ready" && result && (
          <div className="ai-prioritizer-result">
            <div>
              <span>Task to do now</span>
              <strong>{result.priorityTask}</strong>
            </div>
            <div>
              <span>Category</span>
              <strong>{result.category}</strong>
            </div>
            <div>
              <span>Why this is important</span>
              <p>{result.reason}</p>
            </div>
            <div>
              <span>Recommended focus time</span>
              <strong>{result.focusTime}</strong>
            </div>
            <div>
              <span>Next action</span>
              <p>{result.nextAction}</p>
            </div>
            <div>
              <span>Confidence score</span>
              <strong>{formatConfidence(result.confidence)}</strong>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

const accentPresets = [
  { name: "Sage Green", value: "#6E7D68" },
  { name: "Terracotta", value: "#A86952" },
  { name: "Slate Blue", value: "#66758F" },
  { name: "Warm Brown", value: "#7A6652" },
  { name: "Olive", value: "#777C4F" },
];

function ToggleSwitch({ checked, onChange, label }) {
  return (
    <button
      className={`toggle-switch ${checked ? "is-on" : ""}`}
      type="button"
      onClick={() => onChange(!checked)}
      aria-pressed={checked}
      aria-label={label}
    >
      <span />
    </button>
  );
}

function EmptyState({ title, children }) {
  return (
    <div className="empty-state">
      <ClipboardList size={24} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}

function Dashboard({ theme, onToggleTheme }) {
  const { currentUser, logout } = useAuth();
  const {
    tasks,
    loading: tasksLoading,
    addTask,
    updateTask,
    deleteTask,
  } = useTasks();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [collapsedSections, setCollapsedSections] = useState({});
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [prioritizerModal, setPrioritizerModal] = useState({
    isOpen: false,
    status: "idle",
    result: null,
    error: "",
  });
  const [aiRecommendation, setAiRecommendation] = useState(fallbackRecommendation);
  const [isAnalyzingTasks, setIsAnalyzingTasks] = useState(false);
  const [aiError, setAiError] = useState("");

  const rankedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const priorityDelta = getPriority(b) - getPriority(a);
        return priorityDelta || new Date(a.deadline) - new Date(b.deadline);
      }),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return rankedTasks.filter((task) => {
      const matchesSearch = !query || getTaskSearchText(task).includes(query);
      const matchesType = typeFilter === "all" || task.type === typeFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !task.completed) ||
        (statusFilter === "completed" && task.completed) ||
        task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;

      return matchesSearch && matchesType && matchesStatus && matchesPriority;
    });
  }, [priorityFilter, rankedTasks, searchQuery, statusFilter, typeFilter]);

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
  void tasksLoading;

  useEffect(() => {
    if (!rankedTasks.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAiRecommendation(fallbackRecommendation);
      setAiError("");
      setIsAnalyzingTasks(false);
      return undefined;
    }

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
          setAiError("AI recommendation unavailable.");
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

  async function handleLogout() {
    await logout();
  }

  async function handleSaveTask(task) {
    try {
      if (editingTask) {
        await updateTask(task.id, task);
      } else {
        await addTask(task);
      }

      setTypeFilter("all");
      setStatusFilter("all");
      setPriorityFilter("all");
      setEditingTask(null);
      setIsTaskModalOpen(false);
    } catch (error) {
      console.error("Failed to save task:", error);
      alert(error.message);
    }
  }

  function handleOpenTaskModal() {
    setEditingTask(null);
    setIsTaskModalOpen(true);
  }

  function handleEditTask(task) {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  }

  async function handleDeleteTask(taskId) {
    try {
      await deleteTask(taskId);
    } catch (error) {
      console.error("Failed to delete task:", error);
      alert(error.message);
    }
  }

  async function handleToggleComplete(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    const completed = !task.completed;

    try {
      await updateTask(taskId, {
        completed,
        status: completed ? "completed" : "todo",
      });
    } catch (error) {
      console.error("Failed to update task completion:", error);
      alert(error.message);
    }
  }

  function handleCloseTaskModal() {
    setEditingTask(null);
    setIsTaskModalOpen(false);
  }

  function toggleSection(type) {
    setCollapsedSections((current) => ({ ...current, [type]: !current[type] }));
  }

  async function handleAiPrioritize() {
    console.log("AI Prioritizer clicked");
    console.log("AI Prioritizer selected category:", typeFilter);
    console.log("AI Prioritizer task count:", tasks.length);

    const jobs = tasks.filter((task) => task.type === "job");
    const hackathons = tasks.filter((task) => task.type === "hackathon");
    const meetings = tasks.filter((task) => task.type === "meeting");
    const personal = tasks.filter((task) => task.type === "personal");
    const allTasks = [
      ...jobs,
      ...hackathons,
      ...meetings,
      ...personal,
    ];

    console.log("Jobs:", jobs);
    console.log("Hackathons:", hackathons);
    console.log("Meetings:", meetings);
    console.log("Personal:", personal);
    console.log("Combined tasks:", allTasks);
    allTasks.forEach((task, index) => {
      console.log(`AI Prioritizer task ${index + 1}:`, task);
      console.log(`AI Prioritizer task ${index + 1} selected category:`, task.type);
    });

    if (!allTasks.length) {
      setPrioritizerModal({ isOpen: true, status: "empty", result: null, error: "" });
      return;
    }

    setPrioritizerModal({ isOpen: true, status: "loading", result: null, error: "" });

    try {
      const tasksForAi = allTasks.map((task) => ({
        title: getTaskTitle(task),
        category: categoryMeta[task.type]?.label || task.type,
        deadline: task.deadline || "",
        dueDate: task.dueDate || task.deadline || "",
        priority: task.priority || "",
        estimatedEffort: task.effort ? `${task.effort} minutes` : "",
        duration: task.duration || "",
        status: task.status || (task.completed ? "Completed" : "Active"),
        completed: task.completed || false,
        overdueRisk: getRisk(task.deadline),
        notes: task.notes || task.description || "",
        subtasks: task.subtasks || [],
      }));
      console.log("Sending to offline prioritizer:", tasksForAi);
      const result = await generateAiPriority(tasksForAi);
      console.log("Final prioritization result:", result);
      setPrioritizerModal({ isOpen: true, status: "ready", result, error: "" });
    } catch (error) {
      console.error("AI Prioritizer failed:", error);
      setPrioritizerModal({
        isOpen: true,
        status: "error",
        result: null,
        error: "No tasks available to prioritize. Create your first task to receive AI recommendations.",
      });
    }
  }

  function closePrioritizerModal() {
    setPrioritizerModal((current) => ({ ...current, isOpen: false }));
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
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search tasks, deadlines, priorities..."
          />
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
          <h1>Good Morning, {userName}</h1>
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
          <section className="card task-manager" id="tasks">
            <div className="card-header">
              <div>
                <span className="subtle-label">Task Manager</span>
                <h2>Opportunity tasks</h2>
              </div>
              <div className="task-manager-actions">
                <button className="task-add-button" type="button" onClick={handleAiPrioritize}>
                  <Sparkles size={18} />
                  ✨ AI Prioritizer
                </button>
                <button className="task-add-button" type="button" onClick={handleOpenTaskModal}>
                  <Plus size={18} />
                  Add Task
                </button>
              </div>
            </div>

            <div className="task-filters">
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">All categories</option>
                {taskTypes.map((type) => (
                  <option key={type.key} value={type.key}>
                    {type.label}
                  </option>
                ))}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                {jobStatuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                <option value="all">All priorities</option>
                {priorityOptions.map((priority) => (
                  <option key={priority}>{priority}</option>
                ))}
              </select>
            </div>

            <div className="category-list">
              {taskTypes.map((type) => (
                <CategorySection
                  key={type.key}
                  type={type}
                  tasks={filteredTasks.filter((task) => task.type === type.key)}
                  collapsed={collapsedSections[type.key]}
                  onToggle={toggleSection}
                  onEdit={handleEditTask}
                  onDelete={handleDeleteTask}
                  onToggleComplete={handleToggleComplete}
                />
              ))}
            </div>
          </section>

          <section className="card">
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
                  <TaskIcon category={task.type} />
                  <div className="task-body">
                    <div className="task-title-row">
                      <h3>{getTaskTitle(task)}</h3>
                      <span className={`risk-pill ${getRisk(task.deadline).toLowerCase()}`}>
                        {getRisk(task.deadline)}
                      </span>
                    </div>
                    <p>
                      {categoryMeta[task.type]?.shortLabel || task.type} - {task.status || task.priority} -{" "}
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
                  <TaskIcon category={task.type} />
                  <div>
                    <h3>{getTaskTitle(task)}</h3>
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

      {isTaskModalOpen && (
        <AddTaskModal editingTask={editingTask} onClose={handleCloseTaskModal} onSave={handleSaveTask} />
      )}
      {prioritizerModal.isOpen && (
        <AiPrioritizerModal
          status={prioritizerModal.status}
          result={prioritizerModal.result}
          error={prioritizerModal.error}
          onClose={closePrioritizerModal}
        />
      )}
    </main>
  );
}

Dashboard.displayName = "LegacyDashboard";

function DashboardShell({ theme, onToggleTheme }) {
  const { currentUser, logout } = useAuth();
  const { tasks, addTask, updateTask, deleteTask } = useTasks();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [collapsedSections, setCollapsedSections] = useState({});
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState(null);
  const [activeView, setActiveView] = useState("dashboard");
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [accentColor, setAccentColor] = useState(
    () => localStorage.getItem("lastminute-accent") || accentPresets[0].value,
  );
  const [settingsState, setSettingsState] = useState({
    startTime: "09:00",
    endTime: "18:00",
    focusGoal: 4,
    pomodoro: 25,
    shortBreak: 5,
    longBreak: 15,
    deadlineReminders: true,
    aiSuggestions: true,
    browserNotifications: false,
    emailNotifications: false,
    planningStyle: "Balanced",
    priorityMethod: "Balanced",
    aiPersonality: "Calm Planner",
  });
  const [prioritizerModal, setPrioritizerModal] = useState({
    isOpen: false,
    status: "idle",
    result: null,
    error: "",
  });
  const [aiRecommendation, setAiRecommendation] = useState(fallbackRecommendation);
  const [isAnalyzingTasks, setIsAnalyzingTasks] = useState(false);
  const [aiError, setAiError] = useState("");

  const rankedTasks = useMemo(
    () =>
      [...tasks].sort((a, b) => {
        const priorityDelta = getPriority(b) - getPriority(a);
        return priorityDelta || new Date(a.deadline) - new Date(b.deadline);
      }),
    [tasks],
  );

  const filteredTasks = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return rankedTasks.filter((task) => {
      const matchesSearch = !query || getTaskSearchText(task).includes(query);
      const matchesType = typeFilter === "all" || task.type === typeFilter;
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "active" && !task.completed) ||
        (statusFilter === "completed" && task.completed) ||
        task.status === statusFilter;
      const matchesPriority = priorityFilter === "all" || task.priority === priorityFilter;

      return matchesSearch && matchesType && matchesStatus && matchesPriority;
    });
  }, [priorityFilter, rankedTasks, searchQuery, statusFilter, typeFilter]);

  const todayTasks = rankedTasks.filter((task) => isDueToday(task.deadline));
  const completedTasks = tasks.filter((task) => task.completed);
  const overdueTasks = tasks.filter((task) => !task.completed && getRisk(task.deadline) === "Overdue");
  const topTask = rankedTasks[0];
  const criticalTasks = tasks.filter((task) => ["Critical", "Overdue"].includes(getRisk(task.deadline)));
  const totalEffort = tasks.reduce((sum, task) => sum + Number(task.effort), 0);
  const averagePriority = Math.round(rankedTasks.reduce((sum, task) => sum + getPriority(task), 0) / rankedTasks.length);
  const productivityScore = Math.min(98, Math.max(42, Math.round(84 + tasks.length * 2 - criticalTasks.length * 8)));
  const upcomingTasks = rankedTasks.filter((task) => !isDueToday(task.deadline)).slice(0, 4);
  const userName = currentUser?.displayName || currentUser?.email?.split("@")[0] || "Riya";
  const userInitial = userName.charAt(0).toUpperCase();
  const todayDate = new Intl.DateTimeFormat("en", {
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date());

  useEffect(() => {
    document.documentElement.style.setProperty("--primary", accentColor);
    document.documentElement.style.setProperty("--accent", accentColor);
    localStorage.setItem("lastminute-accent", accentColor);
  }, [accentColor]);

  useEffect(() => {
    if (!rankedTasks.length) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAiRecommendation(fallbackRecommendation);
      setAiError("");
      setIsAnalyzingTasks(false);
      return undefined;
    }

    let isCurrent = true;
    const debounceId = window.setTimeout(async () => {
      try {
        setIsAnalyzingTasks(true);
        setAiError("");
        const recommendation = await generateNextMove(rankedTasks);
        if (isCurrent) setAiRecommendation(recommendation);
      } catch {
        if (isCurrent) {
          setAiError("AI recommendation unavailable.");
          setAiRecommendation(fallbackRecommendation);
        }
      } finally {
        if (isCurrent) setIsAnalyzingTasks(false);
      }
    }, 650);

    return () => {
      isCurrent = false;
      window.clearTimeout(debounceId);
    };
  }, [rankedTasks]);

  async function handleLogout() {
    await logout();
  }

  async function handleSaveTask(task) {
    try {
      if (editingTask) {
        await updateTask(task.id, task);
      } else {
        await addTask(task);
      }

      setTypeFilter("all");
      setStatusFilter("all");
      setPriorityFilter("all");
      setEditingTask(null);
      setIsTaskModalOpen(false);
    } catch (error) {
      console.error("Failed to save task:", error);
      alert(error.message);
    }
  }

  function handleOpenTaskModal() {
    setEditingTask(null);
    setIsTaskModalOpen(true);
  }

  function handleEditTask(task) {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  }

  async function handleDeleteTask(taskId) {
    try {
      await deleteTask(taskId);
    } catch (error) {
      console.error("Failed to delete task:", error);
      alert(error.message);
    }
  }

  async function handleToggleComplete(taskId) {
    const task = tasks.find((item) => item.id === taskId);
    if (!task) return;

    const completed = !task.completed;

    try {
      await updateTask(taskId, {
        completed,
        status: completed ? "completed" : "todo",
      });
    } catch (error) {
      console.error("Failed to update task completion:", error);
      alert(error.message);
    }
  }

  async function handleAiPrioritize() {
    const allTasks = [
      ...tasks.filter((task) => task.type === "job"),
      ...tasks.filter((task) => task.type === "hackathon"),
      ...tasks.filter((task) => task.type === "meeting"),
      ...tasks.filter((task) => task.type === "personal"),
    ];

    if (!allTasks.length) {
      setPrioritizerModal({ isOpen: true, status: "empty", result: null, error: "" });
      return;
    }

    setPrioritizerModal({ isOpen: true, status: "loading", result: null, error: "" });

    try {
      const tasksForAi = allTasks.map((task) => ({
        title: getTaskTitle(task),
        category: categoryMeta[task.type]?.label || task.type,
        deadline: task.deadline || "",
        dueDate: task.dueDate || task.deadline || "",
        priority: task.priority || "",
        estimatedEffort: task.effort ? `${task.effort} minutes` : "",
        duration: task.duration || "",
        status: task.status || (task.completed ? "Completed" : "Active"),
        completed: task.completed || false,
        overdueRisk: getRisk(task.deadline),
        notes: task.notes || task.description || "",
        subtasks: task.subtasks || [],
      }));
      const result = await generateAiPriority(tasksForAi);
      setPrioritizerModal({ isOpen: true, status: "ready", result, error: "" });
    } catch (error) {
      console.error("AI Prioritizer failed:", error);
      setPrioritizerModal({
        isOpen: true,
        status: "error",
        result: null,
        error: "No tasks available to prioritize. Create your first task to receive AI recommendations.",
      });
    }
  }

  function updateSetting(key, value) {
    setSettingsState((current) => ({ ...current, [key]: value }));
  }

  function showView(view) {
    setActiveView(view);
    setIsSidebarOpen(false);
  }

  const navItems = [
    { key: "dashboard", label: "Dashboard", icon: Home },
    { key: "tasks", label: "Tasks", icon: ListTodo },
    { key: "planner", label: "AI Planner", icon: Bot },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  const viewTitle = {
    dashboard: `Good morning, ${userName}`,
    tasks: "Tasks",
    planner: "AI Planner",
    settings: "Settings",
  }[activeView];

  const viewDescription = {
    dashboard: "A focused view of what matters today, without the noise.",
    tasks: "Search, filter, and move work forward with the same task workflow.",
    planner: "Shape your day around working hours, priorities, and calm focus blocks.",
    settings: "Tune the workspace presentation and productivity preferences.",
  }[activeView];

  return (
    <main className="app-shell">
      <button className="mobile-menu-button" type="button" onClick={() => setIsSidebarOpen(true)} aria-label="Open navigation">
        <Menu size={20} />
      </button>

      <aside className={`sidebar ${isSidebarOpen ? "open" : ""}`}>
        <div className="sidebar-header">
          <Link to="/dashboard" className="brand" aria-label="LastMinute AI dashboard">
            <span className="brand-mark"><Sparkles size={19} /></span>
            <span>LastMinute AI</span>
          </Link>
          <button className="icon-button mobile-close" type="button" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation">
            <X size={18} />
          </button>
        </div>

        <nav className="sidebar-nav" aria-label="Workspace navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.key} className={`sidebar-link ${activeView === item.key ? "active" : ""}`} type="button" onClick={() => showView(item.key)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="user-menu" aria-label="Signed in user">
            {currentUser?.photoURL ? <img src={currentUser.photoURL} alt={userName} /> : <span className="avatar">{userInitial}</span>}
            <span>{userName}</span>
          </div>
          <button className="logout-button" type="button" onClick={handleLogout}>
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </aside>

      {isSidebarOpen && <button className="sidebar-scrim" type="button" onClick={() => setIsSidebarOpen(false)} aria-label="Close navigation" />}

      <section className="workspace">
        <header className="workspace-header">
          <div>
            <span className="subtle-label">{todayDate}</span>
            <h1>{viewTitle}</h1>
            <p>{viewDescription}</p>
          </div>
          <button className="primary-action" type="button" onClick={handleOpenTaskModal}>
            <Plus size={18} />
            New Task
          </button>
        </header>

        {activeView === "dashboard" && (
          <div className="view-stack">
            <section className="metric-grid">
              <article className="stat-card"><CalendarClock size={20} /><span>Today's Tasks</span><strong>{todayTasks.length}</strong></article>
              <article className="stat-card"><CheckCircle2 size={20} /><span>Completed</span><strong>{completedTasks.length}</strong></article>
              <article className="stat-card"><AlertTriangle size={20} /><span>Overdue</span><strong>{overdueTasks.length}</strong></article>
              <article className="stat-card score-stat"><div className="score-ring" style={{ "--score": `${productivityScore * 3.6}deg` }}><strong>{productivityScore}</strong></div><span>Focus Score</span></article>
            </section>

            <section className="dashboard-grid">
              <div className="card dashboard-today-card">
                <div className="card-header"><div><span className="subtle-label">Today</span><h2>Today's Tasks</h2></div><Target size={21} /></div>
                <div className="task-stack">
                  {(todayTasks.length ? todayTasks : rankedTasks.slice(0, 3)).map((task) => (
                    <TaskCard key={task.id} task={task} onEdit={handleEditTask} onDelete={handleDeleteTask} onToggleComplete={handleToggleComplete} />
                  ))}
                  {!rankedTasks.length && <EmptyState title="No tasks yet">Create a task to build today's plan.</EmptyState>}
                </div>
              </div>

              <div className="card">
                <div className="card-header"><div><span className="subtle-label">Calendar</span><h2>Upcoming Deadlines</h2></div><Timer size={21} /></div>
                <div className="deadline-list">
                  {(upcomingTasks.length ? upcomingTasks : rankedTasks).slice(0, 4).map((task) => (
                    <article className="deadline-item" key={task.id}>
                      <TaskIcon category={task.type} />
                      <div><h3>{getTaskTitle(task)}</h3><p>{formatDeadline(task.deadline)}</p></div>
                      <span>{task.effort}m</span>
                    </article>
                  ))}
                  {!rankedTasks.length && <EmptyState title="No deadlines">Deadlines will appear here once tasks exist.</EmptyState>}
                </div>
              </div>

              <div className="card assistant-card">
                <div className="card-header"><div><span className="subtle-label">AI Recommendation</span><h2>Next Move</h2></div><Bot size={22} /></div>
                <div className="assistant-message">
                  {topTask && <span className="assistant-chip">{getRisk(topTask.deadline)} risk</span>}
                  {isAnalyzingTasks ? (
                    <><span className="loader" /><p>Analyzing your tasks...</p></>
                  ) : aiError ? (
                    <p>{aiError}</p>
                  ) : (
                    <><h3>{aiRecommendation.priorityTask}</h3><p>{aiRecommendation.reason}</p><p><strong>Focus:</strong> {aiRecommendation.focusTime}</p><p><strong>Next:</strong> {aiRecommendation.nextAction}</p></>
                  )}
                </div>
              </div>
            </section>

            <section className="dashboard-grid bottom-grid">
              <div className="card">
                <div className="card-header"><div><span className="subtle-label">Shortcuts</span><h2>Quick Actions</h2></div><SlidersHorizontal size={21} /></div>
                <div className="quick-actions">
                  <button type="button" onClick={handleOpenTaskModal}><Plus size={17} />Add task</button>
                  <button type="button" onClick={handleAiPrioritize}><Sparkles size={17} />AI Prioritizer</button>
                  <button type="button" onClick={() => showView("planner")}><CalendarClock size={17} />Plan day</button>
                </div>
              </div>

              <div className="card">
                <div className="card-header"><div><span className="subtle-label">Activity</span><h2>Recent Activity</h2></div><BarChart3 size={21} /></div>
                <div className="analytics-row"><span>Total tasks</span><strong>{tasks.length}</strong></div>
                <div className="analytics-row"><span>Critical risks</span><strong>{criticalTasks.length}</strong></div>
                <div className="analytics-row"><span>Focus minutes</span><strong>{totalEffort}</strong></div>
                <div className="analytics-row"><span>Average priority</span><strong>{averagePriority || 0}</strong></div>
              </div>
            </section>
          </div>
        )}

        {activeView === "tasks" && (
          <section className="card task-manager">
            <div className="card-header">
              <div><span className="subtle-label">Task Manager</span><h2>All Tasks</h2></div>
              <div className="task-manager-actions">
                <button className="secondary-action wide-action" type="button" onClick={handleAiPrioritize}><Sparkles size={18} />AI Prioritizer</button>
                <button className="primary-action" type="button" onClick={handleOpenTaskModal}><Plus size={18} />Add Task</button>
              </div>
            </div>
            <label className="search-box task-search" aria-label="Search tasks">
              <Search size={18} />
              <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search tasks, deadlines, priorities..." />
            </label>
            <div className="task-filters">
              <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
                <option value="all">All categories</option>
                {taskTypes.map((type) => <option key={type.key} value={type.key}>{type.label}</option>)}
              </select>
              <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
                <option value="all">All statuses</option>
                <option value="active">Active</option>
                <option value="completed">Completed</option>
                {jobStatuses.map((status) => <option key={status}>{status}</option>)}
              </select>
              <select value={priorityFilter} onChange={(event) => setPriorityFilter(event.target.value)}>
                <option value="all">All priorities</option>
                {priorityOptions.map((priority) => <option key={priority}>{priority}</option>)}
              </select>
            </div>
            <div className="category-list">
              {taskTypes.map((type) => (
                <CategorySection
                  key={type.key}
                  type={type}
                  tasks={filteredTasks.filter((task) => task.type === type.key)}
                  collapsed={collapsedSections[type.key]}
                  onToggle={(key) => setCollapsedSections((current) => ({ ...current, [key]: !current[key] }))}
                  onEdit={handleEditTask}
                  onDelete={handleDeleteTask}
                  onToggleComplete={handleToggleComplete}
                />
              ))}
            </div>
          </section>
        )}

        {activeView === "planner" && (
          <section className="planner-layout">
            <div className="card planner-control-card">
              <div className="card-header"><div><span className="subtle-label">Working Hours</span><h2>Daily Plan</h2></div><Clock size={21} /></div>
              <div className="form-row">
                <label>Start Time<input type="time" value={settingsState.startTime} onChange={(event) => updateSetting("startTime", event.target.value)} /></label>
                <label>End Time<input type="time" value={settingsState.endTime} onChange={(event) => updateSetting("endTime", event.target.value)} /></label>
              </div>
              <button className="primary-action planner-generate" type="button" onClick={handleAiPrioritize}><Sparkles size={18} />Generate Plan</button>
            </div>

            <div className="card planner-board">
              <div className="card-header"><div><span className="subtle-label">Timeline</span><h2>Focus Blocks</h2></div><CalendarClock size={21} /></div>
              <div className="timeline-list">
                {rankedTasks.slice(0, 5).map((task, index) => (
                  <article className="timeline-card" key={task.id}>
                    <span>{index === 0 ? settingsState.startTime : `${Number(settingsState.startTime.slice(0, 2)) + index}:00`}</span>
                    <div><h3>{getTaskTitle(task)}</h3><p>{categoryMeta[task.type]?.shortLabel || task.type} - {formatDeadline(task.deadline)}</p></div>
                    <strong>{task.effort}m</strong>
                  </article>
                ))}
                {!rankedTasks.length && <EmptyState title="Your plan is clear">Add tasks, then generate a focus plan for the day.</EmptyState>}
              </div>
            </div>
          </section>
        )}

        {activeView === "settings" && (
          <section className="settings-grid">
            <div className="card settings-card">
              <div className="settings-heading"><Palette size={20} /><h2>Appearance</h2></div>
              <div className="segmented-control">
                <button className={theme === "light" ? "active" : ""} type="button" onClick={() => theme === "dark" && onToggleTheme()}><Sun size={17} />Light Mode</button>
                <button className={theme === "dark" ? "active" : ""} type="button" onClick={() => theme === "light" && onToggleTheme()}><Moon size={17} />Dark Mode</button>
              </div>
              <div className="accent-grid">
                {accentPresets.map((preset) => (
                  <button key={preset.value} className={accentColor === preset.value ? "active" : ""} type="button" onClick={() => setAccentColor(preset.value)}>
                    <span style={{ background: preset.value }} />
                    {preset.name}
                  </button>
                ))}
              </div>
            </div>

            <div className="card settings-card">
              <div className="settings-heading"><Timer size={20} /><h2>Productivity</h2></div>
              <div className="form-row">
                <label>Start Time<input type="time" value={settingsState.startTime} onChange={(event) => updateSetting("startTime", event.target.value)} /></label>
                <label>End Time<input type="time" value={settingsState.endTime} onChange={(event) => updateSetting("endTime", event.target.value)} /></label>
              </div>
              <label>Daily Focus Goal<input type="range" min="1" max="10" value={settingsState.focusGoal} onChange={(event) => updateSetting("focusGoal", event.target.value)} /><span>{settingsState.focusGoal} hours</span></label>
              <div className="form-row">
                <label>Pomodoro Duration<input type="number" min="5" value={settingsState.pomodoro} onChange={(event) => updateSetting("pomodoro", event.target.value)} /></label>
                <label>Short Break Duration<input type="number" min="1" value={settingsState.shortBreak} onChange={(event) => updateSetting("shortBreak", event.target.value)} /></label>
              </div>
              <label>Long Break Duration<input type="number" min="5" value={settingsState.longBreak} onChange={(event) => updateSetting("longBreak", event.target.value)} /></label>
            </div>

            <div className="card settings-card">
              <div className="settings-heading"><Bell size={20} /><h2>Notifications</h2></div>
              {[["deadlineReminders", "Deadline reminders"], ["aiSuggestions", "AI Suggestions"], ["browserNotifications", "Browser Notifications"], ["emailNotifications", "Email Notifications"]].map(([key, label]) => (
                <div className="settings-row" key={key}><span>{label}</span><ToggleSwitch checked={settingsState[key]} onChange={(value) => updateSetting(key, value)} label={label} /></div>
              ))}
            </div>

            <div className="card settings-card">
              <div className="settings-heading"><Bot size={20} /><h2>AI Preferences</h2></div>
              <label>AI Planning Style<select value={settingsState.planningStyle} onChange={(event) => updateSetting("planningStyle", event.target.value)}><option>Balanced</option><option>Aggressive</option><option>Relaxed</option></select></label>
              <label>Task Priority Method<select value={settingsState.priorityMethod} onChange={(event) => updateSetting("priorityMethod", event.target.value)}><option>Deadline First</option><option>Impact First</option><option>Balanced</option></select></label>
            </div>

            <div className="card settings-card">
              <div className="settings-heading"><Sparkles size={20} /><h2>AI Personality</h2></div>
              <div className="personality-grid">
                {["Calm Planner", "Focus Sprint", "Deadline Warrior", "Healthy Balance"].map((personality) => (
                  <button className={settingsState.aiPersonality === personality ? "active" : ""} type="button" key={personality} onClick={() => updateSetting("aiPersonality", personality)}>{personality}</button>
                ))}
              </div>
            </div>

            <div className="card settings-card">
              <div className="settings-heading"><User size={20} /><h2>Account</h2></div>
              <div className="account-block">
                {currentUser?.photoURL ? <img src={currentUser.photoURL} alt={userName} /> : <span className="avatar large-avatar">{userInitial}</span>}
                <div><strong>{userName}</strong><p>{currentUser?.email}</p></div>
              </div>
              <button className="secondary-action wide-action" type="button">Change Password</button>
              <button className="secondary-action wide-action" type="button" onClick={handleLogout}>Logout</button>
            </div>

            <div className="card settings-card danger-zone">
              <div className="settings-heading"><Trash2 size={20} /><h2>Danger Zone</h2></div>
              <p>Delete Account</p>
              <button className="danger-button" type="button">Delete Account</button>
            </div>
          </section>
        )}
      </section>

      {isTaskModalOpen && (
        <AddTaskModal editingTask={editingTask} onClose={() => { setEditingTask(null); setIsTaskModalOpen(false); }} onSave={handleSaveTask} />
      )}
      {prioritizerModal.isOpen && (
        <AiPrioritizerModal
          status={prioritizerModal.status}
          result={prioritizerModal.result}
          error={prioritizerModal.error}
          onClose={() => setPrioritizerModal((current) => ({ ...current, isOpen: false }))}
        />
      )}
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
            <DashboardShell theme={theme} onToggleTheme={toggleTheme} />
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

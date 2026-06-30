const priorityWeights = {
  Critical: 100,
  High: 75,
  Medium: 50,
  Low: 25,
};

function getTaskTitle(task) {
  return task.title || task.competitionName || `${task.company || ""} ${task.role || ""}`.trim() || "Untitled task";
}

function getDueDate(task) {
  return task.dueDate || task.deadline || "";
}

function getPriorityLevel(task) {
  const priority = task.priority || "Medium";
  return priorityWeights[priority] ? priority : "Medium";
}

function isSameDate(first, second) {
  return (
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate()
  );
}

function getDueDateScore(task) {
  const dueDateValue = getDueDate(task);
  if (!dueDateValue) return { score: 0, label: "no due date" };

  const dueDate = new Date(dueDateValue);
  if (Number.isNaN(dueDate.getTime())) return { score: 0, label: "unclear due date" };

  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);

  const msUntilDue = dueDate.getTime() - now.getTime();
  const daysUntilDue = msUntilDue / 86400000;

  if (msUntilDue < 0) return { score: 100, label: "overdue" };
  if (isSameDate(dueDate, now)) return { score: 80, label: "due today" };
  if (isSameDate(dueDate, tomorrow)) return { score: 60, label: "due tomorrow" };
  if (daysUntilDue <= 3) return { score: 40, label: "due within 3 days" };
  if (daysUntilDue <= 7) return { score: 20, label: "due within 7 days" };

  return { score: 0, label: "not due soon" };
}

function getStatusScore(task) {
  const status = String(task.status || "").toLowerCase();
  if (task.completed || status === "completed" || status === "done") return -1000;
  return 0;
}

function formatDueDate(task) {
  const dueDateValue = getDueDate(task);
  if (!dueDateValue) return "No due date";

  const dueDate = new Date(dueDateValue);
  if (Number.isNaN(dueDate.getTime())) return dueDateValue;

  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(dueDate);
}

function formatConfidence(score, runnerUpScore) {
  const margin = runnerUpScore == null ? 20 : Math.max(0, score - runnerUpScore);
  return `${Math.min(98, Math.max(72, 82 + margin))}%`;
}

export function getPriorityScore(task) {
  const priorityLevel = getPriorityLevel(task);
  const due = getDueDateScore(task);
  const statusScore = getStatusScore(task);
  const score = priorityWeights[priorityLevel] + due.score + statusScore;

  return {
    score,
    priorityLevel,
    due,
    statusScore,
  };
}

export async function generateAiPriority(tasks) {
  const activeTasks = Array.isArray(tasks)
    ? tasks.filter((task) => getStatusScore(task) > -1000)
    : [];

  console.log("Offline AI Prioritizer received tasks:", tasks?.length || 0);
  console.log("Offline AI Prioritizer active tasks:", activeTasks.length);
  activeTasks.forEach((task, index) => {
    console.log(`Offline AI Prioritizer task ${index + 1}:`, task);
  });

  if (!activeTasks.length) {
    return {
      priorityTask: "No active tasks found.",
      category: "",
      reason: "No tasks available to prioritize. Create your first task to receive AI recommendations.",
      focusTime: "",
      nextAction: "",
      confidence: "0%",
      priorityLevel: "",
      dueDate: "",
      source: "offline",
    };
  }

  const scoredTasks = activeTasks
    .map((task) => ({
      task,
      ...getPriorityScore(task),
    }))
    .sort((a, b) => b.score - a.score);

  console.log("Offline AI Prioritizer scored tasks:", scoredTasks);

  const top = scoredTasks[0];
  const runnerUp = scoredTasks[1];
  const title = getTaskTitle(top.task);
  const reason = `${top.priorityLevel} priority and ${top.due.label} deadline.`;
  const confidence = formatConfidence(top.score, runnerUp?.score);

  const result = {
    task: top.task,
    priorityTask: title,
    category: top.task.category || top.task.type || "Task",
    reason,
    focusTime: top.task.duration || top.task.estimatedEffort || "25 minutes",
    nextAction: `Work on ${title}.`,
    confidence,
    priorityLevel: top.priorityLevel,
    dueDate: formatDueDate(top.task),
    source: "offline",
  };

  console.log("Offline AI Prioritizer result:", result);
  return result;
}

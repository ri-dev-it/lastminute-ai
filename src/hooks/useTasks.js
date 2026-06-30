import { useEffect, useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import {
  addDoc,
  collection,
  db,
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from "../lib/firestore.js";

function normalizeTask(docSnapshot) {
  const data = docSnapshot.data();
  const category = data.category || data.type || "personal";
  const deadline = data.deadline || data.dueDate || "";

  return {
    ...data,
    id: docSnapshot.id,
    type: category,
    category,
    deadline,
    dueDate: deadline,
    completed: data.status === "completed" || data.completed || false,
    effort: Number(data.effort || data.duration || 30),
    priority: data.priority || "Medium",
    status: data.status || "todo",
    subtasks: data.subtasks || [],
  };
}

function taskToFirestore(task, uid) {
  const category = task.category || task.type || "personal";
  const deadline = task.deadline || task.dueDate || "";

  return {
    uid,
    title: task.title || "",
    description: task.description || task.notes || "",
    category,
    priority: task.priority || "Medium",
    status: task.status || "todo",
    deadline,
    duration: String(task.duration || task.effort || ""),
    company: task.company || "",
    role: task.role || "",
    competitionName: task.competitionName || "",
    teamName: task.teamName || "",
    round: task.round || "",
    interviewDate: task.interviewDate || "",
    reminder: task.reminder || "",
    notes: task.notes || "",
    subtasks: task.subtasks || [],
    completed: task.completed || false,
    effort: Number(task.effort || task.duration || 30),
  };
}

function fieldsToFirestore(fields) {
  const nextFields = { ...fields };

  if (nextFields.type && !nextFields.category) {
    nextFields.category = nextFields.type;
  }

  if (nextFields.dueDate && !nextFields.deadline) {
    nextFields.deadline = nextFields.dueDate;
  }

  delete nextFields.id;
  delete nextFields.type;
  delete nextFields.dueDate;

  return nextFields;
}

function getUserTasksCollection(uid) {
  return collection(db, "users", uid, "tasks");
}

export function useTasks() {
  const { currentUser } = useAuth();
  const [tasks, setTasks] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentUser?.uid) {
      setTasks([]);
      setLoading(false);
      return undefined;
    }

    setLoading(true);

    const unsubscribe = onSnapshot(
      getUserTasksCollection(currentUser.uid),
      (snapshot) => {
        const userTasks = snapshot.docs
          .map(normalizeTask)
          .sort((a, b) => {
            const aCreated = a.createdAt?.toMillis?.() || 0;
            const bCreated = b.createdAt?.toMillis?.() || 0;
            return bCreated - aCreated;
          });

        setTasks(userTasks);
        setLoading(false);
      },
      (error) => {
        console.error("Failed to load tasks from Firestore:", error);
        alert(error.message);
        setTasks([]);
        setLoading(false);
      },
    );

    return unsubscribe;
  }, [currentUser]);

  async function addTask(task) {
    if (!currentUser?.uid) {
      const err = new Error("Cannot add a task without an authenticated user.");
      console.error(err);
      alert(err.message);
      throw err;
    }

    try {
      await addDoc(getUserTasksCollection(currentUser.uid), {
        ...taskToFirestore(task, currentUser.uid),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      alert(err.message);
      throw err;
    }
  }

  async function updateTask(id, fields) {
    if (!currentUser?.uid) {
      const err = new Error("Cannot update a task without an authenticated user.");
      console.error(err);
      alert(err.message);
      throw err;
    }

    try {
      await updateDoc(doc(db, "users", currentUser.uid, "tasks", id), {
        ...fieldsToFirestore(fields),
        updatedAt: serverTimestamp(),
      });
    } catch (err) {
      console.error(err);
      alert(err.message);
      throw err;
    }
  }

  async function deleteTask(id) {
    if (!currentUser?.uid) {
      const err = new Error("Cannot delete a task without an authenticated user.");
      console.error(err);
      alert(err.message);
      throw err;
    }

    try {
      await deleteDoc(doc(db, "users", currentUser.uid, "tasks", id));
    } catch (err) {
      console.error(err);
      alert(err.message);
      throw err;
    }
  }

  return {
    tasks,
    loading,
    addTask,
    updateTask,
    deleteTask,
  };
}

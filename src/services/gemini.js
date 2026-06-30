import { GoogleGenerativeAI } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

function trimToWordLimit(text, limit = 70) {
  const words = text.trim().replace(/\s+/g, " ").split(" ");

  if (words.length <= limit) {
    return words.join(" ");
  }

  return `${words.slice(0, limit).join(" ")}...`;
}

export async function getPrioritySuggestion(tasks) {
  if (!tasks?.length) {
    return "Add a task first, then I can recommend the best next move.";
  }

  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.35,
      maxOutputTokens: 120,
    },
  });

  const taskSummary = tasks.map((task) => ({
    title: task.title,
    category: task.category,
    deadline: task.deadline,
    effortMinutes: task.effort,
    impact: task.impact,
    status: task.status,
  }));

  const prompt = `
You are LastMinute AI, a concise productivity assistant.
Given these tasks, recommend exactly one task to do first and explain why.
Keep the answer under 70 words. Be practical, calm, and direct.

Tasks:
${JSON.stringify(taskSummary, null, 2)}
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  return trimToWordLimit(text);
}

import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";

const apiKey = import.meta.env.VITE_GEMINI_API_KEY;

const fallbackRecommendation = {
  priorityTask: "Unable to generate AI recommendation.",
  reason: "",
  focusTime: "",
  nextAction: "",
  productivityTip: "",
};

const recommendationSchema = {
  type: SchemaType.OBJECT,
  properties: {
    priorityTask: {
      type: SchemaType.STRING,
      description: "The title of the single task the user should complete first.",
    },
    reason: {
      type: SchemaType.STRING,
      description: "A concise reason this task has the highest priority.",
    },
    focusTime: {
      type: SchemaType.STRING,
      description: "Estimated focus duration, such as 25 minutes or 1 hour.",
    },
    nextAction: {
      type: SchemaType.STRING,
      description: "The immediate next action the user should take.",
    },
    productivityTip: {
      type: SchemaType.STRING,
      description: "One short productivity tip relevant to the task list.",
    },
  },
  required: ["priorityTask", "reason", "focusTime", "nextAction", "productivityTip"],
};

function normalizeRecommendation(value) {
  return {
    priorityTask: value?.priorityTask || fallbackRecommendation.priorityTask,
    reason: value?.reason || "",
    focusTime: value?.focusTime || "",
    nextAction: value?.nextAction || "",
    productivityTip: value?.productivityTip || "",
  };
}

export async function generateNextMove(tasks) {
  if (!tasks?.length) {
    return {
      priorityTask: "No tasks yet",
      reason: "Add a task so Gemini can compare urgency, impact, effort, and status.",
      focusTime: "5 minutes",
      nextAction: "Create your first task with a clear deadline.",
      productivityTip: "A useful task starts with a verb and a deadline.",
    };
  }

  if (!apiKey) {
    throw new Error("Missing Gemini API key.");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: {
      temperature: 0.25,
      responseMimeType: "application/json",
      responseSchema: recommendationSchema,
    },
  });

  const taskPayload = tasks.map(({ title, category, deadline, effort, impact, status }) => ({
    title,
    category,
    deadline,
    effort,
    impact,
    status,
  }));

  const prompt = ` 
Analyze this task list for a productivity dashboard.
Choose exactly one task that should be completed first.
Consider deadline urgency, task impact, effort required, and current status.
Return only JSON matching the provided schema.


Tasks:
${JSON.stringify(taskPayload, null, 2)}
`;

  const result = await model.generateContent(prompt);
  const text = result.response.text();

  return normalizeRecommendation(JSON.parse(text));
}

export { fallbackRecommendation };

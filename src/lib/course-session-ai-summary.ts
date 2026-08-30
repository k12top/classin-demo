import type {
  CourseSessionSummaryCaption,
  CourseSessionSummaryDocument,
} from "@/lib/course-session-summary-document";

type SummaryAPIStyle = "responses" | "chat-completions";

export type CourseSessionAISummaryConfig = {
  apiKey: string;
  baseUrl: string;
  model: string;
  language: string;
  apiStyle: SummaryAPIStyle;
  timeoutMs: number;
  maxCaptions: number;
  retryCount: number;
};

type SummaryInput = {
  title: string;
  captions: Array<CourseSessionSummaryCaption & { id?: string }>;
  fallback: CourseSessionSummaryDocument;
};

type SummaryOutput = Pick<
  CourseSessionSummaryDocument,
  "overview" | "keyPoints" | "questions" | "actionItems"
>;

const summarySchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overview: { type: "string" },
    keyPoints: { type: "array", items: { type: "string" }, maxItems: 8 },
    questions: { type: "array", items: { type: "string" }, maxItems: 5 },
    actionItems: { type: "array", items: { type: "string" }, maxItems: 5 },
  },
  required: ["overview", "keyPoints", "questions", "actionItems"],
} as const;

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function courseSessionAISummaryConfig(
  env: NodeJS.ProcessEnv = process.env,
): CourseSessionAISummaryConfig | null {
  if (env.AI_SUMMARY_ENABLED?.trim().toLowerCase() !== "true") return null;
  const apiKey = env.AI_SUMMARY_API_KEY?.trim() || "";
  const model = env.AI_SUMMARY_MODEL?.trim() || "";
  if (!apiKey || !model) return null;
  return {
    apiKey,
    model,
    baseUrl: (env.AI_SUMMARY_BASE_URL?.trim() || "https://api.openai.com/v1")
      .replace(/\/+$/, ""),
    language: env.AI_SUMMARY_LANGUAGE?.trim() || "zh-CN",
    apiStyle:
      env.AI_SUMMARY_API_STYLE?.trim().toLowerCase() === "chat-completions"
        ? "chat-completions"
        : "responses",
    timeoutMs: positiveInteger(env.AI_SUMMARY_TIMEOUT_SECONDS, 180) * 1_000,
    maxCaptions: positiveInteger(env.AI_SUMMARY_MAX_CAPTIONS, 2_000),
    retryCount: Math.min(positiveInteger(env.AI_SUMMARY_RETRY_COUNT, 3), 5),
  };
}

function transcriptPayload(input: SummaryInput, maxCaptions: number) {
  return input.captions.slice(-maxCaptions).map((caption) => ({
    id: caption.id || undefined,
    speakerId: caption.speakerId,
    speakerName: caption.speakerName,
    occurredAt: caption.occurredAt.toISOString(),
    text: caption.text.replace(/\s+/g, " ").trim().slice(0, 1_200),
  }));
}

function instructions(language: string) {
  return `你是课堂课后总结助手。请只依据逐字稿生成可供教师审核的课堂总结，输出语言为 ${language}。\n` +
    "不要虚构知识点、问题、作业、负责人或期限。keyPoints 只保留真正讲授或讨论的重点；questions 只保留课堂中提出且值得回顾的问题；actionItems 只保留明确布置的课后任务。";
}

function extractResponseText(value: unknown, apiStyle: SummaryAPIStyle) {
  if (!value || typeof value !== "object") return "";
  const response = value as Record<string, unknown>;
  if (apiStyle === "responses") {
    if (typeof response.output_text === "string") return response.output_text;
    if (!Array.isArray(response.output)) return "";
    for (const item of response.output) {
      if (!item || typeof item !== "object") continue;
      const content = (item as { content?: unknown }).content;
      if (!Array.isArray(content)) continue;
      for (const part of content) {
        if (part && typeof part === "object" && "text" in part) {
          const text = (part as { text?: unknown }).text;
          if (typeof text === "string") return text;
        }
      }
    }
    return "";
  }
  const choices = response.choices;
  if (!Array.isArray(choices)) return "";
  const first = choices[0] as { message?: { content?: unknown } } | undefined;
  return typeof first?.message?.content === "string"
    ? first.message.content
    : "";
}

function requestBody(config: CourseSessionAISummaryConfig, input: SummaryInput) {
  const transcript = transcriptPayload(input, config.maxCaptions);
  const userInput = JSON.stringify({
    lesson: { title: input.title },
    transcript,
  });
  if (config.apiStyle === "chat-completions") {
    return {
      model: config.model,
      temperature: 0.1,
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "course_session_summary",
          strict: true,
          schema: summarySchema,
        },
      },
      messages: [
        { role: "system", content: instructions(config.language) },
        { role: "user", content: userInput },
      ],
    };
  }
  return {
    model: config.model,
    store: false,
    instructions: instructions(config.language),
    input: userInput,
    text: {
      format: {
        type: "json_schema",
        name: "course_session_summary",
        strict: true,
        schema: summarySchema,
      },
    },
  };
}

function endpoint(config: CourseSessionAISummaryConfig) {
  return `${config.baseUrl}/${
    config.apiStyle === "chat-completions" ? "chat/completions" : "responses"
  }`;
}

export async function generateCourseSessionAISummary(
  input: SummaryInput,
  options: {
    config?: CourseSessionAISummaryConfig | null;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<CourseSessionSummaryDocument | null> {
  const config = options.config === undefined
    ? courseSessionAISummaryConfig()
    : options.config;
  if (!config || input.captions.length === 0) return null;
  const fetchImpl = options.fetchImpl || fetch;
  let lastError: unknown;
  for (let attempt = 0; attempt < config.retryCount; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const response = await fetchImpl(endpoint(config), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(requestBody(config, input)),
        signal: controller.signal,
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`AI summary HTTP ${response.status}: ${body.slice(0, 500)}`);
      }
      const decoded = JSON.parse(body) as unknown;
      const content = extractResponseText(decoded, config.apiStyle).trim();
      if (!content) throw new Error("AI summary response has no output text");
      const output = JSON.parse(content) as SummaryOutput;
      return {
        ...input.fallback,
        overview: output.overview,
        keyPoints: output.keyPoints,
        questions: output.questions,
        actionItems: output.actionItems,
      };
    } catch (error) {
      lastError = error;
      if (attempt + 1 < config.retryCount) {
        await new Promise((resolve) => setTimeout(resolve, 250 * 2 ** attempt));
      }
    } finally {
      clearTimeout(timeout);
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("AI summary generation failed");
}

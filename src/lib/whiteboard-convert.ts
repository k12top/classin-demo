export interface ConversionScene {
  name: string;
  ppt?: { src: string; width: number; height: number };
}

export interface ConversionResult {
  taskUuid: string;
  status: "Pending" | "Converting" | "Finished" | "Failed";
  type: "static" | "dynamic";
  scenes: ConversionScene[];
  prefix?: string;
  errorMessage?: string;
}

const API_BASE = "https://api.netless.link/v5/projector/tasks";
const REGIONS = new Set(["cn-hz", "us-sv", "sg", "in-mum", "eu"]);

// Do not include provider response bodies: they can contain signed source URLs.
function providerError(data: Record<string, unknown>, status: number, region: string): string {
  const error = data.error as { code?: unknown; title?: unknown } | undefined;
  const code = data.errorCode ?? error?.code;
  const title = typeof error?.title === "string" ? error.title : "";
  const detail = code === undefined ? "" : `，错误码 ${String(code).replace(/[^\w-]/g, "").slice(0, 40)}`;
  if (title === "service not enable") return `声网白板 ${region} 区域尚未开通文档转换服务（HTTP ${status}），请在声网控制台开通文档转图片/文档转网页并配置存储后重试`;
  if (status === 401 || status === 403) return `白板课件转换鉴权失败（HTTP ${status}${detail}），请检查 SDK Token 和所选区域的转换服务配置`;
  if (title === "invalid format") return `白板课件转换请求参数无效（HTTP ${status}${detail}）`;
  return `白板课件转换服务请求失败（HTTP ${status}${detail}），请检查所选区域的转换服务与存储配置后重试`;
}

async function requestConversion(path: string, init: RequestInit): Promise<Record<string, unknown>> {
  const token = process.env.WHITEBOARD_SDK_TOKEN?.trim();
  const region = (process.env.WHITEBOARD_REGION || "sg").trim();
  if (!token) throw new Error("互动白板尚未配置：缺少 WHITEBOARD_SDK_TOKEN");
  if (!REGIONS.has(region)) throw new Error("互动白板配置错误：WHITEBOARD_REGION 无效");
  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { Accept: "application/json", "Content-Type": "application/json", token, region },
      cache: "no-store",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new Error("白板课件转换服务暂时无法连接，请稍后重试");
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(providerError(data || {}, response.status, region));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("白板课件转换服务返回了无效结果");
  return data;
}

function conversionStatus(status: unknown): ConversionResult["status"] {
  switch (status) {
    case "Waiting": case "Pending": return "Pending";
    case "Converting": return "Converting";
    case "Finished": return "Finished";
    case "Fail": case "Failed": return "Failed";
    default: throw new Error("白板课件转换服务返回了未知任务状态");
  }
}

/** Projector uses resource + region, rather than the legacy converter's url. */
export async function startWhiteboardConversion(fileUrl: string, ext: string): Promise<Omit<ConversionResult, "scenes">> {
  const type = ["ppt", "pptx"].includes(ext.toLowerCase()) ? "dynamic" : "static";
  const data = await requestConversion("", {
    method: "POST",
    body: JSON.stringify({ resource: fileUrl, type, preview: true }),
  });
  if (typeof data.uuid !== "string" || !data.uuid.trim()) throw new Error("白板课件转换服务未返回任务 UUID");
  return { taskUuid: data.uuid, status: conversionStatus(data.status ?? "Waiting"), type };
}

export async function getWhiteboardConversionStatus(taskUuid: string, type: "static" | "dynamic"): Promise<ConversionResult> {
  const data = await requestConversion(`/${encodeURIComponent(taskUuid)}`, { method: "GET" });
  const status = conversionStatus(data.status);
  const scenes: ConversionScene[] = [];
  if (status === "Finished" && type === "static" && data.images && typeof data.images === "object") {
    for (const [name, image] of Object.entries(data.images).sort(([a], [b]) => Number(a) - Number(b))) {
      if (image && typeof image.url === "string" && Number(image.width) > 0 && Number(image.height) > 0) {
        scenes.push({ name, ppt: { src: image.url, width: Number(image.width), height: Number(image.height) } });
      }
    }
  }
  if (status === "Finished" && (type === "static" ? !scenes.length : typeof data.prefix !== "string" || !data.prefix)) {
    throw new Error("白板课件转换结果缺少可展示的页面或资源地址");
  }
  return {
    taskUuid, status, type, scenes,
    ...(typeof data.prefix === "string" ? { prefix: data.prefix } : {}),
    ...(status === "Failed" ? { errorMessage: `白板课件转换失败${data.errorCode ? `（错误码 ${String(data.errorCode).replace(/[^\w-]/g, "").slice(0, 40)}）` : ""}，请检查源文件和转换服务配置后重试` } : {}),
  };
}

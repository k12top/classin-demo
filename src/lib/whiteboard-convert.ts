export interface ConversionScene {
  name: string;
  ppt?: {
    src: string;
    width: number;
    height: number;
  };
}

export interface ConversionResult {
  taskUuid: string;
  status: "Pending" | "Converting" | "Finished" | "Failed";
  type: "static" | "dynamic";
  scenes: ConversionScene[];
}

/**
 * Request the whiteboard conversion service to convert a document (PPT, PDF, DOC, etc.)
 */
export async function startWhiteboardConversion(
  fileUrl: string,
  ext: string
): Promise<Omit<ConversionResult, "scenes">> {
  const token = process.env.WHITEBOARD_SDK_TOKEN;
  const isDynamic = ["ppt", "pptx"].includes(ext.toLowerCase());
  const type = isDynamic ? "dynamic" : "static";

  if (!token) {
    throw new Error(
      "互动白板尚未配置：缺少 WHITEBOARD_SDK_TOKEN",
    );
  }

  try {
    const res = await fetch("https://api.netless.link/v5/projector/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        token: token,
      },
      body: JSON.stringify({
        url: fileUrl,
        type,
        preview: true,
        scale: 1.2,
        outputFormat: isDynamic ? "dynamic" : "static",
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || "白板课件转换任务创建失败");
    }

    const data = await res.json();
    return {
      taskUuid: data.uuid,
      status: data.status || "Converting",
      type,
    };
  } catch (error) {
    console.error("Whiteboard projector API error:", error);
    throw error instanceof Error
      ? error
      : new Error("白板课件转换任务创建失败");
  }
}

/**
 * Poll the conversion progress of an interactive whiteboard task.
 */
export async function getWhiteboardConversionStatus(
  taskUuid: string,
  type: "static" | "dynamic",
): Promise<ConversionResult> {
  const token = process.env.WHITEBOARD_SDK_TOKEN;

  if (!token) {
    throw new Error("互动白板尚未配置：缺少 WHITEBOARD_SDK_TOKEN");
  }

  try {
    const res = await fetch(`https://api.netless.link/v5/projector/tasks/${taskUuid}`, {
      method: "GET",
      headers: {
        token: token,
      },
    });

    if (!res.ok) {
      throw new Error("查询课件转换状态失败");
    }

    const data = await res.json();
    const status = data.status || "Converting";

    let scenes: ConversionScene[] = [];
    if (status === "Finished" && data.progress) {
      scenes = data.progress.scenes || [];
    }

    return {
      taskUuid,
      status,
      type,
      scenes,
    };
  } catch (error) {
    console.error("Whiteboard conversion status error:", error);
    throw error instanceof Error
      ? error
      : new Error("查询课件转换状态失败");
  }
}

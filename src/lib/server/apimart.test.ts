import { describe, expect, it } from "vitest";
import {
  parseProviderTaskResponse,
  providerErrorCode,
  providerTaskPhase,
} from "./apimart";

/**
 * 2026-09-17 线上真实响应：图生图任务被内容安全拒绝。
 * error.code 是字符串，schema 曾经只接受数字，导致解析失败后
 * 任务被误判成「服务无响应」超时。
 */
const contentPolicyRejection = {
  code: 200,
  data: {
    actual_time: 11,
    completed: 1789591267,
    cost: 0,
    created: 1789591256,
    credits_cost: 0,
    error: {
      code: "task_failed",
      message:
        "Your prompt or input was rejected by the content safety system.",
      param: "",
      type: "task_failed",
    },
    estimated_time: 60,
    id: "task_01M2NZ6YSJ05C27SE40RGYATSA",
    progress: 100,
    status: "failed",
  },
};

const workingTask = {
  code: 200,
  data: { id: "task-1", status: "processing", progress: 40 },
};

describe("providerTaskPhase", () => {
  it("maps the documented statuses", () => {
    expect(providerTaskPhase("pending")).toBe("working");
    expect(providerTaskPhase("processing")).toBe("working");
    expect(providerTaskPhase("completed")).toBe("completed");
    expect(providerTaskPhase("failed")).toBe("failed");
    expect(providerTaskPhase("cancelled")).toBe("cancelled");
  });

  it("reports statuses we do not know instead of throwing", () => {
    expect(providerTaskPhase("moderated")).toBe("unknown");
  });
});

describe("parseProviderTaskResponse", () => {
  it("parses a failure whose error code is a string", () => {
    const task = parseProviderTaskResponse(contentPolicyRejection);

    expect(task?.status).toBe("failed");
    expect(task?.error?.message).toBe(
      "Your prompt or input was rejected by the content safety system.",
    );
    expect(task && providerTaskPhase(task.status)).toBe("failed");
  });

  it("ignores fields the provider adds later", () => {
    const payload = {
      ...contentPolicyRejection,
      request_id: "req-1",
      data: {
        ...contentPolicyRejection.data,
        queued_at: 1789591256,
        error: { ...contentPolicyRejection.data.error, retryable: false },
      },
    };

    expect(parseProviderTaskResponse(payload)?.status).toBe("failed");
  });

  it("parses an in-flight task without a result yet", () => {
    expect(parseProviderTaskResponse(workingTask)?.progress).toBe(40);
  });

  it("returns null for payloads that are not task responses", () => {
    expect(parseProviderTaskResponse({ code: 200 })).toBeNull();
    expect(
      parseProviderTaskResponse({ code: 200, data: { status: "failed" } }),
    ).toBeNull();
    expect(parseProviderTaskResponse(null)).toBeNull();
  });
});

describe("providerErrorCode", () => {
  it("normalises a content-policy rejection to one stable code", () => {
    const task = parseProviderTaskResponse(contentPolicyRejection);

    expect(task && providerErrorCode(task)).toBe("PROVIDER_CONTENT_POLICY");
  });

  it("keeps the provider's own code for other failures", () => {
    const task = parseProviderTaskResponse({
      code: 200,
      data: {
        id: "task-6",
        status: "failed",
        error: { code: "moderation_timeout", message: "Timed out" },
      },
    });

    expect(task && providerErrorCode(task)).toBe("moderation_timeout");
  });

  it("keeps numeric codes and trims long ones", () => {
    const numeric = parseProviderTaskResponse({
      code: 200,
      data: {
        id: "task-2",
        status: "failed",
        error: { code: 402, message: "Out of credits" },
      },
    });
    const verbose = parseProviderTaskResponse({
      code: 200,
      data: {
        id: "task-3",
        status: "failed",
        error: { code: "x".repeat(120), message: "Rejected" },
      },
    });

    expect(numeric && providerErrorCode(numeric)).toBe("code_402");
    expect(verbose && providerErrorCode(verbose)).toHaveLength(64);
  });

  it("falls back to a stable code when the provider omits one", () => {
    const failed = parseProviderTaskResponse({
      code: 200,
      data: { id: "task-4", status: "failed" },
    });
    const cancelled = parseProviderTaskResponse({
      code: 200,
      data: { id: "task-5", status: "cancelled" },
    });

    expect(failed && providerErrorCode(failed)).toBe("TASK_FAILED");
    expect(cancelled && providerErrorCode(cancelled)).toBe("TASK_CANCELLED");
  });
});

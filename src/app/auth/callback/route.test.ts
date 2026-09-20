import { describe, expect, it } from "vitest";
import { GET } from "./route";

/**
 * 回调改成 200 的跳转页是为了绕开 vinext 的一个兼容缺口：它的 route handler
 * 管道会跟随返回的重定向，导致同一处理器在一次请求里被执行十几次、最后抛
 * "Too many redirects"（同一段代码在 Vercel 上是正常的 307）。
 * 所以关键不变量是：**响应里不能出现 Location 头**，跳转由 meta refresh +
 * 内联脚本完成，两者目标必须一致。
 */
function decodeHtmlAttribute(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

function decodeScriptLiteral(value: string): string {
  return value.replaceAll("\\u003c", "<").replaceAll("\\u003e", ">");
}

async function navigate(
  url: string,
): Promise<{ status: number; target: string; body: string }> {
  const response = await GET(new Request(url));
  const body = await response.text();
  const meta = /content="0;url=([^"]*)"/.exec(body)?.[1] ?? "";
  const script = /location\.replace\("([^"]*)"\)/.exec(body)?.[1] ?? "";
  // meta 属性里是 HTML 实体，脚本里是 JS 字符串字面量；各自解码后应完全一致
  expect(decodeScriptLiteral(script)).toBe(decodeHtmlAttribute(meta));
  expect(response.headers.get("location")).toBeNull();
  expect(response.headers.get("content-type")).toContain("text/html");
  return { status: response.status, target: decodeScriptLiteral(script), body };
}

describe("auth callback navigation page", () => {
  it("returns direct sign-ins to the home page", async () => {
    const result = await navigate("http://127.0.0.1:3000/auth/callback");
    expect(result.status).toBe(200);
    expect(result.target).toBe("/");
  });

  it("preserves safe in-app destinations", async () => {
    const result = await navigate(
      "http://127.0.0.1:3000/auth/callback?next=%2Fpricing",
    );
    expect(result.target).toBe("/pricing");
  });

  it("neutralises protocol-relative and auth destinations", async () => {
    const protocolRelative = await navigate(
      "http://127.0.0.1:3000/auth/callback?next=%2F%2Fevil.example",
    );
    expect(protocolRelative.target).toBe("/");
    const authPath = await navigate(
      "http://127.0.0.1:3000/auth/callback?next=%2Fauth%2Fcallback",
    );
    expect(authPath.target).toBe("/");
  });

  it("sends failures to the login page with the reason and next path", async () => {
    const result = await navigate(
      "http://127.0.0.1:3000/auth/callback?error=access_denied&error_description=Denied&next=%2Faccount",
    );
    expect(result.target).toBe("/login?error=Denied&next=%2Faccount");
  });

  it("keeps attacker-controlled values inert in HTML and script contexts", async () => {
    // error 会被 URL 编码，HTML 属性里不会出现裸标签
    const reason = await navigate(
      `http://127.0.0.1:3000/auth/callback?error=${encodeURIComponent('</script><img src=x onerror=alert(1)>')}`,
    );
    expect(reason.body).not.toContain("</script><img");
    expect(reason.body).toContain("%3C%2Fscript%3E");

    // next 是路径，允许出现裸 <，必须在内联脚本里被转义掉
    const path = await navigate(
      "http://127.0.0.1:3000/auth/callback?next=%2F%3Cscript%3Ealert(1)%3C%2Fscript%3E",
    );
    expect(path.body).not.toContain("<script>alert");
    expect(path.body).toContain("\\u003cscript");
  });
});

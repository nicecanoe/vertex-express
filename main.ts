// main.ts

// --- 你之前所有的 CORS 配置常量 ---
const allowedOriginFromEnv = Deno.env.get("ALLOWED_ORIGIN");
const defaultAllowedOrigin = "https://deep-research-eight-ebon.vercel.app"; // 确保这是正确的新前端源
const actualAllowedOrigin = allowedOriginFromEnv || defaultAllowedOrigin;

const allowedMethods = "GET, POST, OPTIONS, PUT, DELETE";
const allowedHeaders = "Content-Type, Authorization"; // 确保这里包含了你前端实际发送的所有头部

async function handler(req: Request): Promise<Response> {
  const requestOrigin = req.headers.get("Origin");
  const responseHeadersToClient = new Headers(); // 用于从 Deno 服务返回给客户端的响应头

  // --- 1. 设置 CORS 头部 ---
  if (requestOrigin && requestOrigin === actualAllowedOrigin) {
    responseHeadersToClient.set("Access-Control-Allow-Origin", actualAllowedOrigin);
  }
  responseHeadersToClient.set("Access-Control-Allow-Methods", allowedMethods);
  responseHeadersToClient.set("Access-Control-Allow-Headers", allowedHeaders);
  responseHeadersToClient.set("Access-Control-Allow-Credentials", "true");

  // --- 2. 处理 OPTIONS 预检请求 ---
  if (req.method === "OPTIONS") {
    // 为调试添加日志
    console.log(`[CORS] OPTIONS request from: ${requestOrigin} for path: ${new URL(req.url).pathname}`);
    console.log(`[CORS] Responding to OPTIONS with ACAO: ${responseHeadersToClient.get("Access-Control-Allow-Origin")}`);
    return new Response(null, { status: 204, headers: responseHeadersToClient });
  }

  // --- 3. 应用逻辑：代理 或 其他 ---
  const url = new URL(req.url);

  // 检查是否是需要代理的路径
  if (url.pathname.startsWith('/v1beta/models') || url.pathname.startsWith('/v1/models')) {
    // --- 代理逻辑 ---
    const targetUrl = new URL(req.url);
    targetUrl.hostname = 'aiplatform.googleapis.com';
    targetUrl.protocol = 'https:';

    if (url.pathname.startsWith('/v1beta/models')) {
      targetUrl.pathname = url.pathname.replace('/v1beta/models', '/v1/publishers/google/models');
    } else { // (url.pathname.startsWith('/v1/models'))
      targetUrl.pathname = url.pathname.replace('/v1/models', '/v1/publishers/google/models');
    }

    // 创建新的请求以转发到目标服务
    const proxyRequest = new Request(targetUrl.toString(), req);

    try {
      console.log(`[Proxy] Forwarding request to: ${targetUrl.toString()}`);
      const proxyResponse = await fetch(proxyRequest);

      // 为调试记录目标服务的响应状态和内容类型
      console.log(`[Proxy] Target responded with status: ${proxyResponse.status}`);
      console.log(`[Proxy] Target response Content-Type: ${proxyResponse.headers.get("Content-Type")}`);

      // 准备最终返回给客户端的响应头，先复制目标服务的响应头
      const finalHeadersForClient = new Headers(proxyResponse.headers);

      // 确保我们自己的 CORS 头部被应用 (覆盖或添加)
      if (requestOrigin && requestOrigin === actualAllowedOrigin) {
        finalHeadersForClient.set("Access-Control-Allow-Origin", actualAllowedOrigin);
      }
      finalHeadersForClient.set("Access-Control-Allow-Methods", allowedMethods); // 理论上主要用于预检，但明确写出无害
      finalHeadersForClient.set("Access-Control-Allow-Headers", allowedHeaders); // 同上
      finalHeadersForClient.set("Access-Control-Allow-Credentials", "true");
      // 如果需要，可以暴露目标服务器的一些特定头部给前端
      // finalHeadersForClient.append("Access-Control-Expose-Headers", "X-Target-Specific-Header");


      if (!proxyResponse.ok) { // 检查状态码是否表示成功 (例如 200-299)
        // 目标服务返回了错误 (例如 404, 500)
        // 我们应该返回一个结构化的 JSON 错误，而不是可能的目标服务的 HTML 错误页面
        let errorPayload = {
          error: "代理目标服务返回错误",
          targetStatus: proxyResponse.status,
          targetResponse: ""
        };
        try {
          // 尝试读取目标服务的错误响应体（可能是文本或JSON）
          const textResponse = await proxyResponse.text();
          errorPayload.targetResponse = textResponse; // 记录原始错误文本
          console.log(`[Proxy] Target error body: ${textResponse}`);
        } catch (e) {
          console.error("[Proxy] Failed to read target error body:", e);
          errorPayload.targetResponse = "无法读取目标错误响应体";
        }
        
        finalHeadersForClient.set("Content-Type", "application/json"); // 确保我们自己的错误响应是 JSON
        return new Response(JSON.stringify(errorPayload), {
          status: proxyResponse.status, // 可以选择返回目标服务的原始状态码，或统一返回如 502 Bad Gateway
          headers: finalHeadersForClient
        });
      }

      // 如果代理请求成功 (proxyResponse.ok 为 true)
      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: finalHeadersForClient // 使用已包含我们CORS策略的头部
      });

    } catch (error) {
      // 这个 catch 块捕获 fetch(proxyRequest) 本身的错误 (例如网络问题，DNS解析失败等)
      console.error("[Proxy] 请求转发本身失败:", error);
      responseHeadersToClient.set("Content-Type", "application/json"); // 我们自己的错误响应是 JSON
      return new Response(JSON.stringify({ error: "代理请求在转发时失败", details: error.message }), {
        status: 502, // Bad Gateway 表示代理服务器收到了无效响应
        headers: responseHeadersToClient
      });
    }
  }

  // --- 4. 如果不是代理路径，则返回 404 ---
  // (或者你应用的其他非代理路径的逻辑)
  console.log(`[App] Path not proxied, returning 404 for: ${url.pathname}`);
  responseHeadersToClient.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ error: "请求的路径未找到" }), {
    status: 404,
    headers: responseHeadersToClient
  });
}

// --- 启动服务 ---
Deno.serve(handler);

console.log(`Deno server running. Effective ALLOWED_ORIGIN: ${actualAllowedOrigin}. Waiting for requests...`);

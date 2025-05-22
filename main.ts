// main.ts

// 在你的 main.ts 文件的顶部
const allowedOriginFromEnv = Deno.env.get("ALLOWED_ORIGIN");
const defaultAllowedOrigin = "https://deep-research-eight-ebon.vercel.app"; // ⬅️ 更新为这个新的源
const allowedOrigin = allowedOriginFromEnv || defaultAllowedOrigin;

// 其他常量保持不变
const allowedMethods = "GET, POST, OPTIONS, PUT, DELETE";
const allowedHeaders = "Content-Type, Authorization"; // 确保这里包含你前端实际发送的头部

// --- 主要的请求处理函数 ---
async function handler(req: Request): Promise<Response> {
  const requestOrigin = req.headers.get("Origin");
  // 这些 headers 将用于从你的 Deno Deploy 服务发回给客户端的响应
  const responseHeadersToClient = new Headers();

  // --- 1. 设置 CORS 头部 (这些应该应用到所有从本服务发出的响应) ---
  if (requestOrigin && allowedOrigin === requestOrigin) { // 严格匹配单个源
    responseHeadersToClient.set("Access-Control-Allow-Origin", allowedOrigin);
  }
  // 如果你需要支持多个源，或者 Deno Deploy 自身的预览 URL，这里的逻辑可能需要更复杂
  // 例如，如果 allowedOrigin 是一个逗号分隔的列表:
  // const allowedOriginsArray = allowedOrigin.split(',');
  // if (requestOrigin && allowedOriginsArray.includes(requestOrigin)) {
  //   responseHeadersToClient.set("Access-Control-Allow-Origin", requestOrigin);
  // }

  responseHeadersToClient.set("Access-Control-Allow-Methods", allowedMethods);
  responseHeadersToClient.set("Access-Control-Allow-Headers", allowedHeaders);
  responseHeadersToClient.set("Access-Control-Allow-Credentials", "true"); // 如果前端需要发送凭证

  // --- 2. 处理预检请求 (OPTIONS) ---
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeadersToClient });
  }

  // --- 3. 应用逻辑：代理 或 其他 ---
  const url = new URL(req.url);

  // 检查请求路径是否为需要代理的路径
  if (url.pathname.startsWith('/v1beta/models') || url.pathname.startsWith('/v1/models')) {
    // --- 代理逻辑 ---
    const targetUrl = new URL(req.url); // 克隆原始请求 URL 进行修改
    targetUrl.hostname = 'aiplatform.googleapis.com';
    targetUrl.protocol = 'https:';

    if (url.pathname.startsWith('/v1beta/models')) {
      targetUrl.pathname = url.pathname.replace('/v1beta/models', '/v1/publishers/google/models');
    } else { // startsWith('/v1/models')
      targetUrl.pathname = url.pathname.replace('/v1/models', '/v1/publishers/google/models');
    }

    // 创建新的请求以转发到目标服务
    // 使用原始请求的 method, headers (大部分), body 来创建新请求
    const proxyRequest = new Request(targetUrl.toString(), req);

    try {
      const proxyResponse = await fetch(proxyRequest);

      // 重要：我们需要将我们自己服务器的 CORS 头部应用到从目标服务器获取的响应上，
      // 然后再返回给客户端。
      // 创建一个新的 Headers 对象，基于目标服务器的响应头，但要确保我们的 CORS 头优先。
      const finalHeadersForClient = new Headers(proxyResponse.headers); // 从目标响应获取原始头部

      // 覆盖或添加我们自己的 CORS 头部
      if (requestOrigin && allowedOrigin === requestOrigin) {
        finalHeadersForClient.set("Access-Control-Allow-Origin", allowedOrigin);
      }
      finalHeadersForClient.set("Access-Control-Allow-Methods", allowedMethods);
      finalHeadersForClient.set("Access-Control-Allow-Headers", allowedHeaders);
      finalHeadersForClient.set("Access-Control-Allow-Credentials", "true");
      // 你可能还想暴露一些目标服务器的特定头部给前端
      // finalHeadersForClient.append("Access-Control-Expose-Headers", "X-Target-Specific-Header");

      return new Response(proxyResponse.body, {
        status: proxyResponse.status,
        statusText: proxyResponse.statusText,
        headers: finalHeadersForClient
      });

    } catch (error) {
      console.error("代理请求失败:", error);
      responseHeadersToClient.set("Content-Type", "application/json");
      return new Response(JSON.stringify({ error: "代理请求失败", details: error.message }), { status: 502, headers: responseHeadersToClient });
    }
  }

  // --- 4. 如果不是代理路径，则返回 404 (或其他自定义逻辑) ---
  responseHeadersToClient.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ error: "路径未找到" }), { status: 404, headers: responseHeadersToClient });
}

// --- 启动服务 (确保这是唯一的服务启动调用) ---
Deno.serve(handler);

console.log("Deno application handler registered with Deno.serve. Waiting for requests...");
// 这个 console.log 在 Deno Deploy 的运行时日志中可能不会显示，或仅在构建时显示。

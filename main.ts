// 在你的 main.ts 文件的顶部或相关部分
const allowedOriginFromEnv = Deno.env.get("ALLOWED_ORIGIN"); // 尝试从环境变量读取
const defaultAllowedOrigin = "https://yangweili-deep-research.hf.space"; // 你的前端源作为默认值
const allowedOrigin = allowedOriginFromEnv || defaultAllowedOrigin;

const allowedMethods = "GET, POST, OPTIONS, PUT, DELETE";
const allowedHeaders = "Content-Type, Authorization";

async function handler(req: Request): Promise<Response> {
  const requestOrigin = req.headers.get("Origin");
  const headers = new Headers();

  // 关键的 CORS 头部设置
  if (requestOrigin && requestOrigin === allowedOrigin) { // 或者更复杂的逻辑来允许多个源
    headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }
  // 如果你希望允许来自环境变量中指定的所有源（如果环境变量中是逗号分隔的列表）
  // 或者你希望你的 Deno Deploy 预览 URL 也被允许，你可能需要更复杂的逻辑
  // 例如： if (allowedOrigin.includes(requestOrigin)) { ... }

  headers.set("Access-Control-Allow-Methods", allowedMethods);
  headers.set("Access-Control-Allow-Headers", allowedHeaders);
  headers.set("Access-Control-Allow-Credentials", "true"); // 如果需要

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }

  // ... 你的其他应用逻辑 ...
  // 确保你的实际响应也包含这些 headers
  // 例如: return new Response(body, { status: 200, headers });
  // ...
}

Deno.serve(handler); // 假设你的服务端口由 Deno Deploy 自动处理

addEventListener('fetch', event => {
  event.respondWith(handleRequest(event.request))
})

async function handleRequest(request) {
  let url = new URL(request.url)
  
  // 检查请求路径是否为 /v1beta/models
  if (url.pathname.startsWith('/v1beta/models') || url.pathname.startsWith('/v1/models')) {
    url.hostname =  'aiplatform.googleapis.com'
    url.pathname = url.pathname.replace('/v1beta/models', '/v1/publishers/google/models').replace('/v1/models', '/v1/publishers/google/models')
    url.protocol = 'https:'
    
    // 创建新的请求
    let newRequest = new Request(url, request)
    
    // 转发请求并返回响应
    return fetch(newRequest)
  }
  
  // 其他请求返回 404 响应
  return new Response('Not Found', { status: 404 })
}

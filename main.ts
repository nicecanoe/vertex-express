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

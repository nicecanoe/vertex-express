// main.ts
export default {
  async fetch(request: Request): Promise<Response> {
    let url = new URL(request.url);

    if (url.pathname.startsWith('/v1beta/models') || url.pathname.startsWith('/v1/models')) {
      url.hostname = 'aiplatform.googleapis.com';
      url.protocol = 'https:';

      const pathSegments = url.pathname.split('/');
      let newPathname = '';

      if (pathSegments.length > 3) {
        const modelAndAction = pathSegments.slice(3).join('/');
        if (url.pathname.startsWith('/v1beta/models')) {
          newPathname = `/v1beta/publishers/google/models/${modelAndAction}`;
        } else {
          newPathname = `/v1/publishers/google/models/${modelAndAction}`;
        }
      } else {
        if (url.pathname.startsWith('/v1beta/models')) {
          newPathname = url.pathname.replace('/v1beta/models', '/v1beta/publishers/google/models');
        } else {
          newPathname = url.pathname.replace('/v1/models', '/v1/publishers/google/models');
        }
      }
      url.pathname = newPathname;

      const newRequest = new Request(url.toString(), request);

      try {
        return await fetch(newRequest);
      } catch (e) {
        console.error("Failed to fetch the upstream request:", e);
        return new Response(JSON.stringify({ message: "Proxy error: Failed to fetch upstream service.", error: e.message }), {
          status: 502,
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    return new Response(JSON.stringify({ message: "Not Found: Path does not match expected API structure." }), {
      status: 404,
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
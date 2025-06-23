// main.ts (Full functionality - FORCE v1 with Project ID)

// In-memory cache for API Key -> Project ID mapping
const apiKeyToProjectIdCache = new Map<string, string>();

async function getProjectIdFromApiKey(apiKey: string): Promise<string | null> {
  if (!apiKey) {
    console.log("getProjectIdFromApiKey: No API key provided.");
    return null;
  }
  // Using a common model and v1beta1 for the test URL.
  // The goal is to trigger an error message that reveals the project ID if the key is valid but needs project scope.
  const testModel = "gemini-1.0-pro:generateContent"; // A commonly available model
  const testUrl = `https://aiplatform.googleapis.com/v1beta1/publishers/google/models/${testModel}?key=${apiKey}`; // Test URL can remain v1beta1 for error parsing

  console.log(`getProjectIdFromApiKey: Testing URL for key ending with ...${apiKey.slice(-4)}`);
  try {
    const response = await fetch(testUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // A minimal valid body for generateContent to ensure the request reaches auth checks
      body: JSON.stringify({ contents: [{ parts: [{ text: "test" }] }] }),
    });

    const responseText = await response.text(); // Read as text first for better error diagnosis
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error(`getProjectIdFromApiKey: Failed to parse JSON response (status ${response.status}) for key ending ...${apiKey.slice(-4)}: ${responseText}`);
      return null; // Cannot proceed if response is not valid JSON
    }

    console.log(`getProjectIdFromApiKey: Response status: ${response.status} for key ending ...${apiKey.slice(-4)}, data:`, data);

    // Primary logic: Extract project ID from error message
    if (data && data.error && data.error.message) {
      const errorMessage = data.error.message;
      // Regex to find "projects/YOUR_PROJECT_ID" where project ID can be alphanumeric with hyphens/underscores
      const projectIdMatch = errorMessage.match(/projects\/([a-zA-Z0-9_-]+)/);
      if (projectIdMatch && projectIdMatch[1]) {
        console.log(`getProjectIdFromApiKey: Extracted Project ID: ${projectIdMatch[1]} from message: "${errorMessage}"`);
        return projectIdMatch[1];
      } else {
         console.log(`getProjectIdFromApiKey: Project ID pattern not found in error message: "${errorMessage}"`);
      }
    }

    // Fallback for the specific 404 case from index.html
    // This might be redundant if the general error message parsing is effective.
    if (response.status === 404) {
        let errorData: any = null; // Use 'any' here to bypass strict checks in this dynamic parsing block
        // Check various possible structures for error data in 404
        if (data && typeof data === 'object' && data.error && typeof data.error === 'object') { // {error: {message: "..."}}
            errorData = data.error;
        } else if (Array.isArray(data) && data.length > 0 && data[0] && typeof data[0] === 'object' && data[0].error && typeof data[0].error === 'object') { // [{error: {message: "..."}}]
            errorData = data[0].error;
        }

        // Check if errorData is an object and has a message property before accessing it
        if (errorData && typeof errorData.message === 'string') {
            const projectIdMatch = errorData.message.match(/projects\/([a-zA-Z0-9_-]+)\//); // Note the trailing slash
            if (projectIdMatch && projectIdMatch[1]) {
                console.log(`getProjectIdFromApiKey: Extracted Project ID (from 404 logic): ${projectIdMatch[1]}`);
                return projectIdMatch[1];
            }
        }
    }

    // Specific check for "API key not valid"
    if (response.status === 400 && data && data.error && data.error.message && data.error.message.toLowerCase().includes("api key not valid")) {
        console.log(`getProjectIdFromApiKey: API key ending ...${apiKey.slice(-4)} reported as not valid by Google.`);
    } else {
      // Generic log if no project ID found and not a clear "API key not valid" case
      console.log(`getProjectIdFromApiKey: Could not determine Project ID for key ending ...${apiKey.slice(-4)}. Status: ${response.status}, Message: ${data?.error?.message || 'No specific error message.'}`);
    }
    return null;
  } catch (error) {
    console.error(`getProjectIdFromApiKey: Network or other error during API key validation for key ending ...${apiKey.slice(-4)}:`, error);
    return null;
  }
}

export default {
  async fetch(request: Request): Promise<Response> {
    const originalUrl = new URL(request.url); // Parse once
    const urlForLogging = new URL(originalUrl.toString()); // Clone for logging
    urlForLogging.searchParams.delete('key'); // Remove sensitive key param before logging

    console.log(`\n--- New Request Received (Full Logic - Force v1 with ProjectID) ---`);
    console.log(`Request URL (key param redacted): ${urlForLogging.toString()}`); // Log redacted URL

    // Log all headers (redacting sensitive ones)
    console.log("Request Headers:");
    const originalHeaders = new Headers(request.headers); // Keep original headers for reference
    for (const [key, value] of originalHeaders.entries()) {
      // Redact sensitive headers
      if (key.toLowerCase() === 'authorization' || key.toLowerCase() === 'x-vertex-api-key' || key.toLowerCase() === 'x-goog-api-key') {
         console.log(`  ${key}: [REDACTED]`);
      } else {
         console.log(`  ${key}: ${value}`);
      }
    }

    // Identify potential API key sources
    const apiKeyFromVertexHeader = originalHeaders.get("X-Vertex-Api-Key"); // Our custom header for Project ID lookup
    const apiKeyFromGoogHeader = originalHeaders.get("x-goog-api-key");   // Standard Google header
    const apiKeyFromQuery = originalUrl.searchParams.get("key");          // Query parameter

    console.log(`Value found for 'X-Vertex-Api-Key' header: ${apiKeyFromVertexHeader ? '[PRESENT]' : '[NOT PRESENT]'}`);
    console.log(`Value found for 'x-goog-api-key' header: ${apiKeyFromGoogHeader ? '[PRESENT]' : '[NOT PRESENT]'}`);
    console.log(`Value found for 'key' query parameter: ${apiKeyFromQuery ? '[PRESENT]' : '[NOT PRESENT]'}`);

    let url = originalUrl; // Use the original URL for processing
    let projectId: string | null = null;
    // Key to use for getting Project ID (Header preferred: X-Vertex first, then x-goog)
    let keyForProjectIdLookup: string | null = apiKeyFromVertexHeader || apiKeyFromGoogHeader;
    // Key to send to Google (Any source: X-Vertex > x-goog > query)
    let keyForGoogleAuth: string | null = apiKeyFromVertexHeader || apiKeyFromGoogHeader || apiKeyFromQuery;

    // --- Project ID Lookup Logic ---
    if (keyForProjectIdLookup) {
      const cacheKey = keyForProjectIdLookup; // Use the actual key found in header for caching
      console.log(`Attempting Project ID lookup using key from header (ending ...${cacheKey.slice(-4)}).`);
      // 1. Check cache
      if (apiKeyToProjectIdCache.has(cacheKey)) {
        projectId = apiKeyToProjectIdCache.get(cacheKey)!;
        console.log(`Project ID found in cache: ${projectId}`);
      } else {
        // 2. Fetch if not in cache
        console.log(`Project ID not in cache, attempting to fetch.`);
        projectId = await getProjectIdFromApiKey(cacheKey);
        if (projectId) {
          // 3. Store in cache upon success
          apiKeyToProjectIdCache.set(cacheKey, projectId);
          console.log(`Project ID fetched and cached: ${projectId}`);
        } else {
          // Handle fetch failure (invalid key, network error, etc.)
          console.error(`Failed to determine Project ID using API Key from header (ending ...${cacheKey.slice(-4)}).`);
          // Return error only if the key used for lookup was explicitly provided in a header
           return new Response(JSON.stringify({ message: "Invalid API Key provided in header or unable to determine Project ID. Ensure the key is correct and has permissions for Vertex AI." }), {
             status: 401, // Unauthorized
             headers: { "Content-Type": "application/json" }
           });
        }
      }
    } else {
      console.log("No API key found in X-Vertex-Api-Key or x-goog-api-key headers. Skipping Project ID lookup.");
    }

    // --- Proxy Logic ---
    if (url.pathname.startsWith('/v1beta/models') || url.pathname.startsWith('/v1/models')) {
      url.hostname = 'aiplatform.googleapis.com';
      url.protocol = 'https:';

      const pathSegments = url.pathname.split('/'); // e.g., ["", "v1beta", "models", "gemini-pro:generateContent"]
      const modelAndAction = pathSegments.slice(3).join('/'); // e.g., "gemini-pro:generateContent"
      const version = 'v1'; // <-- FORCE v1 FOR THE FINAL GOOGLE URL
      let newPathname = '';

      if (projectId) {
        // Use project-specific path if Project ID was determined
        newPathname = `/${version}/projects/${projectId}/locations/global/publishers/google/models/${modelAndAction}`;
        console.log(`Rewriting path with Project ID (Forcing v1): ${newPathname}`);
      } else {
        // Fallback to generic publisher path if no projectId could be determined (e.g. only ?key= was provided)
        // This case should ideally not happen if a header key was provided, as we'd error out above.
        // This mainly covers the case where only ?key= was in the original request.
        console.log("Using generic publisher path (Project ID not determined or lookup skipped, Forcing v1).");
        newPathname = `/${version}/publishers/google/models/${modelAndAction}`;
        console.log(`Rewriting path with generic publisher (Forcing v1): ${newPathname}`);
      }
      url.pathname = newPathname;

      // Ensure the effective API key for Google Auth is in the query string
      if (keyForGoogleAuth) {
        url.searchParams.set('key', keyForGoogleAuth);
      } else {
        console.warn("Warning: No API key (from any source) found for proxied request to Google.");
        // Optionally return error:
        // return new Response(JSON.stringify({ message: "API Key missing." }), { status: 400, ... });
      }

      // --- Header Handling for Outgoing Request ---
      const newRequestHeaders = new Headers();
      // Copy Content-Type if present, otherwise default
      if (originalHeaders.has('content-type')) {
          newRequestHeaders.set('Content-Type', originalHeaders.get('content-type')!);
      } else {
          newRequestHeaders.set('Content-Type', 'application/json');
      }
      // Set a generic Accept, or copy from original if more specific is needed by client
      newRequestHeaders.set('Accept', originalHeaders.get('accept') || 'application/json, */*');

      // IMPORTANT: Keep x-goog-api-key if it was present in the original request
      if (apiKeyFromGoogHeader) {
          newRequestHeaders.set('x-goog-api-key', apiKeyFromGoogHeader);
          console.log("Forwarding request with original 'x-goog-api-key' header.");
      } else {
          console.log("Forwarding request without 'x-goog-api-key' header (was not present in original).");
      }
      // We explicitly DO NOT forward: Host, User-Agent, Sec-*, traceparent, x-forwarded-*, X-Vertex-Api-Key (custom)
      // x-goog-api-client is also usually added by SDKs, let's not forward it to avoid conflicts.
      // --- End Header Handling ---


      // Clone the request with the new URL and carefully constructed headers
      const newRequest = new Request(url.toString(), {
        method: request.method,
        headers: newRequestHeaders, // Use the carefully constructed headers
        body: request.body, // Pass through the original body
        redirect: request.redirect, // Preserve redirect behavior from original request
      });

      try {
        const urlForLoggingProxy = new URL(newRequest.url);
        urlForLoggingProxy.searchParams.delete('key');
        console.log(`Proxying to: ${urlForLoggingProxy.toString()}, Method: ${newRequest.method}`);
        const headersForLogging = new Headers(newRequestHeaders);
        // Redact x-goog-api-key if present
        if (headersForLogging.has('x-goog-api-key')) {
            headersForLogging.set('x-goog-api-key', '[REDACTED]');
        }
        // Add any other sensitive headers you want to redact here
        // e.g., if (headersForLogging.has('authorization')) { headersForLogging.set('authorization', '[REDACTED]'); }
        console.log("Forwarding with headers:", Object.fromEntries(headersForLogging.entries())); // Log the redacted headers
        const upstreamResponse = await fetch(newRequest); // Store the response

        // --- BEGIN RESPONSE LOGGING ---
        console.log(`Upstream response status: ${upstreamResponse.status} ${upstreamResponse.statusText}`);
        console.log("Upstream response headers:");
        for (const [key, value] of upstreamResponse.headers.entries()) {
            // Avoid logging potentially large or sensitive headers like set-cookie
             if (key.toLowerCase() !== 'set-cookie') {
                 console.log(`  ${key}: ${value}`);
             } else {
                 console.log(`  ${key}: [REDACTED]`);
             }
        }
        // --- END RESPONSE LOGGING ---

        return upstreamResponse; // Return the original response

      } catch (e) {
        console.error("Failed to fetch the upstream request:", e);
        const errorMessage = e instanceof Error ? e.message : String(e);
        return new Response(JSON.stringify({ message: "Proxy error: Failed to fetch upstream service.", error: errorMessage }), {
          status: 502, // Bad Gateway
          headers: { "Content-Type": "application/json" }
        });
      }
    }

    // Fallback for non-matching paths
    return new Response(JSON.stringify({ message: "Not Found: Path does not match expected API structure. Use /v1beta/models/... or /v1/models/..." }), {
      status: 404,
      headers: { 'Content-Type': "application/json" }
    });
  }
};

import { randomBytes, createHash } from "node:crypto";

const ALLOWED_SCOPES = Object.freeze([
  "memory:read",
  "memory:write",
  "budget:spend",
  "capability:grant",
]);

const CODE_TTL_SECONDS = 600;
const TOKEN_TTL_SECONDS = 86400;

function base64url(buffer) {
  return buffer.toString("base64url").replace(/=+$/, "");
}

function generateOpaqueToken() {
  return base64url(randomBytes(32));
}

function sha256(input) {
  return createHash("sha256")
    .update(input)
    .digest("base64url")
    .replace(/=+$/, "");
}

function parseScopes(scope) {
  if (!scope) {
    return [];
  }
  const requested = scope.split(/\s+/).filter(Boolean);
  return requested.filter((s) => ALLOWED_SCOPES.includes(s));
}

function nowSeconds() {
  return Math.floor(Date.now() / 1000);
}

function json(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function readFormBody(body) {
  const params = new URLSearchParams(body);
  const result = Object.create(null);
  for (const [key, value] of params) {
    result[key] = value;
  }
  return result;
}

function buildAuthorizationServerMetadata(baseUrl) {
  return {
    issuer: baseUrl,
    authorization_endpoint: `${baseUrl}/oauth/authorize`,
    token_endpoint: `${baseUrl}/oauth/token`,
    introspection_endpoint: `${baseUrl}/oauth/introspect`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256", "plain"],
    scopes_supported: [...ALLOWED_SCOPES],
  };
}

function buildProtectedResourceMetadata(baseUrl) {
  return {
    resource: baseUrl,
    authorization_servers: [baseUrl],
    scopes_supported: [...ALLOWED_SCOPES],
    bearer_methods_supported: ["header"],
  };
}

export async function handleAuthorize(req, res, store, baseUrl) {
  const url = new URL(req.url, baseUrl);

  const responseType = url.searchParams.get("response_type");
  const clientId = url.searchParams.get("client_id");
  const redirectUri = url.searchParams.get("redirect_uri");
  const scope = url.searchParams.get("scope");
  const state = url.searchParams.get("state");
  const codeChallenge = url.searchParams.get("code_challenge");
  const codeChallengeMethod =
    url.searchParams.get("code_challenge_method") || "S256";

  if (responseType !== "code") {
    return json(res, 400, {
      error: "unsupported_response_type",
      error_description: "Only response_type=code is supported",
    });
  }

  if (!clientId || !redirectUri) {
    return json(res, 400, {
      error: "invalid_request",
      error_description: "client_id and redirect_uri are required",
    });
  }

  if (!codeChallenge) {
    return json(res, 400, {
      error: "invalid_request",
      error_description: "PKCE code_challenge is required",
    });
  }

  if (!["S256", "plain"].includes(codeChallengeMethod)) {
    return json(res, 400, {
      error: "invalid_request",
      error_description: "Unsupported code_challenge_method",
    });
  }

  const grantedScopes = parseScopes(scope);
  if (scope && grantedScopes.length === 0) {
    return json(res, 400, {
      error: "invalid_scope",
      error_description: "No valid scopes requested",
    });
  }

  const code = generateOpaqueToken();
  const issuedAt = nowSeconds();
  const codeData = {
    type: "authorization_code",
    clientId,
    redirectUri,
    scope: grantedScopes.join(" "),
    codeChallenge,
    codeChallengeMethod,
    state,
    issuedAt,
    expiresAt: issuedAt + CODE_TTL_SECONDS,
    used: false,
  };

  store.putOAuthCode(code, codeData);

  const redirect = new URL(redirectUri);
  redirect.searchParams.set("code", code);
  if (state) {
    redirect.searchParams.set("state", state);
  }

  res.writeHead(302, { Location: redirect.toString() });
  res.end();
  return undefined;
}

export async function handleToken(req, res, store) {
  const body = await readBody(req);
  const params = readFormBody(body);

  const grantType = params.grant_type;
  const code = params.code;
  const redirectUri = params.redirect_uri;
  const codeVerifier = params.code_verifier;
  const clientId = params.client_id;

  if (grantType !== "authorization_code") {
    return json(res, 400, {
      error: "unsupported_grant_type",
      error_description: "Only grant_type=authorization_code is supported",
    });
  }

  if (!code || !redirectUri || !codeVerifier) {
    return json(res, 400, {
      error: "invalid_request",
      error_description: "code, redirect_uri, and code_verifier are required",
    });
  }

  const codeData = store.getOAuthCode(code);

  if (!codeData) {
    return json(res, 400, {
      error: "invalid_grant",
      error_description: "Authorization code not found",
    });
  }

  store.deleteOAuthCode(code);

  if (codeData.used) {
    return json(res, 400, {
      error: "invalid_grant",
      error_description: "Authorization code has already been used",
    });
  }

  if (codeData.expiresAt < nowSeconds()) {
    return json(res, 400, {
      error: "invalid_grant",
      error_description: "Authorization code has expired",
    });
  }

  if (codeData.redirectUri !== redirectUri) {
    return json(res, 400, {
      error: "invalid_grant",
      error_description: "redirect_uri mismatch",
    });
  }

  if (clientId && codeData.clientId !== clientId) {
    return json(res, 400, {
      error: "invalid_grant",
      error_description: "client_id mismatch",
    });
  }

  let expectedChallenge;
  if (codeData.codeChallengeMethod === "S256") {
    expectedChallenge = sha256(codeVerifier);
  } else {
    expectedChallenge = codeVerifier;
  }

  if (expectedChallenge !== codeData.codeChallenge) {
    return json(res, 400, {
      error: "invalid_grant",
      error_description: "PKCE code_verifier mismatch",
    });
  }

  const accessToken = generateOpaqueToken();
  const issuedAt = nowSeconds();
  const tokenData = {
    type: "access_token",
    clientId: codeData.clientId,
    scope: codeData.scope,
    issuedAt,
    expiresAt: issuedAt + TOKEN_TTL_SECONDS,
  };

  store.putOAuthToken(accessToken, tokenData);

  return json(res, 200, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: TOKEN_TTL_SECONDS,
    scope: tokenData.scope,
  });
}

export async function handleIntrospect(req, res, store, baseUrl) {
  const url = new URL(req.url, baseUrl);
  const token = url.searchParams.get("token");

  if (!token) {
    return json(res, 400, {
      error: "invalid_request",
      error_description: "token parameter is required",
    });
  }

  const tokenData = store.getOAuthToken(token);
  const now = nowSeconds();

  if (!tokenData || tokenData.expiresAt < now) {
    return json(res, 200, { active: false });
  }

  return json(res, 200, {
    active: true,
    scope: tokenData.scope,
    client_id: tokenData.clientId,
    token_type: "Bearer",
    exp: tokenData.expiresAt,
    iat: tokenData.issuedAt,
  });
}

export function isOAuthRoute(pathname) {
  return (
    pathname === "/.well-known/oauth-authorization-server" ||
    pathname === "/.well-known/oauth-protected-resource" ||
    pathname === "/oauth/authorize" ||
    pathname === "/oauth/token" ||
    pathname === "/oauth/introspect"
  );
}

export async function handleOAuthRequest(req, res, store, baseUrl) {
  const url = new URL(req.url, baseUrl);
  const pathname = url.pathname;

  if (
    req.method === "GET" &&
    pathname === "/.well-known/oauth-authorization-server"
  ) {
    return json(res, 200, buildAuthorizationServerMetadata(baseUrl));
  }

  if (
    req.method === "GET" &&
    pathname === "/.well-known/oauth-protected-resource"
  ) {
    return json(res, 200, buildProtectedResourceMetadata(baseUrl));
  }

  if (req.method === "GET" && pathname === "/oauth/authorize") {
    return handleAuthorize(req, res, store, baseUrl);
  }

  if (req.method === "POST" && pathname === "/oauth/token") {
    return handleToken(req, res, store);
  }

  if (req.method === "GET" && pathname === "/oauth/introspect") {
    return handleIntrospect(req, res, store, baseUrl);
  }

  return json(res, 404, { error: "not found" });
}

export function createOAuthServer(store, options = {}) {
  return {
    isOAuthRoute,
    handleOAuthRequest,
  };
}

export { ALLOWED_SCOPES, CODE_TTL_SECONDS, TOKEN_TTL_SECONDS };

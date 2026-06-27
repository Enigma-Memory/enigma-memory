import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";
import { startServer } from "../src/server.mjs";
import { createStore } from "../src/store.mjs";

const TEST_KEY = "a".repeat(64);
const tmpDir = mkdtempSync(join(tmpdir(), "cortex-oauth-"));
const storePath = join(tmpDir, "oauth-store.sqlite");

function base64url(buffer) {
  return buffer.toString("base64url").replace(/=+$/, "");
}

function s256(verifier) {
  return createHash("sha256")
    .update(verifier)
    .digest("base64url")
    .replace(/=+$/, "");
}

function generateVerifier() {
  return base64url(randomBytes(32));
}

describe("OAuth 2.1 + PKCE", () => {
  let server;
  let port;
  let store;

  function freshStore() {
    return createStore({ path: storePath, key: TEST_KEY });
  }

  function url(path) {
    return `http://127.0.0.1:${port}${path}`;
  }

  before(async () => {
    store = freshStore();
    server = await startServer(0, store);
    port = server.address().port;
  });

  after(() => {
    server?.close();
    store?.close();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it("publishes authorization-server metadata", async () => {
    const res = await fetch(url("/.well-known/oauth-authorization-server"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.response_types_supported[0], "code");
    assert.ok(body.scopes_supported.includes("memory:read"));
    assert.ok(body.code_challenge_methods_supported.includes("S256"));
  });

  it("publishes protected-resource metadata", async () => {
    const res = await fetch(url("/.well-known/oauth-protected-resource"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(body.scopes_supported.includes("memory:write"));
    assert.equal(body.bearer_methods_supported[0], "header");
  });

  it("issues an authorization code with PKCE and exchanges it for a token", async () => {
    const verifier = generateVerifier();
    const challenge = s256(verifier);
    const state = base64url(randomBytes(8));

    const authRes = await fetch(
      url(
        `/oauth/authorize?response_type=code&client_id=test-client&redirect_uri=http://localhost/callback&scope=memory:read&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`
      ),
      { redirect: "manual" }
    );
    assert.equal(authRes.status, 302);
    const location = authRes.headers.get("location");
    assert.ok(location.startsWith("http://localhost/callback"));
    const callbackUrl = new URL(location);
    const code = callbackUrl.searchParams.get("code");
    assert.ok(code);
    assert.equal(callbackUrl.searchParams.get("state"), state);

    const storedCode = store.getOAuthCode(code);
    assert.equal(storedCode.clientId, "test-client");
    assert.equal(storedCode.scope, "memory:read");
    assert.equal(storedCode.codeChallengeMethod, "S256");

    const tokenRes = await fetch(url("/oauth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://localhost/callback",
        code_verifier: verifier,
        client_id: "test-client",
      }),
    });
    assert.equal(tokenRes.status, 200);
    const tokenBody = await tokenRes.json();
    assert.equal(tokenBody.token_type, "Bearer");
    assert.ok(tokenBody.access_token);
    assert.equal(typeof tokenBody.expires_in, "number");
    assert.equal(tokenBody.scope, "memory:read");

    const storedToken = store.getOAuthToken(tokenBody.access_token);
    assert.equal(storedToken.clientId, "test-client");
    assert.equal(storedToken.scope, "memory:read");
  });

  it("filters unauthorized scopes", async () => {
    const verifier = generateVerifier();
    const challenge = s256(verifier);

    const authRes = await fetch(
      url(
        `/oauth/authorize?response_type=code&client_id=test-client&redirect_uri=http://localhost/callback&scope=memory:read invalid:scope memory:write&code_challenge=${challenge}`
      ),
      { redirect: "manual" }
    );
    assert.equal(authRes.status, 302);
    const location = authRes.headers.get("location");
    const callbackUrl = new URL(location);
    const code = callbackUrl.searchParams.get("code");

    const storedCode = store.getOAuthCode(code);
    assert.equal(storedCode.scope, "memory:read memory:write");
  });

  it("introspects a valid token", async () => {
    const verifier = generateVerifier();
    const challenge = s256(verifier);

    const authRes = await fetch(
      url(
        `/oauth/authorize?response_type=code&client_id=introspect-client&redirect_uri=http://localhost/callback&scope=budget:spend&code_challenge=${challenge}`
      ),
      { redirect: "manual" }
    );
    const callbackUrl = new URL(authRes.headers.get("location"));
    const code = callbackUrl.searchParams.get("code");

    const tokenRes = await fetch(url("/oauth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://localhost/callback",
        code_verifier: verifier,
      }),
    });
    const { access_token: token } = await tokenRes.json();

    const introspectRes = await fetch(url(`/oauth/introspect?token=${token}`));
    assert.equal(introspectRes.status, 200);
    const body = await introspectRes.json();
    assert.equal(body.active, true);
    assert.equal(body.scope, "budget:spend");
    assert.equal(body.client_id, "introspect-client");
    assert.equal(body.token_type, "Bearer");
    assert.ok(body.exp > Math.floor(Date.now() / 1000));
  });

  it("reports inactive for unknown or expired tokens", async () => {
    const res = await fetch(url("/oauth/introspect?token=not-a-token"));
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.active, false);
  });

  it("rejects reused authorization codes", async () => {
    const verifier = generateVerifier();
    const challenge = s256(verifier);

    const authRes = await fetch(
      url(
        `/oauth/authorize?response_type=code&client_id=reuse-client&redirect_uri=http://localhost/callback&scope=memory:read&code_challenge=${challenge}`
      ),
      { redirect: "manual" }
    );
    const callbackUrl = new URL(authRes.headers.get("location"));
    const code = callbackUrl.searchParams.get("code");

    const first = await fetch(url("/oauth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://localhost/callback",
        code_verifier: verifier,
      }),
    });
    assert.equal(first.status, 200);

    const second = await fetch(url("/oauth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://localhost/callback",
        code_verifier: verifier,
      }),
    });
    assert.equal(second.status, 400);
    const body = await second.json();
    assert.equal(body.error, "invalid_grant");
  });

  it("rejects PKCE verifier mismatch", async () => {
    const verifier = generateVerifier();
    const challenge = s256(verifier);

    const authRes = await fetch(
      url(
        `/oauth/authorize?response_type=code&client_id=pkce-client&redirect_uri=http://localhost/callback&scope=memory:read&code_challenge=${challenge}`
      ),
      { redirect: "manual" }
    );
    const callbackUrl = new URL(authRes.headers.get("location"));
    const code = callbackUrl.searchParams.get("code");

    const tokenRes = await fetch(url("/oauth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://localhost/callback",
        code_verifier: generateVerifier(),
      }),
    });
    assert.equal(tokenRes.status, 400);
    const body = await tokenRes.json();
    assert.equal(body.error, "invalid_grant");
  });

  it("rejects missing PKCE challenge", async () => {
    const res = await fetch(
      url(
        "/oauth/authorize?response_type=code&client_id=no-pkce&redirect_uri=http://localhost/callback&scope=memory:read"
      )
    );
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.error, "invalid_request");
  });

  it("supports plain PKCE method", async () => {
    const verifier = generateVerifier();

    const authRes = await fetch(
      url(
        `/oauth/authorize?response_type=code&client_id=plain-client&redirect_uri=http://localhost/callback&scope=capability:grant&code_challenge=${verifier}&code_challenge_method=plain`
      ),
      { redirect: "manual" }
    );
    assert.equal(authRes.status, 302);
    const callbackUrl = new URL(authRes.headers.get("location"));
    const code = callbackUrl.searchParams.get("code");

    const tokenRes = await fetch(url("/oauth/token"), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: "http://localhost/callback",
        code_verifier: verifier,
        client_id: "plain-client",
      }),
    });
    assert.equal(tokenRes.status, 200);
    const body = await tokenRes.json();
    assert.equal(body.scope, "capability:grant");
  });
});

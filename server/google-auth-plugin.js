import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomBytes } from "node:crypto";

const OAUTH_STATE_COOKIE = "justcal_google_oauth_state";
const OAUTH_CONNECTED_COOKIE = "justcal_google_connected";
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const TOKEN_STORE_PATH = resolve(process.cwd(), ".data/google-auth-store.json");
const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const GOOGLE_DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_DRIVE_ABOUT_URL = "https://www.googleapis.com/drive/v3/about";
const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_SCOPES = GOOGLE_DRIVE_FILE_SCOPE;
const JUSTCALENDAR_DRIVE_FOLDER_NAME = "JustCalendar.ai";

const pendingStates = new Map();
let inFlightEnsureFolderPromise = null;

function parseCookies(req) {
  const headerValue = req.headers?.cookie;
  if (!headerValue || typeof headerValue !== "string") {
    return {};
  }

  return headerValue.split(";").reduce((cookieMap, segment) => {
    const separatorIndex = segment.indexOf("=");
    if (separatorIndex === -1) {
      return cookieMap;
    }
    const rawName = segment.slice(0, separatorIndex).trim();
    const rawValue = segment.slice(separatorIndex + 1).trim();
    if (!rawName) {
      return cookieMap;
    }
    cookieMap[rawName] = decodeURIComponent(rawValue || "");
    return cookieMap;
  }, {});
}

function buildCookie(
  name,
  value,
  { maxAgeSeconds, httpOnly = true, secure = false, domain = "" } = {},
) {
  const cookieParts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "SameSite=Lax"];
  if (typeof maxAgeSeconds === "number") {
    cookieParts.push(`Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`);
  }
  if (typeof domain === "string" && domain.trim()) {
    cookieParts.push(`Domain=${domain.trim()}`);
  }
  if (httpOnly) {
    cookieParts.push("HttpOnly");
  }
  if (secure) {
    cookieParts.push("Secure");
  }
  return cookieParts.join("; ");
}

function getRequestOrigin(req) {
  const forwardedProto =
    typeof req.headers["x-forwarded-proto"] === "string"
      ? req.headers["x-forwarded-proto"].split(",")[0].trim()
      : "";
  const forwardedHost =
    typeof req.headers["x-forwarded-host"] === "string"
      ? req.headers["x-forwarded-host"].split(",")[0].trim()
      : "";
  const protocol = forwardedProto || (req.socket?.encrypted ? "https" : "http");
  const host = forwardedHost || req.headers.host || "localhost";
  return `${protocol}://${host}`;
}

function getSharedCookieDomain(requestOrigin) {
  try {
    const hostname = new URL(requestOrigin).hostname.toLowerCase();
    if (hostname === "justcalendar.ai" || hostname.endsWith(".justcalendar.ai")) {
      return ".justcalendar.ai";
    }
  } catch {
    // Ignore parse failures and fall back to host-only cookies.
  }
  return "";
}

function escapeDriveQueryValue(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

function parseScopeSet(scopeValue) {
  if (typeof scopeValue !== "string" || !scopeValue.trim()) {
    return new Set();
  }
  return new Set(scopeValue.trim().split(/\s+/).filter(Boolean));
}

function hasGoogleScope(scopeValue, expectedScope) {
  if (!expectedScope) return false;
  const scopeSet = parseScopeSet(scopeValue);
  return scopeSet.has(expectedScope);
}

function mergeGoogleScopes(primaryScopeValue, fallbackScopeValue) {
  const primaryScopeSet = parseScopeSet(primaryScopeValue);
  if (primaryScopeSet.size > 0) {
    return Array.from(primaryScopeSet).join(" ").trim();
  }

  const fallbackScopeSet = parseScopeSet(fallbackScopeValue);
  if (fallbackScopeSet.size > 0) {
    return Array.from(fallbackScopeSet).join(" ").trim();
  }

  return "";
}

function isInsufficientDriveScopeError(folderResult) {
  if (
    !folderResult ||
    typeof folderResult !== "object" ||
    (folderResult.error !== "folder_lookup_failed" && folderResult.error !== "folder_create_failed")
  ) {
    return false;
  }

  const details = folderResult.details;
  if (!details || typeof details !== "object") {
    return false;
  }

  const errorsList = Array.isArray(details.errors) ? details.errors : [];
  if (
    errorsList.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        (entry.reason === "insufficientPermissions" ||
          entry.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT"),
    )
  ) {
    return true;
  }

  const detailsList = Array.isArray(details.details) ? details.details : [];
  if (
    detailsList.some(
      (entry) =>
        entry &&
        typeof entry === "object" &&
        entry.reason === "ACCESS_TOKEN_SCOPE_INSUFFICIENT",
    )
  ) {
    return true;
  }

  return false;
}

function buildGoogleAuthorizationUrl({ clientId, redirectUri, state }) {
  const queryParts = [
    ["client_id", clientId],
    ["redirect_uri", redirectUri],
    ["response_type", "code"],
    ["scope", GOOGLE_SCOPES],
    ["access_type", "offline"],
    ["prompt", "consent select_account"],
    ["include_granted_scopes", "false"],
    ["state", state],
  ];

  const queryString = queryParts
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");
  return `${GOOGLE_AUTH_URL}?${queryString}`;
}

function normalizeStoredAuthState(rawState) {
  const storedState =
    rawState && typeof rawState === "object" && !Array.isArray(rawState) ? rawState : {};

  const refreshToken =
    typeof storedState.refreshToken === "string" && storedState.refreshToken.trim()
      ? storedState.refreshToken.trim()
      : "";
  const accessToken =
    typeof storedState.accessToken === "string" && storedState.accessToken.trim()
      ? storedState.accessToken.trim()
      : "";
  const tokenType =
    typeof storedState.tokenType === "string" && storedState.tokenType.trim()
      ? storedState.tokenType.trim()
      : "Bearer";
  const scope =
    typeof storedState.scope === "string" && storedState.scope.trim()
      ? storedState.scope.trim()
      : "";
  const accessTokenExpiresAt = Number.isFinite(Number(storedState.accessTokenExpiresAt))
    ? Number(storedState.accessTokenExpiresAt)
    : 0;
  const drivePermissionId =
    typeof storedState.drivePermissionId === "string" && storedState.drivePermissionId.trim()
      ? storedState.drivePermissionId.trim()
      : "";
  const driveFolderId =
    typeof storedState.driveFolderId === "string" && storedState.driveFolderId.trim()
      ? storedState.driveFolderId.trim()
      : "";

  const updatedAt =
    typeof storedState.updatedAt === "string" && storedState.updatedAt.trim()
      ? storedState.updatedAt.trim()
      : new Date(0).toISOString();

  return {
    refreshToken,
    accessToken,
    tokenType,
    scope,
    accessTokenExpiresAt,
    drivePermissionId,
    driveFolderId,
    updatedAt,
  };
}

function readStoredAuthState() {
  if (!existsSync(TOKEN_STORE_PATH)) {
    return normalizeStoredAuthState({});
  }

  try {
    const fileContents = readFileSync(TOKEN_STORE_PATH, "utf8");
    if (!fileContents.trim()) {
      return normalizeStoredAuthState({});
    }
    const parsed = JSON.parse(fileContents);
    return normalizeStoredAuthState(parsed);
  } catch {
    return normalizeStoredAuthState({});
  }
}

function writeStoredAuthState(nextState) {
  const normalizedState = normalizeStoredAuthState(nextState);
  mkdirSync(dirname(TOKEN_STORE_PATH), { recursive: true });

  // Production hardening note:
  // - move this file to encrypted-at-rest storage or a managed secrets store
  // - scope storage per-user/session instead of single shared local state
  writeFileSync(TOKEN_STORE_PATH, `${JSON.stringify(normalizedState, null, 2)}\n`, "utf8");
  try {
    chmodSync(TOKEN_STORE_PATH, 0o600);
  } catch {
    // Best-effort permission hardening.
  }

  return normalizedState;
}

function clearStoredAuthState() {
  return writeStoredAuthState({});
}

function jsonResponse(res, statusCode, payload) {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res) {
  jsonResponse(res, 405, { error: "method_not_allowed" });
}

function cleanupExpiredPendingStates() {
  const now = Date.now();
  for (const [state, expiresAt] of pendingStates.entries()) {
    if (expiresAt <= now) {
      pendingStates.delete(state);
    }
  }
}

function rememberPendingState(state) {
  cleanupExpiredPendingStates();
  pendingStates.set(state, Date.now() + OAUTH_STATE_TTL_MS);
}

function consumePendingState(state) {
  cleanupExpiredPendingStates();
  const expiresAt = pendingStates.get(state);
  if (!expiresAt) {
    return false;
  }
  pendingStates.delete(state);
  return expiresAt > Date.now();
}

function getRedirectUri({ requestOrigin, configuredRedirectUri }) {
  if (typeof configuredRedirectUri === "string" && configuredRedirectUri.trim()) {
    return configuredRedirectUri.trim();
  }
  return `${requestOrigin}/api/auth/google/callback`;
}

function ensureGoogleOAuthConfigured(config, res) {
  if (!config.clientId || !config.clientSecret) {
    jsonResponse(res, 500, {
      error: "oauth_not_configured",
      message:
        "Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET in .env.local.",
    });
    return false;
  }
  return true;
}

async function ensureJustCalendarFolder({ accessToken }) {
  if (!accessToken) {
    return {
      ok: false,
      error: "missing_access_token",
    };
  }

  const escapedFolderName = escapeDriveQueryValue(JUSTCALENDAR_DRIVE_FOLDER_NAME);
  const listUrl = new URL(GOOGLE_DRIVE_FILES_URL);
  listUrl.searchParams.set(
    "q",
    `name = '${escapedFolderName}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  );
  listUrl.searchParams.set("spaces", "drive");
  listUrl.searchParams.set("fields", "files(id,name)");
  listUrl.searchParams.set("pageSize", "1");

  const listResponse = await fetch(listUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(8_000),
  });
  const listPayload = await listResponse.json().catch(() => ({}));

  if (!listResponse.ok) {
    return {
      ok: false,
      error: "folder_lookup_failed",
      status: listResponse.status,
      details: listPayload?.error || "unknown_error",
    };
  }

  const firstExistingFolder =
    Array.isArray(listPayload?.files) && listPayload.files.length > 0 ? listPayload.files[0] : null;
  const existingFolderId =
    firstExistingFolder && typeof firstExistingFolder.id === "string" ? firstExistingFolder.id : "";
  if (existingFolderId) {
    return {
      ok: true,
      created: false,
      folderId: existingFolderId,
    };
  }

  const createResponse = await fetch(GOOGLE_DRIVE_FILES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      name: JUSTCALENDAR_DRIVE_FOLDER_NAME,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });
  const createPayload = await createResponse.json().catch(() => ({}));

  if (!createResponse.ok) {
    return {
      ok: false,
      error: "folder_create_failed",
      status: createResponse.status,
      details: createPayload?.error || "unknown_error",
    };
  }

  const createdFolderId =
    createPayload && typeof createPayload.id === "string" ? createPayload.id : "";
  if (!createdFolderId) {
    return {
      ok: false,
      error: "folder_create_missing_id",
    };
  }

  return {
    ok: true,
    created: true,
    folderId: createdFolderId,
  };
}

async function fetchDrivePermissionId({ accessToken }) {
  if (!accessToken) {
    return {
      ok: false,
      error: "missing_access_token",
    };
  }

  const aboutUrl = new URL(GOOGLE_DRIVE_ABOUT_URL);
  aboutUrl.searchParams.set("fields", "user(permissionId)");

  const response = await fetch(aboutUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    return {
      ok: false,
      error: "drive_identity_lookup_failed",
      status: response.status,
      details: payload?.error || "unknown_error",
    };
  }

  const permissionId =
    payload && payload.user && typeof payload.user.permissionId === "string"
      ? payload.user.permissionId
      : "";
  if (!permissionId) {
    return {
      ok: false,
      error: "drive_identity_missing_permission_id",
    };
  }

  return {
    ok: true,
    permissionId,
  };
}

async function refreshAccessToken({ config, storedState }) {
  if (!storedState.refreshToken) {
    return {
      ok: false,
      status: 401,
      payload: {
        error: "not_connected",
        message: "Google Drive is not connected.",
      },
    };
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: storedState.refreshToken,
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));

  if (!tokenResponse.ok) {
    if (tokenPayload?.error === "invalid_grant") {
      clearStoredAuthState();
      return {
        ok: false,
        status: 401,
        payload: {
          error: "invalid_grant",
          message: "Stored Google refresh token is invalid. Connect again.",
        },
      };
    }

    return {
      ok: false,
      status: 502,
      payload: {
        error: "token_refresh_failed",
        message: "Failed to refresh Google access token.",
        details: tokenPayload?.error || "unknown_error",
      },
    };
  }

  const nextAccessToken =
    typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : "";
  const expiresInSeconds = Number(tokenPayload.expires_in);
  const nextExpiry =
    Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? Date.now() + expiresInSeconds * 1000
      : Date.now() + 55 * 60 * 1000;

  if (!nextAccessToken) {
    return {
      ok: false,
      status: 502,
      payload: {
        error: "token_refresh_failed",
        message: "Google token refresh response did not include access_token.",
      },
    };
  }

    const nextState = writeStoredAuthState({
      ...storedState,
      accessToken: nextAccessToken,
    tokenType:
      typeof tokenPayload.token_type === "string" && tokenPayload.token_type
        ? tokenPayload.token_type
        : storedState.tokenType || "Bearer",
    scope: mergeGoogleScopes(tokenPayload.scope, storedState.scope || ""),
    accessTokenExpiresAt: nextExpiry,
    refreshToken:
      typeof tokenPayload.refresh_token === "string" && tokenPayload.refresh_token
        ? tokenPayload.refresh_token
        : storedState.refreshToken,
    drivePermissionId: storedState.drivePermissionId || "",
    updatedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    state: nextState,
  };
}

async function refreshAccessTokenForNonCriticalTask({ config, storedState }) {
  if (!storedState.refreshToken) {
    return {
      ok: false,
      status: 401,
      payload: {
        error: "not_connected",
        message: "Google Drive is not connected.",
      },
    };
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: "refresh_token",
      refresh_token: storedState.refreshToken,
    }),
  });

  const tokenPayload = await tokenResponse.json().catch(() => ({}));

  if (!tokenResponse.ok) {
    return {
      ok: false,
      status: tokenPayload?.error === "invalid_grant" ? 401 : 502,
      payload: {
        error:
          tokenPayload?.error === "invalid_grant" ? "invalid_grant" : "token_refresh_failed",
        message:
          tokenPayload?.error === "invalid_grant"
            ? "Stored Google refresh token is invalid. Connect again."
            : "Failed to refresh Google access token.",
        details: tokenPayload?.error || "unknown_error",
      },
    };
  }

  const nextAccessToken =
    typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : "";
  const expiresInSeconds = Number(tokenPayload.expires_in);
  const nextExpiry =
    Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
      ? Date.now() + expiresInSeconds * 1000
      : Date.now() + 55 * 60 * 1000;

  if (!nextAccessToken) {
    return {
      ok: false,
      status: 502,
      payload: {
        error: "token_refresh_failed",
        message: "Google token refresh response did not include access_token.",
      },
    };
  }

  const nextState = writeStoredAuthState({
    ...storedState,
    accessToken: nextAccessToken,
    tokenType:
      typeof tokenPayload.token_type === "string" && tokenPayload.token_type
        ? tokenPayload.token_type
        : storedState.tokenType || "Bearer",
    scope: mergeGoogleScopes(tokenPayload.scope, storedState.scope || ""),
    accessTokenExpiresAt: nextExpiry,
    refreshToken:
      typeof tokenPayload.refresh_token === "string" && tokenPayload.refresh_token
        ? tokenPayload.refresh_token
        : storedState.refreshToken,
    drivePermissionId: storedState.drivePermissionId || "",
    updatedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    state: nextState,
  };
}

async function ensureValidAccessToken({ config }) {
  const storedState = readStoredAuthState();
  const tokenIsStillValid =
    storedState.accessToken && storedState.accessTokenExpiresAt > Date.now() + 60_000;
  if (tokenIsStillValid) {
    return {
      ok: true,
      state: storedState,
    };
  }

  if (!storedState.refreshToken) {
    return {
      ok: false,
      status: 401,
      payload: {
        error: "not_connected",
        message: "Google Drive session expired and no refresh token is available. Connect again.",
      },
    };
  }

  return refreshAccessToken({ config, storedState });
}

function hasSufficientlyValidAccessToken(storedState, minimumLifetimeMs = 30_000) {
  return (
    Boolean(storedState?.accessToken) &&
    Number(storedState?.accessTokenExpiresAt) > Date.now() + minimumLifetimeMs
  );
}

async function ensureJustCalendarFolderForCurrentConnection({ accessToken = "", config } = {}) {
  let storedState = readStoredAuthState();
  if (!hasGoogleScope(storedState.scope, GOOGLE_DRIVE_FILE_SCOPE)) {
    return {
      ok: false,
      error: "missing_drive_scope",
      status: 403,
      details: {
        message:
          "Current Google token does not include drive.file scope. Reconnect and approve Google Drive access.",
      },
    };
  }

  if (storedState.driveFolderId) {
    return {
      ok: true,
      created: false,
      folderId: storedState.driveFolderId,
    };
  }

  if (inFlightEnsureFolderPromise) {
    return inFlightEnsureFolderPromise;
  }

  inFlightEnsureFolderPromise = (async () => {
    let freshState = readStoredAuthState();
    if (freshState.driveFolderId) {
      return {
        ok: true,
        created: false,
        folderId: freshState.driveFolderId,
      };
    }

    let tokenToUse =
      typeof accessToken === "string" && accessToken.trim()
        ? accessToken.trim()
        : hasSufficientlyValidAccessToken(freshState)
          ? freshState.accessToken
          : "";
    if (!tokenToUse && config?.clientId && config?.clientSecret && freshState.refreshToken) {
      const refreshResult = await refreshAccessTokenForNonCriticalTask({
        config,
        storedState: freshState,
      });
      if (refreshResult.ok) {
        freshState = refreshResult.state;
        tokenToUse = freshState.accessToken;
      } else {
        return {
          ok: false,
          error: "token_unavailable",
          status: refreshResult.status || 401,
          details: refreshResult.payload || {
            message:
              "No valid access token available for non-critical folder ensure. Login state is unchanged.",
          },
        };
      }
    }
    if (!tokenToUse) {
      return {
        ok: false,
        error: "token_unavailable",
        status: 401,
        details: {
          message:
            "No valid access token available for non-critical folder ensure. Login state is unchanged.",
        },
      };
    }

    const folderResult = await ensureJustCalendarFolder({
      accessToken: tokenToUse,
    });
    if (!folderResult.ok) {
      if (isInsufficientDriveScopeError(folderResult)) {
        const remainingScopes = Array.from(parseScopeSet(freshState.scope)).filter(
          (scopeValue) => scopeValue !== GOOGLE_DRIVE_FILE_SCOPE,
        );
        writeStoredAuthState({
          ...freshState,
          scope: remainingScopes.join(" ").trim(),
          driveFolderId: "",
          updatedAt: new Date().toISOString(),
        });
      }
      return folderResult;
    }

    const ensuredFolderId =
      folderResult && typeof folderResult.folderId === "string" ? folderResult.folderId : "";
    if (ensuredFolderId && ensuredFolderId !== freshState.driveFolderId) {
      writeStoredAuthState({
        ...freshState,
        driveFolderId: ensuredFolderId,
        updatedAt: new Date().toISOString(),
      });
    }

    return folderResult;
  })();

  try {
    return await inFlightEnsureFolderPromise;
  } finally {
    inFlightEnsureFolderPromise = null;
  }
}

function createGoogleAuthPlugin(config) {
  const googleConfig = {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
    apiKey: config.apiKey,
    appId: config.appId,
    projectNumber: config.projectNumber,
    redirectUri: config.redirectUri,
    postAuthRedirect: config.postAuthRedirect,
  };

  const handleStart = (req, res) => {
    if (!ensureGoogleOAuthConfigured(googleConfig, res)) {
      return;
    }

    const requestOrigin = getRequestOrigin(req);
    const redirectUri = getRedirectUri({
      requestOrigin,
      configuredRedirectUri: googleConfig.redirectUri,
    });

    const state = randomBytes(24).toString("hex");
    rememberPendingState(state);

    const authorizationUrl = buildGoogleAuthorizationUrl({
      clientId: googleConfig.clientId,
      redirectUri,
      state,
    });

    const secureCookie = requestOrigin.startsWith("https://");
    const cookieDomain =
      getSharedCookieDomain(redirectUri) || getSharedCookieDomain(requestOrigin);
    res.statusCode = 302;
    res.setHeader(
      "Set-Cookie",
      buildCookie(OAUTH_STATE_COOKIE, state, {
        maxAgeSeconds: Math.floor(OAUTH_STATE_TTL_MS / 1000),
        secure: secureCookie,
        domain: cookieDomain,
      }),
    );
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", authorizationUrl);
    res.end();
  };

  const handleCallback = async (req, res, url) => {
    if (!ensureGoogleOAuthConfigured(googleConfig, res)) {
      return;
    }

    const requestOrigin = getRequestOrigin(req);
    const redirectUri = getRedirectUri({
      requestOrigin,
      configuredRedirectUri: googleConfig.redirectUri,
    });

    const googleError = url.searchParams.get("error");
    if (googleError) {
      jsonResponse(res, 400, {
        error: "oauth_denied",
        message: `Google OAuth error: ${googleError}`,
      });
      return;
    }

    const state = url.searchParams.get("state") || "";
    const authorizationCode = url.searchParams.get("code") || "";
    const cookieState = parseCookies(req)[OAUTH_STATE_COOKIE] || "";

    const secureCookie = requestOrigin.startsWith("https://");
    const cookieDomain =
      getSharedCookieDomain(redirectUri) || getSharedCookieDomain(requestOrigin);
    const clearStateCookie = buildCookie(OAUTH_STATE_COOKIE, "", {
      maxAgeSeconds: 0,
      secure: secureCookie,
      domain: cookieDomain,
    });
    if (!state || !authorizationCode || !cookieState || cookieState !== state) {
      res.setHeader("Set-Cookie", clearStateCookie);
      jsonResponse(res, 400, {
        error: "invalid_state",
        message: "OAuth state validation failed.",
      });
      return;
    }

    if (!consumePendingState(state)) {
      res.setHeader("Set-Cookie", clearStateCookie);
      jsonResponse(res, 400, {
        error: "expired_state",
        message: "OAuth state expired. Start login again.",
      });
      return;
    }

    const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: googleConfig.clientId,
        client_secret: googleConfig.clientSecret,
        grant_type: "authorization_code",
        code: authorizationCode,
        redirect_uri: redirectUri,
      }),
    });

    const tokenPayload = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok) {
      res.setHeader("Set-Cookie", clearStateCookie);
      jsonResponse(res, 502, {
        error: "code_exchange_failed",
        message: "Failed exchanging Google OAuth code.",
        details: tokenPayload?.error || "unknown_error",
      });
      return;
    }

    const existingState = readStoredAuthState();
    const accessToken =
      typeof tokenPayload.access_token === "string" ? tokenPayload.access_token : "";
    const refreshToken =
      typeof tokenPayload.refresh_token === "string" && tokenPayload.refresh_token
        ? tokenPayload.refresh_token
        : existingState.refreshToken;

    if (!accessToken && !refreshToken) {
      res.setHeader("Set-Cookie", clearStateCookie);
      jsonResponse(res, 502, {
        error: "missing_tokens",
        message: "Google OAuth callback did not return usable tokens.",
      });
      return;
    }

    const expiresInSeconds = Number(tokenPayload.expires_in);
    const accessTokenExpiresAt =
      Number.isFinite(expiresInSeconds) && expiresInSeconds > 0
        ? Date.now() + expiresInSeconds * 1000
        : Date.now() + 55 * 60 * 1000;
    const grantedScope = mergeGoogleScopes(tokenPayload.scope, existingState.scope || "");
    const hasDriveScope = hasGoogleScope(grantedScope, GOOGLE_DRIVE_FILE_SCOPE);
    let drivePermissionId = existingState.drivePermissionId || "";
    if (accessToken && hasDriveScope) {
      const driveIdentityResult = await fetchDrivePermissionId({ accessToken });
      if (driveIdentityResult.ok) {
        drivePermissionId = driveIdentityResult.permissionId;
      } else {
        console.warn(
          "Google Drive identity lookup failed during login callback.",
          driveIdentityResult,
        );
      }
    }
    const connectedCookie = hasDriveScope
      ? buildCookie(OAUTH_CONNECTED_COOKIE, "1", {
          maxAgeSeconds: 60 * 60 * 24 * 30,
          httpOnly: false,
          secure: secureCookie,
          domain: cookieDomain,
        })
      : buildCookie(OAUTH_CONNECTED_COOKIE, "", {
          maxAgeSeconds: 0,
          httpOnly: false,
          secure: secureCookie,
          domain: cookieDomain,
        });

    writeStoredAuthState({
      refreshToken,
      accessToken,
      tokenType:
        typeof tokenPayload.token_type === "string" && tokenPayload.token_type
          ? tokenPayload.token_type
          : "Bearer",
      scope: grantedScope,
      accessTokenExpiresAt,
      drivePermissionId,
      driveFolderId: hasDriveScope ? existingState.driveFolderId || "" : "",
      updatedAt: new Date().toISOString(),
    });

    // Keep login-state update independent from Drive folder checks.
    void ensureJustCalendarFolderForCurrentConnection({ accessToken, config: googleConfig })
      .then((folderResult) => {
        if (!folderResult.ok) {
          console.warn("Google Drive folder ensure failed during login callback.", folderResult);
        }
      })
      .catch((error) => {
        console.warn("Google Drive folder ensure failed during login callback.", error);
      });

    const redirectTarget =
      typeof googleConfig.postAuthRedirect === "string" && googleConfig.postAuthRedirect.trim()
        ? googleConfig.postAuthRedirect.trim()
        : "/";

    res.statusCode = 302;
    res.setHeader("Set-Cookie", [clearStateCookie, connectedCookie]);
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Location", redirectTarget);
    res.end();
  };

  const handleStatus = (res) => {
    const storedState = readStoredAuthState();
    const hasValidAccessToken =
      Boolean(storedState.accessToken) && storedState.accessTokenExpiresAt > Date.now() + 30_000;
    const hasIdentitySession = Boolean(storedState.refreshToken || hasValidAccessToken);
    const hasDriveScope = hasGoogleScope(storedState.scope, GOOGLE_DRIVE_FILE_SCOPE);
    const isConnected = hasIdentitySession && hasDriveScope;

    if (isConnected && hasDriveScope && hasValidAccessToken && !storedState.driveFolderId) {
      void ensureJustCalendarFolderForCurrentConnection({ config: googleConfig }).catch(() => {
        // Folder creation is best-effort and should not block status checks.
      });
    }

    jsonResponse(res, 200, {
      connected: isConnected,
      identityConnected: hasIdentitySession,
      profile: null,
      drivePermissionId: hasIdentitySession ? storedState.drivePermissionId : "",
      scopes: hasIdentitySession ? storedState.scope : "",
      driveScopeGranted: hasIdentitySession ? hasDriveScope : false,
      driveFolderReady: hasIdentitySession ? Boolean(storedState.driveFolderId) : false,
      configured: Boolean(googleConfig.clientId && googleConfig.clientSecret),
    });
  };

  const handleAccessToken = async (res) => {
    if (!ensureGoogleOAuthConfigured(googleConfig, res)) {
      return;
    }

    const tokenStateResult = await ensureValidAccessToken({ config: googleConfig });
    if (!tokenStateResult.ok) {
      jsonResponse(res, tokenStateResult.status, tokenStateResult.payload);
      return;
    }

    const stateWithToken = tokenStateResult.state;
    const tokenType = stateWithToken.tokenType || "Bearer";

    jsonResponse(res, 200, {
      accessToken: stateWithToken.accessToken,
      tokenType,
      expiresAt: stateWithToken.accessTokenExpiresAt,
    });
  };

  const handleDisconnect = async (req, res) => {
    const storedState = readStoredAuthState();
    const requestOrigin = getRequestOrigin(req);
    const secureCookie = requestOrigin.startsWith("https://");
    const cookieDomain = getSharedCookieDomain(requestOrigin);
    const clearConnectedCookie = buildCookie(OAUTH_CONNECTED_COOKIE, "", {
      maxAgeSeconds: 0,
      httpOnly: false,
      secure: secureCookie,
      domain: cookieDomain,
    });

    const tokenToRevoke = storedState.refreshToken || storedState.accessToken;
    if (tokenToRevoke) {
      try {
        await fetch(GOOGLE_REVOKE_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: new URLSearchParams({ token: tokenToRevoke }),
        });
      } catch {
        // Revoke failures should not block local disconnect cleanup.
      }
    }

    clearStoredAuthState();
    res.setHeader("Set-Cookie", clearConnectedCookie);
    jsonResponse(res, 200, { connected: false });
  };

  const handleEnsureFolder = async (res) => {
    if (!ensureGoogleOAuthConfigured(googleConfig, res)) {
      return;
    }

    const folderResult = await ensureJustCalendarFolderForCurrentConnection({
      config: googleConfig,
    });
    if (!folderResult.ok) {
      jsonResponse(res, Number(folderResult.status) || 502, {
        ok: false,
        error: folderResult.error || "ensure_folder_failed",
        details: folderResult.details || null,
      });
      return;
    }

    jsonResponse(res, 200, {
      ok: true,
      created: Boolean(folderResult.created),
      folderId:
        folderResult && typeof folderResult.folderId === "string" ? folderResult.folderId : "",
    });
  };

  const attachAuthRoutes = (middlewares) => {
    middlewares.use(async (req, res, next) => {
      try {
        const requestOrigin = getRequestOrigin(req);
        const requestUrl = new URL(req.url || "/", requestOrigin);

        if (requestUrl.pathname === "/api/auth/google/start") {
          if (req.method !== "GET") {
            methodNotAllowed(res);
            return;
          }
          handleStart(req, res);
          return;
        }

        if (requestUrl.pathname === "/api/auth/google/callback") {
          if (req.method !== "GET") {
            methodNotAllowed(res);
            return;
          }
          await handleCallback(req, res, requestUrl);
          return;
        }

        if (requestUrl.pathname === "/api/auth/google/status") {
          if (req.method !== "GET") {
            methodNotAllowed(res);
            return;
          }
          handleStatus(res);
          return;
        }

        if (requestUrl.pathname === "/api/auth/google/access-token") {
          if (req.method !== "POST") {
            methodNotAllowed(res);
            return;
          }
          await handleAccessToken(res);
          return;
        }

        if (requestUrl.pathname === "/api/auth/google/disconnect") {
          if (req.method !== "POST") {
            methodNotAllowed(res);
            return;
          }
          await handleDisconnect(req, res);
          return;
        }

        if (requestUrl.pathname === "/api/auth/google/ensure-folder") {
          if (req.method !== "POST") {
            methodNotAllowed(res);
            return;
          }
          await handleEnsureFolder(res);
          return;
        }

        next();
      } catch (error) {
        jsonResponse(res, 500, {
          error: "google_auth_internal_error",
          message: "Unexpected server error while handling Google OAuth request.",
          details: error instanceof Error ? error.message : "unknown_error",
        });
      }
    });
  };

  return {
    name: "google-auth-middleware",
    configureServer(server) {
      attachAuthRoutes(server.middlewares);
    },
    configurePreviewServer(server) {
      attachAuthRoutes(server.middlewares);
    },
  };
}

export { GOOGLE_SCOPES, createGoogleAuthPlugin, getRedirectUri };

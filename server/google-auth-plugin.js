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
const GOOGLE_DRIVE_UPLOAD_FILES_URL = "https://www.googleapis.com/upload/drive/v3/files";
const GOOGLE_DRIVE_ABOUT_URL = "https://www.googleapis.com/drive/v3/about";
const GOOGLE_DRIVE_FILE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GOOGLE_SCOPES = GOOGLE_DRIVE_FILE_SCOPE;
const JUSTCALENDAR_DRIVE_FOLDER_NAME = "JustCalendar.ai";
const JUSTCALENDAR_CONFIG_FILE_NAME = "justcalendar.json";
const DEFAULT_BOOTSTRAP_ACCOUNT_NAME = "default";
const DEFAULT_BOOTSTRAP_CALENDAR_TYPE = "signal-3";
const DEFAULT_BOOTSTRAP_CALENDAR_COLOR = "blue";
const DEFAULT_BOOTSTRAP_SCORE_DISPLAY = "number";
const DEFAULT_BOOTSTRAP_CALENDARS = Object.freeze([
  {
    name: "Sleep Score",
    type: "score",
  },
  {
    name: "Took Pills",
    type: "check",
  },
  {
    name: "Energy Tracker",
    type: DEFAULT_BOOTSTRAP_CALENDAR_TYPE,
  },
  {
    name: "TODOs",
    type: "notes",
  },
  {
    name: "Workout Intensity",
    type: "score",
  },
]);
const SUPPORTED_BOOTSTRAP_CALENDAR_TYPES = new Set(["signal-3", "score", "check", "notes"]);
const SUPPORTED_BOOTSTRAP_CALENDAR_COLORS = new Set([
  "green",
  "red",
  "orange",
  "yellow",
  "cyan",
  "blue",
]);
const SUPPORTED_BOOTSTRAP_SCORE_DISPLAYS = new Set(["number", "heatmap", "number-heatmap"]);
const DEFAULT_BOOTSTRAP_THEME = "tokyo-night-storm";
const SUPPORTED_BOOTSTRAP_THEMES = new Set([
  "light",
  "dark",
  "red",
  "tokyo-night-storm",
  "solarized-dark",
  "solarized-light",
]);
const DRIVE_DATA_LOAD_CONCURRENCY = 5;

const pendingStates = new Map();
let inFlightEnsureFolderPromise = null;
let inFlightEnsureConfigPromise = null;

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

function readJsonRequestBody(req, maxBytes = 256 * 1024) {
  return new Promise((resolveBody, rejectBody) => {
    const chunks = [];
    let totalBytes = 0;

    req.on("data", (chunk) => {
      const chunkLength = Buffer.isBuffer(chunk) ? chunk.length : Buffer.byteLength(String(chunk));
      totalBytes += chunkLength;
      if (totalBytes > maxBytes) {
        rejectBody(new Error("request_body_too_large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });

    req.on("end", () => {
      if (chunks.length === 0) {
        resolveBody({});
        return;
      }

      const rawBody = Buffer.concat(chunks).toString("utf8").trim();
      if (!rawBody) {
        resolveBody({});
        return;
      }

      try {
        const parsedBody = JSON.parse(rawBody);
        if (parsedBody && typeof parsedBody === "object" && !Array.isArray(parsedBody)) {
          resolveBody(parsedBody);
          return;
        }
        rejectBody(new Error("request_body_must_be_object"));
      } catch {
        rejectBody(new Error("invalid_json_request_body"));
      }
    });

    req.on("error", (error) => {
      rejectBody(error);
    });
  });
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

function normalizeBootstrapCalendarType(rawType) {
  const normalizedType =
    typeof rawType === "string" ? rawType.trim().toLowerCase() : DEFAULT_BOOTSTRAP_CALENDAR_TYPE;
  return SUPPORTED_BOOTSTRAP_CALENDAR_TYPES.has(normalizedType)
    ? normalizedType
    : DEFAULT_BOOTSTRAP_CALENDAR_TYPE;
}

function normalizeBootstrapCalendarColor(rawColor) {
  const normalizedColor =
    typeof rawColor === "string" ? rawColor.trim().toLowerCase() : DEFAULT_BOOTSTRAP_CALENDAR_COLOR;
  return SUPPORTED_BOOTSTRAP_CALENDAR_COLORS.has(normalizedColor)
    ? normalizedColor
    : DEFAULT_BOOTSTRAP_CALENDAR_COLOR;
}

function normalizeBootstrapCalendarPinned(rawPinned) {
  if (rawPinned === true || rawPinned === false) {
    return rawPinned;
  }
  if (typeof rawPinned === "number" && Number.isFinite(rawPinned)) {
    return rawPinned === 1;
  }
  if (typeof rawPinned !== "string") {
    return false;
  }
  const normalizedPinned = rawPinned.trim().toLowerCase();
  return (
    normalizedPinned === "1" ||
    normalizedPinned === "true" ||
    normalizedPinned === "yes" ||
    normalizedPinned === "on"
  );
}

function normalizeBootstrapScoreDisplay(rawDisplay) {
  const normalizedDisplay =
    typeof rawDisplay === "string" ? rawDisplay.trim().toLowerCase() : DEFAULT_BOOTSTRAP_SCORE_DISPLAY;
  return SUPPORTED_BOOTSTRAP_SCORE_DISPLAYS.has(normalizedDisplay)
    ? normalizedDisplay
    : DEFAULT_BOOTSTRAP_SCORE_DISPLAY;
}

function normalizeBootstrapTheme(rawTheme) {
  const normalizedTheme = typeof rawTheme === "string" ? rawTheme.trim().toLowerCase() : "";
  if (normalizedTheme === "abyss") {
    return "solarized-dark";
  }
  return SUPPORTED_BOOTSTRAP_THEMES.has(normalizedTheme)
    ? normalizedTheme
    : DEFAULT_BOOTSTRAP_THEME;
}

function normalizeBootstrapCalendarName(rawName, fallbackName) {
  const nextName = String(rawName ?? "").replace(/\s+/g, " ").trim();
  return nextName || fallbackName;
}

function toCalendarNameLookupKey(rawName) {
  return normalizeBootstrapCalendarName(rawName, "").toLowerCase();
}

function isObjectRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function normalizeDriveFileId(rawValue) {
  const candidateId = typeof rawValue === "string" ? rawValue.trim() : "";
  return candidateId || "";
}

function normalizeBootstrapCheckValue(rawDayValue) {
  if (rawDayValue === true || rawDayValue === false) {
    return rawDayValue;
  }
  if (typeof rawDayValue === "number" && Number.isFinite(rawDayValue)) {
    if (rawDayValue === 1) return true;
    if (rawDayValue === 0) return false;
    return null;
  }
  if (typeof rawDayValue !== "string") {
    return null;
  }
  const normalizedCheckValue = rawDayValue.trim().toLowerCase();
  if (
    normalizedCheckValue === "1" ||
    normalizedCheckValue === "true" ||
    normalizedCheckValue === "checked" ||
    normalizedCheckValue === "yes" ||
    normalizedCheckValue === "on"
  ) {
    return true;
  }
  if (
    normalizedCheckValue === "0" ||
    normalizedCheckValue === "false" ||
    normalizedCheckValue === "unchecked" ||
    normalizedCheckValue === "no" ||
    normalizedCheckValue === "off"
  ) {
    return false;
  }
  return null;
}

function normalizeBootstrapScoreValue(rawDayValue) {
  const numericScoreValue = Number(rawDayValue);
  if (!Number.isFinite(numericScoreValue)) {
    return null;
  }
  const roundedScoreValue = Math.round(numericScoreValue);
  if (roundedScoreValue < -1 || roundedScoreValue > 10) {
    return null;
  }
  return roundedScoreValue;
}

function normalizeBootstrapSignalValue(rawDayValue) {
  if (typeof rawDayValue !== "string") {
    return null;
  }
  const normalizedSignalValue = rawDayValue.trim().toLowerCase();
  if (
    normalizedSignalValue === "red" ||
    normalizedSignalValue === "yellow" ||
    normalizedSignalValue === "green"
  ) {
    return normalizedSignalValue;
  }
  return null;
}

function normalizeBootstrapNoteValue(rawDayValue) {
  if (typeof rawDayValue !== "string") {
    return null;
  }
  const normalizedNoteValue = rawDayValue.trim();
  return normalizedNoteValue || null;
}

function normalizeBootstrapCalendarDayValue(rawDayValue, calendarType) {
  const normalizedCalendarType = normalizeBootstrapCalendarType(calendarType);
  if (normalizedCalendarType === "check") {
    const normalizedCheckValue = normalizeBootstrapCheckValue(rawDayValue);
    if (normalizedCheckValue !== true) {
      // Persist only checked days for compact check calendars.
      return null;
    }
    return true;
  }
  if (normalizedCalendarType === "score") {
    const normalizedScoreValue = normalizeBootstrapScoreValue(rawDayValue);
    if (normalizedScoreValue === null || normalizedScoreValue === -1) {
      // Skip unassigned score values for compact storage.
      return null;
    }
    return normalizedScoreValue;
  }
  if (normalizedCalendarType === "notes") {
    return normalizeBootstrapNoteValue(rawDayValue);
  }
  return normalizeBootstrapSignalValue(rawDayValue);
}

function normalizeDateParts(yearPart, monthPart, dayPart) {
  const yearToken = String(yearPart ?? "").trim();
  const monthToken = String(monthPart ?? "").trim();
  const dayToken = String(dayPart ?? "").trim();

  if (!/^\d{4}$/.test(yearToken)) {
    return null;
  }
  if (!/^\d{1,2}$/.test(monthToken)) {
    return null;
  }
  if (!/^\d{1,2}$/.test(dayToken)) {
    return null;
  }

  const monthValue = Number(monthToken);
  const dayValue = Number(dayToken);
  if (!Number.isInteger(monthValue) || monthValue < 1 || monthValue > 12) {
    return null;
  }
  if (!Number.isInteger(dayValue) || dayValue < 1 || dayValue > 31) {
    return null;
  }

  const normalizedMonth = String(monthValue).padStart(2, "0");
  const normalizedDay = String(dayValue).padStart(2, "0");
  return {
    year: yearToken,
    month: normalizedMonth,
    day: normalizedDay,
    dayKey: `${yearToken}-${normalizedMonth}-${normalizedDay}`,
  };
}

function normalizeBootstrapCalendarDayEntries(rawDayEntries, calendarType) {
  if (!isObjectRecord(rawDayEntries)) {
    return {};
  }

  const normalizedDayEntries = {};
  const addNormalizedDayEntry = (yearPart, monthPart, dayPart, rawDayValue) => {
    const normalizedDateParts = normalizeDateParts(yearPart, monthPart, dayPart);
    if (!normalizedDateParts) {
      return;
    }
    const normalizedDayValue = normalizeBootstrapCalendarDayValue(rawDayValue, calendarType);
    if (normalizedDayValue === null) {
      return;
    }
    normalizedDayEntries[normalizedDateParts.dayKey] = normalizedDayValue;
  };

  for (const [rawOuterKey, rawOuterValue] of Object.entries(rawDayEntries)) {
    const outerKey = String(rawOuterKey ?? "").trim();
    if (!outerKey) {
      continue;
    }

    const flatKeyMatch = outerKey.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (flatKeyMatch) {
      addNormalizedDayEntry(flatKeyMatch[1], flatKeyMatch[2], flatKeyMatch[3], rawOuterValue);
      continue;
    }

    if (!/^\d{4}$/.test(outerKey) || !isObjectRecord(rawOuterValue)) {
      continue;
    }

    for (const [rawMonthKey, rawMonthValue] of Object.entries(rawOuterValue)) {
      const monthKey = String(rawMonthKey ?? "").trim();
      if (!monthKey || !isObjectRecord(rawMonthValue)) {
        continue;
      }

      for (const [rawDayKey, rawDayValue] of Object.entries(rawMonthValue)) {
        const dayKey = String(rawDayKey ?? "").trim();
        if (!dayKey) {
          continue;
        }
        addNormalizedDayEntry(outerKey, monthKey, dayKey, rawDayValue);
      }
    }
  }

  return normalizedDayEntries;
}

function toNestedCalendarDayEntries(flatDayEntries) {
  if (!isObjectRecord(flatDayEntries)) {
    return {};
  }

  const nestedDayEntries = {};
  const sortedDayEntries = Object.entries(flatDayEntries).sort(([leftDayKey], [rightDayKey]) =>
    leftDayKey.localeCompare(rightDayKey),
  );
  for (const [dayKey, dayValue] of sortedDayEntries) {
    const dayKeyMatch = dayKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dayKeyMatch) {
      continue;
    }
    const [, yearKey, monthKey, dayToken] = dayKeyMatch;
    if (!nestedDayEntries[yearKey]) {
      nestedDayEntries[yearKey] = {};
    }
    if (!nestedDayEntries[yearKey][monthKey]) {
      nestedDayEntries[yearKey][monthKey] = {};
    }
    nestedDayEntries[yearKey][monthKey][dayToken] = dayValue;
  }
  return nestedDayEntries;
}

const ENTITY_ID_ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
const ENTITY_ID_CHARSET_SIZE = ENTITY_ID_ALPHABET.length;
const ENTITY_ID_RANDOM_TOKEN_LENGTH = 17;
const ACCOUNT_ID_RANDOM_TOKEN_LENGTH = 22;
const CALENDAR_ID_RANDOM_TOKEN_LENGTH = 22;
const ACCOUNT_ID_PATTERN = /^[A-Za-z0-9]{12,48}$/;
const CALENDAR_ID_PATTERN = /^[A-Za-z0-9]{12,48}$/;

function createHighEntropyToken(length = ENTITY_ID_RANDOM_TOKEN_LENGTH) {
  const tokenLength = Number.isInteger(length) && length > 0 ? length : ENTITY_ID_RANDOM_TOKEN_LENGTH;
  let token = "";
  while (token.length < tokenLength) {
    const randomChunk = randomBytes(Math.max(tokenLength, 16));
    for (const rawByte of randomChunk) {
      if (rawByte >= 248) {
        continue;
      }
      token += ENTITY_ID_ALPHABET[rawByte % ENTITY_ID_CHARSET_SIZE];
      if (token.length >= tokenLength) {
        break;
      }
    }
  }
  return token;
}

function normalizeIncomingEntityId(rawValue, prefix) {
  const candidateId = typeof rawValue === "string" ? rawValue.trim() : "";
  const expectedPrefix = `${prefix}_`;
  if (!candidateId || !candidateId.startsWith(expectedPrefix)) {
    return "";
  }

  const candidateToken = candidateId.slice(expectedPrefix.length);
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{5,63}$/.test(candidateToken)) {
    return "";
  }

  return `${prefix}_${candidateToken}`;
}

function generateEntityId(prefix, usedIds = null) {
  let nextId = "";
  do {
    nextId = `${prefix}_${createHighEntropyToken()}`;
  } while (usedIds instanceof Set && usedIds.has(nextId));
  if (usedIds instanceof Set) {
    usedIds.add(nextId);
  }
  return nextId;
}

function normalizeIncomingAccountId(rawValue, { allowLegacyDefault = true } = {}) {
  const candidateId = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!candidateId) {
    return "";
  }

  if (!allowLegacyDefault && candidateId === "acc_default") {
    return "";
  }

  // Accept both new account IDs (pure alphanumeric) and legacy acc_* IDs.
  if (ACCOUNT_ID_PATTERN.test(candidateId)) {
    return candidateId;
  }

  return normalizeIncomingEntityId(candidateId, "acc");
}

function normalizeIncomingCalendarId(rawValue) {
  const candidateId = typeof rawValue === "string" ? rawValue.trim() : "";
  if (!candidateId) {
    return "";
  }

  // Accept both new calendar IDs (pure alphanumeric) and legacy cal_* IDs.
  if (CALENDAR_ID_PATTERN.test(candidateId)) {
    return candidateId;
  }

  return normalizeIncomingEntityId(candidateId, "cal");
}

function generateAccountId(usedIds = null) {
  let nextId = "";
  do {
    nextId = createHighEntropyToken(ACCOUNT_ID_RANDOM_TOKEN_LENGTH);
  } while (usedIds instanceof Set && usedIds.has(nextId));
  if (usedIds instanceof Set) {
    usedIds.add(nextId);
  }
  return nextId;
}

function generateCalendarId(usedIds = null) {
  let nextId = "";
  do {
    nextId = createHighEntropyToken(CALENDAR_ID_RANDOM_TOKEN_LENGTH);
  } while (usedIds instanceof Set && usedIds.has(nextId));
  if (usedIds instanceof Set) {
    usedIds.add(nextId);
  }
  return nextId;
}

function normalizeBootstrapCalendars(rawCalendars) {
  const sourceCalendars = Array.isArray(rawCalendars) ? rawCalendars : [];
  const normalizedCalendars = sourceCalendars
    .map((rawCalendar, index) => {
      if (!rawCalendar || typeof rawCalendar !== "object" || Array.isArray(rawCalendar)) {
        return null;
      }

      const fallbackName = `Calendar ${index + 1}`;
      const calendarType = normalizeBootstrapCalendarType(rawCalendar.type);
      const calendarColor = normalizeBootstrapCalendarColor(rawCalendar.color);
      const calendarPinned = normalizeBootstrapCalendarPinned(rawCalendar.pinned);
      const calendarDisplay =
        calendarType === "score"
          ? normalizeBootstrapScoreDisplay(rawCalendar.display)
          : undefined;
      const calendarDataFileId = normalizeDriveFileId(
        rawCalendar["data-file-id"] || rawCalendar.dataFileId,
      );
      return {
        id: normalizeIncomingCalendarId(rawCalendar.id),
        name: normalizeBootstrapCalendarName(rawCalendar.name, fallbackName),
        type: calendarType,
        color: calendarColor,
        pinned: calendarPinned,
        ...(calendarDisplay ? { display: calendarDisplay } : {}),
        ...(calendarDataFileId ? { dataFileId: calendarDataFileId } : {}),
        data: normalizeBootstrapCalendarDayEntries(rawCalendar.data, calendarType),
      };
    })
    .filter(Boolean);

  if (normalizedCalendars.length > 0) {
    return normalizedCalendars;
  }

  return DEFAULT_BOOTSTRAP_CALENDARS.map((calendar) => ({
    ...calendar,
    color: DEFAULT_BOOTSTRAP_CALENDAR_COLOR,
    pinned: false,
    ...(calendar.type === "score" ? { display: DEFAULT_BOOTSTRAP_SCORE_DISPLAY } : {}),
    data: {},
  }));
}

function buildJustCalendarBootstrapBundle(rawPayload = {}) {
  const payloadObject =
    rawPayload && typeof rawPayload === "object" && !Array.isArray(rawPayload) ? rawPayload : {};
  const requestedCurrentAccountName =
    typeof payloadObject.currentAccount === "string" ? payloadObject.currentAccount.trim() : "";
  const selectedTheme = normalizeBootstrapTheme(
    payloadObject.selectedTheme || payloadObject["selected-theme"],
  );
  const requestedCurrentCalendarId = normalizeIncomingCalendarId(payloadObject.currentCalendarId);
  const currentAccountName = requestedCurrentAccountName || DEFAULT_BOOTSTRAP_ACCOUNT_NAME;
  const currentAccountId =
    normalizeIncomingAccountId(payloadObject.currentAccountId, { allowLegacyDefault: false }) ||
    generateAccountId();

  const normalizedCalendars = normalizeBootstrapCalendars(payloadObject.calendars);
  const usedCalendarIds = new Set();
  const accountCalendars = normalizedCalendars.map((calendar) => {
    const requestedCalendarId = normalizeIncomingCalendarId(calendar.id);
    const calendarId =
      requestedCalendarId && !usedCalendarIds.has(requestedCalendarId)
        ? requestedCalendarId
        : generateCalendarId(usedCalendarIds);
    usedCalendarIds.add(calendarId);
    const dataFile = `${currentAccountId}_${calendarId}.json`;

    return {
      id: calendarId,
      name: calendar.name,
      type: calendar.type,
      color: normalizeBootstrapCalendarColor(calendar.color),
      pinned: normalizeBootstrapCalendarPinned(calendar.pinned),
      ...(calendar.type === "score"
        ? { display: normalizeBootstrapScoreDisplay(calendar.display) }
        : {}),
      dataFile,
      ...(calendar.dataFileId ? { dataFileId: normalizeDriveFileId(calendar.dataFileId) } : {}),
      data: normalizeBootstrapCalendarDayEntries(calendar.data, calendar.type),
    };
  });

  const configCalendars = accountCalendars.map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    type: calendar.type,
    color: calendar.color,
    pinned: calendar.pinned,
    ...(calendar.type === "score" && calendar.display ? { display: calendar.display } : {}),
    "data-file": calendar.dataFile,
    ...(calendar.dataFileId ? { "data-file-id": normalizeDriveFileId(calendar.dataFileId) } : {}),
  }));
  const currentCalendarId =
    requestedCurrentCalendarId &&
    accountCalendars.some((calendar) => calendar.id === requestedCurrentCalendarId)
      ? requestedCurrentCalendarId
      : accountCalendars[0]?.id || "";

  return {
    accountId: currentAccountId,
    accountName: currentAccountName,
    currentCalendarId,
    selectedTheme,
    calendars: accountCalendars,
    configPayload: {
      version: 1,
      "current-account-id": currentAccountId,
      "current-calendar-id": currentCalendarId,
      "selected-theme": selectedTheme,
      accounts: {
        [currentAccountId]: {
          id: currentAccountId,
          name: currentAccountName,
          calendars: configCalendars,
        },
      },
    },
  };
}

function buildJustCalendarConfigPayload(rawPayload = {}) {
  return buildJustCalendarBootstrapBundle(rawPayload).configPayload;
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
  const configFileId =
    typeof storedState.configFileId === "string" && storedState.configFileId.trim()
      ? storedState.configFileId.trim()
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
    configFileId,
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

async function findDriveFileByNameInFolder({ accessToken, folderId, fileName }) {
  if (!accessToken || !folderId || !fileName) {
    return {
      ok: false,
      error: "missing_drive_file_lookup_params",
    };
  }

  const escapedFileName = escapeDriveQueryValue(fileName);
  const escapedFolderId = escapeDriveQueryValue(folderId);
  const listUrl = new URL(GOOGLE_DRIVE_FILES_URL);
  listUrl.searchParams.set(
    "q",
    `name = '${escapedFileName}' and '${escapedFolderId}' in parents and trashed = false`,
  );
  listUrl.searchParams.set("spaces", "drive");
  listUrl.searchParams.set("fields", "files(id,name,mimeType)");
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
      error: "config_lookup_failed",
      status: listResponse.status,
      details: listPayload?.error || "unknown_error",
    };
  }

  const existingFile =
    Array.isArray(listPayload?.files) && listPayload.files.length > 0 ? listPayload.files[0] : null;
  if (!existingFile || typeof existingFile.id !== "string" || !existingFile.id) {
    return {
      ok: true,
      found: false,
    };
  }

  return {
    ok: true,
    found: true,
    fileId: existingFile.id,
  };
}

async function createDriveJsonFileInFolder({ accessToken, folderId, fileName, payload }) {
  if (!accessToken || !folderId || !fileName) {
    return {
      ok: false,
      error: "missing_drive_file_create_params",
    };
  }

  const metadata = {
    name: fileName,
    parents: [folderId],
    mimeType: "application/json",
  };
  const fileContents = `${JSON.stringify(payload, null, 2)}\n`;
  const boundary = `justcalendar_boundary_${randomBytes(12).toString("hex")}`;
  const multipartBody = [
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    JSON.stringify(metadata),
    `--${boundary}`,
    "Content-Type: application/json; charset=UTF-8",
    "",
    fileContents,
    `--${boundary}--`,
    "",
  ].join("\r\n");

  const createUrl = new URL(GOOGLE_DRIVE_UPLOAD_FILES_URL);
  createUrl.searchParams.set("uploadType", "multipart");
  createUrl.searchParams.set("fields", "id,name,mimeType");

  const createResponse = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    signal: AbortSignal.timeout(10_000),
    body: multipartBody,
  });
  const createPayload = await createResponse.json().catch(() => ({}));

  if (!createResponse.ok) {
    return {
      ok: false,
      error: "config_create_failed",
      status: createResponse.status,
      details: createPayload?.error || "unknown_error",
    };
  }

  const createdFileId =
    createPayload && typeof createPayload.id === "string" ? createPayload.id : "";
  if (!createdFileId) {
    return {
      ok: false,
      error: "config_create_missing_id",
    };
  }

  return {
    ok: true,
    fileId: createdFileId,
  };
}

async function updateDriveJsonFileById({ accessToken, fileId, payload }) {
  if (!accessToken || !fileId) {
    return {
      ok: false,
      error: "missing_drive_file_update_params",
    };
  }

  const updateUrl = new URL(`${GOOGLE_DRIVE_UPLOAD_FILES_URL}/${encodeURIComponent(fileId)}`);
  updateUrl.searchParams.set("uploadType", "media");
  updateUrl.searchParams.set("fields", "id,name,mimeType");

  const updateResponse = await fetch(updateUrl, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    signal: AbortSignal.timeout(10_000),
    body: `${JSON.stringify(payload, null, 2)}\n`,
  });
  const updatePayload = await updateResponse.json().catch(() => ({}));

  if (!updateResponse.ok) {
    return {
      ok: false,
      error: "config_update_failed",
      status: updateResponse.status,
      details: updatePayload?.error || "unknown_error",
    };
  }

  const updatedFileId =
    updatePayload && typeof updatePayload.id === "string" ? updatePayload.id : fileId;
  if (!updatedFileId) {
    return {
      ok: false,
      error: "config_update_missing_id",
    };
  }

  return {
    ok: true,
    fileId: updatedFileId,
  };
}

async function upsertDriveJsonFileInFolder({ accessToken, folderId, fileName, payload }) {
  if (!accessToken || !folderId || !fileName) {
    return {
      ok: false,
      error: "missing_drive_file_upsert_params",
    };
  }

  const existingFileResult = await findDriveFileByNameInFolder({
    accessToken,
    folderId,
    fileName,
  });
  if (!existingFileResult.ok) {
    return existingFileResult;
  }

  if (existingFileResult.found && existingFileResult.fileId) {
    const updateResult = await updateDriveJsonFileById({
      accessToken,
      fileId: existingFileResult.fileId,
      payload,
    });
    if (!updateResult.ok) {
      return updateResult;
    }

    return {
      ok: true,
      created: false,
      fileId: updateResult.fileId || existingFileResult.fileId,
    };
  }

  const createResult = await createDriveJsonFileInFolder({
    accessToken,
    folderId,
    fileName,
    payload,
  });
  if (!createResult.ok) {
    return createResult;
  }

  return {
    ok: true,
    created: true,
    fileId: createResult.fileId,
  };
}

async function ensureJustCalendarConfigFile({
  accessToken,
  folderId,
  configPayload,
  allowCreateIfMissing = true,
  preferredFileId = "",
}) {
  const normalizedPreferredFileId = normalizeDriveFileId(preferredFileId);
  if (normalizedPreferredFileId) {
    const readByIdResult = await readDriveJsonFileById({
      accessToken,
      fileId: normalizedPreferredFileId,
    });
    if (readByIdResult.ok) {
      return {
        ok: true,
        created: false,
        fileId: normalizedPreferredFileId,
        payload: isObjectRecord(readByIdResult.payload) ? readByIdResult.payload : null,
      };
    }
    if (Number(readByIdResult.status) !== 404) {
      return readByIdResult;
    }
  }

  const existingFileResult = await findDriveFileByNameInFolder({
    accessToken,
    folderId,
    fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
  });
  if (!existingFileResult.ok) {
    return existingFileResult;
  }
  if (existingFileResult.found) {
    return {
      ok: true,
      created: false,
      fileId: existingFileResult.fileId,
    };
  }
  if (!allowCreateIfMissing) {
    return {
      ok: true,
      created: false,
      fileId: "",
      missing: true,
    };
  }

  const createResult = await createDriveJsonFileInFolder({
    accessToken,
    folderId,
    fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
    payload: configPayload,
  });
  if (!createResult.ok) {
    return createResult;
  }

  return {
    ok: true,
    created: true,
    fileId: createResult.fileId,
  };
}

async function readDriveJsonFileById({ accessToken, fileId }) {
  if (!accessToken || !fileId) {
    return {
      ok: false,
      error: "missing_drive_file_read_params",
    };
  }

  const readUrl = new URL(`${GOOGLE_DRIVE_FILES_URL}/${encodeURIComponent(fileId)}`);
  readUrl.searchParams.set("alt", "media");

  const readResponse = await fetch(readUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
    signal: AbortSignal.timeout(8_000),
  });
  const readPayload = await readResponse.json().catch(() => null);

  if (!readResponse.ok) {
    return {
      ok: false,
      error: "config_read_failed",
      status: readResponse.status,
      details:
        (readPayload && typeof readPayload === "object" ? readPayload.error : null) || "unknown_error",
    };
  }

  if (!isObjectRecord(readPayload)) {
    return {
      ok: false,
      error: "config_invalid_json",
      status: 502,
    };
  }

  return {
    ok: true,
    payload: readPayload,
  };
}

function extractBootstrapBundleFromPersistedConfig(rawConfigPayload) {
  if (!isObjectRecord(rawConfigPayload)) {
    return null;
  }
  const selectedTheme = normalizeBootstrapTheme(
    rawConfigPayload["selected-theme"] || rawConfigPayload.selectedTheme,
  );

  const rawAccounts = isObjectRecord(rawConfigPayload.accounts) ? rawConfigPayload.accounts : {};
  let currentAccountId = normalizeIncomingAccountId(rawConfigPayload["current-account-id"]);
  let currentAccountRecord =
    currentAccountId && isObjectRecord(rawAccounts[currentAccountId])
      ? rawAccounts[currentAccountId]
      : null;

  if (!currentAccountRecord) {
    for (const [rawAccountId, rawAccountRecord] of Object.entries(rawAccounts)) {
      const normalizedAccountId = normalizeIncomingAccountId(rawAccountId);
      if (!normalizedAccountId || !isObjectRecord(rawAccountRecord)) {
        continue;
      }
      currentAccountId = normalizedAccountId;
      currentAccountRecord = rawAccountRecord;
      break;
    }
  }

  if (!currentAccountId || !currentAccountRecord) {
    return null;
  }

  const accountName = normalizeBootstrapCalendarName(
    currentAccountRecord.name,
    DEFAULT_BOOTSTRAP_ACCOUNT_NAME,
  );
  const rawCalendars = Array.isArray(currentAccountRecord.calendars)
    ? currentAccountRecord.calendars
    : [];
  const usedCalendarIds = new Set();
  const calendars = rawCalendars
    .map((rawCalendar, index) => {
      if (!isObjectRecord(rawCalendar)) {
        return null;
      }

      const calendarId = normalizeIncomingCalendarId(rawCalendar.id);
      if (!calendarId || usedCalendarIds.has(calendarId)) {
        return null;
      }
      usedCalendarIds.add(calendarId);

      const calendarName = normalizeBootstrapCalendarName(rawCalendar.name, `Calendar ${index + 1}`);
      const calendarType = normalizeBootstrapCalendarType(rawCalendar.type);
      const calendarColor = normalizeBootstrapCalendarColor(rawCalendar.color);
      const calendarPinned = normalizeBootstrapCalendarPinned(rawCalendar.pinned);
      const calendarDisplay =
        calendarType === "score"
          ? normalizeBootstrapScoreDisplay(rawCalendar.display)
          : undefined;
      const rawDataFile = typeof rawCalendar["data-file"] === "string" ? rawCalendar["data-file"].trim() : "";
      const dataFile = rawDataFile || `${currentAccountId}_${calendarId}.json`;
      const dataFileId = normalizeDriveFileId(rawCalendar["data-file-id"] || rawCalendar.dataFileId);

      return {
        id: calendarId,
        name: calendarName,
        type: calendarType,
        color: calendarColor,
        pinned: calendarPinned,
        ...(calendarDisplay ? { display: calendarDisplay } : {}),
        dataFile,
        ...(dataFileId ? { dataFileId } : {}),
        data: {},
      };
    })
    .filter(Boolean);

  const requestedCurrentCalendarId =
    normalizeIncomingCalendarId(rawConfigPayload["current-calendar-id"]) ||
    normalizeIncomingCalendarId(currentAccountRecord["current-calendar-id"]);
  const currentCalendarId =
    requestedCurrentCalendarId && calendars.some((calendar) => calendar.id === requestedCurrentCalendarId)
      ? requestedCurrentCalendarId
      : calendars[0]?.id || "";

  return {
    accountId: currentAccountId,
    accountName,
    currentCalendarId,
    selectedTheme,
    calendars,
    configPayload: rawConfigPayload,
  };
}

function buildCalendarDataLookupMaps(calendars = []) {
  const calendarDataById = new Map();
  const calendarDataByName = new Map();
  if (!Array.isArray(calendars)) {
    return {
      byId: calendarDataById,
      byName: calendarDataByName,
    };
  }

  for (const calendar of calendars) {
    if (!isObjectRecord(calendar)) {
      continue;
    }

    const normalizedCalendarType = normalizeBootstrapCalendarType(calendar.type);
    const normalizedDayEntries = normalizeBootstrapCalendarDayEntries(
      calendar.data,
      normalizedCalendarType,
    );

    const calendarId = normalizeIncomingCalendarId(calendar.id);
    if (calendarId) {
      calendarDataById.set(calendarId, normalizedDayEntries);
    }

    const nameKey = toCalendarNameLookupKey(calendar.name);
    if (nameKey) {
      calendarDataByName.set(nameKey, normalizedDayEntries);
    }
  }

  return {
    byId: calendarDataById,
    byName: calendarDataByName,
  };
}

function buildCalendarDataFilePayload({ accountId, calendar, dayEntries }) {
  const normalizedDayEntries = normalizeBootstrapCalendarDayEntries(dayEntries, calendar?.type);
  return {
    version: 1,
    "account-id": accountId,
    "calendar-id": calendar.id,
    "calendar-name": calendar.name,
    "calendar-type": calendar.type,
    data: toNestedCalendarDayEntries(normalizedDayEntries),
  };
}

async function ensureJustCalendarDataFiles({
  accessToken,
  folderId,
  accountId,
  calendars = [],
  requestedCalendars = [],
}) {
  if (!accessToken || !folderId || !accountId) {
    return {
      ok: false,
      error: "missing_calendar_data_bootstrap_params",
    };
  }

  const targetCalendars = Array.isArray(calendars) ? calendars : [];
  if (targetCalendars.length === 0) {
    return {
      ok: true,
      createdCount: 0,
      files: [],
    };
  }

  const requestedCalendarDataLookup = buildCalendarDataLookupMaps(requestedCalendars);
  const fileResults = [];

  for (const calendar of targetCalendars) {
    if (!isObjectRecord(calendar)) {
      continue;
    }

    const fileName = typeof calendar.dataFile === "string" ? calendar.dataFile.trim() : "";
    if (!fileName) {
      continue;
    }

    const existingDataFileResult = await findDriveFileByNameInFolder({
      accessToken,
      folderId,
      fileName,
    });
    if (!existingDataFileResult.ok) {
      return {
        ok: false,
        error: "calendar_data_lookup_failed",
        status: existingDataFileResult.status || 502,
        details: {
          fileName,
          cause: existingDataFileResult.details || existingDataFileResult.error || "unknown_error",
        },
      };
    }

    if (existingDataFileResult.found) {
      fileResults.push({
        fileName,
        fileId: existingDataFileResult.fileId || "",
        created: false,
      });
      continue;
    }

    const calendarNameKey = toCalendarNameLookupKey(calendar.name);
    const calendarDayEntries =
      requestedCalendarDataLookup.byId.get(calendar.id) ||
      (calendarNameKey ? requestedCalendarDataLookup.byName.get(calendarNameKey) : null) ||
      {};
    const createDataFileResult = await createDriveJsonFileInFolder({
      accessToken,
      folderId,
      fileName,
      payload: buildCalendarDataFilePayload({
        accountId,
        calendar,
        dayEntries: calendarDayEntries,
      }),
    });
    if (!createDataFileResult.ok) {
      return {
        ok: false,
        error: "calendar_data_create_failed",
        status: createDataFileResult.status || 502,
        details: {
          fileName,
          cause: createDataFileResult.details || createDataFileResult.error || "unknown_error",
        },
      };
    }

    fileResults.push({
      fileName,
      fileId: createDataFileResult.fileId || "",
      created: true,
    });
  }

  return {
    ok: true,
    createdCount: fileResults.filter((fileResult) => fileResult.created).length,
    files: fileResults,
  };
}

async function loadJustCalendarDataFiles({
  accessToken,
  folderId,
  calendars = [],
}) {
  if (!accessToken || !folderId) {
    return {
      ok: false,
      error: "missing_calendar_data_load_params",
    };
  }

  const targetCalendars = Array.isArray(calendars) ? calendars : [];
  const calendarLoadTasks = targetCalendars.map((calendar) => async () => {
    if (!isObjectRecord(calendar)) {
      return {
        ok: true,
        calendarId: "",
        dayEntries: {},
        resolvedFileId: "",
      };
    }

    const calendarId = normalizeIncomingCalendarId(calendar.id);
    if (!calendarId) {
      return {
        ok: true,
        calendarId: "",
        dayEntries: {},
        resolvedFileId: "",
      };
    }

    const fileName = typeof calendar.dataFile === "string" ? calendar.dataFile.trim() : "";
    const configuredFileId = normalizeDriveFileId(
      calendar["data-file-id"] || calendar.dataFileId,
    );

    const parseCalendarEntries = (readPayload) => {
      const payloadObject = isObjectRecord(readPayload) ? readPayload : {};
      const fileCalendarType = normalizeBootstrapCalendarType(
        payloadObject["calendar-type"] || calendar.type,
      );
      return normalizeBootstrapCalendarDayEntries(payloadObject.data, fileCalendarType);
    };

    if (configuredFileId) {
      const readByIdResult = await readDriveJsonFileById({
        accessToken,
        fileId: configuredFileId,
      });
      if (readByIdResult.ok) {
        return {
          ok: true,
          calendarId,
          dayEntries: parseCalendarEntries(readByIdResult.payload),
          resolvedFileId: configuredFileId,
        };
      }

      if (Number(readByIdResult.status) !== 404) {
        return {
          ok: false,
          error: "calendar_data_load_read_failed",
          status: readByIdResult.status || 502,
          details: {
            fileName,
            fileId: configuredFileId,
            cause: readByIdResult.details || readByIdResult.error || "unknown_error",
          },
        };
      }
    }

    if (!fileName) {
      return {
        ok: true,
        calendarId,
        dayEntries: {},
        resolvedFileId: "",
      };
    }

    const lookupResult = await findDriveFileByNameInFolder({
      accessToken,
      folderId,
      fileName,
    });
    if (!lookupResult.ok) {
      return {
        ok: false,
        error: "calendar_data_load_lookup_failed",
        status: lookupResult.status || 502,
        details: {
          fileName,
          cause: lookupResult.details || lookupResult.error || "unknown_error",
        },
      };
    }
    if (!lookupResult.found || !lookupResult.fileId) {
      return {
        ok: true,
        calendarId,
        dayEntries: {},
        resolvedFileId: "",
      };
    }

    const readResult = await readDriveJsonFileById({
      accessToken,
      fileId: lookupResult.fileId,
    });
    if (!readResult.ok) {
      return {
        ok: false,
        error: "calendar_data_load_read_failed",
        status: readResult.status || 502,
        details: {
          fileName,
          fileId: lookupResult.fileId,
          cause: readResult.details || readResult.error || "unknown_error",
        },
      };
    }

    return {
      ok: true,
      calendarId,
      dayEntries: parseCalendarEntries(readResult.payload),
      resolvedFileId: lookupResult.fileId,
    };
  });

  const dayStatesByCalendarId = {};
  const resolvedFileIdsByCalendarId = {};
  const concurrentTaskCount = Math.max(
    1,
    Math.min(
      DRIVE_DATA_LOAD_CONCURRENCY,
      Number.isFinite(targetCalendars.length) ? targetCalendars.length : DRIVE_DATA_LOAD_CONCURRENCY,
    ),
  );
  let nextTaskIndex = 0;
  const workerResults = [];

  const runNextTask = async () => {
    while (nextTaskIndex < calendarLoadTasks.length) {
      const taskIndex = nextTaskIndex;
      nextTaskIndex += 1;
      const taskResult = await calendarLoadTasks[taskIndex]();
      workerResults[taskIndex] = taskResult;
      if (!taskResult?.ok) {
        return;
      }
    }
  };

  await Promise.all(Array.from({ length: concurrentTaskCount }, () => runNextTask()));

  for (const taskResult of workerResults) {
    if (!taskResult || !taskResult.ok) {
      return taskResult || {
        ok: false,
        error: "calendar_data_load_failed",
        status: 502,
      };
    }
    const calendarId = normalizeIncomingCalendarId(taskResult.calendarId);
    if (!calendarId) {
      continue;
    }
    dayStatesByCalendarId[calendarId] = isObjectRecord(taskResult.dayEntries)
      ? taskResult.dayEntries
      : {};
    const resolvedFileId = normalizeDriveFileId(taskResult.resolvedFileId);
    if (resolvedFileId) {
      resolvedFileIdsByCalendarId[calendarId] = resolvedFileId;
    }
  }

  return {
    ok: true,
    dayStatesByCalendarId,
    resolvedFileIdsByCalendarId,
  };
}

function injectDataFileIdsIntoConfigPayload(
  rawConfigPayload,
  { accountId = "", resolvedFileIdsByCalendarId = {} } = {},
) {
  if (!isObjectRecord(rawConfigPayload) || !isObjectRecord(rawConfigPayload.accounts)) {
    return {
      updated: false,
      payload: rawConfigPayload,
    };
  }

  const resolvedFileIds =
    isObjectRecord(resolvedFileIdsByCalendarId) ? resolvedFileIdsByCalendarId : {};
  if (Object.keys(resolvedFileIds).length === 0) {
    return {
      updated: false,
      payload: rawConfigPayload,
    };
  }

  const normalizedAccountId =
    normalizeIncomingAccountId(accountId) ||
    normalizeIncomingAccountId(rawConfigPayload["current-account-id"]) ||
    "";
  if (!normalizedAccountId) {
    return {
      updated: false,
      payload: rawConfigPayload,
    };
  }

  const accounts = rawConfigPayload.accounts;
  const currentAccountRecord = isObjectRecord(accounts[normalizedAccountId])
    ? accounts[normalizedAccountId]
    : null;
  if (!currentAccountRecord || !Array.isArray(currentAccountRecord.calendars)) {
    return {
      updated: false,
      payload: rawConfigPayload,
    };
  }

  let updated = false;
  const nextCalendars = currentAccountRecord.calendars.map((rawCalendar) => {
    if (!isObjectRecord(rawCalendar)) {
      return rawCalendar;
    }

    const calendarId = normalizeIncomingCalendarId(rawCalendar.id);
    if (!calendarId) {
      return rawCalendar;
    }
    const resolvedFileId = normalizeDriveFileId(resolvedFileIds[calendarId]);
    if (!resolvedFileId) {
      return rawCalendar;
    }
    const existingFileId = normalizeDriveFileId(
      rawCalendar["data-file-id"] || rawCalendar.dataFileId,
    );
    if (existingFileId === resolvedFileId) {
      return rawCalendar;
    }

    updated = true;
    return {
      ...rawCalendar,
      "data-file-id": resolvedFileId,
    };
  });

  if (!updated) {
    return {
      updated: false,
      payload: rawConfigPayload,
    };
  }

  return {
    updated: true,
    payload: {
      ...rawConfigPayload,
      accounts: {
        ...accounts,
        [normalizedAccountId]: {
          ...currentAccountRecord,
          calendars: nextCalendars,
        },
      },
    },
  };
}

async function ensureJustCalendarConfigForCurrentConnection({
  accessToken = "",
  config,
  configPayload = {},
  bootstrapBundle = null,
  allowCreateIfMissing = true,
  ensureDataFiles = true,
} = {}) {
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

  if (inFlightEnsureConfigPromise) {
    return inFlightEnsureConfigPromise;
  }

  inFlightEnsureConfigPromise = (async () => {
    let freshState = readStoredAuthState();

    const folderResult = await ensureJustCalendarFolderForCurrentConnection({
      accessToken,
      config,
    });
    if (!folderResult.ok) {
      return folderResult;
    }

    const folderId =
      folderResult && typeof folderResult.folderId === "string" ? folderResult.folderId : "";
    if (!folderId) {
      return {
        ok: false,
        error: "missing_folder_id",
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
              "No valid access token available for non-critical config bootstrap. Login state is unchanged.",
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
            "No valid access token available for non-critical config bootstrap. Login state is unchanged.",
        },
      };
    }

    const requestedBootstrapBundle =
      bootstrapBundle &&
      typeof bootstrapBundle === "object" &&
      !Array.isArray(bootstrapBundle) &&
      isObjectRecord(bootstrapBundle.configPayload)
        ? bootstrapBundle
        : buildJustCalendarBootstrapBundle(configPayload);

    const configFileResult = await ensureJustCalendarConfigFile({
      accessToken: tokenToUse,
      folderId,
      configPayload: requestedBootstrapBundle.configPayload,
      allowCreateIfMissing,
      preferredFileId: freshState.configFileId || "",
    });
    if (!configFileResult.ok) {
      return configFileResult;
    }

    const configFileId =
      configFileResult && typeof configFileResult.fileId === "string" ? configFileResult.fileId : "";

    let effectiveBootstrapBundle = null;
    let effectiveConfigPayload = null;
    if (configFileResult.created) {
      effectiveBootstrapBundle = requestedBootstrapBundle;
      effectiveConfigPayload = requestedBootstrapBundle.configPayload;
    } else if (isObjectRecord(configFileResult.payload)) {
      effectiveBootstrapBundle = extractBootstrapBundleFromPersistedConfig(configFileResult.payload);
      effectiveConfigPayload = configFileResult.payload;
    } else if (configFileId) {
      const readConfigResult = await readDriveJsonFileById({
        accessToken: tokenToUse,
        fileId: configFileId,
      });
      if (!readConfigResult.ok) {
        return readConfigResult;
      }

      effectiveBootstrapBundle = extractBootstrapBundleFromPersistedConfig(readConfigResult.payload);
      effectiveConfigPayload = readConfigResult.payload;
    }

    if (!effectiveBootstrapBundle) {
      return {
        ok: false,
        error: "invalid_existing_config_payload",
        status: 422,
        details: {
          message:
            "Existing justcalendar.json is invalid or missing required current-account-id/account data.",
        },
      };
    }

    const shouldCreateMissingDataFiles = Boolean(
      ensureDataFiles && configFileResult.created && effectiveBootstrapBundle,
    );
    const dataFilesResult = shouldCreateMissingDataFiles
      ? await ensureJustCalendarDataFiles({
          accessToken: tokenToUse,
          folderId,
          accountId: effectiveBootstrapBundle.accountId,
          calendars: effectiveBootstrapBundle.calendars,
          requestedCalendars: requestedBootstrapBundle.calendars,
        })
      : {
          ok: true,
          createdCount: 0,
          files: [],
        };
    if (!dataFilesResult.ok) {
      return dataFilesResult;
    }

    if (configFileId && configFileId !== freshState.configFileId) {
      writeStoredAuthState({
        ...freshState,
        driveFolderId: folderId || freshState.driveFolderId || "",
        configFileId,
        updatedAt: new Date().toISOString(),
      });
    }

    const responseBundle = effectiveBootstrapBundle;
    const responseCalendars = Array.isArray(responseBundle?.calendars)
      ? responseBundle.calendars.map((calendar) => ({
          id: calendar.id,
          name: calendar.name,
          type: calendar.type,
          color: normalizeBootstrapCalendarColor(calendar.color),
          pinned: normalizeBootstrapCalendarPinned(calendar.pinned),
          ...(calendar.type === "score" && calendar.display
            ? { display: normalizeBootstrapScoreDisplay(calendar.display) }
            : {}),
          "data-file": calendar.dataFile,
          ...(calendar.dataFileId ? { "data-file-id": normalizeDriveFileId(calendar.dataFileId) } : {}),
        }))
      : [];

    const remoteLoadResult =
      !configFileResult.created && ensureDataFiles
        ? await loadJustCalendarDataFiles({
            accessToken: tokenToUse,
            folderId,
            calendars: responseCalendars.map((calendar) => ({
              id: calendar.id,
              name: calendar.name,
              type: calendar.type,
              dataFile: calendar["data-file"],
              dataFileId: calendar["data-file-id"],
            })),
          })
        : {
            ok: true,
            dayStatesByCalendarId: {},
          };
    if (!remoteLoadResult.ok) {
      return remoteLoadResult;
    }

    const resolvedCalendarFileIds = isObjectRecord(remoteLoadResult.resolvedFileIdsByCalendarId)
      ? remoteLoadResult.resolvedFileIdsByCalendarId
      : {};
    const responseCalendarsWithResolvedFileIds = responseCalendars.map((calendar) => {
      if (!isObjectRecord(calendar)) {
        return calendar;
      }
      const calendarId = normalizeIncomingCalendarId(calendar.id);
      const resolvedFileId = normalizeDriveFileId(
        calendarId ? resolvedCalendarFileIds[calendarId] : "",
      );
      if (!resolvedFileId) {
        return calendar;
      }
      return {
        ...calendar,
        "data-file-id": resolvedFileId,
      };
    });

    const configFileIdInjection = injectDataFileIdsIntoConfigPayload(effectiveConfigPayload, {
      accountId: responseBundle?.accountId || "",
      resolvedFileIdsByCalendarId: resolvedCalendarFileIds,
    });
    if (configFileIdInjection.updated && configFileId) {
      await updateDriveJsonFileById({
        accessToken: tokenToUse,
        fileId: configFileId,
        payload: configFileIdInjection.payload,
      });
    }

    const firstCalendarId =
      Array.isArray(responseCalendarsWithResolvedFileIds) && responseCalendarsWithResolvedFileIds.length > 0
        ? responseCalendarsWithResolvedFileIds[0].id || ""
        : "";
    const requestedCurrentCalendarId = normalizeIncomingCalendarId(responseBundle?.currentCalendarId);
    const selectedTheme = normalizeBootstrapTheme(responseBundle?.selectedTheme);
    const activeCalendarId =
      requestedCurrentCalendarId &&
      responseCalendarsWithResolvedFileIds.some((calendar) => calendar.id === requestedCurrentCalendarId)
        ? requestedCurrentCalendarId
        : firstCalendarId;
    const remoteState =
      !configFileResult.created && ensureDataFiles
        ? {
            version: 1,
            activeCalendarId,
            selectedTheme,
            calendars: responseCalendarsWithResolvedFileIds,
            dayStatesByCalendarId: isObjectRecord(remoteLoadResult.dayStatesByCalendarId)
              ? remoteLoadResult.dayStatesByCalendarId
              : {},
          }
        : null;

    return {
      ok: true,
      created: Boolean(configFileResult.created),
      configSource: configFileResult.created ? "created" : "existing",
      fileId: configFileId,
      folderId,
      accountId: responseBundle?.accountId || "",
      account: responseBundle?.accountName || DEFAULT_BOOTSTRAP_ACCOUNT_NAME,
      currentCalendarId: activeCalendarId,
      selectedTheme,
      calendars: responseCalendarsWithResolvedFileIds,
      remoteState,
      dataFilesCreated: Number(dataFilesResult.createdCount) || 0,
      dataFiles: Array.isArray(dataFilesResult.files) ? dataFilesResult.files : [],
    };
  })();

  try {
    return await inFlightEnsureConfigPromise;
  } finally {
    inFlightEnsureConfigPromise = null;
  }
}

async function saveJustCalendarStateForCurrentConnection({
  accessToken = "",
  config,
  bootstrapBundle = null,
} = {}) {
  const storedState = readStoredAuthState();
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

  const requestedBootstrapBundle =
    bootstrapBundle &&
    typeof bootstrapBundle === "object" &&
    !Array.isArray(bootstrapBundle) &&
    isObjectRecord(bootstrapBundle.configPayload)
      ? bootstrapBundle
      : buildJustCalendarBootstrapBundle({});

  const folderResult = await ensureJustCalendarFolderForCurrentConnection({
    accessToken,
    config,
  });
  if (!folderResult.ok) {
    return folderResult;
  }

  const folderId =
    folderResult && typeof folderResult.folderId === "string" ? folderResult.folderId : "";
  if (!folderId) {
    return {
      ok: false,
      error: "missing_folder_id",
    };
  }

  const upsertConfigResult = await upsertDriveJsonFileInFolder({
    accessToken,
    folderId,
    fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
    payload: requestedBootstrapBundle.configPayload,
  });
  if (!upsertConfigResult.ok) {
    return {
      ok: false,
      error: "config_upsert_failed",
      status: upsertConfigResult.status || 502,
      details: upsertConfigResult.details || upsertConfigResult.error || "unknown_error",
    };
  }

  const dataFileResults = [];
  const resolvedFileIdsByCalendarId = {};
  for (const calendar of requestedBootstrapBundle.calendars) {
    if (!isObjectRecord(calendar)) {
      continue;
    }

    const calendarId = normalizeIncomingCalendarId(calendar.id);
    const fileName = typeof calendar.dataFile === "string" ? calendar.dataFile.trim() : "";
    if (!fileName) {
      continue;
    }

    const upsertDataFileResult = await upsertDriveJsonFileInFolder({
      accessToken,
      folderId,
      fileName,
      payload: buildCalendarDataFilePayload({
        accountId: requestedBootstrapBundle.accountId,
        calendar,
        dayEntries: calendar.data,
      }),
    });
    if (!upsertDataFileResult.ok) {
      return {
        ok: false,
        error: "calendar_data_upsert_failed",
        status: upsertDataFileResult.status || 502,
        details: {
          fileName,
          cause: upsertDataFileResult.details || upsertDataFileResult.error || "unknown_error",
        },
      };
    }

    dataFileResults.push({
      calendarId,
      fileName,
      fileId: upsertDataFileResult.fileId || "",
      created: Boolean(upsertDataFileResult.created),
    });
    const resolvedFileId = normalizeDriveFileId(upsertDataFileResult.fileId);
    if (calendarId && resolvedFileId) {
      resolvedFileIdsByCalendarId[calendarId] = resolvedFileId;
    }
  }

  const configFileIdInjection = injectDataFileIdsIntoConfigPayload(
    requestedBootstrapBundle.configPayload,
    {
      accountId: requestedBootstrapBundle.accountId || "",
      resolvedFileIdsByCalendarId,
    },
  );
  if (configFileIdInjection.updated && upsertConfigResult.fileId) {
    const updateConfigResult = await updateDriveJsonFileById({
      accessToken,
      fileId: upsertConfigResult.fileId,
      payload: configFileIdInjection.payload,
    });
    if (!updateConfigResult.ok) {
      return {
        ok: false,
        error: "config_file_id_update_failed",
        status: updateConfigResult.status || 502,
        details: updateConfigResult.details || updateConfigResult.error || "unknown_error",
      };
    }
  }

  const latestState = readStoredAuthState();
  writeStoredAuthState({
    ...latestState,
    driveFolderId: folderId || latestState.driveFolderId || "",
    configFileId: upsertConfigResult.fileId || latestState.configFileId || "",
    updatedAt: new Date().toISOString(),
  });

  const dataFileIdByName = new Map(
    dataFileResults.map((dataFileResult) => [dataFileResult.fileName, dataFileResult.fileId || ""]),
  );
  const responseCalendars = requestedBootstrapBundle.calendars.map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    type: calendar.type,
    color: normalizeBootstrapCalendarColor(calendar.color),
    pinned: normalizeBootstrapCalendarPinned(calendar.pinned),
    ...(calendar.type === "score" && calendar.display
      ? { display: normalizeBootstrapScoreDisplay(calendar.display) }
      : {}),
    "data-file": calendar.dataFile,
    ...(() => {
      const calendarId = normalizeIncomingCalendarId(calendar.id);
      const resolvedDataFileId = normalizeDriveFileId(
        (calendarId ? resolvedFileIdsByCalendarId[calendarId] : "") ||
        dataFileIdByName.get(calendar.dataFile) || calendar.dataFileId,
      );
      return resolvedDataFileId ? { "data-file-id": resolvedDataFileId } : {};
    })(),
  }));
  const firstCalendarId = responseCalendars.length > 0 ? responseCalendars[0].id || "" : "";
  const requestedCurrentCalendarId = normalizeIncomingCalendarId(
    requestedBootstrapBundle.currentCalendarId,
  );
  const selectedTheme = normalizeBootstrapTheme(requestedBootstrapBundle.selectedTheme);
  const activeCalendarId =
    requestedCurrentCalendarId &&
    responseCalendars.some((calendar) => calendar.id === requestedCurrentCalendarId)
      ? requestedCurrentCalendarId
      : firstCalendarId;
  const dayStatesByCalendarId = requestedBootstrapBundle.calendars.reduce((nextValue, calendar) => {
    if (!isObjectRecord(calendar) || !calendar.id) {
      return nextValue;
    }
    nextValue[calendar.id] = normalizeBootstrapCalendarDayEntries(calendar.data, calendar.type);
    return nextValue;
  }, {});

  return {
    ok: true,
    created: Boolean(upsertConfigResult.created),
    configSource: upsertConfigResult.created ? "created" : "updated",
    folderId,
    fileId: upsertConfigResult.fileId || "",
    accountId: requestedBootstrapBundle.accountId || "",
    account: requestedBootstrapBundle.accountName || DEFAULT_BOOTSTRAP_ACCOUNT_NAME,
    currentCalendarId: activeCalendarId,
    selectedTheme,
    calendars: responseCalendars,
    remoteState: {
      version: 1,
      activeCalendarId,
      selectedTheme,
      calendars: responseCalendars,
      dayStatesByCalendarId,
    },
    dataFilesCreated: dataFileResults.filter((dataFileResult) => dataFileResult.created).length,
    dataFilesSaved: dataFileResults.length,
    dataFiles: dataFileResults,
  };
}

async function saveCurrentCalendarStateForCurrentConnection({
  accessToken = "",
  config,
  bootstrapBundle = null,
} = {}) {
  const storedState = readStoredAuthState();
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

  const requestedBootstrapBundle =
    bootstrapBundle &&
    typeof bootstrapBundle === "object" &&
    !Array.isArray(bootstrapBundle) &&
    isObjectRecord(bootstrapBundle.configPayload)
      ? bootstrapBundle
      : buildJustCalendarBootstrapBundle({});

  const currentCalendarId = normalizeIncomingCalendarId(requestedBootstrapBundle.currentCalendarId);
  if (!currentCalendarId) {
    return {
      ok: false,
      error: "missing_current_calendar_id",
      status: 400,
      details: {
        message: "Current calendar id is required to save a single calendar.",
      },
    };
  }

  const requestedCalendar = Array.isArray(requestedBootstrapBundle.calendars)
    ? requestedBootstrapBundle.calendars.find(
        (calendar) =>
          isObjectRecord(calendar) &&
          normalizeIncomingCalendarId(calendar.id) === currentCalendarId,
      )
    : null;
  if (!requestedCalendar) {
    return {
      ok: false,
      error: "current_calendar_not_found_in_request",
      status: 400,
      details: {
        message: "Current calendar was not found in payload calendars.",
      },
    };
  }

  const loadResult = await loadJustCalendarStateForCurrentConnection({
    accessToken,
    config,
  });
  if (!loadResult.ok) {
    return loadResult;
  }
  if (loadResult.missing) {
    return {
      ok: false,
      error: "missing_config",
      status: 404,
      details: {
        message: "justcalendar.json was not found in Google Drive.",
      },
    };
  }

  const persistedCalendar = Array.isArray(loadResult.calendars)
    ? loadResult.calendars.find(
        (calendar) =>
          isObjectRecord(calendar) &&
          normalizeIncomingCalendarId(calendar.id) === currentCalendarId,
      )
    : null;
  if (!persistedCalendar) {
    return {
      ok: false,
      error: "current_calendar_not_found_in_config",
      status: 404,
      details: {
        message: "Current calendar id was not found in justcalendar.json.",
      },
    };
  }

  const fileName =
    typeof persistedCalendar["data-file"] === "string" ? persistedCalendar["data-file"].trim() : "";
  if (!fileName) {
    return {
      ok: false,
      error: "missing_current_calendar_data_file",
      status: 422,
      details: {
        message: "Current calendar is missing a data-file in justcalendar.json.",
      },
    };
  }

  const folderId = typeof loadResult.folderId === "string" ? loadResult.folderId.trim() : "";
  if (!folderId) {
    return {
      ok: false,
      error: "missing_folder_id",
    };
  }

  const accountId = typeof loadResult.accountId === "string" ? loadResult.accountId.trim() : "";
  if (!accountId) {
    return {
      ok: false,
      error: "missing_account_id_in_config",
      status: 422,
      details: {
        message: "Persisted justcalendar.json is missing current-account-id.",
      },
    };
  }
  const currentCalendarType = normalizeBootstrapCalendarType(
    persistedCalendar.type || requestedCalendar.type,
  );

  const upsertDataFileResult = await upsertDriveJsonFileInFolder({
    accessToken,
    folderId,
    fileName,
    payload: buildCalendarDataFilePayload({
      accountId,
      calendar: {
        id: currentCalendarId,
        name: normalizeBootstrapCalendarName(
          persistedCalendar.name,
          normalizeBootstrapCalendarName(requestedCalendar.name, "Calendar"),
        ),
        type: currentCalendarType,
      },
      dayEntries: requestedCalendar.data,
    }),
  });
  if (!upsertDataFileResult.ok) {
    return {
      ok: false,
      error: "current_calendar_data_upsert_failed",
      status: upsertDataFileResult.status || 502,
      details: {
        fileName,
        cause: upsertDataFileResult.details || upsertDataFileResult.error || "unknown_error",
      },
    };
  }

  return {
    ok: true,
    folderId,
    fileId: upsertDataFileResult.fileId || "",
    dataFile: fileName,
    created: Boolean(upsertDataFileResult.created),
    accountId,
    account: loadResult.account || DEFAULT_BOOTSTRAP_ACCOUNT_NAME,
    currentCalendarId,
    calendar: {
      id: currentCalendarId,
      name: normalizeBootstrapCalendarName(
        persistedCalendar.name,
        normalizeBootstrapCalendarName(requestedCalendar.name, "Calendar"),
      ),
      type: currentCalendarType,
      color: normalizeBootstrapCalendarColor(
        persistedCalendar.color || requestedCalendar.color,
      ),
      pinned: normalizeBootstrapCalendarPinned(
        persistedCalendar.pinned ?? requestedCalendar.pinned,
      ),
      ...(currentCalendarType === CALENDAR_TYPE_SCORE
        ? {
            display: normalizeBootstrapScoreDisplay(
              persistedCalendar.display || requestedCalendar.display,
            ),
          }
        : {}),
      "data-file": fileName,
      ...(upsertDataFileResult.fileId ? { "data-file-id": upsertDataFileResult.fileId } : {}),
    },
  };
}

async function loadJustCalendarStateForCurrentConnection({ accessToken = "", config } = {}) {
  const storedState = readStoredAuthState();
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

  const folderResult = await ensureJustCalendarFolderForCurrentConnection({
    accessToken,
    config,
  });
  if (!folderResult.ok) {
    return folderResult;
  }

  const folderId =
    folderResult && typeof folderResult.folderId === "string" ? folderResult.folderId : "";
  if (!folderId) {
    return {
      ok: false,
      error: "missing_folder_id",
    };
  }

  let resolvedConfigFileId = normalizeDriveFileId(storedState.configFileId);
  let readConfigResult = null;

  if (resolvedConfigFileId) {
    const readByStoredIdResult = await readDriveJsonFileById({
      accessToken,
      fileId: resolvedConfigFileId,
    });
    if (readByStoredIdResult.ok) {
      readConfigResult = readByStoredIdResult;
    } else if (Number(readByStoredIdResult.status) !== 404) {
      return readByStoredIdResult;
    } else {
      resolvedConfigFileId = "";
    }
  }

  if (!readConfigResult) {
    const configLookupResult = await findDriveFileByNameInFolder({
      accessToken,
      folderId,
      fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
    });
    if (!configLookupResult.ok) {
      return {
        ok: false,
        error: "config_lookup_failed",
        status: configLookupResult.status || 502,
        details: configLookupResult.details || configLookupResult.error || "unknown_error",
      };
    }

    if (!configLookupResult.found || !configLookupResult.fileId) {
      return {
        ok: true,
        missing: true,
        folderId,
        fileId: "",
        remoteState: null,
        dataFilesLoaded: 0,
      };
    }

    resolvedConfigFileId = configLookupResult.fileId;
    const readByLookupResult = await readDriveJsonFileById({
      accessToken,
      fileId: resolvedConfigFileId,
    });
    if (!readByLookupResult.ok) {
      return readByLookupResult;
    }
    readConfigResult = readByLookupResult;
  }

  const extractedBootstrapBundle = extractBootstrapBundleFromPersistedConfig(readConfigResult.payload);
  if (!extractedBootstrapBundle) {
    return {
      ok: false,
      error: "invalid_persisted_config",
      status: 502,
      details: {
        message: "justcalendar.json is missing required account/calendar structure.",
      },
    };
  }

  const responseCalendars = extractedBootstrapBundle.calendars.map((calendar) => ({
    id: calendar.id,
    name: calendar.name,
    type: calendar.type,
    color: normalizeBootstrapCalendarColor(calendar.color),
    pinned: normalizeBootstrapCalendarPinned(calendar.pinned),
    ...(calendar.type === "score" && calendar.display
      ? { display: normalizeBootstrapScoreDisplay(calendar.display) }
      : {}),
    "data-file": calendar.dataFile,
    ...(calendar.dataFileId ? { "data-file-id": normalizeDriveFileId(calendar.dataFileId) } : {}),
  }));

  const remoteLoadResult = await loadJustCalendarDataFiles({
    accessToken,
    folderId,
    calendars: responseCalendars.map((calendar) => ({
      id: calendar.id,
      name: calendar.name,
      type: calendar.type,
      dataFile: calendar["data-file"],
      dataFileId: calendar["data-file-id"],
    })),
  });
  if (!remoteLoadResult.ok) {
    return remoteLoadResult;
  }

  const resolvedCalendarFileIds = isObjectRecord(remoteLoadResult.resolvedFileIdsByCalendarId)
    ? remoteLoadResult.resolvedFileIdsByCalendarId
    : {};
  const withResolvedFileIdCalendars = responseCalendars.map((calendar) => {
    if (!isObjectRecord(calendar)) {
      return calendar;
    }
    const calendarId = normalizeIncomingCalendarId(calendar.id);
    const resolvedFileId = normalizeDriveFileId(
      calendarId ? resolvedCalendarFileIds[calendarId] : "",
    );
    if (!resolvedFileId) {
      return calendar;
    }
    return {
      ...calendar,
      "data-file-id": resolvedFileId,
    };
  });

  const configFileIdInjection = injectDataFileIdsIntoConfigPayload(readConfigResult.payload, {
    accountId: extractedBootstrapBundle.accountId,
    resolvedFileIdsByCalendarId: resolvedCalendarFileIds,
  });
  if (configFileIdInjection.updated && resolvedConfigFileId) {
    const updateConfigFileResult = await updateDriveJsonFileById({
      accessToken,
      fileId: resolvedConfigFileId,
      payload: configFileIdInjection.payload,
    });
    if (updateConfigFileResult.ok) {
      readConfigResult = {
        ...readConfigResult,
        payload: configFileIdInjection.payload,
      };
    }
  }

  const firstCalendarId = responseCalendars.length > 0 ? responseCalendars[0].id || "" : "";
  const requestedCurrentCalendarId = normalizeIncomingCalendarId(
    extractedBootstrapBundle.currentCalendarId,
  );
  const selectedTheme = normalizeBootstrapTheme(extractedBootstrapBundle.selectedTheme);
  const activeCalendarId =
    requestedCurrentCalendarId &&
    responseCalendars.some((calendar) => calendar.id === requestedCurrentCalendarId)
      ? requestedCurrentCalendarId
      : firstCalendarId;

  const latestState = readStoredAuthState();
  writeStoredAuthState({
    ...latestState,
    driveFolderId: folderId || latestState.driveFolderId || "",
    configFileId: resolvedConfigFileId || latestState.configFileId || "",
    updatedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    missing: false,
    folderId,
    fileId: resolvedConfigFileId || "",
    accountId: extractedBootstrapBundle.accountId || "",
    account: extractedBootstrapBundle.accountName || DEFAULT_BOOTSTRAP_ACCOUNT_NAME,
    currentCalendarId: activeCalendarId,
    selectedTheme,
    calendars: withResolvedFileIdCalendars,
    remoteState: {
      version: 1,
      activeCalendarId,
      selectedTheme,
      calendars: withResolvedFileIdCalendars,
      dayStatesByCalendarId: isObjectRecord(remoteLoadResult.dayStatesByCalendarId)
        ? remoteLoadResult.dayStatesByCalendarId
        : {},
    },
    dataFilesLoaded: withResolvedFileIdCalendars.length,
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
        configFileId: "",
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
      configFileId: hasDriveScope ? existingState.configFileId || "" : "",
      updatedAt: new Date().toISOString(),
    });

    // Intentionally skip config bootstrap in callback.
    // Frontend bootstrap endpoint call provides full local calendar payload.

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
      driveConfigReady: hasIdentitySession ? Boolean(storedState.configFileId) : false,
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

  const handleBootstrapConfig = async (req, res) => {
    if (!ensureGoogleOAuthConfigured(googleConfig, res)) {
      return;
    }

    let bootstrapRequestPayload = {};
    try {
      bootstrapRequestPayload = await readJsonRequestBody(req);
    } catch (error) {
      jsonResponse(res, 400, {
        ok: false,
        error: "invalid_bootstrap_payload",
        details: error instanceof Error ? error.message : "unknown_error",
      });
      return;
    }

    const tokenStateResult = await ensureValidAccessToken({ config: googleConfig });
    if (!tokenStateResult.ok) {
      jsonResponse(res, tokenStateResult.status, {
        ok: false,
        ...(tokenStateResult.payload || {
          error: "not_connected",
          message: "Google Drive is not connected.",
        }),
      });
      return;
    }

    const stateWithToken = tokenStateResult.state;
    if (!hasGoogleScope(stateWithToken.scope, GOOGLE_DRIVE_FILE_SCOPE)) {
      jsonResponse(res, 403, {
        ok: false,
        error: "missing_drive_scope",
        details: {
          message:
            "Current Google token does not include drive.file scope. Reconnect and approve Google Drive access.",
        },
      });
      return;
    }

    const bootstrapBundle = buildJustCalendarBootstrapBundle(bootstrapRequestPayload);

    const ensureConfigResult = await ensureJustCalendarConfigForCurrentConnection({
      accessToken: stateWithToken.accessToken,
      config: googleConfig,
      bootstrapBundle,
    });
    if (!ensureConfigResult.ok) {
      jsonResponse(res, Number(ensureConfigResult.status) || 502, {
        ok: false,
        error: ensureConfigResult.error || "ensure_config_failed",
        details: ensureConfigResult.details || null,
      });
      return;
    }

    jsonResponse(res, 200, {
      ok: true,
      created: Boolean(ensureConfigResult.created),
      configSource:
        typeof ensureConfigResult.configSource === "string"
          ? ensureConfigResult.configSource
          : ensureConfigResult.created
            ? "created"
            : "existing",
      folderId: ensureConfigResult.folderId || "",
      fileId: ensureConfigResult.fileId || "",
      fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
      accountId: ensureConfigResult.accountId || bootstrapBundle.accountId || "",
      account: ensureConfigResult.account || bootstrapBundle.accountName || DEFAULT_BOOTSTRAP_ACCOUNT_NAME,
      currentCalendarId:
        ensureConfigResult.currentCalendarId || bootstrapBundle.currentCalendarId || "",
      selectedTheme:
        ensureConfigResult.selectedTheme ||
        bootstrapBundle.selectedTheme ||
        DEFAULT_BOOTSTRAP_THEME,
      calendars: Array.isArray(ensureConfigResult.calendars)
        ? ensureConfigResult.calendars
        : bootstrapBundle.calendars.map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            type: calendar.type,
            color: normalizeBootstrapCalendarColor(calendar.color),
            pinned: normalizeBootstrapCalendarPinned(calendar.pinned),
            ...(calendar.type === "score" && calendar.display
              ? { display: normalizeBootstrapScoreDisplay(calendar.display) }
              : {}),
            "data-file": calendar.dataFile,
            ...(calendar.dataFileId ? { "data-file-id": normalizeDriveFileId(calendar.dataFileId) } : {}),
          })),
      remoteState: isObjectRecord(ensureConfigResult.remoteState)
        ? ensureConfigResult.remoteState
        : null,
      dataFilesCreated: Number(ensureConfigResult.dataFilesCreated) || 0,
      dataFiles: Array.isArray(ensureConfigResult.dataFiles) ? ensureConfigResult.dataFiles : [],
    });
  };

  const handleSaveState = async (req, res) => {
    if (!ensureGoogleOAuthConfigured(googleConfig, res)) {
      return;
    }

    let saveRequestPayload = {};
    try {
      saveRequestPayload = await readJsonRequestBody(req);
    } catch (error) {
      jsonResponse(res, 400, {
        ok: false,
        error: "invalid_save_payload",
        details: error instanceof Error ? error.message : "unknown_error",
      });
      return;
    }

    const tokenStateResult = await ensureValidAccessToken({ config: googleConfig });
    if (!tokenStateResult.ok) {
      jsonResponse(res, tokenStateResult.status, {
        ok: false,
        ...(tokenStateResult.payload || {
          error: "not_connected",
          message: "Google Drive is not connected.",
        }),
      });
      return;
    }

    const stateWithToken = tokenStateResult.state;
    if (!hasGoogleScope(stateWithToken.scope, GOOGLE_DRIVE_FILE_SCOPE)) {
      jsonResponse(res, 403, {
        ok: false,
        error: "missing_drive_scope",
        details: {
          message:
            "Current Google token does not include drive.file scope. Reconnect and approve Google Drive access.",
        },
      });
      return;
    }

    const bootstrapBundle = buildJustCalendarBootstrapBundle(saveRequestPayload);
    const saveResult = await saveJustCalendarStateForCurrentConnection({
      accessToken: stateWithToken.accessToken,
      config: googleConfig,
      bootstrapBundle,
    });
    if (!saveResult.ok) {
      jsonResponse(res, Number(saveResult.status) || 502, {
        ok: false,
        error: saveResult.error || "save_state_failed",
        details: saveResult.details || null,
      });
      return;
    }

    jsonResponse(res, 200, {
      ok: true,
      created: Boolean(saveResult.created),
      configSource:
        typeof saveResult.configSource === "string"
          ? saveResult.configSource
          : saveResult.created
            ? "created"
            : "updated",
      folderId: saveResult.folderId || "",
      fileId: saveResult.fileId || "",
      fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
      accountId: saveResult.accountId || bootstrapBundle.accountId || "",
      account: saveResult.account || bootstrapBundle.accountName || DEFAULT_BOOTSTRAP_ACCOUNT_NAME,
      currentCalendarId: saveResult.currentCalendarId || bootstrapBundle.currentCalendarId || "",
      selectedTheme: saveResult.selectedTheme || bootstrapBundle.selectedTheme || DEFAULT_BOOTSTRAP_THEME,
      calendars: Array.isArray(saveResult.calendars)
        ? saveResult.calendars
        : bootstrapBundle.calendars.map((calendar) => ({
            id: calendar.id,
            name: calendar.name,
            type: calendar.type,
            color: normalizeBootstrapCalendarColor(calendar.color),
            pinned: normalizeBootstrapCalendarPinned(calendar.pinned),
            ...(calendar.type === "score" && calendar.display
              ? { display: normalizeBootstrapScoreDisplay(calendar.display) }
              : {}),
            "data-file": calendar.dataFile,
            ...(calendar.dataFileId ? { "data-file-id": normalizeDriveFileId(calendar.dataFileId) } : {}),
          })),
      remoteState: isObjectRecord(saveResult.remoteState) ? saveResult.remoteState : null,
      dataFilesSaved: Number(saveResult.dataFilesSaved) || 0,
      dataFilesCreated: Number(saveResult.dataFilesCreated) || 0,
      dataFiles: Array.isArray(saveResult.dataFiles) ? saveResult.dataFiles : [],
    });
  };

  const handleSaveCurrentCalendarState = async (req, res) => {
    if (!ensureGoogleOAuthConfigured(googleConfig, res)) {
      return;
    }

    let saveRequestPayload = {};
    try {
      saveRequestPayload = await readJsonRequestBody(req);
    } catch (error) {
      jsonResponse(res, 400, {
        ok: false,
        error: "invalid_save_payload",
        details: error instanceof Error ? error.message : "unknown_error",
      });
      return;
    }

    const tokenStateResult = await ensureValidAccessToken({ config: googleConfig });
    if (!tokenStateResult.ok) {
      jsonResponse(res, tokenStateResult.status, {
        ok: false,
        ...(tokenStateResult.payload || {
          error: "not_connected",
          message: "Google Drive is not connected.",
        }),
      });
      return;
    }

    const stateWithToken = tokenStateResult.state;
    if (!hasGoogleScope(stateWithToken.scope, GOOGLE_DRIVE_FILE_SCOPE)) {
      jsonResponse(res, 403, {
        ok: false,
        error: "missing_drive_scope",
        details: {
          message:
            "Current Google token does not include drive.file scope. Reconnect and approve Google Drive access.",
        },
      });
      return;
    }

    const bootstrapBundle = buildJustCalendarBootstrapBundle(saveRequestPayload);
    const saveResult = await saveCurrentCalendarStateForCurrentConnection({
      accessToken: stateWithToken.accessToken,
      config: googleConfig,
      bootstrapBundle,
    });
    if (!saveResult.ok) {
      jsonResponse(res, Number(saveResult.status) || 502, {
        ok: false,
        error: saveResult.error || "save_current_calendar_failed",
        details: saveResult.details || null,
      });
      return;
    }

    jsonResponse(res, 200, {
      ok: true,
      created: Boolean(saveResult.created),
      folderId: saveResult.folderId || "",
      fileId: saveResult.fileId || "",
      fileName: saveResult.dataFile || "",
      accountId: saveResult.accountId || bootstrapBundle.accountId || "",
      account: saveResult.account || bootstrapBundle.accountName || DEFAULT_BOOTSTRAP_ACCOUNT_NAME,
      currentCalendarId: saveResult.currentCalendarId || bootstrapBundle.currentCalendarId || "",
      calendar: isObjectRecord(saveResult.calendar) ? saveResult.calendar : null,
    });
  };

  const handleLoadState = async (res) => {
    if (!ensureGoogleOAuthConfigured(googleConfig, res)) {
      return;
    }

    const tokenStateResult = await ensureValidAccessToken({ config: googleConfig });
    if (!tokenStateResult.ok) {
      jsonResponse(res, tokenStateResult.status, {
        ok: false,
        ...(tokenStateResult.payload || {
          error: "not_connected",
          message: "Google Drive is not connected.",
        }),
      });
      return;
    }

    const stateWithToken = tokenStateResult.state;
    if (!hasGoogleScope(stateWithToken.scope, GOOGLE_DRIVE_FILE_SCOPE)) {
      jsonResponse(res, 403, {
        ok: false,
        error: "missing_drive_scope",
        details: {
          message:
            "Current Google token does not include drive.file scope. Reconnect and approve Google Drive access.",
        },
      });
      return;
    }

    const loadResult = await loadJustCalendarStateForCurrentConnection({
      accessToken: stateWithToken.accessToken,
      config: googleConfig,
    });
    if (!loadResult.ok) {
      jsonResponse(res, Number(loadResult.status) || 502, {
        ok: false,
        error: loadResult.error || "load_state_failed",
        details: loadResult.details || null,
      });
      return;
    }

    jsonResponse(res, 200, {
      ok: true,
      missing: Boolean(loadResult.missing),
      folderId: loadResult.folderId || "",
      fileId: loadResult.fileId || "",
      fileName: JUSTCALENDAR_CONFIG_FILE_NAME,
      accountId: loadResult.accountId || "",
      account: loadResult.account || DEFAULT_BOOTSTRAP_ACCOUNT_NAME,
      currentCalendarId: loadResult.currentCalendarId || "",
      selectedTheme: loadResult.selectedTheme || DEFAULT_BOOTSTRAP_THEME,
      calendars: Array.isArray(loadResult.calendars) ? loadResult.calendars : [],
      remoteState: isObjectRecord(loadResult.remoteState) ? loadResult.remoteState : null,
      dataFilesLoaded: Number(loadResult.dataFilesLoaded) || 0,
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

        if (requestUrl.pathname === "/api/auth/google/bootstrap-config") {
          if (req.method !== "POST") {
            methodNotAllowed(res);
            return;
          }
          await handleBootstrapConfig(req, res);
          return;
        }

        if (requestUrl.pathname === "/api/auth/google/save-state") {
          if (req.method !== "POST") {
            methodNotAllowed(res);
            return;
          }
          await handleSaveState(req, res);
          return;
        }

        if (requestUrl.pathname === "/api/auth/google/save-current-calendar-state") {
          if (req.method !== "POST") {
            methodNotAllowed(res);
            return;
          }
          await handleSaveCurrentCalendarState(req, res);
          return;
        }

        if (requestUrl.pathname === "/api/auth/google/load-state") {
          if (req.method !== "POST") {
            methodNotAllowed(res);
            return;
          }
          await handleLoadState(res);
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

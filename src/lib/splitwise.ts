import { SPLITWISE_API_URL } from "~/constant";

export const RESOURCES = ["current_user", "friends", "groups", "expenses"] as const;
export type Resource = (typeof RESOURCES)[number];

// Small enough that one page stays well within a serverless function's time limit.
export const EXPENSES_PAGE_SIZE = 500;

export type DownloadRequest = {
  apiKey: string;
  resource: Resource;
  offset?: number;
  groupId?: number;
};

export type ErrorCode = "bad_request" | "unauthorized" | "rate_limited" | "splitwise_error";

export type DownloadResult =
  | { ok: true; data: unknown }
  | { ok: false; status: number; code: ErrorCode; error: string };

export const UNAUTHORIZED_MESSAGE =
  "Splitwise didn't accept this API key. Check that you copied the whole key. Splitwise may also require a Splitwise Pro subscription to use its API.";

const getApiUrl = () => process.env.SPLITWISE_API_URL || SPLITWISE_API_URL;

const isNonNegativeInteger = (value: unknown): value is number =>
  "number" === typeof value && Number.isSafeInteger(value) && 0 <= value;

/** Validates the browser's request. Returns an error message, or null when it is valid. */
export const validateRequest = (body: unknown): DownloadRequest | string => {
  if (!body || "object" !== typeof body) {
    return "Invalid request.";
  }
  const { apiKey, resource, offset, groupId } = body as Record<string, unknown>;

  if ("string" !== typeof apiKey || !apiKey.trim() || 500 < apiKey.length) {
    return "API key is required.";
  }
  if (!RESOURCES.includes(resource as Resource)) {
    return "Unknown resource.";
  }
  if (undefined !== offset && (!isNonNegativeInteger(offset) || 10_000_000 < offset)) {
    return "Invalid offset.";
  }
  if (undefined !== groupId && !isNonNegativeInteger(groupId)) {
    return "Invalid group.";
  }

  return { apiKey: apiKey.trim(), resource: resource as Resource, offset, groupId };
};

const getPath = ({ resource, offset, groupId }: DownloadRequest) => {
  if ("expenses" !== resource) {
    return `/get_${resource}`;
  }

  const params = new URLSearchParams({
    limit: String(EXPENSES_PAGE_SIZE),
    offset: String(offset ?? 0),
  });
  if (undefined !== groupId) {
    params.set("group_id", String(groupId));
  }
  return `/get_expenses?${params.toString()}`;
};

/** The field each endpoint returns its data in. */
const RESPONSE_FIELDS: Record<Resource, string> = {
  current_user: "user",
  friends: "friends",
  groups: "groups",
  expenses: "expenses",
};

/**
 * Fetches one resource (or one page of expenses) from Splitwise. Never logs or returns the key.
 */
export const downloadResource = async (
  request: DownloadRequest,
  fetchImpl: typeof fetch = fetch,
): Promise<DownloadResult> => {
  let response: Response;
  try {
    response = await fetchImpl(`${getApiUrl()}${getPath(request)}`, {
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${request.apiKey}`,
      },
      cache: "no-store",
    });
  } catch {
    return {
      ok: false,
      status: 502,
      code: "splitwise_error",
      error: "Couldn't reach Splitwise. Please try again.",
    };
  }

  if (401 === response.status || 403 === response.status) {
    return { ok: false, status: response.status, code: "unauthorized", error: UNAUTHORIZED_MESSAGE };
  }
  if (429 === response.status) {
    return {
      ok: false,
      status: 429,
      code: "rate_limited",
      error: "Splitwise is limiting requests. Please wait a minute and try again.",
    };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: 502,
      code: "splitwise_error",
      error: `Splitwise returned an error (${response.status}) for ${request.resource.replace("_", " ")}. Please try again.`,
    };
  }

  let json: unknown;
  try {
    json = await response.json();
  } catch {
    return {
      ok: false,
      status: 502,
      code: "splitwise_error",
      error: "Splitwise returned an unexpected response. Please try again.",
    };
  }

  const field = RESPONSE_FIELDS[request.resource];
  const data = json && "object" === typeof json ? (json as Record<string, unknown>)[field] : undefined;
  const isValid = "current_user" === request.resource ? !!data && "object" === typeof data : Array.isArray(data);

  if (!isValid) {
    return {
      ok: false,
      status: 502,
      code: "splitwise_error",
      error: "Splitwise returned an unexpected response. Please try again.",
    };
  }

  return { ok: true, data };
};

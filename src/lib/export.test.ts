import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";

import { POST } from "~/app/api/download/route";
import { EXPORT_VERSION, ExportError, exportSplitwise, type Requester } from "./export";
import {
  EXPENSES_PAGE_SIZE,
  UNAUTHORIZED_MESSAGE,
  downloadResource,
  validateRequest,
} from "./splitwise";

const API_KEY = "sw-test-key-0123456789";

// Shapes follow https://github.com/splitwise/api-docs/blob/main/splitwise.yaml
const currentUser = { id: 1, first_name: "Ada", last_name: null, email: "ada@example.com" };
const friends = [
  {
    id: 2,
    first_name: "Bo",
    last_name: "Lee",
    email: "bo@example.com",
    registration_status: "confirmed",
    balance: [{ currency_code: "USD", amount: "12.5" }],
    groups: [{ group_id: 10, balance: [{ currency_code: "USD", amount: "12.5" }] }],
  },
];
const groups = [
  { id: 0, name: "Non-group expenses", members: [] },
  { id: 10, name: "Flat", members: [currentUser, friends[0]], original_debts: [] },
];
const expense = (id: number, groupId: number | null, extra: object = {}) => ({
  id,
  group_id: groupId,
  description: `Expense ${id}`,
  payment: false,
  cost: "10.0",
  currency_code: "USD",
  date: "2024-01-01T00:00:00Z",
  deleted_at: null,
  users: [],
  repayments: [],
  ...extra,
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const noWait = () => Promise.resolve();

afterEach(() => {
  mock.restoreAll();
});

describe("validateRequest", () => {
  it("accepts a page of a group's expenses", () => {
    assert.deepEqual(
      validateRequest({ apiKey: ` ${API_KEY} `, resource: "expenses", offset: 500, groupId: 10 }),
      { apiKey: API_KEY, resource: "expenses", offset: 500, groupId: 10 }
    );
  });

  it("rejects a missing key, unknown resources and invalid paging", () => {
    assert.equal(validateRequest({ resource: "friends" }), "API key is required.");
    assert.equal(validateRequest({ apiKey: API_KEY, resource: "get_user" }), "Unknown resource.");
    assert.equal(
      validateRequest({ apiKey: API_KEY, resource: "expenses", offset: -1 }),
      "Invalid offset."
    );
    assert.equal(
      validateRequest({ apiKey: API_KEY, resource: "expenses", groupId: "10&x=1" }),
      "Invalid group."
    );
  });
});

describe("downloadResource", () => {
  it("fetches one page of expenses with the key as a bearer token", async () => {
    const fetchMock = mock.fn(async (..._args: Parameters<typeof fetch>) =>
      json(200, { expenses: [expense(1, 10)] })
    );

    const result = await downloadResource(
      { apiKey: API_KEY, resource: "expenses", offset: 1000, groupId: 10 },
      fetchMock as unknown as typeof fetch
    );

    assert.deepEqual(result, { ok: true, data: [expense(1, 10)] });
    const [url, init] = fetchMock.mock.calls[0]!.arguments;
    assert.equal(
      url,
      `https://secure.splitwise.com/api/v3.0/get_expenses?limit=${EXPENSES_PAGE_SIZE}&offset=1000&group_id=10`
    );
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${API_KEY}`);
  });

  for (const status of [401, 403]) {
    it(`explains a rejected key on ${status}, mentioning Splitwise Pro`, async () => {
      const result = await downloadResource(
        { apiKey: API_KEY, resource: "current_user" },
        (async () => json(status, { error: "Invalid API request: you are not logged in" })) as typeof fetch
      );

      assert.deepEqual(result, {
        ok: false,
        status,
        code: "unauthorized",
        error: UNAUTHORIZED_MESSAGE,
      });
      assert.match(UNAUTHORIZED_MESSAGE, /Splitwise Pro/);
    });
  }

  it("reports rate limits, server errors, network errors and unexpected bodies", async () => {
    const request = { apiKey: API_KEY, resource: "friends" as const };

    const limited = await downloadResource(request, (async () => json(429, {})) as typeof fetch);
    assert.equal(limited.ok || limited.code, "rate_limited");

    const failed = await downloadResource(request, (async () => json(500, {})) as typeof fetch);
    assert.equal(failed.ok || failed.status, 502);
    assert.match(failed.ok ? "" : failed.error, /\(500\)/);

    const offline = await downloadResource(request, (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch);
    assert.equal(offline.ok || offline.code, "splitwise_error");

    const unexpected = await downloadResource(
      request,
      (async () => json(200, { friends: "nope" })) as typeof fetch
    );
    assert.equal(unexpected.ok || unexpected.code, "splitwise_error");
  });
});

/** A fake download API backed by in-memory Splitwise data. */
const createRequester = (
  allExpenses: ReturnType<typeof expense>[],
  groupExpenses: Record<number, ReturnType<typeof expense>[]>
) => {
  const calls: Parameters<Requester>[0][] = [];
  const requester: Requester = async (request) => {
    calls.push(request);
    if ("current_user" === request.resource) {
      return { status: 200, body: { data: currentUser } };
    }
    if ("friends" === request.resource) {
      return { status: 200, body: { data: friends } };
    }
    if ("groups" === request.resource) {
      return { status: 200, body: { data: groups } };
    }
    const source = undefined === request.groupId ? allExpenses : groupExpenses[request.groupId] ?? [];
    const offset = request.offset ?? 0;
    return { status: 200, body: { data: source.slice(offset, offset + EXPENSES_PAGE_SIZE) } };
  };
  return { requester, calls };
};

describe("exportSplitwise", () => {
  it("pages through every expense, adds each group's expenses and removes duplicates", async () => {
    // 1,010 of the user's expenses; the group adds one the user isn't part of (id 5000).
    const mine = Array.from({ length: 1010 }, (_, index) =>
      expense(index + 1, index % 2 ? 10 : null)
    );
    const groupOnly = mine.filter((item) => 10 === item.group_id);
    const { requester, calls } = createRequester(mine, {
      10: [...groupOnly, expense(5000, 10)],
    });

    const file = await exportSplitwise(requester, undefined, noWait);

    assert.equal(file.version, EXPORT_VERSION);
    assert.equal(file.version, 2);
    assert.deepEqual(file.currentUser, currentUser);
    assert.deepEqual(file.friends, friends);
    assert.deepEqual(file.groups, groups);
    assert.equal(file.expenses.length, 1011);
    assert.equal(new Set(file.expenses.map((item) => item.id)).size, 1011);
    assert.ok(file.expenses.some((item) => 5000 === item.id));

    const pages = calls.filter((call) => "expenses" === call.resource);
    assert.deepEqual(
      pages.map((call) => [call.groupId, call.offset]),
      [
        [undefined, 0],
        [undefined, 500],
        [undefined, 1000],
        [10, 0],
        [10, 500],
      ]
    );
    // Group 0 is the list of expenses without a group, not a real group.
    assert.ok(!pages.some((call) => 0 === call.groupId));
  });

  it("keeps deleted expenses, marked by deleted_at", async () => {
    const deleted = expense(7, 10, { deleted_at: "2024-02-01T00:00:00Z" });
    const { requester } = createRequester([expense(6, null), deleted], { 10: [deleted] });

    const file = await exportSplitwise(requester, undefined, noWait);

    assert.deepEqual(
      file.expenses.find((item) => 7 === item.id),
      deleted
    );
  });

  it("waits and retries when rate limited", async () => {
    const { requester: inner } = createRequester([], {});
    let limited = 2;
    const waits: number[] = [];
    const requester: Requester = async (request) =>
      "friends" === request.resource && 0 < limited--
        ? { status: 429, body: { code: "rate_limited", error: "slow down" } }
        : inner(request);

    const file = await exportSplitwise(requester, undefined, async (ms) => {
      waits.push(ms);
    });

    assert.deepEqual(file.friends, friends);
    assert.deepEqual(waits, [2000, 4000]);
  });

  it("stops with the server's message when the key is rejected", async () => {
    const requester: Requester = async () => ({
      status: 401,
      body: { code: "unauthorized", error: UNAUTHORIZED_MESSAGE },
    });

    await assert.rejects(exportSplitwise(requester, undefined, noWait), (error: unknown) => {
      assert.ok(error instanceof ExportError);
      assert.equal(error.code, "unauthorized");
      assert.equal(error.message, UNAUTHORIZED_MESSAGE);
      return true;
    });
  });
});

describe("POST /api/download", () => {
  const post = (body: unknown) =>
    POST(
      new Request("http://localhost/api/download", {
        method: "POST",
        body: JSON.stringify(body),
      })
    );

  it("returns one resource and never echoes or logs the key", async () => {
    const fetchMock = mock.method(globalThis, "fetch", async () => json(200, { user: currentUser }));
    const logs = ["log", "info", "warn", "error", "debug"].map((method) =>
      mock.method(console, method as "log", () => undefined)
    );

    const response = await post({ apiKey: API_KEY, resource: "current_user" });

    assert.equal(response.status, 200);
    const text = await response.text();
    assert.deepEqual(JSON.parse(text), { data: currentUser });
    assert.ok(!text.includes(API_KEY));
    assert.equal(fetchMock.mock.callCount(), 1);
    logs.forEach((log) => {
      log.mock.calls.forEach((call) => {
        assert.ok(!JSON.stringify(call.arguments).includes(API_KEY));
      });
    });
  });

  it("passes on a rejected key as 401 with a helpful message", async () => {
    mock.method(globalThis, "fetch", async () => json(401, { error: "not logged in" }));

    const response = await post({ apiKey: API_KEY, resource: "expenses", offset: 0 });

    assert.equal(response.status, 401);
    const body = await response.text();
    assert.deepEqual(JSON.parse(body), { code: "unauthorized", error: UNAUTHORIZED_MESSAGE });
    assert.ok(!body.includes(API_KEY));
  });

  it("still answers the old request shape with friends and groups", async () => {
    mock.method(globalThis, "fetch", async (url: string) =>
      url.endsWith("/get_friends") ? json(200, { friends }) : json(200, { groups })
    );

    const response = await post({ apiKey: API_KEY });

    assert.deepEqual(await response.json(), { friends, groups });
  });

  it("rejects invalid requests", async () => {
    const response = await post({ apiKey: API_KEY, resource: "expenses", offset: "1; drop" });

    assert.equal(response.status, 400);
  });
});

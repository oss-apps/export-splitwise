import { EXPENSES_PAGE_SIZE, type DownloadRequest } from "./splitwise";

export const EXPORT_VERSION = 2;

// Far more than any real account, so a misbehaving response can't page forever.
const MAX_PAGES = 2_000;
const MAX_ATTEMPTS = 5;

type SplitwiseObject = Record<string, unknown> & { id?: unknown };

export type ExportFile = {
  version: typeof EXPORT_VERSION;
  exportedAt: string;
  currentUser: SplitwiseObject;
  friends: SplitwiseObject[];
  groups: SplitwiseObject[];
  /** Every expense, deleted ones included (they have `deleted_at` set). */
  expenses: SplitwiseObject[];
};

export type Progress = { step: string; expenses: number };

/** Calls the download API once. Resolves with the response status and JSON body. */
export type Requester = (
  request: Omit<DownloadRequest, "apiKey">,
) => Promise<{ status: number; body: unknown }>;

export class ExportError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getError = (body: unknown) => {
  const { error, code } = (body && "object" === typeof body ? body : {}) as {
    error?: unknown;
    code?: unknown;
  };
  return new ExportError(
    "string" === typeof error ? error : "Failed to fetch data. Please try again.",
    "string" === typeof code ? code : "unknown",
  );
};

const fetchData = async (
  requester: Requester,
  request: Omit<DownloadRequest, "apiKey">,
  wait: (ms: number) => Promise<unknown>,
) => {
  for (let attempt = 1; ; attempt++) {
    let response: { status: number; body: unknown };
    try {
      response = await requester(request);
    } catch {
      if (MAX_ATTEMPTS <= attempt) {
        throw new ExportError("Couldn't reach the server. Check your connection and try again.", "network");
      }
      await wait(1_000 * attempt);
      continue;
    }

    if (200 === response.status) {
      return (response.body as { data: unknown }).data;
    }

    // Splitwise asks to slow down and retry after a short delay.
    if (429 === response.status && attempt < MAX_ATTEMPTS) {
      await wait(2_000 * 2 ** (attempt - 1));
      continue;
    }

    throw getError(response.body);
  }
};

const fetchExpensePages = async (
  requester: Requester,
  groupId: number | undefined,
  onPage: (page: SplitwiseObject[]) => void,
  wait: (ms: number) => Promise<unknown>,
) => {
  for (let page = 0; page < MAX_PAGES; page++) {
    const expenses = (await fetchData(
      requester,
      { resource: "expenses", offset: page * EXPENSES_PAGE_SIZE, groupId },
      wait,
    )) as SplitwiseObject[];
    onPage(expenses);

    if (expenses.length < EXPENSES_PAGE_SIZE) {
      return;
    }
  }

  throw new ExportError("Too many expenses to export.", "too_many");
};

/**
 * Downloads everything the importer needs, one request per resource or page of expenses.
 *
 * The plain expense list is "the current user's expenses". To be sure a group's history includes
 * expenses the user isn't part of (group balances depend on them), each group is listed again
 * with `group_id`, and expenses are de-duplicated by id.
 */
export const exportSplitwise = async (
  requester: Requester,
  onProgress: (progress: Progress) => void = () => undefined,
  wait: (ms: number) => Promise<unknown> = sleep,
): Promise<ExportFile> => {
  const expenses = new Map<unknown, SplitwiseObject>();
  const report = (step: string) => onProgress({ step, expenses: expenses.size });
  const addPage = (step: string) => (page: SplitwiseObject[]) => {
    page.forEach((expense) => {
      if (!expenses.has(expense.id)) {
        expenses.set(expense.id, expense);
      }
    });
    report(step);
  };

  report("Fetching your account");
  const currentUser = (await fetchData(requester, { resource: "current_user" }, wait)) as SplitwiseObject;
  report("Fetching friends");
  const friends = (await fetchData(requester, { resource: "friends" }, wait)) as SplitwiseObject[];
  report("Fetching groups");
  const groups = (await fetchData(requester, { resource: "groups" }, wait)) as SplitwiseObject[];

  await fetchExpensePages(requester, undefined, addPage("Fetching expenses"), wait);

  // Group 0 holds expenses without a group, which the plain list already covers.
  const groupIds = groups
    .map((group) => group.id)
    .filter((id): id is number => "number" === typeof id && 0 !== id);
  for (let index = 0; index < groupIds.length; index++) {
    const groupId = groupIds[index];
    await fetchExpensePages(
      requester,
      groupId,
      addPage(`Fetching group expenses (${index + 1} of ${groupIds.length})`),
      wait,
    );
  }

  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    currentUser,
    friends,
    groups,
    expenses: Array.from(expenses.values()),
  };
};

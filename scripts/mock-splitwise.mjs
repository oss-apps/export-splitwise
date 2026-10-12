// A local stand-in for the Splitwise API, for checking the exporter without a Splitwise account.
//
//   node scripts/mock-splitwise.mjs [data.json]
//   SPLITWISE_API_URL=http://localhost:4010/api/v3.0 pnpm dev
//
// Then use the API key "test-key" on the page. Any other key gets a 401. The data file has
// { currentUser, friends, groups, expenses } in Splitwise's API shapes; without one, a small
// example account is served.
import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 4010);
const API_KEY = "test-key";

const user = (id, first_name, email) => ({
  id,
  first_name,
  last_name: null,
  email,
  registration_status: "confirmed",
  picture: { small: "", medium: "", large: "" },
});
const share = (user_id, paid_share, owed_share) => ({
  user_id,
  paid_share,
  owed_share,
  net_balance: (Number(paid_share) - Number(owed_share)).toFixed(2),
});

const ada = user(1, "Ada", "ada@example.com");
const bo = user(2, "Bo", "bo@example.com");
const cy = user(3, "Cy", "cy@example.com");

const exampleData = {
  currentUser: ada,
  friends: [
    {
      ...bo,
      balance: [{ currency_code: "USD", amount: "10.0" }],
      groups: [{ group_id: 10, balance: [{ currency_code: "USD", amount: "10.0" }] }],
    },
    {
      ...cy,
      balance: [{ currency_code: "USD", amount: "10.0" }],
      groups: [{ group_id: 10, balance: [{ currency_code: "USD", amount: "10.0" }] }],
    },
  ],
  groups: [
    {
      id: 10,
      name: "Flat",
      members: [
        { ...ada, balance: [{ currency_code: "USD", amount: "20.0" }] },
        { ...bo, balance: [{ currency_code: "USD", amount: "-5.0" }] },
        { ...cy, balance: [{ currency_code: "USD", amount: "-15.0" }] },
      ],
      original_debts: [
        { from: 2, to: 1, amount: "10.0", currency_code: "USD" },
        { from: 3, to: 1, amount: "10.0", currency_code: "USD" },
        { from: 3, to: 2, amount: "5.0", currency_code: "USD" },
      ],
    },
  ],
  expenses: [
    {
      id: 101,
      group_id: 10,
      description: "Groceries",
      payment: false,
      cost: "30.0",
      currency_code: "USD",
      date: "2024-03-01T12:00:00Z",
      deleted_at: null,
      category: { id: 12, name: "Groceries" },
      users: [share(1, "30.0", "10.0"), share(2, "0.0", "10.0"), share(3, "0.0", "10.0")],
      repayments: [
        { from: 2, to: 1, amount: "10.0" },
        { from: 3, to: 1, amount: "10.0" },
      ],
    },
    {
      // Bo and Cy only: listed for the group, not in Ada's own expense list.
      id: 102,
      group_id: 10,
      description: "Taxi",
      payment: false,
      cost: "10.0",
      currency_code: "USD",
      date: "2024-03-02T12:00:00Z",
      deleted_at: null,
      category: { id: 36, name: "Taxi" },
      users: [share(2, "10.0", "5.0"), share(3, "0.0", "5.0")],
      repayments: [{ from: 3, to: 2, amount: "5.0" }],
    },
    {
      id: 103,
      group_id: 10,
      description: "Deleted dinner",
      payment: false,
      cost: "99.0",
      currency_code: "USD",
      date: "2024-03-03T12:00:00Z",
      deleted_at: "2024-03-04T12:00:00Z",
      category: { id: 13, name: "Dining out" },
      users: [share(1, "99.0", "33.0"), share(2, "0.0", "33.0"), share(3, "0.0", "33.0")],
      repayments: [
        { from: 2, to: 1, amount: "33.0" },
        { from: 3, to: 1, amount: "33.0" },
      ],
    },
  ],
};

const data = process.argv[2] ? JSON.parse(readFileSync(process.argv[2], "utf8")) : exampleData;
const involves = (expense, userId) => expense.users.some((item) => item.user_id === userId);

const send = (res, status, body) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
};

createServer((req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  if (`Bearer ${API_KEY}` !== req.headers.authorization) {
    send(res, 401, { error: "Invalid API request: you are not logged in" });
    return;
  }

  switch (url.pathname) {
    case "/api/v3.0/get_current_user":
      send(res, 200, { user: data.currentUser });
      return;
    case "/api/v3.0/get_friends":
      send(res, 200, { friends: data.friends });
      return;
    case "/api/v3.0/get_groups":
      send(res, 200, { groups: data.groups });
      return;
    case "/api/v3.0/get_expenses": {
      const limit = Number(url.searchParams.get("limit") ?? 20);
      const offset = Number(url.searchParams.get("offset") ?? 0);
      const groupId = url.searchParams.get("group_id");
      const expenses = groupId
        ? data.expenses.filter((expense) => String(expense.group_id) === groupId)
        : data.expenses.filter((expense) => involves(expense, data.currentUser.id));
      send(res, 200, { expenses: expenses.slice(offset, offset + limit) });
      return;
    }
    default:
      send(res, 404, { errors: { base: ["Invalid API Request: record not found"] } });
  }
}).listen(PORT, () => {
  console.info(`Mock Splitwise API on http://localhost:${PORT}/api/v3.0 (key: ${API_KEY})`);
});

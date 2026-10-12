# Export Splitwise data

Downloads your Splitwise friends, groups and expenses as one JSON file, using your own Splitwise API key. SplitPro's importer reads this file.

## File format

```jsonc
{
  "version": 2,
  "exportedAt": "2024-01-01T00:00:00.000Z",
  "currentUser": {}, // get_current_user
  "friends": [],     // get_friends, unchanged from version 1
  "groups": [],      // get_groups, unchanged from version 1
  "expenses": []     // get_expenses, every page, deleted expenses included (deleted_at is set)
}
```

Files without `version` are version 1 and only have `friends` and `groups`.

`get_expenses` is documented as "the current user's expenses". So that a group's history also has expenses you aren't part of, each group is listed again with `group_id`, and expenses are de-duplicated by id.

The browser drives the paging: each call to `/api/download` fetches one resource or one page of 500 expenses, so long histories don't run into the hosting time limit. The API key is only sent to Splitwise; it isn't stored or logged.

Splitwise may require a Splitwise Pro subscription to use its API. A rejected key (401 or 403) shows a message saying so.

## Tests

```bash
pnpm test
```

The tests mock `fetch`, so they don't need a Splitwise account.

To try the whole page without one, run the mock Splitwise API and point the app at it:

```bash
node scripts/mock-splitwise.mjs            # serves an example account on port 4010
SPLITWISE_API_URL=http://localhost:4010/api/v3.0 pnpm dev
```

Then enter the API key `test-key` and download. Any other key gets a 401. Pass a JSON file with `{ currentUser, friends, groups, expenses }` to serve your own data.

## Development

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/basic-features/font-optimization) to automatically optimize and load Inter, a custom Google Font.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js/) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/deployment) for more details.

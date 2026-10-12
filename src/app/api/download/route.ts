import { downloadResource, validateRequest, type Resource } from "~/lib/splitwise";

// Each request fetches a single resource or one page of expenses, so it finishes quickly; the
// browser drives the paging. This only gives a slow Splitwise response more room.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const errorResponse = (status: number, code: string, error: string) =>
  Response.json({ code, error }, { status });

const download = async (body: object, resource: Resource) => {
  const request = validateRequest({ ...body, resource });
  if ("string" === typeof request) {
    return { ok: false as const, status: 400, code: "bad_request", error: request };
  }
  return downloadResource(request);
};

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return errorResponse(400, "bad_request", "Invalid request.");
  }

  if (!body || "object" !== typeof body) {
    return errorResponse(400, "bad_request", "Invalid request.");
  }

  // Older versions of the page sent only the key and got friends and groups back.
  if (!("resource" in body)) {
    const friends = await download(body, "friends");
    if (!friends.ok) {
      return errorResponse(friends.status, friends.code, friends.error);
    }
    const groups = await download(body, "groups");
    if (!groups.ok) {
      return errorResponse(groups.status, groups.code, groups.error);
    }
    return Response.json({ friends: friends.data, groups: groups.data });
  }

  const request = validateRequest(body);
  if ("string" === typeof request) {
    return errorResponse(400, "bad_request", request);
  }

  const result = await downloadResource(request);
  if (!result.ok) {
    return errorResponse(result.status, result.code, result.error);
  }

  return Response.json({ data: result.data });
}

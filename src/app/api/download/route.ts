import { SPLITWISE_API_URL } from "~/constant";

export async function POST(req: Request) {
  const body = await req.json(); // No need to call .json()
  const { apiKey } = body;

  const friend_response = await fetch(`${SPLITWISE_API_URL}/get_friends`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!friend_response.ok) {
    return Response.json(
      { error: "Error in getting friends" },
      { status: friend_response.status }
    );
  }

  const group_response = await fetch(`${SPLITWISE_API_URL}/get_groups`, {
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
  });

  if (!group_response.ok) {
    return Response.json(
      { error: "Error in getting groups" },
      { status: group_response.status }
    );
  }

  return Response.json({
    friends: (await friend_response.json()).friends,
    groups: (await group_response.json()).groups,
  });
}

const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, UpdateCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// PATCH /issues/{issueId}
// Body (optional): { "resolved": true }  — defaults to true if omitted.
exports.handler = async (event) => {
  try {
    const issueId = event.pathParameters?.issueId;
    if (!issueId) return respond(400, { error: "issueId is required in the path" });

    let resolved = true;
    if (event.body) {
      try {
        const body = JSON.parse(event.body);
        if (typeof body.resolved === "boolean") resolved = body.resolved;
      } catch {
        // ignore malformed body, default to resolved: true
      }
    }

    await ddb.send(new UpdateCommand({
      TableName: process.env.ISSUES_TABLE,
      Key: { issue_id: issueId },
      UpdateExpression: "SET resolved = :r",
      ExpressionAttributeValues: { ":r": resolved },
      ConditionExpression: "attribute_exists(issue_id)",
    }));

    return respond(200, { issueId, resolved });
  } catch (err) {
    if (err.name === "ConditionalCheckFailedException") {
      return respond(404, { error: "Issue not found" });
    }
    console.error(err);
    return respond(500, { error: "Internal error resolving issue" });
  }
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  };
}

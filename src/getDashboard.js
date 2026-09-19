const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, ScanCommand } = require("@aws-sdk/lib-dynamodb");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// GET /dashboard/{businessId}
// NOTE: uses Scan + filter for hackathon simplicity. Swap to a GSI on
// business_id for anything beyond a demo — Scan doesn't scale.
exports.handler = async (event) => {
  const businessId = event.pathParameters?.businessId;
  if (!businessId) {
    return respond(400, { error: "businessId is required" });
  }

  const [filings, issues] = await Promise.all([
    ddb.send(new ScanCommand({
      TableName: process.env.FILINGS_TABLE,
      FilterExpression: "business_id = :b",
      ExpressionAttributeValues: { ":b": businessId },
    })),
    ddb.send(new ScanCommand({
      TableName: process.env.ISSUES_TABLE,
      FilterExpression: "business_id = :b",
      ExpressionAttributeValues: { ":b": businessId },
    })),
  ]);

  return respond(200, {
    businessId,
    filings: filings.Items || [],
    flaggedIssues: issues.Items || [],
  });
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  };
}

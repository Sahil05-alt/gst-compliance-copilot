const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { SFNClient, StartExecutionCommand } = require("@aws-sdk/client-sfn");
const { randomUUID } = require("crypto");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const sfn = new SFNClient({});

// Expected POST body:
// {
//   "businessId": "BIZ001",
//   "period": "2026-08",
//   "filingType": "GSTR-1",
//   "invoices": [
//     { "invoiceNo": "INV-101", "gstin": "22AAAAA0000A1Z5", "taxableValue": 10000, "taxRate": 18, "hsnCode": "8471" },
//     ...
//   ]
// }
exports.handler = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const { businessId, period, filingType, invoices } = body;

    if (!businessId || !period || !filingType || !Array.isArray(invoices)) {
      return respond(400, { error: "businessId, period, filingType, and invoices[] are required" });
    }

    const filingId = `FIL-${randomUUID()}`;

    await ddb.send(new PutCommand({
      TableName: process.env.FILINGS_TABLE,
      Item: {
        filing_id: filingId,
        business_id: businessId,
        period,
        filing_type: filingType,
        invoices,
        status: "SUBMITTED",
        created_at: new Date().toISOString(),
      },
    }));

    // Kick off the review pipeline asynchronously
    await sfn.send(new StartExecutionCommand({
      stateMachineArn: process.env.STATE_MACHINE_ARN,
      input: JSON.stringify({ filingId, businessId, invoices }),
    }));

    return respond(202, { filingId, status: "SUBMITTED", message: "Filing received, review in progress" });
  } catch (err) {
    console.error(err);
    return respond(500, { error: "Internal error ingesting filing" });
  }
};

function respond(statusCode, body) {
  return {
    statusCode,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
    body: JSON.stringify(body),
  };
}

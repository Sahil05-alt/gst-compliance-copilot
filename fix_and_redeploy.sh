#!/bin/bash
set -e

echo "== Step 1: Rewriting src/bedrockExplain.js to use the Converse API =="
cat > src/bedrockExplain.js << 'EOF'
const { BedrockRuntimeClient, ConverseCommand } = require("@aws-sdk/client-bedrock-runtime");
const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

const bedrock = new BedrockRuntimeClient({});
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

exports.handler = async (event) => {
  const { filingId, businessId, issues } = event;

  const prompt = buildPrompt(issues);

  // Converse API — same request/response shape regardless of which
  // Bedrock model (Claude, Nova, etc.) BEDROCK_MODEL_ID points to.
  const response = await bedrock.send(new ConverseCommand({
    modelId: process.env.BEDROCK_MODEL_ID,
    messages: [
      { role: "user", content: [{ text: prompt }] },
    ],
    inferenceConfig: { maxTokens: 1000, temperature: 0.3 },
  }));

  const explanationText = response.output?.message?.content?.[0]?.text || "";
  const explanations = parseExplanations(explanationText, issues);

  // Store each flagged issue with its explanation
  for (const issue of explanations) {
    await ddb.send(new PutCommand({
      TableName: process.env.ISSUES_TABLE,
      Item: {
        issue_id: `ISS-${randomUUID()}`,
        filing_id: filingId,
        business_id: businessId,
        invoice_no: issue.invoiceNo,
        issue_type: issue.issueType,
        severity: issue.severity,
        detail: issue.detail,
        explanation: issue.explanation,
        suggested_fix: issue.suggestedFix,
        resolved: false,
        created_at: new Date().toISOString(),
      },
    }));
  }

  return { filingId, businessId, flaggedCount: explanations.length };
};

function buildPrompt(issues) {
  return `You are a GST compliance assistant helping a small business owner in India understand filing errors.
For each issue below, write a short plain-language explanation of why it matters and a concrete suggested fix.
Respond ONLY as a JSON array, one object per issue, each with keys: invoiceNo, explanation, suggestedFix.

Issues:
${JSON.stringify(issues, null, 2)}`;
}

function parseExplanations(text, originalIssues) {
  try {
    const cleaned = text.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    return originalIssues.map((issue, i) => ({
      ...issue,
      explanation: parsed[i]?.explanation || "Review this issue with your accountant.",
      suggestedFix: parsed[i]?.suggestedFix || "Correct the flagged field and resubmit.",
    }));
  } catch {
    // Fallback if Bedrock doesn't return clean JSON
    return originalIssues.map((issue) => ({
      ...issue,
      explanation: "This issue was flagged by rule-based checks and needs review.",
      suggestedFix: "Correct the flagged field and resubmit.",
    }));
  }
}
EOF
echo "Done."
echo ""

echo "== Step 2: Finding an available Amazon Nova model ID on Bedrock =="
NOVA_ID=$(aws bedrock list-inference-profiles --region us-east-1 \
  --query "inferenceProfileSummaries[?contains(inferenceProfileId, 'nova-lite')].inferenceProfileId" \
  --output text | head -n1)

if [ -z "$NOVA_ID" ]; then
  echo "Couldn't find a nova-lite profile, trying nova-pro..."
  NOVA_ID=$(aws bedrock list-inference-profiles --region us-east-1 \
    --query "inferenceProfileSummaries[?contains(inferenceProfileId, 'nova-pro')].inferenceProfileId" \
    --output text | head -n1)
fi

if [ -z "$NOVA_ID" ]; then
  echo "ERROR: No Nova model found in your account's inference profiles."
  echo "Open the Bedrock console > Inference profiles, search 'nova', and copy an ID manually."
  echo "Then run: sed -i 's|BEDROCK_MODEL_ID:.*|BEDROCK_MODEL_ID: <paste-id-here>|' template.yaml"
  exit 1
fi

echo "Found: $NOVA_ID"
echo ""

echo "== Step 3: Updating template.yaml =="
sed -i "s|BEDROCK_MODEL_ID:.*|BEDROCK_MODEL_ID: $NOVA_ID|" template.yaml
grep BEDROCK_MODEL_ID template.yaml
echo ""

echo "== Step 4: Building =="
sam build
echo ""

echo "== Step 5: Deploying (will show changeset, confirm with y when prompted) =="
sam deploy
echo ""

echo "== Step 6: Fetching API URL =="
API_URL=$(aws cloudformation describe-stacks --stack-name gst-compliance-copilot \
  --region us-east-1 --query "Stacks[0].Outputs[?OutputKey=='ApiUrl'].OutputValue" --output text)
echo "API URL: $API_URL"
echo ""

echo "== Step 7: Submitting test filing =="
curl -s -X POST "${API_URL}filings" \
  -H "Content-Type: application/json" \
  -d @demo-data/sample_filing.json
echo ""
echo ""

echo "Waiting 20 seconds for the review pipeline to run..."
sleep 20

echo "== Step 8: Fetching dashboard =="
curl -s "${API_URL}dashboard/BIZ001"
echo ""

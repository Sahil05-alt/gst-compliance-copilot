const { DynamoDBClient } = require("@aws-sdk/client-dynamodb");
const { DynamoDBDocumentClient, PutCommand } = require("@aws-sdk/lib-dynamodb");
const { randomUUID } = require("crypto");

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

// Rule-based plain-language explanations — no LLM/Bedrock call needed.
// Zero cost, zero external dependency, works immediately. Swap this back
// to an AI call later (Bedrock or Anthropic API direct) without touching
// anything else in the pipeline — ruleCheck.js and the Step Functions
// wiring stay exactly the same either way.
exports.handler = async (event) => {
  const { filingId, businessId, issues } = event;

  const explanations = issues.map((issue) => ({
    ...issue,
    explanation: EXPLANATION_TEMPLATES[issue.issueType]?.explain(issue) || DEFAULT_EXPLANATION,
    suggestedFix: EXPLANATION_TEMPLATES[issue.issueType]?.fix(issue) || DEFAULT_FIX,
  }));

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

const DEFAULT_EXPLANATION = "This issue was flagged during compliance review and needs a closer look.";
const DEFAULT_FIX = "Review the flagged field, correct it, and resubmit this invoice.";

// One template per issueType from ruleCheck.js. Each returns a short,
// plain-language explanation and a concrete fix, filled in with the
// specific invoice's details.
const EXPLANATION_TEMPLATES = {
  INVALID_GSTIN_FORMAT: {
    explain: (i) =>
      `Invoice ${i.invoiceNo} has a GSTIN ("${i.detail.match(/'([^']+)'/)?.[1] || "?"}") that doesn't match the standard 15-character GST format. This usually means a typo when the number was entered, or the wrong number was used entirely. Filing with an invalid GSTIN can cause this invoice to be rejected by the GST portal.`,
    fix: () =>
      "Double-check the buyer's GSTIN against their GST registration certificate, and re-enter it carefully — the standard format is 2 digits (state code) + 10 characters (PAN) + 1 digit (entity number) + 'Z' + 1 checksum character.",
  },
  DUPLICATE_INVOICE_NUMBER: {
    explain: (i) =>
      `Invoice number ${i.invoiceNo} appears more than once in this filing. GST rules require invoice numbers to be unique within a financial year — duplicates can trigger a mismatch during reconciliation or look like an attempt to claim input tax credit twice.`,
    fix: () =>
      "Check whether this was entered twice by mistake, or whether one of the two invoices actually has a different number. Remove the duplicate or correct the number before filing.",
  },
  INVALID_TAX_RATE: {
    explain: (i) =>
      `Invoice ${i.invoiceNo} uses a tax rate that isn't one of the standard GST slabs (0%, 0.25%, 3%, 5%, 12%, 18%, 28%). This is likely a data entry error, since non-standard rates aren't valid under current GST rules.`,
    fix: () =>
      "Check the HSN/SAC code for this item against the official GST rate schedule and correct the tax rate to the applicable standard slab.",
  },
  INVALID_HSN_CODE: {
    explain: (i) =>
      `Invoice ${i.invoiceNo} has an HSN code that isn't 4, 6, or 8 digits long, which is what GST filings require. An incorrect HSN code can misclassify the goods/services and lead to the wrong tax rate being applied.`,
    fix: () =>
      "Look up the correct HSN code for this product/service (most billing software and the GST portal both have an HSN lookup tool) and update the invoice.",
  },
  INVALID_TAXABLE_VALUE: {
    explain: (i) =>
      `Invoice ${i.invoiceNo} has a taxable value that's missing, zero, or negative. Every invoice needs a positive taxable value for GST to calculate correctly — a negative or missing value usually points to a data entry mistake or an incomplete invoice.`,
    fix: () =>
      "Confirm the actual sale amount for this invoice and enter it as a positive number before filing.",
  },
};

// Rule-based checks — fast, deterministic, no LLM call needed.
// Runs first in the Step Functions pipeline; only flagged filings go to Bedrock.

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
const VALID_TAX_RATES = [0, 0.25, 3, 5, 12, 18, 28];

exports.handler = async (event) => {
  const { filingId, businessId, invoices } = event;
  const issues = [];
  const seenInvoiceNos = new Set();

  for (const inv of invoices) {
    // 1. GSTIN format check
    if (!GSTIN_REGEX.test(inv.gstin || "")) {
      issues.push({
        invoiceNo: inv.invoiceNo,
        issueType: "INVALID_GSTIN_FORMAT",
        severity: "HIGH",
        detail: `GSTIN '${inv.gstin}' does not match the standard 15-character format`,
      });
    }

    // 2. Duplicate invoice number within this filing
    if (seenInvoiceNos.has(inv.invoiceNo)) {
      issues.push({
        invoiceNo: inv.invoiceNo,
        issueType: "DUPLICATE_INVOICE_NUMBER",
        severity: "HIGH",
        detail: `Invoice number '${inv.invoiceNo}' appears more than once in this filing`,
      });
    }
    seenInvoiceNos.add(inv.invoiceNo);

    // 3. Tax rate validity
    if (!VALID_TAX_RATES.includes(inv.taxRate)) {
      issues.push({
        invoiceNo: inv.invoiceNo,
        issueType: "INVALID_TAX_RATE",
        severity: "MEDIUM",
        detail: `Tax rate ${inv.taxRate}% is not a standard GST slab (0, 0.25, 3, 5, 12, 18, 28)`,
      });
    }

    // 4. HSN code sanity (4, 6, or 8 digits)
    if (!/^\d{4}(\d{2})?(\d{2})?$/.test(inv.hsnCode || "")) {
      issues.push({
        invoiceNo: inv.invoiceNo,
        issueType: "INVALID_HSN_CODE",
        severity: "MEDIUM",
        detail: `HSN code '${inv.hsnCode}' should be 4, 6, or 8 digits`,
      });
    }

    // 5. Taxable value sanity
    if (typeof inv.taxableValue !== "number" || inv.taxableValue <= 0) {
      issues.push({
        invoiceNo: inv.invoiceNo,
        issueType: "INVALID_TAXABLE_VALUE",
        severity: "HIGH",
        detail: `Taxable value must be a positive number, got '${inv.taxableValue}'`,
      });
    }
  }

  return {
    filingId,
    businessId,
    issuesFound: issues.length > 0,
    issues,
  };
};

# GST Compliance Copilot

AI compliance co-pilot for Indian MSMEs — flags GST filing errors and compliance
risks before they turn into penalties, and explains each issue in plain language.

Built for the WeMakeDevs Bharat Build Tour hackathon (Ship It / AWS track).

## Architecture

```
Frontend (React + Vite)
      |
      v
API Gateway --> IngestFiling Lambda --> DynamoDB (Filings)
      |                 |
      |                 v
      |         Step Functions pipeline
      |                 |
      |       +---------+---------+
      |       |                   |
      | RuleCheck Lambda   ExplainIssues Lambda
      | (fast, free,       (only runs if rule check
      |  deterministic)     finds something)
      |                           |
      |                           v
      |                  DynamoDB (FlaggedIssues)
      |
      +--> GetDashboard Lambda --> reads Filings + FlaggedIssues
      |
      +--> ResolveIssue Lambda --> marks a FlaggedIssue resolved
      |
      v
Frontend dashboard
```

**Why rule checks run before the explanation step:** most GST errors (bad
GSTIN format, duplicate invoice numbers, invalid tax rates) are catchable
with plain validation logic. Explanations for flagged issues are generated
via a plain-language template engine (see "A note on the AI layer" below)
so the whole pipeline runs with zero external API cost and no dependency
on model access approval.

## A note on the AI layer

The original design called Amazon Bedrock (Claude/Nova) to generate the
plain-language explanation for each flagged issue. On this AWS account,
Bedrock model invocation is currently blocked by AWS's new-account
restriction ("ValidationException: Operation not allowed"), which affects
both Anthropic and Amazon Nova models regardless of model access settings.

As a working fallback for the hackathon deadline, `bedrockExplain.js` was
rewritten to generate explanations from a rule-based template engine keyed
by issue type — same output shape, same pipeline, zero cost, zero external
dependency. Swapping in a real LLM call (Bedrock once unblocked, or any
other provider) only requires changing that one Lambda function.

## Project structure

```
template.yaml                        SAM template (infra as code)
statemachine/review_pipeline.asl.json Step Functions definition
src/
  ingestFiling.js                    POST /filings
  ruleCheck.js                       Step Functions task 1
  bedrockExplain.js                  Step Functions task 2 (rule-based explanation engine — see "A note on the AI layer")
  getDashboard.js                    GET /dashboard/{businessId}
  resolveIssue.js                    PATCH /issues/{issueId} — marks a flagged issue resolved
  package.json
demo-data/
  sample_filing.json                 Synthetic data with baked-in errors for the demo
frontend/                            React + Vite dashboard
  src/
    GstDashboard.jsx                 Main app — sidebar nav (Dashboard / New Filing / Settings)
    GstDashboard.css                 Ledger/audit-stamp visual styling
    useCountUp.js                    Animated stat-number hook
    App.jsx, main.jsx                Entry points
  .env                               Set VITE_API_URL here to skip re-entering it in Settings
```

## API endpoints

| Method | Path | Purpose |
|---|---|---|
| POST | `/filings` | Submit a filing; kicks off the review pipeline |
| GET | `/dashboard/{businessId}` | Read filings + flagged issues for a business |
| PATCH | `/issues/{issueId}` | Mark a flagged issue resolved |

## Deploy

Requires AWS CLI configured and SAM CLI installed.

```bash
cd gst-compliance-copilot
sam build
sam deploy --guided
```

On first deploy, SAM will ask for a stack name and region, then walk
you through the rest. Grab the `ApiUrl` output when it finishes — you'll
need it for the frontend.

**Note:** Claude 3.5 Sonnet on Bedrock has been deprecated on AWS — if you
ever reconnect the AI layer, use a currently active model/inference profile
ID from the Bedrock console rather than the one that may be in old commits.

## Running the frontend

```bash
cd frontend
npm install
npm run dev
```

Either paste your deployed `ApiUrl` into the Settings view, or set it once
in `frontend/.env`:

```
VITE_API_URL=https://xxxxx.execute-api.us-east-1.amazonaws.com/prod/
```

## Demo flow

1. Go to **New Filing**, set a Business ID (e.g. `BIZ-DEMO`)
2. Click **Load sample errors**, then **Submit filing**
3. Wait ~10 seconds for the Step Functions pipeline to run
4. Go to **Dashboard**, click **Refresh ledger** — flagged issues appear
   as stamp-style cards with severity, explanation, and suggested fix
5. Click **Mark resolved** on any issue to test the resolve endpoint

**Or via curl**, if you just want to hit the API directly:

```bash
curl -X POST {ApiUrl}filings \
  -H "Content-Type: application/json" \
  -d @demo-data/sample_filing.json

curl {ApiUrl}dashboard/BIZ001

curl -X PATCH {ApiUrl}issues/{issueId} \
  -H "Content-Type: application/json" \
  -d '{"resolved":true}'
```

## Next steps to build out

- [ ] Cognito auth so each business only sees its own filings
- [ ] Swap the dashboard's DynamoDB `Scan` for a GSI query on `business_id`
      before this goes beyond demo scale
- [ ] Reconnect a real LLM (Bedrock or otherwise) once model access is available
- [ ] Optional: EventBridge rule to notify (SNS/email) when a HIGH severity
      issue is flagged

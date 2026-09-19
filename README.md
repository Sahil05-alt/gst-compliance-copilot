# GST Compliance Copilot

AI compliance co-pilot for Indian MSMEs — flags GST filing errors and compliance
risks before they turn into penalties, and explains each issue in plain language.

Built for the WeMakeDevs Bharat Build Tour hackathon (Ship It / AWS track).

## Architecture

```
Frontend (React)
      |
      v
API Gateway --> IngestFiling Lambda --> DynamoDB (Filings)
                        |
                        v
                Step Functions pipeline
                        |
              +---------+---------+
              |                   |
        RuleCheck Lambda   BedrockExplain Lambda
        (fast, free,       (only runs if rule check
         deterministic)     finds something — saves
                             on Bedrock calls)
                                  |
                                  v
                         DynamoDB (FlaggedIssues)

API Gateway --> GetDashboard Lambda --> reads Filings + FlaggedIssues
      |
      v
Frontend dashboard
```

**Why rule checks run before Bedrock:** most GST errors (bad GSTIN format,
duplicate invoice numbers, invalid tax rates) are catchable with plain
validation logic. Only flagged filings get sent to Bedrock, which keeps
latency and cost down and gives you a clean two-stage story to explain
to judges — "deterministic checks catch the obvious stuff instantly;
the LLM adds the human-readable *why* and *how to fix*."

## Project structure

```
template.yaml                        SAM template (infra as code)
statemachine/review_pipeline.asl.json Step Functions definition
src/
  ingestFiling.js                    POST /filings
  ruleCheck.js                       Step Functions task 1
  bedrockExplain.js                  Step Functions task 2
  getDashboard.js                    GET /dashboard/{businessId}
  package.json
demo-data/
  sample_filing.json                 Synthetic data with baked-in errors for the demo
frontend/                            (scaffold your React dashboard here)
```

## Deploy

Requires AWS CLI configured and SAM CLI installed.

```bash
cd gst-compliance-copilot
sam build
sam deploy --guided
```

On first deploy, SAM will ask for a stack name and region, then walk
you through the rest. Grab the `ApiUrl` output when it finishes.

**Important:** Bedrock model access must be enabled in your AWS account/region
for the model set in `template.yaml` (`anthropic.claude-3-5-sonnet-20241022-v2:0`)
before `bedrockExplain.js` will work — enable it in the Bedrock console under
"Model access" if you haven't already.

## Demo flow

1. Seed a business (optional — `businessId` can just be any string like `BIZ001`)
2. POST `demo-data/sample_filing.json` to `{ApiUrl}filings`
3. Wait a few seconds for the Step Functions pipeline to run
4. GET `{ApiUrl}dashboard/BIZ001` to show the flagged issues with
   plain-language explanations live on stage

```bash
curl -X POST {ApiUrl}filings \
  -H "Content-Type: application/json" \
  -d @demo-data/sample_filing.json

curl {ApiUrl}dashboard/BIZ001
```

## Next steps to build out

- [ ] React frontend: filing upload form + dashboard table (flagged issues,
      severity badges, "mark resolved" action)
- [ ] Cognito auth so each business only sees its own filings
- [ ] Swap the dashboard's DynamoDB `Scan` for a GSI query on `business_id`
      before this goes beyond demo scale
- [ ] Add a "resolve issue" PATCH endpoint
- [ ] Optional: EventBridge rule to notify (SNS/email) when a HIGH severity
      issue is flagged

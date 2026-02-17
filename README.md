# Glucose Monitor — Alexa Skill

An Alexa skill that reads your latest glucose value from [Nightscout](http://www.nightscout.info/) and speaks it back with trend direction.

> "Alexa, open glucose monitor"
> "Alexa, ask glucose monitor what is my glucose"

---

## Project Structure

```
lambda/
  index.js          — Lambda handler (ASK SDK v2)
  package.json      — Dependencies (ask-sdk-core only)
skill-package/
  interactionModels/
    custom/
      en-US.json    — Interaction model with GetGlucoseIntent
```

## Setup in Alexa-Hosted Environment

### 1. Create the Skill

1. Go to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask).
2. **Create Skill** → name it "Glucose Monitor" → choose **Custom** model → **Alexa-Hosted (Node.js)** → **Create**.

### 2. Add Code

- In the **Code** tab, replace the contents of `lambda/index.js` and `lambda/package.json` with the files from this repo.
- Click **Deploy**.

### 3. Add the Interaction Model

- In the **Build** tab, go to **JSON Editor** (left sidebar, under Interaction Model).
- Paste the contents of `skill-package/interactionModels/custom/en-US.json`.
- Click **Save** then **Build Skill**.

### 4. Set Environment Variables

In the **Code** tab, open the file `.env` (create it if missing) or use the inline editor's terminal:

```bash
# In the Alexa-hosted Lambda terminal:
export NIGHTSCOUT_URL="https://your-nightscout-site.herokuapp.com"
```

For **Alexa-Hosted skills**, environment variables are not natively supported via a UI. Two approaches:

#### Option A — Hardcode in code (simplest for private skill)
At the top of `index.js`, add:
```js
process.env.NIGHTSCOUT_URL = 'https://your-nightscout-site.com';
process.env.NIGHTSCOUT_TOKEN = 'your-api-secret-or-token';  // optional
```

#### Option B — Use AWS Lambda console
If your Alexa-Hosted skill gives you access to the underlying Lambda:
1. Go to [AWS Lambda Console](https://console.aws.amazon.com/) → find your skill's function.
2. **Configuration** → **Environment variables** → add:

| Key                  | Value                                      | Required |
|----------------------|--------------------------------------------|----------|
| `NIGHTSCOUT_URL`     | `https://your-nightscout-site.com`         | Yes      |
| `NIGHTSCOUT_TOKEN`   | Your API secret or token                   | No       |
| `NIGHTSCOUT_AUTH_MODE` | `bearer` (default) or `apisecret_sha1`   | No       |
| `UNITS`              | `mgdl` (default) or `mmol`                | No       |

### Environment Variables Reference

| Variable              | Description | Default |
|-----------------------|-------------|---------|
| `NIGHTSCOUT_URL`      | Your Nightscout base URL (no trailing slash) | — (required) |
| `NIGHTSCOUT_TOKEN`    | API secret or bearer token for protected sites | — (no auth) |
| `NIGHTSCOUT_AUTH_MODE` | `bearer` — sends `Authorization: Bearer <token>` header | `bearer` |
|                       | `apisecret_sha1` — sends `api-secret` header with SHA-1 hash of token | |
| `UNITS`               | `mgdl` — speaks values in mg/dL | `mgdl` |
|                       | `mmol` — converts to mmol/L (÷ 18) | |

## Testing

### In the Developer Console

1. Go to the **Test** tab.
2. Enable testing in **Development** mode.
3. Type or say:
   - "open glucose monitor"
   - "ask glucose monitor what is my glucose"
   - "ask glucose monitor check my blood sugar"

### Expected Responses

- **Success:** "Your glucose is 120 milligrams per decilitre and steady."
- **Stale reading:** "Your glucose is 95 milligrams per decilitre and falling slightly. But heads up, this reading is 23 minutes old."
- **mmol/L mode:** "Your glucose is 6.7 millimoles per litre and rising."
- **Error:** "Sorry, I could not get your glucose reading right now. Please try again later."

## Units: mg/dL vs mmol/L

By default the skill speaks glucose in **mg/dL** (standard in the US). If you prefer **mmol/L**:

Set `UNITS=mmol` in your environment variables. The skill divides the mg/dL value by 18 and rounds to one decimal place.

## Trend Directions

The skill maps Nightscout direction strings to spoken English:

| Nightscout Direction | Spoken As |
|---------------------|-----------|
| DoubleUp            | rising fast |
| SingleUp            | rising |
| FortyFiveUp         | rising slightly |
| Flat                | steady |
| FortyFiveDown       | falling slightly |
| SingleDown          | falling |
| DoubleDown          | falling fast |

## Security Notes

- Error messages never expose your Nightscout URL or token.
- The skill stores nothing persistently (no DynamoDB).
- For private/dev use only — not designed for Alexa Skill Store publishing.

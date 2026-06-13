# Development guide

1. Replace `<BASE_URL>` and `SELF_BASE_URL` in the `manifest.yml` and `.env`. This app can't be run on socket mode.
1. Create a Slack app in the [developer dashboard](https://api.slack.com/apps).
1. Click on "From manifest" and paste your `manifest.yml`
1. Copy `.env.example` to `.env` and fill it

---
1. Install the dependencies (`npm install`)
1. Compile the typescript (`npm run build`)
1. Start the bot (`npm run start`)
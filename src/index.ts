import { config } from "dotenv";
config();

import Slack from "@slack/bolt";
const { App, ExpressReceiver } = Slack;

const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  PORT,
} = process.env;
import { populateReceiver } from "./endpoints.js";
import { populateSlackEvents } from "./slack.js";
import assert from "node:assert";

const receiver = new ExpressReceiver({ signingSecret: SLACK_SIGNING_SECRET! });

assert(PORT && SLACK_BOT_TOKEN && SLACK_SIGNING_SECRET);

const slack = new App({
  token: SLACK_BOT_TOKEN,
  installerOptions: { port: 3000 },
  receiver,
});

populateReceiver(receiver, slack.client);
populateSlackEvents(slack);


await slack.start(PORT);
await slack.logger.info("Slack app started in", PORT);


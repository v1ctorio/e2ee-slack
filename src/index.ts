import { config } from "dotenv";
config();

import { randomUUID } from "crypto";
import Slack from "@slack/bolt";
const { App, ExpressReceiver } = Slack;

import { Valkeyrie } from "valkeyrie";
const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  PORT,
} = process.env;

import { videoEmbedBlock, getTimestamp } from "./util.js";
import { populateReceiver } from "./endpoints.js";
import { populateSlackEvents } from "./slack.js";

const receiver = new ExpressReceiver({ signingSecret: SLACK_SIGNING_SECRET! });

//const slugs = new Map<string, PageKind>() // slug to PageKind

const slack = new App({
  token: SLACK_BOT_TOKEN,
  installerOptions: { port: 3000 },
  receiver,
});

populateReceiver(receiver);
populateSlackEvents(slack);

await slack.start(PORT!);
await slack.logger.info("Slack app started in", PORT!);


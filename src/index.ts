import Slack, {} from "@slack/bolt";
const { App, subtype, ExpressReceiver } = Slack;
import { Eta } from "eta";
import { config } from "dotenv";
import { randomUUID, UUID } from "crypto";
import path from "path";
import * as express from "express";
config();
import * as pgp from "openpgp";
import type { PageKind, PostMessagePayload, RegistrationPayload, UserData, writeMessagePage } from "./types.js";
import { Valkeyrie } from "valkeyrie";
const {
  SLACK_BOT_TOKEN,
  SLACK_SIGNING_SECRET,
  SLACK_APP_TOKEN,
  SLACK_CLIENT_SECRET,
  SELF_BASE_URL,
  PORT,
} = process.env;

//This is so silly but tscompiler is trash
const eta = new Eta({
  views: path.join(import.meta.dirname, "../src", "templates"),
});
const assetsPath = path.join(import.meta.dirname, "../src", "assets");

const receiver = new ExpressReceiver({ signingSecret: SLACK_SIGNING_SECRET! });

//const slugs = new Map<string, PageKind>() // slug to PageKind
const db = await Valkeyrie.open("./e2ee.db");
const SLUGS = "slugs",
  USERS = "users";

//DEBUG
await db.set([SLUGS, "quecosa"], {
  kind: "registration",
  user: "U1234567",
  user_name: "Jorge",
});

const slack = new App({
  token: SLACK_BOT_TOKEN,
  installerOptions: { port: 3000 },
  receiver,
});

const possible_commands = ["register", "send", "self", "delete_my_data"];
slack.command("/e2ee", async ({ ack, body, client, respond, command }) => {
  await ack();
  const args = body.text;
  let cmd = args.split(" ")[0];
  console.log(`Received from ${body.user_id} - /e2ee ${args}`);

  const userData = await (await db.get([USERS, body.user_id])).value;
  if (!userData) cmd = "register";

  console.log(`Parsed cmd =`, cmd);

  if (!possible_commands.includes(cmd)) {
    await respond({
      response_type: "ephemeral",
      text: `Unknown command, available: ${possible_commands.map((c) => `\`${c}\``).join(", ")}`,
    });
    return;
  }

  switch (cmd) {
    case "register": {
      const slugData = {
        user: body.user_id,
        kind: "registration" as const,
        user_name: body.user_name,
      };
      const slug = await generateSlug(slugData);

      const responseBlocks = [videoEmbedBlock("Register", slug)];

      //await respond({
      //  response_type: "ephemeral",
      //  text: "To use e2ee slack you must use a different client",
      //  blocks: responseBlocks
      //})

      const res = await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: "modal",
          title: {
            type: "plain_text",
            text: "E2EE Slack",
          },
          callback_id: slug,
          blocks: responseBlocks,
          close: {
            type: "plain_text",
            text: "Done",
          },
        },
      });

      await db.set([USERS, body.user_id], {
        ...slugData,
        view_id: res.view?.id,
      });

      break;
    }
    case "delete_my_data":
      await respond({
        response_type: "ephemeral",
        text: "Deleting your data...",
      });
      await delete_user(body.user_id);
      break;
    case "self": {
      const user_data = await getUserData(body.user_id);
      await respond({
        response_type: "ephemeral",
        text: "```\n" + JSON.stringify(user_data, null, 4) + "\n```",
      }); //TODO prettify ts

      break;
    }
    case "send":
      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: "modal",
          title: {
            type: "plain_text",
            text: "E2EE Slack - Send",
            emoji: true,
          },
          submit: {
            type: "plain_text",
            text: "Encrypt",
            emoji: true,
          },
          close: {
            type: "plain_text",
            text: "Cancel",
            emoji: true,
          },
          callback_id: "encrypt_msg",
          blocks: [
            {
              type: "section",
              text: {
                type: "mrkdwn",
                text: "After selecting the recipients, you will be prompted to write and encrypt the message.",
              },
            },
            {
              type: "input",
              element: {
                type: "multi_users_select",
                placeholder: {
                  type: "plain_text",
                  text: "Select users",
                  emoji: true,
                },
                action_id: "multi_users_select-action",
              },
              label: {
                type: "plain_text",
                text: "Recipients",
                emoji: true,
              },
              optional: false,
            },
          ],
        }, // hs typescript is so bad. i should be using slack-block-builder
      });
      break;
  }
});

slack.view("encrypt_msg", async ({ ack, body, client }) => {
  console.time("viewsubm");
  console.log("Received message encryption modals submission");
  console.log("state =", body.view.state);
  let recipients =
    body.view.state?.values?.mv0Ig["multi_users_select-action"]?.selected_users;
  const respond = async (text: string) => {
    const res = await ack({
      response_action: "update",
      view: {
        type: "modal",
        title: {
          type: "plain_text",
          text: "E2EE Slack - Error",
        },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: text,
            },
          },
        ],
      },
    });
    return res;
  };

  if (!recipients) recipients = [];
  if (recipients.length === 0) {
    await respond("You must select at least one recipient!");
    return;
  }

  console.log("recipients = ", recipients);

  const unregisteredRecipients: Array<string> = [];
  const recipientSPubKeys = (
    await Promise.all(
      recipients.map(async (r) => {
        const d = await getUserData(r);
        if (!d) {
          unregisteredRecipients.push(`<@${r}>`);
          return null;
        }
        return d.public_key;
      }),
    )
  ).filter((k) => k) as string[];

  console.log("recipientspubkeys =", recipientSPubKeys);
  console.log("unregistered =", unregisteredRecipients);
  if (unregisteredRecipients.length > 0) {
    //do something (else?) because not all the selected recipients are registered
    console.log("0 < unregisteredRecipients =", unregisteredRecipients);
    await respond(`The following selected recipients do not have public keys stored in E2EE Slack: ${unregisteredRecipients.join(", ")}.
\nThey must store one using \`/e2ee\` before being able to receive messages.`);
    return;
  }

  const author_private_key = ((await db.get([USERS, body.user.id]))
    ?.value as UserData)["private_key"];
  if (!author_private_key) {
    await respond("Missing private key! Register first using `/e2ee`.");
    return;
  }

  const slug = await generateSlug({
    kind: "write_message",
    recipients,
    recipients_keys: recipientSPubKeys,
    user: body.user.id,
    user_name: body.user.name,
    author_private_key,
  });
  if (!slug) {
    await respond("Internal server error.");
    return;
  }

  console.timeEnd("viewsubm");
  // Seems like slack is rejecting my video blocks when updating through ack(?)
  const res = await respond("processing...");
  await client.views.update({
    view_id: body.view.id,
    view: {
      type: "modal",
      title: { type: "plain_text", text: "E2EE Slack - Encrypt" },
      blocks: [videoEmbedBlock("Encrypt", slug)],
      close: {
        type: "plain_text",
        text: "Done",
      },
    },
  });
});

receiver.router.get("/slug/:slug", async (req, res) => {
  const { slug } = req.params;

  const page = (await (await db.get([SLUGS, slug])).value) as PageKind;

  if (!page) return res.status(404).send("Slug not found, weird");

  if (page.kind === "registration") {
    res
      .status(200)
      .send(
        eta.render("./registration", {
          name: page.user_name,
          slug,
          slack_user_id: page.user,
        }),
      );
  } else if (page.kind === "write_message") {
    //const user_data = await getUserData(page.user);
    // if (!user_data)
      // return res.status(500).send("server error: user data not found");
    //const recipient_keys_const = `const _recipient_keys = \`${JSON.stringify(page.recipients_keys)}\``
    const base64Keys = Buffer.from(JSON.stringify(page.recipients_keys)).toString('base64');

    res
      .status(200)
      .send(eta.render("./write_message", { name: page.user_name, author_private_key: page.author_private_key, recipient_keys: base64Keys, slug}));
  }
});

receiver.router.get("/openpgp.min.mjs", (req, res) => {
  res.status(200).sendFile(path.join(assetsPath, "openpgp.min.mjs"));
});

receiver.router.get("/que", (r, res) => {
  res.status(200).send("so");
});

receiver.router.post("/postKey", express.json(), async (req, res) => {
  const body: RegistrationPayload = req.body;
  console.log("received a post request", body);
  if (!body["slug"] || !body["public_key"] || !body["private_key"]) {
    res.status(422).send("unprocessable body");
  }

  if (!(await save_user(body))) return res.status(500).send("server error");

  // TODO use views.update to change the view
  res.status(200).send("ok");
});

receiver.router.post("/message", express.json(), async (req, res) => {
  const {slug, guarded_message}: PostMessagePayload = req.body;
  console.log("Received an encrypted message")
  const data = (await db.get([SLUGS, slug])); 
  if (!data) return res.status(404).send("slug not found");
  
  const page = data.value as writeMessagePage;
  const {recipients,user,user_name, kind } = page;
  
  if (!kind || kind !== "write_message" ) return res.status(400).send("Invalid slug");
  if (!guarded_message || guarded_message.length < 10 ) return res.status(422).send("unprocessable body");




})
await slack.start(PORT!);
await slack.logger.info("Slack app started in", PORT!);

async function generateSlug(k: PageKind) {
  const slug = randomUUID();
  await db.set([SLUGS, slug], k);
  return slug;
}

async function save_user(payload: RegistrationPayload): Promise<boolean> {
  const { public_key, private_key, slug } = payload;
  const slug_data = (await (await db.get([SLUGS, slug])).value) as PageKind;
  if (!slug_data) return false;
  if (slug_data.kind !== "registration") return false;

  let fingerprint: string;
  try {
    const parsedKey = await pgp.readKey({ armoredKey: payload.public_key });
    fingerprint = parsedKey.getFingerprint();
  } catch {
    return false;
  }
  await db.set([USERS, slug_data.user], {
    private_key,
    public_key,
    fingerprint,
  });

  slack.client.chat
    .postMessage({
      channel: slug_data.user,
      text:
        "Successfully registered to E2EE Slack with private key (encrypted, you must preserve your passphrase): `redacted`, public key fingerprint: `" +
        fingerprint +
        "`. \nTo see your full keys, use `/e2ee self`",
    })
    .catch((e) => console.error(e))
    .then((m) => console.log(`sent registration message${m}`));
  return true;
}

async function delete_user(slack_id: string): Promise<boolean> {
  try {
    await db.delete([USERS, slack_id]);
  } catch {
    return false;
  }
  slack.client.chat.postMessage({
    channel: slack_id,
    text: "Delete your key pair from my database. You may register again using `/e2ee register`.",
  });
  return true;
}

async function getUserData(slack_id: string): Promise<UserData | null> {
  const val = (await db.get([USERS, slack_id])).value;

  if (!val) return null;
  else return val as UserData;
}

function videoEmbedBlock(page_title: string, slug: string) {
  console.log("generating video embed:", SELF_BASE_URL + "/slug/" + slug)
  return {
    type: "video",
    alt_text: "embedded e2ee client",
    title: {
      type: "plain_text",
      text: "E2EE Slack - " + page_title,
    },
    thumbnail_url: "https://http.cat/200", // TODO change this with an actual thumbnail
    video_url: SELF_BASE_URL + "/slug/" + slug,
  };
}

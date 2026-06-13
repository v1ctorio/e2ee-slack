import type { App as SlackApp, webApi } from "@slack/bolt";
import type { KnownBlock } from "@slack/types/dist/block-kit/blocks.js"
import { getTimestamp, videoEmbedBlock } from "./util.js";
import {
  deleteUserData,
  generateSlug,
  getMessage,
  getUserData,
  saveUser,
} from "./db.js";

const possible_commands = ["register", "send", "self", "self delete"];

export function populateSlackEvents(slack: SlackApp): SlackApp {
  slack.command("/e2ee", async ({ ack, body, client, respond }) => {
    await ack();
    const args = body.text.split(" ");
    let cmd = args[0];
    console.log(`Received from ${body.user_id} - /e2ee ${args}`);

    const userData = await getUserData(body.user_id);
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

        const _res = await client.views.open({
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
        // TODO do this elegantly
        //await db.set([USERS, body.user_id], {
        //    ...slugData,
        //    view_id: res.view?.id,
        //});

        break;
      }
      case "self": {
        const user_data = await getUserData(body.user_id);
        if (!user_data)
          return respond({
            response_type: "ephemeral",
            text: "Your user data couldn't be found",
          });
        let blocks: KnownBlock[];
        if(args[1]==="delete"){
          blocks = [
            {
              "type":"section",
              "text": {
                "type": "mrkdwn",
                "text": "Clicking the button below will delete your data permanently."
              }
            },
            {
              "type":"actions",
              "elements":[
                {
                  "type":"button",
                  "text": {
                    "type":"plain_text",
                    "text":"Confirm deletion"
                  },
                  "action_id": "delete-data",
                  "style":"danger"
                }
              ]
            }
          ]
        } else { 

        blocks = [
          {
            "type": "section",
            "text": {
              "type": "mrkdwn",
              "text": "Click on the buttons below to display your stored data."
            }
          },
          {
            "type": "actions",
            "elements": [
              {
                "type": "button",
                "text": {
                  "type": "plain_text",
                  "text": "Public Key",
                  "emoji": true
                },
                "action_id": "show-pubkey"
              },
              {
                "type": "button",
                "text": {
                  "type": "plain_text",
                  "text": "Private Key"
                },
                "action_id": "show-privkey",
                "style": "danger"
              }
            ]
          }
        ];

       return;
                   

        }
        await respond({
          text:"Successfully retrieved your data. Open the Slack app to interact.",
          blocks: blocks,
          response_type: "ephemeral"
        })
 
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
      body.view.state?.values?.mv0Ig["multi_users_select-action"]
        ?.selected_users;
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

    const author_private_key = (await getUserData(body.user.id))?.private_key;
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
    await respond("processing...");
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

  slack.action(
    "open-envelope",
    async ({ ack, body, payload, respond, client }) => {
      if (payload.type !== "button" || body.type !== "block_actions")
        return console.error("invalid open-envelope action received");
      const message_id = payload.value;
      if (!message_id) return;
      await ack();
      const message_data = await getMessage(message_id);

      if (!message_data)
        return await respond({
          text: "Message not found.",
          replace_original: false,
          response_type: "ephemeral",
        });
      if (!message_data.recipients.includes(body.user.id))
        return await respond({
          text: "This message was not addressed to you.",
          replace_original: false,
          response_type: "ephemeral",
        });

      const user_data = await getUserData(body.user.id);
      if (!user_data)
        return await respond({
          text: "Your user's data couldn't be found.",
          replace_original: false,
          response_type: "ephemeral",
        });

      const slug = await generateSlug({
        kind: "read_message",
        armored_message: message_data.armored_message,
        reader: body.user.id,
        reader_private_key: user_data.private_key,
      });

      await client.views.open({
        trigger_id: body.trigger_id,
        view: {
          type: "modal",
          title: { text: "E2EE Slack - Letter", type: "plain_text" },
          blocks: [videoEmbedBlock("Letter", slug)],
        },
      });
    },
  );

  const r_default_opts = { ephemeral: true, replace_original: false };

  slack.action("show-privkey", async ({ ack, body, respond }) => {
    await ack();
    const user = body.user.id;
    const userData = await getUserData(user);
    if (!userData) return respond({ text: "Couldn't find your user data", ...r_default_opts });
    respond({
      text: "```\n" + userData.private_key + "\n```",
      ...r_default_opts
    });
  });

  slack.action("show-pubkey", async ({ ack, body, respond }) => {
    await ack();
    const user = body.user.id;
    const userData = await getUserData(user);
    if (!userData) return respond({ text: "Couldn't find your used data", ...r_default_opts });
    respond({
      text: "```\n" + userData.public_key + "\n```",
      ...r_default_opts
    });
  });

  slack.action("delete-data", async ({ack, body, respond})=>{
    await ack();
    const user = body.user.id;
    if (!await deleteUserData(user,slack.client)) {
      await respond({
        text: "For some reason, your stored data failed to be deleted",
        ...r_default_opts
      })
      return;
    }
    await respond({
      text:"Deleted! You may register again via `/e2ee register`"
    })
  })

  //eo populateSlackEvents 
  return slack;
}

export async function sendEnvelope(
  client: webApi.WebClient,
  {
    recipient,
    author,
    message_id,
    ts,
  }: {
    recipient: string;
    author: string;
    message_id: string;
    ts?: number;
  },
) {
  const timestamp = ts ?? getTimestamp();

  const blocks = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text:
          "You have received a new encrypted message. \nClick on the button below to decrypt it." +
          "\n" +
          `<!date^${timestamp}^{date_pretty} at {time}|send_time> by *<@${author}>*`,
      },
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: {
            type: "plain_text",
            text: "Open Envelope",
            emoji: true,
          },
          style: "primary",
          value: message_id,
          action_id: "open-envelope",
        },
      ],
    },
  ];
  client.chat.postMessage({
    icon_emoji: ":tw_envelope_with_arrow:",
    text: "New End-to-end Encrypted Slack envelope message.",
    channel: recipient,
    blocks,
    username: "Envelope - E2EE Slack",
  });
}

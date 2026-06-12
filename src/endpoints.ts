import type { ExpressReceiver, webApi } from "@slack/bolt";
import {Eta} from "eta";
import path from "node:path";
import type { PostMessagePayload, RegistrationPayload } from "./types.js";
import { getTimestamp } from "./util.js";
import { getPage, saveMessage, saveUser } from "./db.js";
import express from "express";
import { sendEnvelope } from "./slack.js";
//This is so silly but tscompiler is trash
const eta = new Eta({
  views: path.join(import.meta.dirname, "../src", "templates"),
});

const assetsPath = path.join(import.meta.dirname, "../src", "assets");


export function populateReceiver(receiver: ExpressReceiver, slack_client: webApi.WebClient): ExpressReceiver {
    receiver.router.get("/slug/:slug", async (req, res) => {
        const { slug } = req.params;

        const page = await getPage(slug);

        if (!page) return res.status(404).send("Slug not found, weird");

        if (page.kind === "registration") {
            res.status(200).send(
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
            const base64Keys = Buffer.from(
                JSON.stringify(page.recipients_keys),
            ).toString("base64");

            res
                .status(200)
                .send(
                    eta.render("./write_message", {
                        name: page.user_name,
                        author_private_key: page.author_private_key,
                        recipient_keys: base64Keys,
                        slug,
                    }),
                );
        } else if (page.kind === "read_message") {
            res.status(200).send(
                eta.render("./read_message", {
                    reader_id: page.reader,
                    reader_private_key: page.reader_private_key,
                    armored_message: page.armored_message,
                    slug,
                }),
            );
        }
    });

    receiver.router.get("/openpgp.min.mjs", (_req, res) => {
        res.status(200).sendFile(path.join(assetsPath, "openpgp.min.mjs"));
    });

    receiver.router.get("/que", (_, res) => {
        res.status(200).send("so");
    });

    receiver.router.post("/postKey", express.json(), async (req, res) => {
        const body: RegistrationPayload = req.body;
        console.log("received a post request", body);
        if (!body["slug"] || !body["public_key"] || !body["private_key"]) {
            return res.status(422).send("unprocessable body");
        }
        //TODO pass the slack client
        if (!(await saveUser(body, slack_client))) return res.status(500).send("server error");

        // TODO use views.update to change the view
        res.status(200).send("ok");
    });

    receiver.router.post("/message", express.json(), async (req, res) => {
        console.log(req.body);
        const { slug, guarded_message }: PostMessagePayload = req.body;
        console.log("Received an encrypted message");

        const page = await getPage(slug);

        if (!page) return res.status(404).send("slug not found");
        if (!page.kind || page.kind !== "write_message")
            return res.status(400).send("Invalid slug");
        if (!guarded_message || guarded_message.length < 10)
            return res.status(422).send("unprocessable body");

        //Messages are not saved in the slack block metadata because maybe they could get too long (?)
        //I should look more into that. I want the server to hold as little data as possible

        const message_id = await saveMessage({
            armored_message: guarded_message,
            author: page.user,
            creation_timestamp: getTimestamp(),
            recipients: page.recipients,
        });

        if (!message_id) return res.status(500).send("internal server error");

        res.status(200).json({ ok: true, message_id });

        for (const recipient of page.recipients) {
            await sendEnvelope(slack_client, { recipient, author: page.user, message_id });
        }
    });



    return receiver;
}
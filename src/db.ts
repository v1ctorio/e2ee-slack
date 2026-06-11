import { randomUUID } from "node:crypto";
import { Valkeyrie } from "valkeyrie";
import * as pgp from "openpgp";
import type {
  MessageData,
  PageKind,
  PostMessagePayload,
  RegistrationPayload,
  UserData,
  writeMessagePage,
} from "./types.js";
import { webApi } from "@slack/bolt";
const db = await Valkeyrie.open("./e2ee.db");
const SLUGS = "slugs",
  USERS = "users",
  MESSAGES = "messages";

//DEBUG
await db.set([SLUGS, "quecosa"], {
  kind: "registration",
  user: "U1234567",
  user_name: "Jorge",
});

export async function generateSlug(k: PageKind) {
  const slug = randomUUID();
  await db.set([SLUGS, slug], k);
  return slug;
}

export async function save_user(payload: RegistrationPayload, client: webApi.WebClient|null): Promise<boolean> {
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

  if (client) client.chat
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

export async function delete_user(slack_id: string, client: webApi.WebClient|null): Promise<boolean> {
  try {
    await db.delete([USERS, slack_id]);
  } catch {
    return false;
  }
  if(client) client.chat.postMessage({
    channel: slack_id,
    text: "Delete your key pair from my database. You may register again using `/e2ee register`.",
  });
  return true;
}

export async function getUserData(slack_id: string): Promise<UserData | null> {
  const val = (await db.get([USERS, slack_id])).value;

  if (!val) return null;
  else return val as UserData;
}

export async function saveMessage(data: MessageData): Promise<string | null> {
  if (!data) return null;
  const uuid = randomUUID();

  try {
    const r = await db.set([MESSAGES, uuid], data);
    if (!r.ok) return null;
  } catch (e) {
    console.error("Error trying to save message", e);
    return null;
  }
  return uuid;
}

export async function getMessage(message_id: string): Promise<MessageData | null> {
  const data = await db.get([MESSAGES, message_id]);

  if (!data.value) return null;
  else return data.value as MessageData;
}

export interface registrationPage {
  user: string; // slack id
  user_name: string;
  kind: "registration"; // kind of page
  view_id?: string;
}
export interface writeMessagePage {
  user: string;
  user_name: string;
  kind: "write_message";
  recipients: string[]; // recipient slack ids (do i really need this for anything?). Yes, I need this to send the "envelope" dms
  recipients_keys: string[];
  author_private_key: string;
}
export interface readMessagePage {
  reader: string;
  reader_private_key: string;
  kind: "read_message";
  armored_message: string;
}
export type PageKind = registrationPage | writeMessagePage | readMessagePage;

export interface UserData {
  //  slack_id: string; the slack ID is they key
  public_key: string;
  private_key: string; // Private keys should ALWAYS have a passphrase
  fingerprint: string;
}

export interface MessageData {
  author: string; //slack id of the message author
  recipients: string[];
  armored_message: string; // the encrypted message
  creation_timestamp: number;
}

export interface RegistrationPayload {
  private_key: string;
  public_key: string;
  slug: string;
}

export interface PostMessagePayload {
  guarded_message: string;
  slug: string;
}

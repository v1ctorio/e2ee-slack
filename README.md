# e2ee Slack

Proof of Concept of e2ee communication inside the slack client using the video embed block and OpenPGP public key encryption.


The idea is that the bot embeds a website that generates a simple webapp which, embedded in the slack app, allow you to:
- Create a openpgp key pair which is stored in the server. The private key is encrypted with a passphrase so the service (_or any intermediary such as Slack_) can't decrypt it.
- Once the user has a private key, allow them to encrypt messages targeting other registered users public keys.



**The decrypted message and private key never leaves the users client**. All the encryption is done locally.

### Features 

Messages can be delivered via *letter* or *channel* mode. In the first one, the *envelope* (encrypted message inside Slack) is sent to each recipient via DM. In the latter, the *envelope* is sent to a certain Slack channel.  
### todo
- [x] Generate key pairs inside the slack client
- [x] Encrypt messages
- [ ] Deliver messages and allow recipients to decrypt them
- [ ] Add a feature to see your private key (encrypted)
- [ ] Add a feature to provide your own key pair 
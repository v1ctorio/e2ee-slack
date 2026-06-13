# e2ee Slack

Proof of Concept of e2ee communication inside the slack client using the video embed block and OpenPGP public key encryption.


The idea is that the bot embeds a website that generates a simple webapp which, embedded in the slack app, allow you to:
- Create a openpgp key pair which is stored in the server. The private key is encrypted with a passphrase so the service (_or any intermediary such as Slack_) can't decrypt it.
- Once the user has a private key, allow them to encrypt messages targeting other registered users public keys.



**The decrypted message and private key never leaves the users client**. All the encryption is done locally.

### Usage
Available commands:
- `/e2ee register` - Register a key pair into the app
- `/e2ee send`     - Send a message through e2ee Slack
- `/e2ee self`     - Display are your stored data
- `/e2ee self delete` - Delete your data from the app 


### Features 

Messages can be delivered via *letter* or *channel* mode. In the first one, the *envelope* (encrypted message inside Slack) is sent to each recipient via DM. In the latter, the *envelope* is sent to a certain Slack channel.  
- [x] Generate key pairs inside the slack client
- [x] Encrypt messages
- [x] Deliver messages and allow recipients to decrypt them
- [x] Add a feature to see your private key (encrypted)
- [ ] Add a feature to provide your own key pair 
- [ ] Verify message signature on read
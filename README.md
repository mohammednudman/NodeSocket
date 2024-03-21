# Web Socket application using only Node.js built-in modules

## About
First of all, leave your star 🌟 on this repo.

## Features Checklist + Challenges

- Web Socket Server
    - Receiving data
        - [x] Establishes handshake connections according to the Web Socket protocol
        - [x] Receives masked data payloads
        - [x] Decodes 7-bits long data payloads
        - [x] Decodes 16-bits long data payloads
        - [ ] Decodes 64-bits long data payloads
    - Replying
        - [x] Builds data frames according to the Web Socket protocol
        - [x] Sends 7-bits long unmasked data payloads
        - [x] Sends 16-bits long unmasked data payloads
        - [ ] Sends 64-bits long unmasked data payloads

- Web Socket Client
    - [x] Establishes handshake connections according to the Web Socket protocol
    - [x] Sends masked data payloads
    - [x] Receives masked and unmasked data payloads
    - [ ] Tries reconnecting to the server after a disconnection

## Running

- Server - Use the Node.js v20 and execute the [server.mjs](./server.mjs) file as `node server.mjs`
- Client - You just need to open the [index.html](./index.html) file on a browser. (I use Firefox for the examples)

## Have fun!
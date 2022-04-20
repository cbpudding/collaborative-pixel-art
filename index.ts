//import { PrismaClient } from ".prisma/client";

import express from "express";
import fs from "fs";
//import jwt from "jsonwebtoken";
import ws from "ws";

const app = express();
const config = JSON.parse(fs.readFileSync("config.json").toString());
//const prisma = new PrismaClient();

app.get("/", (_, res) => {
    res.sendFile(__dirname + "/public/index.html");
});

app.use(express.static("public"));

const wss = new ws.WebSocketServer({server: app.listen(9078)});

/* Message types:
Type 0 - C -> S - Ping(Keepalive)
Type 1 - S -> C - Pong(Acknowledgement)
Type 2 - S -> C - Place(Pixel update)
*/

// Handle WebSocket connections
wss.on("connection", sock => {
    (sock as any).last = Date.now();
    sock.on("message", data => {
        try {
            let msg = JSON.parse(data.toString());
            if(typeof msg.type !== "undefined") {
                if(msg.type === 0) {
                    (sock as any).last = Date.now();
                    sock.send(JSON.stringify({type: 1}));
                }
            }
        } catch(e) {
            console.error(e);
        }
    });
});

// Terminate sockets that haven't sent a keepalive message in 15 seconds
setInterval(() => {
    wss.clients.forEach(sock => {
        if(sock.readyState === ws.OPEN) {
            if((sock as any).last < Date.now() - 15000) {
                sock.terminate();
            }
        }
    });
}, 15000);

// API for placing pixels
app.get('/api/v1/placePixel/:x/:y/:color', (req, res) => {
    let status = {success: false};
    // Collect data
    let [x, y, color] = [req.params.x, req.params.y, req.params.color];
    // Make sure we're dealing with correct types
    if(typeof x === "number" && typeof y === "number" && typeof color === "string") {
        if(/[0-9A-Fa-f]{6}/.test(color)) {
            // Check bounds
            if(x >= 0 && x < 512 && y >= 0 && y < 512) {
                // TODO: Check whether a user is authenticated or not
                // TODO: Make sure the user hasn't placed a pixel in the last five minutes
                // TODO: Add entry to log
                // TODO: Update image on server
                // Announce change via WebSocket
                let msg = JSON.stringify({type: 2, x, y, color});

                wss.clients.forEach(sock => {
                    if(sock.readyState === ws.OPEN) {
                        sock.send(msg);
                    }
                });
            }
        }
    }
    res.send(status);
});
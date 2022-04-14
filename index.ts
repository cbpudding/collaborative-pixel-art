import { Jimp } from "@jimp/core";
import { PrismaClient } from ".prisma/client";

import express from "express";
import fs from "fs";
import jimp from "jimp";
import jwt from "jsonwebtoken";
import ws from "ws";

const app = express();
const config = JSON.parse(fs.readFileSync("config.json").toString());
const prisma = new PrismaClient();

var image: Jimp | null = null;

jimp.read("public/canvas.png").then(img => { image = img; }).catch(err => { throw err; });

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
    let color = req.params.color;
    let x = parseInt(req.params.x);
    let y = parseInt(req.params.y);
    // Make sure we're dealing with correct types
    if(typeof x === "number" && typeof y === "number" && typeof color === "string") {
        if(/[0-9A-Fa-f]{6}/.test(color)) {
            // Make sure we actually have an image to work with
            if(image != null) {
                // Check bounds
                if(x >= 0 && x < image.bitmap.width && y >= 0 && y < image.bitmap.height) {
                    // TODO: Check whether a user is authenticated or not
                    // TODO: Make sure the user hasn't placed a pixel in the last five minutes
                    // TODO: Add entry to log
                    // Update image on server
                    image.setPixelColor(jimp.cssColorToHex("#" + color), x, y);
                    image.write("public/canvas.png");
                    // Announce change via WebSocket
                    let msg = JSON.stringify({type: 2, x, y, color});

                    wss.clients.forEach(sock => {
                        if(sock.readyState === ws.OPEN) {
                            sock.send(msg);
                        }
                    });
                    // We have succeeded!
                    status.success = true;
                }
            }
        }
    }
    res.send(status);
});
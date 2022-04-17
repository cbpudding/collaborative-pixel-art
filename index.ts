import DiscordOAuth2 from "discord-oauth2";
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
var oauth2 = new DiscordOAuth2({
    clientId: config.id,
    clientSecret: config.secret,
    redirectUri: "http://localhost:9078/api/v1/authenticate"
});

jimp.read("public/canvas.png").then(img => { image = img; }).catch(e => { throw e; });

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

// Test endpoint: https://discord.com/api/oauth2/authorize?client_id=961409481248493628&redirect_uri=http%3A%2F%2Flocalhost%3A9078%2Fapi%2Fv1%2Fauthenticate&response_type=code&scope=identify
// Endpoint for authenticating Discord users
// TODO: Populate state and check for validity
app.get("/api/v1/authenticate", (req, res) => {
    // Get the code from the authorization prompt
    let code = req.query.code as string;
    // Ask Discord for the token nicely
    oauth2.tokenRequest({
        code,
        grantType: "authorization_code",
        scope: ["identify"]
    }).then(token => {
        // TODO: Fetch user information
        // TODO: Store token in the database
        // TODO: Generate a JWT
        // TODO: Store the JWT in a cookie
        // Redirect to the homepage
        res.redirect("/");
    }).catch(e => {
        console.error(e);
        res.send("Authentication failed. Please try again or contact Breadpudding#9078 if issues persist.");
    });
});

// Endpoint for placing pixels
app.get('/api/v1/place', (req, res) => {
    let status = {success: false};
    // Collect data
    let color = req.query.color as string;
    let x = parseInt(req.query.x as string);
    let y = parseInt(req.query.y as string);
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
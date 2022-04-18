import DiscordOAuth2 from "discord-oauth2";
import { Jimp } from "@jimp/core";
import { PrismaClient } from ".prisma/client";

import cookie_parser from "cookie-parser";
import express from "express";
import fs from "fs";
import jimp from "jimp";
import jwt from "jsonwebtoken";
import ws from "ws";

const app = express();
const config = JSON.parse(fs.readFileSync("config.json").toString());
const prisma = new PrismaClient();
const privatekey = fs.readFileSync("private.pem");
const publickey = fs.readFileSync("public.pem");

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

app.use(cookie_parser());
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
app.get("/api/v1/authenticate", async (req, res) => {
    // Get the code from the authorization prompt
    let code = req.query.code as string;
    // Ask Discord for the token nicely
    oauth2.tokenRequest({
        code,
        grantType: "authorization_code",
        scope: ["identify"]
    }).then(async token => {
        // Fetch user information
        oauth2.getUser(token.access_token).then(async user => {
            // Generate a JWT
            let webtoken = jwt.sign({id: user.id}, privatekey, {algorithm: "RS512"});
            // Store user data in the database
            let userdata = await prisma.user.findUnique({
                where: {
                    id: user.id
                }
            });
            if(userdata == null) {
                // Create a new user if they don't exist in the database
                await prisma.user.create({
                    data: {
                        access_token: token.access_token,
                        avatar: user.avatar,
                        discriminator: user.discriminator,
                        id: user.id,
                        last_placed: new Date(0),
                        refresh_token: token.refresh_token,
                        token_expiration: new Date(Date.now() + (token.expires_in * 1000)),
                        token_type: token.token_type,
                        username: user.username
                    }
                });
            } else {
                // Update the existing user if they already exist
                await prisma.user.update({
                    where: {
                        id: user.id
                    },
                    data: {
                        access_token: token.access_token,
                        avatar: user.avatar,
                        discriminator: user.discriminator,
                        refresh_token: token.refresh_token,
                        token_expiration: new Date(Date.now() + (token.expires_in * 1000)),
                        token_type: token.token_type,
                        username: user.username
                    }
                });
            }
            // Store the JWT in a cookie and redirect to the homepage
            res.cookie("token", webtoken).redirect("/");
        }).catch(e => {
            console.error(e);
            res.send("Unable to fetch user data. Please try again or contact Breadpudding#9078 if issues persist.");
        })
    }).catch(e => {
        console.error(e);
        res.send("Authentication failed. Please try again or contact Breadpudding#9078 if issues persist.");
    });
});

// Endpoint for placing pixels
/* Error codes:
0 - No error
1 - Input validation error
2 - Image not loaded
3 - Authentication failure
4 - Internal server error(Check logs)
5 - Rate limited
*/
app.get('/api/v1/place', async (req, res) => {
    let status = { code: 0, success: false };
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
                    // Check whether a user is authenticated or not
                    if(typeof req.cookies.token !== "undefined") {
                        jwt.verify(req.cookies.token, publickey, async (err: any, token: any) => {
                            if(err == null) {
                                // Checking the image again to make Typescript happy
                                if(image != null) {
                                    try {
                                        // Fetch information about the user
                                        let userdata = await prisma.user.findUnique({
                                            where: {
                                                id: token.id
                                            }
                                        });
                                        if(userdata != null) {
                                            // Make sure the user hasn't placed a pixel in the last five minutes
                                            if((new Date().valueOf() - userdata.last_placed.valueOf()) >= 300000) {
                                                // Update last_placed for the user
                                                await prisma.user.update({
                                                    where: {
                                                        id: token.id
                                                    },
                                                    data: {
                                                        last_placed: new Date()
                                                    }
                                                });
                                                // Add entry to log
                                                await prisma.pixel.create({
                                                    data: {
                                                        color,
                                                        user_id: token.id,
                                                        x,
                                                        y
                                                    }
                                                });
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
                                                status.code = 0;
                                                status.success = true;
                                            } else {
                                                status.code = 5;
                                            }
                                        } else {
                                            status.code = 3;
                                        }
                                    } catch(e) {
                                        console.error(e);
                                        status.code = 4;
                                    }
                                } else {
                                    status.code = 2;
                                }
                            } else {
                                console.error(err);
                                status.code = 3;
                            }
                        });
                    } else {
                        status.code = 3;
                    }
                } else {
                    status.code = 1;
                }
            } else {
                status.code = 2;
            }
        } else {
            status.code = 1;
        }
    } else {
        status.code = 1;
    }
    res.send(status);
});
const express = require("express");
const ws = require("ws");

const app = express();

app.get("/", (_, res) => {
    res.sendFile(__dirname + "/public/index.htm");
});

app.get('/api/v1/:coords', (req,res) => {
    let status = {
        success: true
    }
    console.log(JSON.parse(req.params.coords))
    res.send(status);
});
app.use(express.static("public"));

const wss = new ws.WebSocketServer({server: app.listen(9078)});

// TODO: Endpoint for changing a pixel
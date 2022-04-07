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
    res.send(status);
});

app.use(express.static("public"));

const wss = new ws.WebSocketServer({server: app.listen(9077)});

wss.on('connection', function connection(ws) {
    console.log('connected')
    ws.on('message', function message(data) {
      console.log('received: %s', data);
    });
  
    ws.send('something');
});
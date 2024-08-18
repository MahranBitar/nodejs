const WebSocket = require("ws");
const http = require("http");
const url = require("url");
const uuid = require("uuid");
const express = require("express");
const net = require("net"); // إضافة مكتبة net
const app = express();

const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const tunnels = new Map();

app.get("/", (req, res) => {
  res.send("Welcome to the Tunnel Server!");
});

app.get("/create-tunnel", (req, res) => {
  const tunnelId = uuid.v4();
  const tunnelUrl = `wss://${req.headers.host}/tunnel/${tunnelId}`;
  res.json({ url: tunnelUrl });
});

wss.on("connection", (ws, request) => {
  const pathname = url.parse(request.url).pathname;
  const tunnelId = pathname.split("/")[2];

  if (!tunnels.has(tunnelId)) {
    tunnels.set(tunnelId, { ws: new Set(), tcp: null });
  }
  tunnels.get(tunnelId).ws.add(ws);

  if (!tunnels.get(tunnelId).tcp) {
    const tcpClient = new net.Socket();
    tcpClient.connect(25565, 'localhost', () => {
      console.log(`Connected to TCP server on port 25565`);
    });

    tcpClient.on('data', (data) => {
      ws.send(data); // إرسال البيانات من TCP إلى WebSocket
    });

    tcpClient.on('close', () => {
      console.log('TCP connection closed');
    });

    tcpClient.on('error', (err) => {
      console.error('TCP error:', err);
    });

    tunnels.get(tunnelId).tcp = tcpClient;
  }

  ws.on("message", (message) => {
    const tunnel = tunnels.get(tunnelId);
    if (tunnel.tcp) {
      tunnel.tcp.write(message); // إرسال البيانات من WebSocket إلى TCP
    }
  });

  ws.on("close", () => {
    tunnels.get(tunnelId).ws.delete(ws);
    if (tunnels.get(tunnelId).ws.size === 0 && tunnels.get(tunnelId).tcp) {
      tunnels.get(tunnelId).tcp.end(); // إغلاق اتصال TCP
      tunnels.delete(tunnelId);
    }
  });
});

server.on("upgrade", (request, socket, head) => {
  const pathname = url.parse(request.url).pathname;
  if (pathname.startsWith("/tunnel/")) {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit("connection", ws, request);
    });
  } else {
    socket.destroy();
  }
});

server.listen(process.env.PORT || 8080, () => {
  console.log("Server is listening on port 8080");
});

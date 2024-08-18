const WebSocket = require("ws");
const http = require("http");
const url = require("url");
const uuid = require("uuid");
const express = require("express");
const dgram = require("dgram"); // إضافة مكتبة dgram
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
    tunnels.set(tunnelId, { ws: new Set(), udp: null });
  }
  tunnels.get(tunnelId).ws.add(ws);

  if (!tunnels.get(tunnelId).udp) {
    // إنشاء خادم UDP
    const udpServer = dgram.createSocket("udp4");

    udpServer.on("message", (msg) => {
      ws.send(msg); // إرسال البيانات من UDP إلى WebSocket
    });

    udpServer.on("error", (err) => {
      console.error("UDP error:", err);
    });

    udpServer.bind(19132, () => {
      console.log("UDP server listening on port 19132");
    });

    tunnels.get(tunnelId).udp = udpServer;
  }

  ws.on("message", (message) => {
    const tunnel = tunnels.get(tunnelId);
    if (tunnel.udp) {
      // إرسال البيانات من WebSocket إلى UDP
      tunnel.udp.send(message, 0, message.length, 19132, 'localhost', (err) => {
        if (err) {
          console.error("Error sending UDP message:", err);
        }
      });
    }
  });

  ws.on("close", () => {
    tunnels.get(tunnelId).ws.delete(ws);
    if (tunnels.get(tunnelId).ws.size === 0 && tunnels.get(tunnelId).udp) {
      tunnels.get(tunnelId).udp.close(); // إغلاق اتصال UDP
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

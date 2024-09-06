const WebSocket = require("ws");
const http = require("http");
const url = require("url");
const uuid = require("uuid");
const express = require("express");
const dgram = require("dgram");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const tunnels = new Map(); // لتخزين الأنفاق النشطة
const clientAddresses = new Map(); // لتخزين عناوين IP للأجهزة المتصلة

// البورت الذي تستخدمه ماين كرافت Bedrock للبث واكتشاف العوالم
const minecraftPort = 19132;

// إعداد خادم UDP للاستماع لحزم الـ broadcast على البورت 19132
const udpServer = dgram.createSocket("udp4");

// التعامل مع الحزم المستلمة من الأجهزة المحلية
udpServer.on("message", (message, rinfo) => {
    console.log(`Received packet from ${rinfo.address}:${rinfo.port}`);
    console.log(`Packet length: ${message.length}`);
    console.log("Packet data before sending via WebSocket:");
    console.log(message);  // طباعة الحزمة قبل إرسالها عبر WebSocket

    // إرسال الحزمة إلى جميع عملاء النفق باستثناء الجهاز الذي أرسلها
    tunnels.forEach((clients, tunnelId) => {
        clients.forEach(client => {
            if (client.readyState === WebSocket.OPEN && clientAddresses.get(client) !== rinfo.address) {
                console.log(`[Tunnel ${tunnelId}] Sending packet to WebSocket client ${clientAddresses.get(client)}`);
                client.send(message, { binary: true });
            }
        });
    });
});

// التعامل مع الأخطاء في UDP
udpServer.on("error", (err) => {
    console.error(`UDP server error:\n${err.stack}`);
    udpServer.close();
});

udpServer.bind(minecraftPort);

// معالجة الطلبات على المسار '/'
app.get("/", (req, res) => {
    res.send("Welcome to the Tunnel Server!");
});

// إنشاء نفق جديد وتوفير رابط النفق للمستخدم
app.get("/create-tunnel", (req, res) => {
    const tunnelId = uuid.v4(); // إنشاء معرف فريد للنفق
    const tunnelUrl = `wss://${req.headers.host}/tunnel/${tunnelId}`;
    res.json({ url: tunnelUrl });
});

// التعامل مع اتصالات WebSocket
wss.on("connection", (ws, request) => {
    const clientAddress = request.headers['x-forwarded-for'] || request.socket.remoteAddress;
    console.log(`Client connected from IP: ${clientAddress}`);

    const pathname = url.parse(request.url).pathname;
    const tunnelId = pathname.split("/")[2]; // استخراج ID النفق من URL

    if (!tunnels.has(tunnelId)) {
        tunnels.set(tunnelId, new Set());
    }
    tunnels.get(tunnelId).add(ws);

    // تخزين عنوان IP للعميل
    clientAddresses.set(ws, clientAddress);

    console.log(`User connected to tunnel ${tunnelId}`);
    console.log(`Tunnel URL: wss://${request.headers.host}/tunnel/${tunnelId}`);

    ws.on("message", (message) => {
        console.log(`[Tunnel ${tunnelId}] Received WebSocket message`);
        console.log(message);  // طباعة الرسالة قبل إرسالها عبر UDP

        // إرسال الحزمة عبر UDP إلى خادم Minecraft المحلي
        udpServer.send(message, 0, message.length, minecraftPort, "127.0.0.1", () => {
            console.log("Sent packet to local Minecraft server");
        });
    });

    ws.on("close", () => {
        console.log(`[Tunnel ${tunnelId}] User disconnected.`);
        const tunnel = tunnels.get(tunnelId);
        if (tunnel) {
            tunnel.delete(ws);
            clientAddresses.delete(ws);
            if (tunnel.size === 0) {
                tunnels.delete(tunnelId);
            }
        }
    });

    // التعامل مع الأخطاء في WebSocket
    ws.on("error", (error) => {
        console.error(`WebSocket error:\n${error.stack}`);
    });
});

// التعامل مع ترقية طلبات WebSocket
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

// تشغيل الخادم HTTP
server.listen(process.env.PORT || 8080, () => {
    console.log("Server is listening on port 8080");
});

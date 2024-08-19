const WebSocket = require("ws");
const http = require("http");
const url = require("url");
const uuid = require("uuid");
const express = require("express");
const dgram = require("dgram"); // مكتبة UDP
const app = express();

// إعداد خادم HTTP
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const tunnels = new Map(); // لتخزين الأنفاق النشطة
const udpPort = 7551; // تعيين المنفذ المحدد

// إعداد خادم UDP
const udpServer = dgram.createSocket("udp4");

// معالجة الطلبات على المسار '/'
app.get("/", (req, res) => {
  res.send("Welcome to the Tunnel Server!"); // رسالة ترحيبية
});

// إنشاء نفق جديد وتوفير رابط النفق للمستخدم
app.get("/create-tunnel", (req, res) => {
  const tunnelId = uuid.v4(); // إنشاء معرف فريد للنفق
  const tunnelUrl = `wss://${req.headers.host}/tunnel/${tunnelId}`;
  res.json({ url: tunnelUrl }); // إرسال رابط النفق إلى العميل
});

// التعامل مع اتصالات WebSocket
wss.on("connection", (ws, request) => {
  const pathname = url.parse(request.url).pathname;
  const tunnelId = pathname.split("/")[2]; // استخراج ID النفق من URL

  if (!tunnels.has(tunnelId)) {
    tunnels.set(tunnelId, new Set()); // إنشاء مجموعة جديدة للاتصالات
  }
  tunnels.get(tunnelId).add(ws); // إضافة الاتصال إلى النفق المحدد

  console.log(`User connected to tunnel ${tunnelId}`);
  console.log(`Tunnel URL: wss://${request.headers.host}/tunnel/${tunnelId}`); // طباعة رابط النفق

  // التعامل مع الرسائل الواردة من WebSocket
  ws.on("message", (message) => {
    console.log(`[Tunnel ${tunnelId}] Received WebSocket message: ${message}`);

    // إرسال الرسالة عبر UDP إلى خادم UDP
    try {
      const buffer = Buffer.from(message);
      udpServer.send(buffer, 0, buffer.length, udpPort, 'localhost', (err) => {
        if (err) {
          console.error(`Error sending UDP message: ${err}`);
        }
      });
    } catch (error) {
      console.error(`Error processing WebSocket message: ${error}`);
    }
  });

  // التعامل مع إغلاق الاتصال
  ws.on("close", () => {
    console.log(`[Tunnel ${tunnelId}] User disconnected.`);
    tunnels.get(tunnelId).delete(ws); // إزالة الاتصال من النفق
    if (tunnels.get(tunnelId).size === 0) {
      tunnels.delete(tunnelId); // حذف النفق إذا لم يتبقى فيه اتصالات
    }
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

// إعداد خادم UDP للاستماع
udpServer.on("message", (message, rinfo) => {
  console.log(`Received UDP message: ${message} from ${rinfo.address}:${rinfo.port}`);
  
  // إرسال الرسالة إلى جميع العملاء في النفق المحدد
  try {
    for (const [tunnelId, clients] of tunnels) {
      clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
          client.send(message);
        }
      });
    }
  } catch (error) {
    console.error(`Error sending UDP message to WebSocket clients: ${error}`);
  }
});

// تعيين المنفذ UDP المحدد واستدعاء الاستماع عليه
udpServer.bind(udpPort, () => {
  console.log(`UDP server is listening on port ${udpPort}`);
});

// تشغيل الخادم HTTP
server.listen(process.env.PORT || 8080, () => {
  console.log("Server is listening on port 8080");
});

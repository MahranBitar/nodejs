const WebSocket = require("ws");
const http = require("http");
const url = require("url");
const uuid = require("uuid");
const express = require("express");
const app = express();

// إنشاء خادم HTTP
const server = http.createServer(app);
const wss = new WebSocket.Server({ noServer: true });
const tunnels = new Map(); // لتخزين الأنفاق النشطة

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

  // التعامل مع الرسائل الواردة
  ws.on("message", (message) => {
    console.log(`Received message on ${tunnelId}: ${message}`);
    // توجيه الرسالة إلى جميع المستخدمين في النفق المحدد
    tunnels.get(tunnelId).forEach((client) => {
      if (client !== ws && client.readyState === WebSocket.OPEN) {
        client.send(message);
      }
    });
  });

  // التعامل مع إغلاق الاتصال
  ws.on("close", () => {
    console.log(`User disconnected from tunnel ${tunnelId}`);
    tunnels.get(tunnelId).delete(ws); // إزالة الاتصال من النفق
    if (tunnels.get(tunnelId).size === 0) {
      tunnels.delete(tunnelId); // حذف النفق إذا لم يتبقى فيه اتصالات
    }
  });

  // التعامل مع الأخطاء
  ws.on("error", (error) => {
    console.error(`WebSocket error on tunnel ${tunnelId}:`, error);
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

// استماع الخادم على جميع الواجهات
server.listen(process.env.PORT || 8080, "0.0.0.0", () => {
  console.log("Server is listening on port 8080");
});

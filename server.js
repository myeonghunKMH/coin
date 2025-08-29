// server.js
const express = require("express");
const { Server } = require("ws");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

// 프론트엔드 파일을 제공할 정적 폴더 설정
app.use(express.static("public"));

// 업비트 웹소켓 연결
const upbitWs = new WebSocket("wss://api.upbit.com/websocket/v1");

upbitWs.onopen = () => {
  console.log("업비트 웹소켓 서버에 연결되었습니다.");
  const requestMessage = [
    { ticket: uuidv4() },
    { type: "ticker", codes: ["KRW-BTC"] },
  ];
  upbitWs.send(JSON.stringify(requestMessage));
};

upbitWs.onmessage = (event) => {
  // 업비트에서 받은 데이터를 모든 연결된 클라이언트에게 전송
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(event.data);
    }
  });
};

upbitWs.onclose = () => {
  console.log("업비트 웹소켓 연결 끊김");
};

upbitWs.onerror = (error) => {
  console.error("업비트 웹소켓 오류:", error);
};

// 클라이언트로부터의 웹소켓 연결 처리
wss.on("connection", (ws) => {
  console.log("프론트엔드 클라이언트 연결됨");
  ws.on("close", () => {
    console.log("프론트엔드 클라이언트 연결 끊김");
  });
});

// HTTP 서버 시작
server.listen(3000, () => {
  console.log("서버가 http://localhost:3000 에서 실행 중입니다.");
});

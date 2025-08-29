// server.js
const express = require("express");
const { Server } = require("ws");
const http = require("http");
const { v4: uuidv4 } = require("uuid");
const WebSocket = require("ws");
const axios = require("axios"); // axios 라이브러리
const cors = require("cors");

const app = express();
const server = http.createServer(app);
const wss = new Server({ server });

// CORS 허용 (로컬 환경 테스트용)
app.use(cors());

// 프론트엔드 파일을 제공할 정적 폴더 설정
app.use(express.static("public"));

// ---- 캔들 데이터 API 엔드포인트 수정 ----
app.get("/api/candles", async (req, res) => {
  const { unit, market } = req.query;
  if (!unit || !market) {
    return res.status(400).json({ error: "unit과 market 코드가 필요합니다." });
  }

  let url;
  // 단위가 '1D'(1일)인 경우 일 캔들 API 사용
  if (unit === "1D") {
    url = `https://api.upbit.com/v1/candles/days?market=${market}&count=200`;
  }
  // 그 외 분 단위 캔들의 경우 분 캔들 API 사용
  else {
    url = `https://api.upbit.com/v1/candles/minutes/${unit}?market=${market}&count=200`;
  }

  try {
    const response = await axios.get(url, {
      headers: { "Accept-Encoding": "gzip, deflate" },
    });
    res.json(response.data);
  } catch (error) {
    console.error("캔들 데이터 요청 오류:", error.message);
    res.status(500).json({ error: "캔들 데이터를 가져오는 데 실패했습니다." });
  }
});
// ----------------------------------------

// (기존의 웹소켓 연결 코드)
const marketCodes = ["KRW-BTC", "KRW-ETH", "KRW-XRP"];
const upbitWs = new WebSocket("wss://api.upbit.com/websocket/v1");

upbitWs.onopen = () => {
  console.log("업비트 웹소켓 서버에 연결되었습니다.");
  const requestMessage = [
    { ticket: uuidv4() },
    // 티커와 호가창 데이터를 모두 구독하도록 추가
    { type: "ticker", codes: marketCodes },
    { type: "orderbook", codes: marketCodes },
    { format: "DEFAULT" },
  ];
  upbitWs.send(JSON.stringify(requestMessage));
};

upbitWs.onmessage = (event) => {
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

wss.on("connection", (ws) => {
  console.log("프론트엔드 클라이언트 연결됨");
  ws.on("close", () => {
    console.log("프론트엔드 클라이언트 연결 끊김");
  });
});

server.listen(3000, () => {
  console.log("서버가 http://localhost:3000 에서 실행 중입니다.");
});

// chart-manager.js - TradingView Lightweight Charts 버전
import { COIN_NAMES } from "./constants.js";

export class ChartManager {
  constructor(state) {
    this.state = state;
    this.chart = null;
    this.candlestickSeries = null;
    this.volumeSeries = null;
    this.ma5Series = null;
    this.ma20Series = null;
  }

  async fetchAndRender() {
    if (!this.state.activeCoin || !this.state.activeUnit) return;

    try {
      const response = await fetch(
        `/api/candles?unit=${this.state.activeUnit}&market=${this.state.activeCoin}`
      );
      const data = await response.json();

      if (!data || data.length === 0) {
        console.error("캔들 데이터가 비어있습니다.");
        return;
      }

      const sortedData = data.reverse();

      // TradingView 형식으로 데이터 변환
      const candleData = sortedData.map((d) => ({
        time: Math.floor(new Date(d.candle_date_time_kst).getTime() / 1000), // Unix timestamp in seconds
        open: Number(d.opening_price) || 0,
        high: Number(d.high_price) || 0,
        low: Number(d.low_price) || 0,
        close: Number(d.trade_price) || 0,
      }));

      // 데이터 유효성 검사
      if (candleData.length === 0 || !candleData[0].time) {
        console.error("변환된 캔들 데이터가 유효하지 않습니다:", candleData[0]);
        return;
      }

      const volumeData = sortedData.map((d) => ({
        time: Math.floor(new Date(d.candle_date_time_kst).getTime() / 1000),
        value: Number(d.candle_acc_trade_volume) || 0,
        color:
          (Number(d.trade_price) || 0) >= (Number(d.opening_price) || 0)
            ? "rgba(38, 166, 154, 0.5)"
            : "rgba(239, 83, 80, 0.5)",
      }));

      // 이동평균 계산
      const ma5Data = this.calculateMA(candleData, 5)
        .map((ma, i) => ({
          time: candleData[i]?.time,
          value: ma,
        }))
        .filter((item) => item.value !== null);

      const ma20Data = this.calculateMA(candleData, 20)
        .map((ma, i) => ({
          time: candleData[i]?.time,
          value: ma,
        }))
        .filter((item) => item.value !== null);

      console.log("데이터 변환 완료:", {
        candles: candleData.length,
        firstCandle: candleData[0],
        lastCandle: candleData[candleData.length - 1],
        volumePoints: volumeData.length,
        ma5Points: ma5Data.length,
        ma20Points: ma20Data.length,
      });

      this.renderChart(candleData, volumeData, ma5Data, ma20Data);
    } catch (error) {
      console.error("차트 데이터 로딩 오류:", error);
    }
  }

  renderChart(candleData, volumeData, ma5Data, ma20Data) {
    // 기존 차트 제거
    if (this.chart) {
      this.chart.remove();
    }

    const container = document.getElementById("combinedChart");
    if (!container) return;

    // TradingView 차트 생성
    this.chart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: container.clientHeight,
      layout: {
        background: { type: "solid", color: "#1a1a1a" },
        textColor: "#e0e0e0",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.1)" },
        horzLines: { color: "rgba(255, 255, 255, 0.1)" },
      },
      crosshair: {
        mode: LightweightCharts.CrosshairMode.Normal,
        vertLine: {
          color: "#6A7985",
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: "rgba(0, 0, 0, 0.8)",
        },
        horzLine: {
          color: "#6A7985",
          width: 1,
          style: LightweightCharts.LineStyle.Dashed,
          labelBackgroundColor: "rgba(0, 0, 0, 0.8)",
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        // 보조지표 선을 비활성화하는 옵션 추가
        // 이를 통해 MA5, MA20 선이 오른쪽 가격 축에 표시되지 않음
        drawPriceLabels: false,
        drawTicks: false,
      },
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        mouseWheel: false, // 마우스 휠 스크롤 비활성화
        pressedMouseMove: true, // 마우스 드래그로 스크롤 활성화
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: false, // 마우스 휠 줌 비활성화
        pinch: true,
      },
    });

    // 캔들스틱 차트 추가
    this.candlestickSeries = this.chart.addCandlestickSeries({
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
      priceFormat: {
        type: "price",
        precision: 0,
        minMove: 1,
      },
    });

    // 거래량 차트 추가 (히스토그램)
    this.volumeSeries = this.chart.addHistogramSeries({
      color: "#26a69a",
      priceFormat: {
        type: "volume",
      },
      priceScaleId: "volume",
    });

    // 이동평균선 추가
    this.ma5Series = this.chart.addLineSeries({
      color: "#FF0000",
      lineWidth: 1,
      title: "MA5",
      lastValueVisible: true, // 지표의 현재 값을 가격 축에 표시 (라벨)
      lastPriceAnimation: LightweightCharts.LastPriceAnimationMode.OnDataUpdate,
      lineVisible: true, // 선은 보이게
    });

    this.ma20Series = this.chart.addLineSeries({
      color: "#00FF00",
      lineWidth: 1,
      title: "MA20",
      lastValueVisible: true, // 지표의 현재 값을 가격 축에 표시 (라벨)
      lastPriceAnimation: LightweightCharts.LastPriceAnimationMode.OnDataUpdate,
      lineVisible: true, // 선은 보이게
    });

    // 거래량 차트를 별도 스케일로 설정
    this.chart.priceScale("volume").applyOptions({
      scaleMargins: {
        top: 0.7, // 상단 70% 공간은 가격 차트용
        bottom: 0,
      },
    });

    // 데이터 설정
    this.candlestickSeries.setData(candleData);
    this.volumeSeries.setData(volumeData);
    this.ma5Series.setData(ma5Data);
    this.ma20Series.setData(ma20Data);

    // 반응형 처리
    this.setupResponsive();

    // 실시간 업데이트를 위한 참조 저장
    this.lastCandleData = candleData;
  }

  // 실시간 데이터 업데이트 메서드
  updateRealtime(newCandle) {
    if (!this.candlestickSeries) return;

    const formattedCandle = {
      time: Math.floor(
        new Date(newCandle.candle_date_time_kst).getTime() / 1000
      ),
      open: Number(newCandle.opening_price),
      high: Number(newCandle.high_price),
      low: Number(newCandle.low_price),
      close: Number(newCandle.trade_price),
    };

    // 마지막 캔들 업데이트 (실시간)
    this.candlestickSeries.update(formattedCandle);
  }

  calculateMA(candleData, period) {
    const ma = [];
    for (let i = 0; i < candleData.length; i++) {
      if (i < period - 1) {
        ma.push(null);
      } else {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += candleData[i - j].close;
        }
        ma.push(sum / period);
      }
    }
    return ma;
  }

  setupResponsive() {
    if (!this.chart) return;

    const container = document.getElementById("combinedChart");
    if (!container) return;

    // 반응형 리사이즈 처리
    const resizeObserver = new ResizeObserver((entries) => {
      if (this.chart && entries.length > 0) {
        const { width, height } = entries[0].contentRect;
        this.chart.applyOptions({
          width: Math.max(width, 300),
          height: Math.max(height, 300),
        });
      }
    });

    resizeObserver.observe(container);

    // 정리를 위해 observer 저장
    this.resizeObserver = resizeObserver;
  }

  // 🔥 기술적 지표 추가 기능
  addIndicator(type, params = {}) {
    if (!this.chart) return;

    switch (type) {
      case "RSI":
        return this.addRSI(params);
      case "MACD":
        return this.addMACD(params);
      case "BB": // Bollinger Bands
        return this.addBollingerBands(params);
      default:
        console.warn(`지원하지 않는 지표: ${type}`);
    }
  }

  addRSI(params = { period: 14 }) {
    // RSI 계산 및 차트 추가 로직
    const rsiData = this.calculateRSI(this.lastCandleData, params.period);

    const rsiSeries = this.chart.addLineSeries({
      color: "#9C27B0",
      lineWidth: 2,
      title: `RSI(${params.period})`,
      priceScaleId: "rsi",
    });

    // RSI 스케일 설정 (0-100)
    this.chart.priceScale("rsi").applyOptions({
      scaleMargins: {
        top: 0.8,
        bottom: 0,
      },
    });

    rsiSeries.setData(rsiData);
    return rsiSeries;
  }

  calculateRSI(candleData, period = 14) {
    // RSI 계산 로직 (간단 구현)
    const changes = [];
    for (let i = 1; i < candleData.length; i++) {
      changes.push(candleData[i].close - candleData[i - 1].close);
    }

    const rsiData = [];
    for (let i = period; i < changes.length; i++) {
      const gains = changes.slice(i - period, i).filter((c) => c > 0);
      const losses = changes
        .slice(i - period, i)
        .filter((c) => c < 0)
        .map((c) => Math.abs(c));

      const avgGain = gains.reduce((a, b) => a + b, 0) / period;
      const avgLoss = losses.reduce((a, b) => a + b, 0) / period;

      const rs = avgGain / (avgLoss || 0.001);
      const rsi = 100 - 100 / (1 + rs);

      rsiData.push({
        time: candleData[i + 1].time,
        value: rsi,
      });
    }

    return rsiData;
  }

  checkAutoUpdate() {
    // TradingView Charts는 자체적으로 실시간 업데이트를 처리하므로
    // 필요에 따라 새로운 데이터를 fetch해서 update() 메서드 호출
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();

    if (this.state.activeUnit === "1D") {
      if (
        currentHour === 0 &&
        currentMinute === 0 &&
        this.state.lastUpdateTime !== "1D-updated"
      ) {
        this.fetchAndRender();
        this.state.lastUpdateTime = "1D-updated";
      } else if (currentHour !== 0 || currentMinute !== 0) {
        this.state.lastUpdateTime = null;
      }
    } else {
      const unitInMinutes = parseInt(this.state.activeUnit);
      if (unitInMinutes) {
        const isUpdateMinute = currentMinute % unitInMinutes === 0;
        const lastUpdateString = `${this.state.activeUnit}-${currentHour}:${currentMinute}`;
        if (
          isUpdateMinute &&
          now.getSeconds() === 0 &&
          this.state.lastUpdateTime !== lastUpdateString
        ) {
          this.fetchAndRender();
          this.state.lastUpdateTime = lastUpdateString;
        } else if (!isUpdateMinute) {
          this.state.lastUpdateTime = null;
        }
      }
    }
  }

  // 정리 메서드
  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.chart) {
      this.chart.remove();
      this.chart = null;
    }
  }
}

// chart-manager.js - TradingView Lightweight Charts 버전
import { COIN_NAMES } from "./constants.js";

export class ChartManager {
  constructor(state) {
    this.state = state;
    this.priceChart = null; // 메인 차트 인스턴스
    this.volumeChart = null; // 볼륨 차트 인스턴스
    this.priceSeries = null;
    this.volumeSeries = null;
    this.indicatorSeries = {}; // 지표 시리즈를 관리할 객체
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

      const sortedData = data.reverse(); // TradingView 형식으로 데이터 변환

      const candleData = sortedData.map((d) => ({
        time: Math.floor(new Date(d.candle_date_time_kst).getTime() / 1000), // Unix timestamp (초 단위)
        open: Number(d.opening_price) || 0,
        high: Number(d.high_price) || 0,
        low: Number(d.low_price) || 0,
        close: Number(d.trade_price) || 0,
      }));

      const volumeData = sortedData.map((d) => ({
        time: Math.floor(new Date(d.candle_date_time_kst).getTime() / 1000),
        value: Number(d.candle_acc_trade_volume) || 0,
        color:
          (Number(d.trade_price) || 0) >= (Number(d.opening_price) || 0)
            ? "rgba(38, 166, 154, 0.5)"
            : "rgba(239, 83, 80, 0.5)",
      })); // 이동평균 계산

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

      this.renderCharts(candleData, volumeData, ma5Data, ma20Data);
    } catch (error) {
      console.error("차트 데이터 로딩 오류:", error);
    }
  }

  renderCharts(candleData, volumeData, ma5Data, ma20Data) {
    // 기존 차트 제거
    this.destroy();

    const priceContainer = document.getElementById("priceChart");
    const volumeContainer = document.getElementById("volumeChart");

    if (!priceContainer || !volumeContainer) {
      console.error("차트 컨테이너 엘리먼트를 찾을 수 없습니다.");
      return;
    }

    const chartConfig = {
      width: priceContainer.clientWidth,
      height: priceContainer.clientHeight,
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
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        timeVisible: true,
        secondsVisible: false,
        timezone: "Asia/Seoul", // UTC+9 시간대
      },
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: false,
        pinch: true,
      },
    }; // 1. 메인 가격 차트 생성

    this.priceChart = LightweightCharts.createChart(priceContainer, {
      ...chartConfig,
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
      },
    });

    this.priceSeries = this.priceChart.addCandlestickSeries({
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
    this.priceSeries.setData(candleData);
    this.addIndicatorToMainChart(ma5Data, ma20Data); // 2. 볼륨 차트 생성

    const volumeChartConfig = { ...chartConfig };
    volumeChartConfig.width = volumeContainer.clientWidth;
    volumeChartConfig.height = volumeContainer.clientHeight;

    this.volumeChart = LightweightCharts.createChart(volumeContainer, {
      ...volumeChartConfig,
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        // 볼륨 차트의 높이 비율을 줄임
        scaleMargins: {
          top: 0.8,
          bottom: 0,
        },
      },
    });
    this.volumeSeries = this.volumeChart.addHistogramSeries({
      color: "#26a69a",
      priceFormat: { type: "volume" },
    });
    this.volumeSeries.setData(volumeData); // 3. 차트 스케일 동기화

    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      this.volumeChart.timeScale().setVisibleLogicalRange(range);
    });

    this.volumeChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      this.priceChart.timeScale().setVisibleLogicalRange(range);
    });

    // 4. 초기 차트 뷰 설정
    this.priceChart.timeScale().fitContent(); // 반응형 처리

    this.setupResponsive();
    this.lastCandleData = candleData;
  }

  addIndicatorToMainChart(ma5Data, ma20Data) {
    if (!this.priceChart) return;

    this.indicatorSeries.ma5 = this.priceChart.addLineSeries({
      color: "#FF0000",
      lineWidth: 1,
      title: "MA5",
      lastValueVisible: true,
    });
    this.indicatorSeries.ma5.setData(ma5Data);

    this.indicatorSeries.ma20 = this.priceChart.addLineSeries({
      color: "#00FF00",
      lineWidth: 1,
      title: "MA20",
      lastValueVisible: true,
    });
    this.indicatorSeries.ma20.setData(ma20Data);
  }

  updateRealtime(newCandle) {
    if (!this.priceSeries) return;

    const formattedCandle = {
      time: Math.floor(
        new Date(newCandle.candle_date_time_kst).getTime() / 1000
      ),
      open: Number(newCandle.opening_price),
      high: Number(newCandle.high_price),
      low: Number(newCandle.low_price),
      close: Number(newCandle.trade_price),
    };
    this.priceSeries.update(formattedCandle);
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
    const priceContainer = document.getElementById("priceChart");
    const volumeContainer = document.getElementById("volumeChart");

    if (
      !this.priceChart ||
      !this.volumeChart ||
      !priceContainer ||
      !volumeContainer
    )
      return;

    const resizeObserver = new ResizeObserver((entries) => {
      if (this.priceChart && entries[0]) {
        const { width, height } = entries.find(
          (entry) => entry.target === priceContainer
        ).contentRect;
        this.priceChart.applyOptions({
          width: Math.max(width, 300),
          height: Math.max(height, 300),
        });
      }
      if (this.volumeChart && entries[1]) {
        const { width, height } = entries.find(
          (entry) => entry.target === volumeContainer
        ).contentRect;
        this.volumeChart.applyOptions({
          width: Math.max(width, 300),
          height: Math.max(height, 300),
        });
      }
    });

    resizeObserver.observe(priceContainer);
    resizeObserver.observe(volumeContainer);

    this.resizeObserver = resizeObserver;
  }

  destroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
    }
    if (this.priceChart) {
      this.priceChart.remove();
      this.priceChart = null;
    }
    if (this.volumeChart) {
      this.volumeChart.remove();
      this.volumeChart = null;
    }
  }

  checkAutoUpdate() {
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
}

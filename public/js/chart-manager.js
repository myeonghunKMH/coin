// chart-manager.js - TradingView Lightweight Charts 버전 (X축 틱 제거 및 정렬 개선)
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

    // 🔧 공통 차트 설정
    const commonChartConfig = {
      width: priceContainer.clientWidth,
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
      handleScroll: {
        mouseWheel: false,
        pressedMouseMove: true,
      },
      handleScale: {
        axisPressedMouseMove: true,
        mouseWheel: false,
        pinch: true,
      },
    };

    // 🔧 1. 가격 차트 생성 (X축 틱 제거)
    this.priceChart = LightweightCharts.createChart(priceContainer, {
      ...commonChartConfig,
      height: 280,
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        visible: false, // 🔧 X축 틱 완전 제거
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        scaleMargins: {
          top: 0.1,
          bottom: 0.1,
        },
        entireTextOnly: true,
        minimumWidth: 80,
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
    this.addIndicatorToMainChart(ma5Data, ma20Data);

    // 🔧 2. 볼륨 차트 생성 (X축 틱만 표시)
    this.volumeChart = LightweightCharts.createChart(volumeContainer, {
      ...commonChartConfig,
      height: 120,
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        visible: true, // 🔧 볼륨차트에서만 X축 표시
        timeVisible: true,
        secondsVisible: false,
        timezone: "Asia/Seoul",
        fixLeftEdge: true,
        fixRightEdge: true,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        // 🔧 Y축 자동 스케일링을 위해 scaleMargins 조정
        scaleMargins: {
          top: 0.1, // 상단 여백
          bottom: 0, // 하단 여백 제거
        },
        entireTextOnly: true,
        minimumWidth: 80, // 🔧 가격차트와 동일한 Y축 너비
      },
    });

    this.volumeSeries = this.volumeChart.addHistogramSeries({
      color: "#26a69a",
      priceFormat: {
        type: "volume",
        // 🔧 볼륨 포맷 개선
        formatter: (volume) => {
          if (volume >= 1000000) {
            return (volume / 1000000).toFixed(1) + "M";
          } else if (volume >= 1000) {
            return (volume / 1000).toFixed(1) + "K";
          }
          return Math.round(volume).toString();
        },
      },
    });
    this.volumeSeries.setData(volumeData);

    // 🔧 3. 차트 스케일 동기화 (X축 완벽 정렬)
    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      this.volumeChart.timeScale().setVisibleLogicalRange(range);
    });

    this.volumeChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      this.priceChart.timeScale().setVisibleLogicalRange(range);
    });

    // 🔧 4. 크로스헤어 동기화
    this.priceChart.subscribeCrosshairMove((param) => {
      if (param.point) {
        this.volumeChart.setCrosshairPosition(param.point);
      } else {
        this.volumeChart.clearCrosshairPosition();
      }
    });

    this.volumeChart.subscribeCrosshairMove((param) => {
      if (param.point) {
        this.priceChart.setCrosshairPosition(param.point);
      } else {
        this.priceChart.clearCrosshairPosition();
      }
    });

    // 🔧 5. 초기 차트 뷰 설정 및 정렬
    // 두 차트를 동시에 맞춤
    this.priceChart.timeScale().fitContent();
    this.volumeChart.timeScale().fitContent();

    // 반응형 처리
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
      entries.forEach((entry) => {
        const { width, height } = entry.contentRect;

        if (entry.target === priceContainer && this.priceChart) {
          this.priceChart.applyOptions({
            width: Math.max(width, 300),
            height: Math.max(height, 200), // 🔧 최소 높이도 축소
          });
        }

        if (entry.target === volumeContainer && this.volumeChart) {
          this.volumeChart.applyOptions({
            width: Math.max(width, 300),
            height: Math.max(height, 80), // 🔧 볼륨차트 최소 높이 축소
          });
        }
      });
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
    // 시리즈 초기화
    this.priceSeries = null;
    this.volumeSeries = null;
    this.indicatorSeries = {};
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

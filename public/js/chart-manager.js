// chart-manager.js
import { COIN_NAMES } from "./constants.js";
import { CacheManager } from "./cache-manager.js";

export class ChartManager {
  constructor(state) {
    this.state = state;
    this.priceChart = null; // 메인 차트 인스턴스
    this.volumeChart = null; // 볼륨 차트 인스턴스
    this.rsiChart = null;
    this.macdChart = null;
    this.priceSeries = null;
    this.volumeSeries = null;
    this.rsiSeries = null;
    this.macdSeries = null;
    this.macdSignalSeries = null;
    this.macdHistogramSeries = null;
    this.bbUpperSeries = null;
    this.bbLowerSeries = null;
    this.bbMiddleSeries = null;
    this.indicatorSeries = {}; // 지표 시리즈를 관리할 객체
    this.cacheManager = new CacheManager();
    this.allCandleData = []; // 전체 캔들 데이터 저장
    this.isLoadingMore = false;
    this._syncing = false;
    this._crosshairSyncing = false;
  }

  async fetchAndRender() {
    if (!this.state.activeCoin || !this.state.activeUnit) return;

    // 캐시 확인
    const cachedData = this.cacheManager.get(
      this.state.activeCoin,
      this.state.activeUnit,
      null
    );
    if (cachedData) {
      console.log(
        "📦 캐시된 데이터 사용:",
        this.state.activeCoin,
        this.state.activeUnit
      );
      this.processAndRenderData(cachedData);
      return;
    }

    try {
      const response = await fetch(
        `/api/candles?unit=${this.state.activeUnit}&market=${this.state.activeCoin}&count=100`
      );
      const data = await response.json();

      if (!data || data.length === 0) {
        console.error("캔들 데이터가 비어있습니다.");
        return;
      }

      // 캐시 저장
      this.cacheManager.set(this.state.activeCoin, this.state.activeUnit, data);
      this.processAndRenderData(data);
    } catch (error) {
      console.error("차트 데이터 로딩 오류:", error);
    }
  }

  processAndRenderData(data) {
    this.allCandleData = [...data];

    // 캔들 데이터를 캐시에 등록
    this.cacheManager.addCandles(
      this.state.activeCoin,
      this.state.activeUnit,
      data
    );

    const sortedData = data.reverse();

    // 데이터 검증 및 변환
    const candleData = [];
    const volumeData = [];

    for (let i = 0; i < sortedData.length; i++) {
      const d = sortedData[i];

      // 필수 필드 존재 확인
      if (!d || !d.candle_date_time_kst) {
        console.warn("데이터 누락:", i, d);
        continue;
      }

      // KST 시간 처리
      let timeValue;
      try {
        const kstTimeString = d.candle_date_time_kst;
        const kstDate = new Date(kstTimeString);
        timeValue = kstDate.getTime();

        if (isNaN(timeValue)) {
          console.warn("잘못된 시간:", kstTimeString);
          continue;
        }
      } catch (error) {
        console.warn("시간 파싱 오류:", d.candle_date_time_kst, error);
        continue;
      }

      const time = Math.floor(timeValue / 1000);

      // 시간 값 유효성 검사
      const currentTime = Math.floor(Date.now() / 1000);
      const oneYearAgo = currentTime - 365 * 24 * 60 * 60;
      const oneYearLater = currentTime + 365 * 24 * 60 * 60;

      if (time < oneYearAgo || time > oneYearLater) {
        console.warn("비정상적인 시간 값:", time, new Date(time * 1000));
        continue;
      }

      // OHLC 값 변환 및 검증
      const open = parseFloat(d.opening_price);
      const high = parseFloat(d.high_price);
      const low = parseFloat(d.low_price);
      const close = parseFloat(d.trade_price);
      const volume = parseFloat(d.candle_acc_trade_volume) || 0;

      // 값 유효성 검사
      if (
        isNaN(open) ||
        isNaN(high) ||
        isNaN(low) ||
        isNaN(close) ||
        open <= 0 ||
        high <= 0 ||
        low <= 0 ||
        close <= 0
      ) {
        console.warn("잘못된 OHLC 값:", { open, high, low, close });
        continue;
      }

      // OHLC 논리 검증
      if (high < Math.max(open, close) || low > Math.min(open, close)) {
        console.warn("OHLC 논리 오류:", { open, high, low, close });
        continue;
      }

      // 유효한 데이터만 추가
      candleData.push({ time, open, high, low, close });
      volumeData.push({
        time,
        value: Math.max(0, volume),
        color:
          close >= open ? "rgba(38, 166, 154, 0.5)" : "rgba(239, 83, 80, 0.5)",
      });
    }

    console.log(`유효한 데이터: ${candleData.length}/${sortedData.length}`);

    // 시간 순 정렬
    candleData.sort((a, b) => a.time - b.time);
    volumeData.sort((a, b) => a.time - b.time);

    // 최소 데이터 개수 확인
    if (candleData.length < 5) {
      console.error("유효한 데이터가 너무 적습니다:", candleData.length);
      return;
    }

    // MA 계산
    const ma5Data = this.calculateSafeMA(candleData, 5);
    const ma20Data = this.calculateSafeMA(candleData, 20);

    console.log("차트 렌더링 시작");
    this.renderCharts(candleData, volumeData);
  }

  calculateSafeMA(candleData, period) {
    const result = [];

    for (let i = 0; i < candleData.length; i++) {
      if (i < period - 1) {
        continue;
      }

      let sum = 0;
      let validCount = 0;

      for (let j = 0; j < period; j++) {
        const candle = candleData[i - j];
        if (
          candle &&
          typeof candle.close === "number" &&
          !isNaN(candle.close)
        ) {
          sum += candle.close;
          validCount++;
        }
      }

      if (validCount === period) {
        result.push({
          time: candleData[i].time,
          value: sum / period,
        });
      }
    }

    return result;
  }

  renderCharts(candleData, volumeData) {
    // 데이터 유효성 최종 검사
    if (!Array.isArray(candleData) || candleData.length === 0) {
      console.error("캔들 데이터 없음");
      return;
    }

    if (!Array.isArray(volumeData) || volumeData.length === 0) {
      console.error("볼륨 데이터 없음");
      return;
    }

    // 기존 차트 제거
    this.destroy();

    const priceContainer = document.getElementById("priceChart");
    const volumeContainer = document.getElementById("volumeChart");

    if (!priceContainer || !volumeContainer) {
      console.error("차트 컨테이너 엘리먼트를 찾을 수 없습니다.");
      return;
    }

    // 공통 차트 설정
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
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
      handleScale: {
        axisPressedMouseMove: {
          time: true,
          price: true,
        },
        mouseWheel: true,
        pinch: true,
        axisDoubleClickReset: {
          time: true,
          price: true,
        },
      },
    };

    // 1. 가격 차트 생성 (X축 틱 제거)
    this.priceChart = LightweightCharts.createChart(priceContainer, {
      ...commonChartConfig,
      height: 280,
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        visible: false, // X축 틱 완전 제거
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
      lastValueVisible: false, // 마지막 가격 숨김
      priceLineVisible: false, // 가격선 숨김
    });
    this.priceSeries.setData(candleData);

    // 2. 볼륨 차트 생성 (X축 틱만 표시)
    this.volumeChart = LightweightCharts.createChart(volumeContainer, {
      ...commonChartConfig,
      height: 120,
      timeScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        visible: true,
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
        fixLeftEdge: true,
        fixRightEdge: true,
        tickMarkFormatter: (time) => {
          const date = new Date(time * 1000);

          // 시간단위에 따른 포맷 변경
          if (this.state.activeUnit === "1D") {
            // 일봉: 6일 간격으로 표시, 달 바뀌는 곳에 영문월
            const day = date.getDate();
            const isMonthBoundary = day <= 6; // 월 초인지 확인

            if (isMonthBoundary) {
              return date.toLocaleDateString("en-US", {
                timeZone: "Asia/Seoul",
                month: "short", // Sep, Oct, Nov
                day: "numeric",
              });
            } else {
              return day.toString(); // 10, 16, 22, 28
            }
          } else if (this.state.activeUnit === "240") {
            // 4시간봉: 2일 간격으로 표시, 달 바뀌는 곳에 영문월
            const day = date.getDate();
            const isMonthBoundary = day <= 2; // 월 초 2일 이내

            if (isMonthBoundary) {
              return date.toLocaleDateString("en-US", {
                timeZone: "Asia/Seoul",
                month: "short", // Sep, Oct
                day: "numeric",
              });
            } else {
              return day.toString(); // 10, 12, 14, 16
            }
          } else {
            // 분봉: 기존대로 시:분
            return date.toLocaleTimeString("ko-KR", {
              timeZone: "Asia/Seoul",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            });
          }
        },
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        scaleMargins: {
          top: 0.1,
          bottom: 0,
        },
        entireTextOnly: true,
        minimumWidth: 80,
      },
      localization: {
        // 크로스헤어 라벨 포맷 변경 (yy.mm.dd.hh:mm)
        timeFormatter: (time) => {
          const date = new Date(time * 1000);
          return date
            .toLocaleDateString("ko-KR", {
              timeZone: "Asia/Seoul",
              year: "2-digit",
              month: "2-digit",
              day: "2-digit",
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
            .replace(/\//g, ".")
            .replace(", ", ".");
        },
        dateFormatter: (time) => {
          const date = new Date(time * 1000);
          return date.toLocaleDateString("ko-KR", {
            timeZone: "Asia/Seoul",
            month: "short",
            day: "numeric",
          });
        },
      },
    });

    this.volumeSeries = this.volumeChart.addHistogramSeries({
      color: "#26a69a",
      priceFormat: {
        type: "volume",
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

    // 시간단위별 틱 간격 조정
    if (this.state.activeUnit === "240") {
      // 4시간봉
      this.volumeChart.timeScale().applyOptions({
        barSpacing: 12, // 틱 간격 늘리기 (2일씩)
      });
    } else if (this.state.activeUnit === "1D") {
      // 1일봉
      this.volumeChart.timeScale().applyOptions({
        barSpacing: 18, // 틱 간격 더 늘리기 (6일씩)
      });
    }

    // 3. 차트 스케일 동기화 (X축 완벽 정렬)
    const syncTimeScale = (range, source = "price") => {
      if (!range) return;

      // 순환 참조 방지를 위한 플래그
      if (this._syncing) return;
      this._syncing = true;

      try {
        // 소스에 따라 다른 차트들 동기화
        if (source !== "volume" && this.volumeChart) {
          this.volumeChart.timeScale().setVisibleLogicalRange(range);
        }
        if (source !== "price" && this.priceChart) {
          this.priceChart.timeScale().setVisibleLogicalRange(range);
        }
        if (this.rsiChart) {
          this.rsiChart.timeScale().setVisibleLogicalRange(range);
        }
        if (this.macdChart) {
          this.macdChart.timeScale().setVisibleLogicalRange(range);
        }
      } catch (error) {
        console.warn("차트 동기화 오류:", error);
      } finally {
        this._syncing = false;
      }
    };

    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      syncTimeScale(range, "price");
    });
    this.volumeChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      syncTimeScale(range, "volume");
    });

    // 4. 개선된 크로스헤어 동기화 (모든 차트 완벽 동기화)
    const syncCrosshair = (param, source = "price") => {
      if (this._crosshairSyncing) return;
      this._crosshairSyncing = true;

      try {
        if (param.point) {
          const x = param.point.x;

          // 모든 차트에 동일한 X 좌표로 크로스헤어 설정
          if (source !== "price" && this.priceChart) {
            this.priceChart.setCrosshairPosition(
              x,
              priceContainer.clientHeight / 2
            );
          }
          if (source !== "volume" && this.volumeChart) {
            this.volumeChart.setCrosshairPosition(
              x,
              volumeContainer.clientHeight / 2
            );
          }
          if (this.rsiChart) {
            const rsiContainer = document.querySelector(
              "#rsiChart .chart-content"
            );
            if (rsiContainer) {
              this.rsiChart.setCrosshairPosition(
                x,
                rsiContainer.clientHeight / 2
              );
            }
          }
          if (this.macdChart) {
            const macdContainer = document.querySelector(
              "#macdChart .chart-content"
            );
            if (macdContainer) {
              this.macdChart.setCrosshairPosition(
                x,
                macdContainer.clientHeight / 2
              );
            }
          }
        } else {
          // 모든 차트에서 크로스헤어 제거
          if (source !== "price" && this.priceChart)
            this.priceChart.clearCrosshairPosition();
          if (source !== "volume" && this.volumeChart)
            this.volumeChart.clearCrosshairPosition();
          if (this.rsiChart) this.rsiChart.clearCrosshairPosition();
          if (this.macdChart) this.macdChart.clearCrosshairPosition();
        }
      } catch (error) {
        console.warn("크로스헤어 동기화 오류:", error);
      } finally {
        this._crosshairSyncing = false;
      }
    };

    this.priceChart.subscribeCrosshairMove((param) => {
      syncCrosshair(param, "price");
    });

    this.volumeChart.subscribeCrosshairMove((param) => {
      syncCrosshair(param, "volume");
    });

    // 5. 초기 차트 뷰 설정 (오른쪽은 최신 데이터이므로 여유 없음)
    this.priceChart.timeScale().setVisibleLogicalRange({
      from: 20, // 100개 데이터 중 처음 20개 숨김 (왼쪽 여유)
      to: 100, // 마지막까지 표시 (오른쪽 여유 없음)
    });
    this.volumeChart.timeScale().setVisibleLogicalRange({
      from: 20,
      to: 100,
    });

    // 반응형 처리 및 무한스크롤 설정
    this.setupResponsive();
    this.setupInfiniteScroll();
    this.lastCandleData = candleData;
    this.lastVolumeData = volumeData;
  }

  // 🔧 보조지표 계산 메서드들
  calculateBollingerBands(candleData, period = 20, multiplier = 2) {
    const result = { upper: [], middle: [], lower: [] };

    for (let i = period - 1; i < candleData.length; i++) {
      const slice = candleData.slice(i - period + 1, i + 1);
      const closes = slice.map((c) => c.close);
      const sma = closes.reduce((sum, close) => sum + close, 0) / period;

      const variance =
        closes.reduce((sum, close) => sum + Math.pow(close - sma, 2), 0) /
        period;
      const stdDev = Math.sqrt(variance);

      result.middle.push({ time: candleData[i].time, value: sma });
      result.upper.push({
        time: candleData[i].time,
        value: sma + stdDev * multiplier,
      });
      result.lower.push({
        time: candleData[i].time,
        value: sma - stdDev * multiplier,
      });
    }

    return result;
  }

  calculateRSI(candleData, period = 14) {
    const result = [];
    const gains = [];
    const losses = [];

    for (let i = 1; i < candleData.length; i++) {
      const change = candleData[i].close - candleData[i - 1].close;
      gains.push(change > 0 ? change : 0);
      losses.push(change < 0 ? -change : 0);

      if (i >= period) {
        const avgGain =
          gains.slice(-period).reduce((sum, gain) => sum + gain, 0) / period;
        const avgLoss =
          losses.slice(-period).reduce((sum, loss) => sum + loss, 0) / period;

        const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
        const rsi = 100 - 100 / (1 + rs);

        result.push({ time: candleData[i].time, value: rsi });
      }
    }

    return result;
  }

  calculateMACD(
    candleData,
    fastPeriod = 12,
    slowPeriod = 26,
    signalPeriod = 9
  ) {
    // 🔧 디버깅: 입력 데이터 검증
    console.log("MACD 계산 시작:", {
      dataLength: candleData.length,
      firstTime: candleData[0]?.time,
      lastTime: candleData[candleData.length - 1]?.time,
    });

    // EMA 계산 함수 - 🔧 null 체크 강화
    const calculateEMA = (data, period) => {
      const ema = new Array(data.length); // 🔧 전체 길이로 초기화
      const multiplier = 2 / (period + 1);

      // 🔧 첫 번째 유효한 값 찾기
      let firstValidIndex = 0;
      while (
        firstValidIndex < data.length &&
        (data[firstValidIndex] == null || isNaN(data[firstValidIndex]))
      ) {
        firstValidIndex++;
      }

      if (firstValidIndex >= data.length) return [];

      // 🔧 초기값들을 모두 첫 번째 유효값으로 채움
      for (let i = 0; i <= firstValidIndex; i++) {
        ema[i] = data[firstValidIndex];
      }

      // 🔧 EMA 계산
      for (let i = firstValidIndex + 1; i < data.length; i++) {
        if (data[i] != null && !isNaN(data[i])) {
          ema[i] = data[i] * multiplier + ema[i - 1] * (1 - multiplier);
        } else {
          ema[i] = ema[i - 1];
        }
      }

      return ema;
    };

    const closes = candleData.map((c) => c.close);
    const fastEMA = calculateEMA(closes, fastPeriod);
    const slowEMA = calculateEMA(closes, slowPeriod);

    // 🔧 EMA 결과 검증
    console.log("EMA 계산 결과:", {
      fastEMALength: fastEMA.length,
      slowEMALength: slowEMA.length,
      fastEMAHasNull: fastEMA.some((v) => v == null || isNaN(v)),
      slowEMAHasNull: slowEMA.some((v) => v == null || isNaN(v)),
    });

    const macdLine = [];
    for (let i = 0; i < closes.length; i++) {
      if (
        fastEMA[i] != null &&
        slowEMA[i] != null &&
        !isNaN(fastEMA[i]) &&
        !isNaN(slowEMA[i])
      ) {
        macdLine.push(fastEMA[i] - slowEMA[i]);
      } else {
        macdLine.push(0); // 🔧 null 대신 0으로 처리
      }
    }

    const signalLine = calculateEMA(macdLine, signalPeriod);

    const result = {
      macd: [],
      signal: [],
      histogram: [],
    };

    // 🔧 결과 데이터 검증 및 필터링
    for (let i = slowPeriod - 1; i < candleData.length; i++) {
      const time = candleData[i].time;
      const macdValue = macdLine[i];
      const signalValue = signalLine[i];

      // 🔧 유효한 값만 추가
      if (
        macdValue != null &&
        signalValue != null &&
        !isNaN(macdValue) &&
        !isNaN(signalValue)
      ) {
        result.macd.push({ time, value: macdValue });
        result.signal.push({ time, value: signalValue });

        const histogramValue = macdValue - signalValue;
        result.histogram.push({
          time,
          value: histogramValue,
          color: histogramValue >= 0 ? "#26a69a" : "#ef5350",
        });
      }
    }

    // 🔧 최종 검증
    console.log("MACD 최종 결과:", {
      macdLength: result.macd.length,
      signalLength: result.signal.length,
      histogramLength: result.histogram.length,
      hasNullValues: result.histogram.some(
        (h) => h.value == null || isNaN(h.value)
      ),
    });

    return result;
  }

  // 🔧 보조지표 차트 생성 메서드들
  createRSIChart() {
    const container = document.querySelector("#rsiChart .chart-content");
    if (!container) return null;

    this.rsiChart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 95,
      layout: {
        background: { type: "solid", color: "#1a1a1a" },
        textColor: "#e0e0e0",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.1)" },
        horzLines: { color: "rgba(255, 255, 255, 0.1)" },
      },
      timeScale: {
        visible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        barSpacing: this.volumeChart
          ? this.volumeChart.timeScale().options().barSpacing
          : 6,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        scaleMargins: { top: 0.1, bottom: 0.1 },
        entireTextOnly: true, // 🔧 추가
        minimumWidth: 80, // 🔧 추가
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
    });

    this.rsiSeries = this.rsiChart.addLineSeries({
      color: "#FFA500",
      lineWidth: 2,
    });

    // 즉시 동기화 적용
    if (this.priceChart) {
      const currentRange = this.priceChart.timeScale().getVisibleLogicalRange();
      if (currentRange) {
        this.rsiChart.timeScale().setVisibleLogicalRange(currentRange);
      }
    }

    this.rsiChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (this._syncing) return;
      this._syncing = true;
      try {
        if (this.priceChart)
          this.priceChart.timeScale().setVisibleLogicalRange(range);
        if (this.volumeChart)
          this.volumeChart.timeScale().setVisibleLogicalRange(range);
        if (this.macdChart)
          this.macdChart.timeScale().setVisibleLogicalRange(range);
      } finally {
        this._syncing = false;
      }
    });

    // 크로스헤어 동기화만 유지
    this.rsiChart.subscribeCrosshairMove((param) => {
      if (this._crosshairSyncing) return;
      this._crosshairSyncing = true;
      try {
        if (param.point && this.priceChart) {
          this.priceChart.setCrosshairPosition(
            param.point.x,
            document.getElementById("priceChart").clientHeight / 2
          );
          this.volumeChart.setCrosshairPosition(
            param.point.x,
            document.getElementById("volumeChart").clientHeight / 2
          );
          if (this.macdChart) {
            const macdContainer = document.querySelector(
              "#macdChart .chart-content"
            );
            if (macdContainer) {
              this.macdChart.setCrosshairPosition(
                param.point.x,
                macdContainer.clientHeight / 2
              );
            }
          }
        } else if (!param.point) {
          this.priceChart?.clearCrosshairPosition();
          this.volumeChart?.clearCrosshairPosition();
          this.macdChart?.clearCrosshairPosition();
        }
      } finally {
        this._crosshairSyncing = false;
      }
    });

    return this.rsiChart;
  }

  createMACDChart() {
    const container = document.querySelector("#macdChart .chart-content");
    if (!container) return null;

    this.macdChart = LightweightCharts.createChart(container, {
      width: container.clientWidth,
      height: 95,
      layout: {
        background: { type: "solid", color: "#1a1a1a" },
        textColor: "#e0e0e0",
      },
      grid: {
        vertLines: { color: "rgba(255, 255, 255, 0.1)" },
        horzLines: { color: "rgba(255, 255, 255, 0.1)" },
      },
      timeScale: {
        visible: false,
        fixLeftEdge: true,
        fixRightEdge: true,
        barSpacing: this.volumeChart
          ? this.volumeChart.timeScale().options().barSpacing
          : 6,
      },
      rightPriceScale: {
        borderColor: "rgba(255, 255, 255, 0.1)",
        textColor: "#e0e0e0",
        scaleMargins: { top: 0.1, bottom: 0.1 },
        entireTextOnly: true, // 🔧 추가
        minimumWidth: 80, // 🔧 추가
      },
      handleScroll: {
        mouseWheel: true,
        pressedMouseMove: true,
        horzTouchDrag: true,
        vertTouchDrag: false,
      },
    });

    this.macdSeries = this.macdChart.addLineSeries({
      color: "#2196F3",
      lineWidth: 2,
      priceFormat: {
        type: "price",
        precision: 0,
        minMove: 1,
      },
    });

    this.macdSignalSeries = this.macdChart.addLineSeries({
      color: "#FF9800",
      lineWidth: 2,
    });

    this.macdHistogramSeries = this.macdChart.addHistogramSeries({
      color: "#26a69a",
    });

    // 즉시 동기화 적용
    if (this.priceChart) {
      const currentRange = this.priceChart.timeScale().getVisibleLogicalRange();
      if (currentRange) {
        this.macdChart.timeScale().setVisibleLogicalRange(currentRange);
      }
    }

    this.macdChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (this._syncing) return;
      this._syncing = true;
      try {
        if (this.priceChart)
          this.priceChart.timeScale().setVisibleLogicalRange(range);
        if (this.volumeChart)
          this.volumeChart.timeScale().setVisibleLogicalRange(range);
        if (this.rsiChart)
          this.rsiChart.timeScale().setVisibleLogicalRange(range);
      } finally {
        this._syncing = false;
      }
    });

    // 크로스헤어 동기화만 유지
    this.macdChart.subscribeCrosshairMove((param) => {
      if (this._crosshairSyncing) return;
      this._crosshairSyncing = true;
      try {
        if (param.point && this.priceChart) {
          this.priceChart.setCrosshairPosition(
            param.point.x,
            document.getElementById("priceChart").clientHeight / 2
          );
          this.volumeChart.setCrosshairPosition(
            param.point.x,
            document.getElementById("volumeChart").clientHeight / 2
          );
          if (this.rsiChart) {
            const rsiContainer = document.querySelector(
              "#rsiChart .chart-content"
            );
            if (rsiContainer) {
              this.rsiChart.setCrosshairPosition(
                param.point.x,
                rsiContainer.clientHeight / 2
              );
            }
          }
        } else if (!param.point) {
          this.priceChart?.clearCrosshairPosition();
          this.volumeChart?.clearCrosshairPosition();
          this.rsiChart?.clearCrosshairPosition();
        }
      } finally {
        this._crosshairSyncing = false;
      }
    });

    return this.macdChart;
  }

  addIndicatorToMainChart(ma5Data, ma20Data) {
    if (!this.priceChart) {
      console.warn("가격 차트가 없어서 지표 추가 불가");
      return;
    }

    // MA5 추가
    if (Array.isArray(ma5Data) && ma5Data.length > 0) {
      this.indicatorSeries.ma5 = this.priceChart.addLineSeries({
        color: "#FF0000",
        lineWidth: 1,
        title: "MA5",
        lastValueVisible: true,
      });
      this.indicatorSeries.ma5.setData(ma5Data);
    }

    // MA20 추가
    if (Array.isArray(ma20Data) && ma20Data.length > 0) {
      this.indicatorSeries.ma20 = this.priceChart.addLineSeries({
        color: "#00FF00",
        lineWidth: 1,
        title: "MA20",
        lastValueVisible: true,
      });
      this.indicatorSeries.ma20.setData(ma20Data);
    }
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
            height: Math.max(height, 200),
          });
        }

        if (entry.target === volumeContainer && this.volumeChart) {
          this.volumeChart.applyOptions({
            width: Math.max(width, 300),
            height: Math.max(height, 80),
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
    // 🔧 보조지표 차트들 정리
    if (this.rsiChart) {
      this.rsiChart.remove();
      this.rsiChart = null;
      this.rsiSeries = null;
    }
    if (this.macdChart) {
      this.macdChart.remove();
      this.macdChart = null;
      this.macdSeries = null;
      this.macdSignalSeries = null;
      this.macdHistogramSeries = null;
    }

    // 볼린저밴드 시리즈 정리
    this.bbUpperSeries = null;
    this.bbLowerSeries = null;
    this.bbMiddleSeries = null;
  }

  checkAutoUpdate() {
    const now = new Date();
    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();
    let shouldUpdate = false;

    if (this.state.activeUnit === "1D") {
      if (
        currentHour === 0 &&
        currentMinute === 0 &&
        this.state.lastUpdateTime !== "1D-updated"
      ) {
        shouldUpdate = true;
        this.state.lastUpdateTime = "1D-updated";
      } else if (currentHour !== 0 || currentMinute !== 0) {
        this.state.lastUpdateTime = null;
      }
    } else {
      const unitInMinutes = parseInt(this.state.activeUnit);
      if (unitInMinutes && currentMinute % unitInMinutes === 0) {
        const lastUpdateString = `${this.state.activeUnit}-${currentHour}:${currentMinute}`;
        if (this.state.lastUpdateTime !== lastUpdateString) {
          shouldUpdate = true;
          this.state.lastUpdateTime = lastUpdateString;
        }
      }
    }

    if (shouldUpdate) {
      console.log("차트 업데이트 실행!");
      this.fetchAndRender();
    }
  }

  setupInfiniteScroll() {
    if (!this.priceChart) return;

    let scrollTimeout;

    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (!range || this.isLoadingMore || range.from > 80) return;

      clearTimeout(scrollTimeout);

      scrollTimeout = setTimeout(() => {
        console.log("무한스크롤 트리거 - range.from:", range.from);
        this.loadMoreHistoricalData()
          .then((success) => {
            if (success) {
              console.log("추가 데이터 차트에 적용 완료");
            } else {
              console.warn("추가 데이터가 없습니다.");
            }
          })
          .catch((error) => {
            console.error("무한스크롤 오류:", error);
          });
      }, 400);
    });
  }

  async loadMoreHistoricalData() {
    if (this.isLoadingMore || this.allCandleData.length === 0) return false;

    this.isLoadingMore = true;
    console.log("추가 히스토리 데이터 로딩...");

    try {
      const to = this.calculateNonOverlappingTime(this.allCandleData);

      if (!to) {
        console.warn("시간 계산 실패로 추가 로딩 중단");
        return false;
      }

      console.log("연속 구간 요청:", to);

      const response = await fetch(
        `/api/candles?unit=${this.state.activeUnit}&market=${
          this.state.activeCoin
        }&count=100&to=${encodeURIComponent(to)}`
      );

      if (!response.ok) {
        console.error("API 응답 오류:", response.status);
        if (response.status === 500) {
          console.log("서버 오류로 인해 추가 로딩을 중단합니다.");
          return false;
        }
        return false;
      }

      const apiData = await response.json();

      if (!apiData || apiData.length === 0) {
        console.log("더 이상 가져올 데이터가 없습니다");
        return false;
      }

      const smartResult = this.cacheManager.getHistoryDataSmart(
        this.state.activeCoin,
        this.state.activeUnit,
        apiData
      );

      let finalData = [];

      if (smartResult.cached.length > 0) {
        console.log("캔들 캐시 활용:", smartResult.cached.length + "개");
        finalData.push(...smartResult.cached);
      }

      if (smartResult.missing.length > 0) {
        console.log("새 데이터 추가:", smartResult.missing.length + "개");
        finalData.push(...smartResult.missing);

        this.cacheManager.addCandles(
          this.state.activeCoin,
          this.state.activeUnit,
          smartResult.missing
        );
      }

      if (
        smartResult.missing.length === 0 &&
        smartResult.cached.length === apiData.length
      ) {
        console.log("완전 캐시 히트! API 데이터를 100% 캐시에서 제공");
      }

      const filteredNewData = finalData.filter(
        (newCandle) =>
          !this.allCandleData.find(
            (existingCandle) =>
              existingCandle.candle_date_time_utc ===
              newCandle.candle_date_time_utc
          )
      );

      if (filteredNewData.length > 0) {
        this.allCandleData.push(...filteredNewData);
        console.log(
          "최종 추가 데이터:",
          filteredNewData.length + "개",
          "(캐시 활용률:",
          (
            ((apiData.length - smartResult.missing.length) / apiData.length) *
            100
          ).toFixed(1) + "%)"
        );
        this.appendHistoricalData(filteredNewData);
        return true;
      } else {
        console.log("새로운 데이터가 없습니다 (모두 중복)");
        return false;
      }
    } catch (error) {
      console.error("추가 데이터 로딩 실패:", error);
      return false;
    } finally {
      this.isLoadingMore = false;
    }
  }

  appendHistoricalData(newData) {
    console.log("🔍 appendHistoricalData 시작", {
      newDataLength: newData.length,
      hasLastCandleData: !!this.lastCandleData,
      lastCandleDataLength: this.lastCandleData?.length || 0,
    });

    const sortedNewData = newData.reverse();
    const newCandleData = [];
    const newVolumeData = [];

    console.log("🔍 데이터 처리 시작");

    for (let i = 0; i < sortedNewData.length; i++) {
      const d = sortedNewData[i];

      if (!d || !d.candle_date_time_kst) continue;

      let timeValue;
      try {
        const kstTimeString = d.candle_date_time_kst;
        const kstDate = new Date(kstTimeString);
        timeValue = kstDate.getTime();
        if (isNaN(timeValue)) continue;
      } catch (error) {
        continue;
      }

      const time = Math.floor(timeValue / 1000);
      const open = parseFloat(d.opening_price);
      const high = parseFloat(d.high_price);
      const low = parseFloat(d.low_price);
      const close = parseFloat(d.trade_price);
      const volume = parseFloat(d.candle_acc_trade_volume) || 0;

      if (
        isNaN(open) ||
        isNaN(high) ||
        isNaN(low) ||
        isNaN(close) ||
        open <= 0 ||
        high <= 0 ||
        low <= 0 ||
        close <= 0
      )
        continue;

      if (high < Math.max(open, close) || low > Math.min(open, close)) continue;

      newCandleData.push({ time, open, high, low, close });
      newVolumeData.push({
        time,
        value: Math.max(0, volume),
        color:
          close >= open ? "rgba(38, 166, 154, 0.5)" : "rgba(239, 83, 80, 0.5)",
      });
    }

    console.log("🔍 데이터 처리 완료", {
      newCandleDataLength: newCandleData.length,
      newVolumeDataLength: newVolumeData.length,
    });

    newCandleData.sort((a, b) => a.time - b.time);
    newVolumeData.sort((a, b) => a.time - b.time);

    console.log("🔍 가격 시리즈 업데이트 시작");
    if (this.priceSeries && newCandleData.length > 0) {
      const existingData = this.lastCandleData || [];
      const combinedData = [...newCandleData, ...existingData];
      console.log("🔍 가격 데이터 결합", {
        newLength: newCandleData.length,
        existingLength: existingData.length,
        combinedLength: combinedData.length,
      });
      this.priceSeries.setData(combinedData);
      this.lastCandleData = combinedData;
      console.log("🔍 가격 시리즈 업데이트 완료");
    }

    console.log("🔍 볼륨 시리즈 업데이트 시작");
    if (this.volumeSeries && newVolumeData.length > 0) {
      this.volumeSeries.setData([
        ...newVolumeData,
        ...(this.lastVolumeData || []),
      ]);
      this.lastVolumeData = [...newVolumeData, ...(this.lastVolumeData || [])];
      console.log("🔍 볼륨 시리즈 업데이트 완료");
    }

    // RSI/MACD 차트 업데이트 추가
    if (newCandleData.length > 0) {
      console.log("🔍 RSI/MACD 업데이트 준비");
      const allCandleData = [...newCandleData, ...this.lastCandleData];

      // 🔧 중복 제거 - 시간 기준으로 유니크하게
      const uniqueCandleData = allCandleData
        .reduce((acc, current) => {
          const existing = acc.find((item) => item.time === current.time);
          if (!existing) {
            acc.push(current);
          }
          return acc;
        }, [])
        .sort((a, b) => a.time - b.time);

      console.log("🔍 중복 제거 후 데이터 상태", {
        beforeLength: allCandleData.length,
        afterLength: uniqueCandleData.length,
        removedDuplicates: allCandleData.length - uniqueCandleData.length,
      });

      // RSI 업데이트
      if (this.rsiSeries) {
        const rsiData = this.calculateRSI(uniqueCandleData, 14);
        this.rsiSeries.setData(rsiData);
      }

      // MACD 업데이트
      if (
        this.macdSeries &&
        this.macdSignalSeries &&
        this.macdHistogramSeries
      ) {
        const macdData = this.calculateMACD(uniqueCandleData);
        this.macdSeries.setData(macdData.macd);
        this.macdSignalSeries.setData(macdData.signal);
        this.macdHistogramSeries.setData(macdData.histogram);
      }
    }

    console.log("🔍 appendHistoricalData 완료");
  }

  calculateNonOverlappingTime(allCandleData) {
    if (!allCandleData || allCandleData.length === 0) return null;

    const oldestCandle = allCandleData[allCandleData.length - 1];
    if (!oldestCandle?.candle_date_time_utc) return null;

    try {
      const oldestTime = new Date(oldestCandle.candle_date_time_utc);

      let targetTime;

      if (this.state.activeUnit === "1D") {
        targetTime = new Date(oldestTime.getTime() - 24 * 60 * 60 * 1000);
      } else {
        const minutes = parseInt(this.state.activeUnit);
        targetTime = new Date(oldestTime.getTime() - minutes * 60 * 1000);
      }

      return targetTime.toISOString();
    } catch (error) {
      console.error("시간 계산 오류:", error);
      return oldestCandle.candle_date_time_utc;
    }
  }

  addMovingAverage(period) {
    if (!this.priceChart || !this.lastCandleData) {
      console.warn("차트 또는 캔들 데이터가 없어서 이동평균선 추가 불가");
      return null;
    }

    const key = `ma${period}`;

    if (this.indicatorSeries[key]) {
      this.priceChart.removeSeries(this.indicatorSeries[key]);
    }

    const colors = {
      5: "#FF6B6B",
      10: "#4ECDC4",
      20: "#45B7D1",
      50: "#96CEB4",
      100: "#FFEAA7",
      200: "#DDA0DD",
    };

    const maSeries = this.priceChart.addLineSeries({
      color: colors[period] || "#FFFFFF",
      lineWidth: 2,
      title: `MA${period}`,
      lastValueVisible: true,
    });

    const maData = this.calculateSafeMA(this.lastCandleData, period);
    if (maData.length > 0) {
      maSeries.setData(maData);
    }

    this.indicatorSeries[key] = maSeries;
    console.log(`MA${period} 추가됨`);
    return maSeries;
  }

  removeMovingAverage(period) {
    const key = `ma${period}`;
    if (this.indicatorSeries[key]) {
      this.priceChart.removeSeries(this.indicatorSeries[key]);
      delete this.indicatorSeries[key];
      console.log(`MA${period} 제거됨`);
      return true;
    }
    return false;
  }

  addIndicator(type) {
    if (!this.priceChart || !this.lastCandleData) return null;

    if (type === "RSI") {
      if (!this.rsiChart) {
        this.createRSIChart();
      }

      const rsiData = this.calculateRSI(this.lastCandleData, 14);
      if (rsiData.length > 0) {
        this.rsiSeries.setData(rsiData);
      }

      setTimeout(() => {
        if (this.priceChart && this.rsiChart) {
          const currentRange = this.priceChart
            .timeScale()
            .getVisibleLogicalRange();
          const priceBarSpacing = this.priceChart
            .timeScale()
            .options().barSpacing;
          if (currentRange) {
            this.rsiChart.timeScale().setVisibleLogicalRange(currentRange);
            this.rsiChart
              .timeScale()
              .applyOptions({ barSpacing: priceBarSpacing });
          }
        }
      }, 200);

      console.log("RSI 차트 활성화됨");
      return this.rsiSeries;
    } else if (type === "MACD") {
      if (!this.macdChart) {
        this.createMACDChart();
      }

      const macdData = this.calculateMACD(this.lastCandleData);
      if (macdData.macd.length > 0) {
        this.macdSeries.setData(macdData.macd);
        this.macdSignalSeries.setData(macdData.signal);
        this.macdHistogramSeries.setData(macdData.histogram);
      }

      // 생성 직후 강제 동기화
      setTimeout(() => {
        if (this.priceChart && this.rsiChart) {
          const currentRange = this.priceChart
            .timeScale()
            .getVisibleLogicalRange();
          const priceBarSpacing = this.priceChart
            .timeScale()
            .options().barSpacing;
          if (currentRange) {
            this.rsiChart.timeScale().setVisibleLogicalRange(currentRange);
            this.rsiChart
              .timeScale()
              .applyOptions({ barSpacing: priceBarSpacing });
          }
        }
      }, 200);

      console.log("MACD 차트 활성화됨");
      return {
        macd: this.macdSeries,
        signal: this.macdSignalSeries,
        histogram: this.macdHistogramSeries,
      };
    } else if (type === "BB") {
      const bbData = this.calculateBollingerBands(this.lastCandleData, 20, 2);

      this.bbUpperSeries = this.priceChart.addLineSeries({
        color: "rgba(255, 255, 255, 0.5)",
        lineWidth: 1,
        title: "BB Upper",
      });

      this.bbMiddleSeries = this.priceChart.addLineSeries({
        color: "rgba(255, 255, 255, 0.3)",
        lineWidth: 1,
        title: "BB Middle",
      });

      this.bbLowerSeries = this.priceChart.addLineSeries({
        color: "rgba(255, 255, 255, 0.5)",
        lineWidth: 1,
        title: "BB Lower",
      });

      this.bbUpperSeries.setData(bbData.upper);
      this.bbMiddleSeries.setData(bbData.middle);
      this.bbLowerSeries.setData(bbData.lower);

      this.indicatorSeries["BB"] = {
        upper: this.bbUpperSeries,
        middle: this.bbMiddleSeries,
        lower: this.bbLowerSeries,
      };

      console.log("볼린저밴드 추가됨");
      return this.indicatorSeries["BB"];
    }

    return null;
  }

  removeIndicator(type) {
    if (type === "RSI" && this.rsiChart) {
      this.rsiChart.remove();
      this.rsiChart = null;
      this.rsiSeries = null;
      console.log("RSI 차트 제거됨");
      return true;
    } else if (type === "MACD" && this.macdChart) {
      this.macdChart.remove();
      this.macdChart = null;
      this.macdSeries = null;
      this.macdSignalSeries = null;
      this.macdHistogramSeries = null;
      console.log("MACD 차트 제거됨");
      return true;
    } else if (type === "BB" && this.indicatorSeries["BB"]) {
      const bb = this.indicatorSeries["BB"];
      this.priceChart.removeSeries(bb.upper);
      this.priceChart.removeSeries(bb.middle);
      this.priceChart.removeSeries(bb.lower);
      delete this.indicatorSeries["BB"];
      this.bbUpperSeries = null;
      this.bbMiddleSeries = null;
      this.bbLowerSeries = null;
      console.log("볼린저밴드 제거됨");
      return true;
    }

    return false;
  }

  clearAllIndicators() {
    Object.keys(this.indicatorSeries).forEach((key) => {
      if (this.indicatorSeries[key]) {
        this.priceChart.removeSeries(this.indicatorSeries[key]);
        delete this.indicatorSeries[key];
      }
    });
    console.log("모든 지표 제거됨");
  }
}

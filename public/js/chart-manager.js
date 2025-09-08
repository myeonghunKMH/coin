// chart-manager.js - TradingView Lightweight Charts 버전 (X축 틱 제거 및 정렬 개선)
import { COIN_NAMES } from "./constants.js";
import { CacheManager } from "./cache-manager.js";

export class ChartManager {
  constructor(state) {
    this.state = state;
    this.priceChart = null; // 메인 차트 인스턴스
    this.volumeChart = null; // 볼륨 차트 인스턴스
    this.priceSeries = null;
    this.volumeSeries = null;
    this.indicatorSeries = {}; // 지표 시리즈를 관리할 객체
    this.cacheManager = new CacheManager();
  }

  // 기존 async fetchAndRender() { 메서드 전체를 다음으로 교체
  async fetchAndRender() {
    if (!this.state.activeCoin || !this.state.activeUnit) return;

    // 캐시 확인
    const cachedData = this.cacheManager.get(
      this.state.activeCoin,
      this.state.activeUnit
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
        `/api/candles?unit=${this.state.activeUnit}&market=${this.state.activeCoin}`
      );
      const data = await response.json();

      if (!data || data.length === 0) {
        console.error("캔들 데이터가 비어있습니다.");
        return;
      }

      // 캐시 저장
      this.cacheManager.set(this.state.activeCoin, this.state.activeUnit, data);
      console.log(
        "💾 데이터 캐시 저장:",
        this.state.activeCoin,
        this.state.activeUnit
      );

      this.processAndRenderData(data);
    } catch (error) {
      console.error("차트 데이터 로딩 오류:", error);
    }
  }

  // 🆕 새 메서드 추가 (fetchAndRender 다음에)
  // 기존 processAndRenderData 메서드를 다음으로 교체
  processAndRenderData(data) {
    this.allCandleData = [...data];

    console.log("🔍 원본 데이터 샘플:", data.slice(0, 3));

    const sortedData = data.reverse();

    // 🔧 더 엄격한 데이터 검증 및 변환
    const candleData = [];
    const volumeData = [];

    for (let i = 0; i < sortedData.length; i++) {
      const d = sortedData[i];

      // 필수 필드 존재 확인
      if (!d || !d.candle_date_time_kst) {
        console.warn("⚠️ 데이터 누락:", i, d);
        continue;
      }

      // 🔧 KST 시간을 그대로 사용 (변환하지 않음)
      let timeValue;
      try {
        const kstTimeString = d.candle_date_time_kst;

        // KST 시간을 직접 파싱 (오프셋 조정 없이)
        const kstDate = new Date(kstTimeString);
        timeValue = kstDate.getTime();

        if (isNaN(timeValue)) {
          console.warn("⚠️ 잘못된 시간:", kstTimeString);
          continue;
        }
      } catch (error) {
        console.warn("⚠️ 시간 파싱 오류:", d.candle_date_time_kst, error);
        continue;
      }

      const time = Math.floor(timeValue / 1000);
      // 시간 값 유효성 검사
      const currentTime = Math.floor(Date.now() / 1000);
      const oneYearAgo = currentTime - 365 * 24 * 60 * 60;
      const oneYearLater = currentTime + 365 * 24 * 60 * 60;

      if (time < oneYearAgo || time > oneYearLater) {
        console.warn("⚠️ 비정상적인 시간 값:", time, new Date(time * 1000));
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
        console.warn("⚠️ 잘못된 OHLC 값:", { open, high, low, close });
        continue;
      }

      // OHLC 논리 검증
      if (high < Math.max(open, close) || low > Math.min(open, close)) {
        console.warn("⚠️ OHLC 논리 오류:", { open, high, low, close });
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

    console.log(`✅ 유효한 데이터: ${candleData.length}/${sortedData.length}`);
    // 시간 순 정렬
    candleData.sort((a, b) => a.time - b.time);
    volumeData.sort((a, b) => a.time - b.time);

    // 🔧 실제 차트에 표시될 시간 확인
    console.log("🔍 실제 차트 시간 범위:", {
      first: new Date(candleData[0]?.time * 1000),
      last: new Date(candleData[candleData.length - 1]?.time * 1000),
    });

    // 최소 데이터 개수 확인
    if (candleData.length < 5) {
      console.error("❌ 유효한 데이터가 너무 적습니다:", candleData.length);
      return;
    }

    // MA 계산 (안전한 버전)
    const ma5Data = this.calculateSafeMA(candleData, 5);
    const ma20Data = this.calculateSafeMA(candleData, 20);

    console.log("📊 차트 렌더링 시작");
    this.renderCharts(candleData, volumeData, ma5Data, ma20Data);
  }

  // 🔧 새로운 안전한 MA 계산 메서드 추가
  calculateSafeMA(candleData, period) {
    const result = [];

    for (let i = 0; i < candleData.length; i++) {
      if (i < period - 1) {
        // 충분한 데이터가 없으면 건너뛰기 (null 대신)
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

  renderCharts(candleData, volumeData, ma5Data, ma20Data) {
    console.log("🎨 renderCharts 호출됨");
    console.log("📊 데이터 개수:", {
      candle: candleData?.length || 0,
      volume: volumeData?.length || 0,
      ma5: ma5Data?.length || 0,
      ma20: ma20Data?.length || 0,
    });

    // 데이터 유효성 최종 검사
    if (!Array.isArray(candleData) || candleData.length === 0) {
      console.error("❌ 캔들 데이터 없음");
      return;
    }

    if (!Array.isArray(volumeData) || volumeData.length === 0) {
      console.error("❌ 볼륨 데이터 없음");
      return;
    }

    // 샘플 데이터 로그
    console.log("🔍 캔들 데이터 샘플:", candleData[0]);
    console.log("🔍 볼륨 데이터 샘플:", volumeData[0]);

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
        visible: true,
        timeVisible: true,
        secondsVisible: false,
        shiftVisibleRangeOnNewBar: true,
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
      localization: {
        timeFormatter: (time) => {
          // 🔧 커스텀 시간 포매터로 KST 시간 강제 표시
          const date = new Date(time * 1000);
          return date.toLocaleTimeString("ko-KR", {
            timeZone: "Asia/Seoul",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
        },
        dateFormatter: (time) => {
          // 🔧 커스텀 날짜 포매터로 KST 날짜 강제 표시
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
    if (!this.priceChart) {
      console.warn("⚠️ 가격 차트가 없어서 지표 추가 불가");
      return;
    }

    // MA5 추가 (데이터가 있는 경우에만)
    if (Array.isArray(ma5Data) && ma5Data.length > 0) {
      this.indicatorSeries.ma5 = this.priceChart.addLineSeries({
        color: "#FF0000",
        lineWidth: 1,
        title: "MA5",
        lastValueVisible: true,
      });
      this.indicatorSeries.ma5.setData(ma5Data);
      console.log("✅ MA5 추가됨:", ma5Data.length, "개");
    }

    // MA20 추가 (데이터가 있는 경우에만)
    if (Array.isArray(ma20Data) && ma20Data.length > 0) {
      this.indicatorSeries.ma20 = this.priceChart.addLineSeries({
        color: "#00FF00",
        lineWidth: 1,
        title: "MA20",
        lastValueVisible: true,
      });
      this.indicatorSeries.ma20.setData(ma20Data);
      console.log("✅ MA20 추가됨:", ma20Data.length, "개");
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

  // calculateMA 메서드를 다음으로 교체
  calculateMA(candleData, period) {
    const ma = [];
    for (let i = 0; i < candleData.length; i++) {
      if (i < period - 1) {
        ma.push(null);
      } else {
        let sum = 0;
        let validCount = 0;

        // 🔧 유효한 데이터만 계산에 포함
        for (let j = 0; j < period; j++) {
          const candle = candleData[i - j];
          if (candle && candle.close && !isNaN(candle.close)) {
            sum += candle.close;
            validCount++;
          }
        }

        // 🔧 유효한 데이터가 충분하지 않으면 null
        if (validCount === period) {
          ma.push(sum / period);
        } else {
          ma.push(null);
        }
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

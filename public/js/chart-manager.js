// chart-manager.js - TradingView Lightweight Charts 정리된 버전
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
    this.allCandleData = []; // 전체 캔들 데이터 저장
    this.isLoadingMore = false;
  }

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
    const sortedData = data.reverse();

    // 데이터 검증 및 변환
    const candleData = [];
    const volumeData = [];

    for (let i = 0; i < sortedData.length; i++) {
      const d = sortedData[i];

      // 필수 필드 존재 확인
      if (!d || !d.candle_date_time_kst) {
        console.warn("⚠️ 데이터 누락:", i, d);
        continue;
      }

      // KST 시간 처리
      let timeValue;
      try {
        const kstTimeString = d.candle_date_time_kst;
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

    // 최소 데이터 개수 확인
    if (candleData.length < 5) {
      console.error("❌ 유효한 데이터가 너무 적습니다:", candleData.length);
      return;
    }

    // MA 계산
    const ma5Data = this.calculateSafeMA(candleData, 5);
    const ma20Data = this.calculateSafeMA(candleData, 20);

    console.log("📊 차트 렌더링 시작");
    this.renderCharts(candleData, volumeData, ma5Data, ma20Data);
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

  renderCharts(candleData, volumeData, ma5Data, ma20Data) {
    // 데이터 유효성 최종 검사
    if (!Array.isArray(candleData) || candleData.length === 0) {
      console.error("❌ 캔들 데이터 없음");
      return;
    }

    if (!Array.isArray(volumeData) || volumeData.length === 0) {
      console.error("❌ 볼륨 데이터 없음");
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
    });
    this.priceSeries.setData(candleData);
    this.addIndicatorToMainChart(ma5Data, ma20Data);

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
        timeFormatter: (time) => {
          const date = new Date(time * 1000);
          return date.toLocaleTimeString("ko-KR", {
            timeZone: "Asia/Seoul",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
          });
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

    // 3. 차트 스케일 동기화 (X축 완벽 정렬)
    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      this.volumeChart.timeScale().setVisibleLogicalRange(range);
    });

    this.volumeChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      this.priceChart.timeScale().setVisibleLogicalRange(range);
    });

    // 4. 크로스헤어 동기화
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

  addIndicatorToMainChart(ma5Data, ma20Data) {
    if (!this.priceChart) {
      console.warn("⚠️ 가격 차트가 없어서 지표 추가 불가");
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

  // 100개 데이터 기준으로 조정된 무한스크롤
  // 기존 setupInfiniteScroll() 메서드를 다음으로 교체
  setupInfiniteScroll() {
    if (!this.priceChart) return;

    let failedAttempts = 0;
    const MAX_FAILED_ATTEMPTS = 3;
    let lastFailedTimestamp = null;
    let scrollTimeout; // 디바운싱용
    let lastTriggeredRange = null; // 마지막 트리거된 범위

    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      if (this.isLoadingMore || !range) return;

      // 실패 횟수 제한 확인
      if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
        return;
      }

      // 트리거 조건 확인 (왼쪽 끝 근처만)
      const totalRange = range.to - range.from;
      const leftThreshold = range.from + totalRange * 0.15;
      const shouldTrigger = range.from <= 5 || range.from <= leftThreshold;

      if (shouldTrigger) {
        // 디바운싱: 500ms 대기 후 실행
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          // 이미 비슷한 범위에서 트리거됐는지 확인
          if (
            lastTriggeredRange &&
            Math.abs(range.from - lastTriggeredRange.from) < 2
          ) {
            console.log("중복 트리거 방지 - 비슷한 범위에서 이미 실행됨");
            return;
          }

          console.log("무한스크롤 트리거 - range.from:", range.from);
          lastTriggeredRange = { ...range }; // 현재 범위 저장

          this.loadMoreHistoricalData()
            .then((success) => {
              if (success) {
                failedAttempts = 0;
                lastFailedTimestamp = null;
              } else {
                failedAttempts++;
                lastFailedTimestamp = Date.now();
                console.warn(
                  `무한스크롤 실패 횟수: ${failedAttempts}/${MAX_FAILED_ATTEMPTS}`
                );
              }
            })
            .catch((error) => {
              failedAttempts++;
              lastFailedTimestamp = Date.now();
              console.error(
                `무한스크롤 오류 (${failedAttempts}/${MAX_FAILED_ATTEMPTS}):`,
                error
              );
            });
        }, 500); // 500ms 디바운싱
      }
    });

    // 실패 카운터 리셋 (60초 후)
    setInterval(() => {
      if (failedAttempts >= MAX_FAILED_ATTEMPTS && lastFailedTimestamp) {
        const timeSinceLastFail = Date.now() - lastFailedTimestamp;
        if (timeSinceLastFail > 60000) {
          console.log("무한스크롤 재시도 허용 (60초 경과)");
          failedAttempts = 0;
          lastFailedTimestamp = null;
          lastTriggeredRange = null; // 범위도 리셋
        }
      }
    }, 10000);
  }

  async loadMoreHistoricalData() {
    if (this.isLoadingMore || this.allCandleData.length === 0) return false;

    this.isLoadingMore = true;
    console.log("📈 추가 히스토리 데이터 로딩...");

    try {
      const oldestCandle = this.allCandleData[this.allCandleData.length - 1];
      const to = oldestCandle?.candle_date_time_utc;

      if (!to) {
        console.warn("⚠️ candle_date_time_utc가 없어서 추가 로딩 중단");
        return false;
      }

      // 캐시 확인
      const cachedData = this.cacheManager.get(
        this.state.activeCoin,
        `${this.state.activeUnit}-${to}`
      );

      let newData;

      if (cachedData) {
        console.log("📦 캐시된 히스토리 데이터 사용");
        newData = cachedData;
      } else {
        const response = await fetch(
          `/api/candles?unit=${this.state.activeUnit}&market=${
            this.state.activeCoin
          }&count=100&to=${encodeURIComponent(to)}`
        );

        if (!response.ok) {
          console.error("❌ API 응답 오류:", response.status);

          // 500 에러 시 더 이상 시도하지 않음
          if (response.status === 500) {
            console.log("⚠️ 서버 오류로 인해 추가 로딩을 중단합니다.");
            return false;
          }
          return false;
        }

        newData = await response.json();

        // 히스토리 데이터 캐시 저장
        if (newData && newData.length > 0) {
          this.cacheManager.set(
            this.state.activeCoin,
            `${this.state.activeUnit}-${to}`,
            newData
          );
        }
      }

      if (newData && newData.length > 0) {
        // 중복 제거 후 데이터 병합
        const filteredNewData = newData.filter(
          (newCandle) =>
            !this.allCandleData.find(
              (existingCandle) =>
                existingCandle.candle_date_time_utc ===
                newCandle.candle_date_time_utc
            )
        );

        if (filteredNewData.length > 0) {
          this.allCandleData.push(...filteredNewData);
          console.log(`📊 추가 데이터 ${filteredNewData.length}개 로드됨`);
          this.appendHistoricalData(filteredNewData);
          return true; // 성공
        } else {
          console.log("📭 새로운 데이터가 없습니다 (모두 중복)");
          return false; // 중복 데이터로 인한 실패
        }
      } else {
        console.log("📭 더 이상 가져올 데이터가 없습니다");
        return false; // 데이터 없음으로 인한 실패
      }
    } catch (error) {
      console.error("❌ 추가 데이터 로딩 실패:", error);
      return false; // 에러로 인한 실패
    } finally {
      this.isLoadingMore = false; // 항상 리셋
    }
  }

  appendHistoricalData(newData) {
    // 새 데이터 처리
    const sortedNewData = newData.reverse();
    const newCandleData = [];
    const newVolumeData = [];

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

    // 시간 순 정렬
    newCandleData.sort((a, b) => a.time - b.time);
    newVolumeData.sort((a, b) => a.time - b.time);

    // 기존 데이터에 새 데이터 추가
    if (this.priceSeries && newCandleData.length > 0) {
      const existingData = this.lastCandleData || [];
      const combinedData = [...newCandleData, ...existingData];
      this.priceSeries.setData(combinedData);
      this.lastCandleData = combinedData;
    }

    if (this.volumeSeries && newVolumeData.length > 0) {
      this.volumeSeries.setData([
        ...newVolumeData,
        ...(this.lastVolumeData || []),
      ]);
      this.lastVolumeData = [...newVolumeData, ...(this.lastVolumeData || [])];
    }

    console.log("✅ 추가 데이터 차트에 적용 완료");
  }
}

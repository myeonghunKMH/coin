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
    this.priceChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      this.volumeChart.timeScale().setVisibleLogicalRange(range);
    });

    this.volumeChart.timeScale().subscribeVisibleLogicalRangeChange((range) => {
      this.priceChart.timeScale().setVisibleLogicalRange(range);
    });

    // 4. 개선된 크로스헤어 동기화 (양방향 동기화)
    this.priceChart.subscribeCrosshairMove((param) => {
      if (param.point) {
        // 가격 차트의 크로스헤어를 볼륨 차트에 동기화
        const point = {
          x: param.point.x,
          y: volumeContainer.clientHeight / 2, // 볼륨 차트 중앙에 표시
        };
        this.volumeChart.setCrosshairPosition(point.x, point.y);
      } else {
        this.volumeChart.clearCrosshairPosition();
      }
    });

    this.volumeChart.subscribeCrosshairMove((param) => {
      if (param.point) {
        // 볼륨 차트의 크로스헤어를 가격 차트에 동기화
        const point = {
          x: param.point.x,
          y: priceContainer.clientHeight / 2, // 가격 차트 중앙에 표시
        };
        this.priceChart.setCrosshairPosition(point.x, point.y);
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

    newCandleData.sort((a, b) => a.time - b.time);
    newVolumeData.sort((a, b) => a.time - b.time);

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
    if (!this.priceChart) return null;

    if (this.indicatorSeries[type]) {
      this.priceChart.removeSeries(this.indicatorSeries[type]);
    }

    if (type === "RSI") {
      const rsiSeries = this.priceChart.addLineSeries({
        color: "#FFA500",
        lineWidth: 2,
        title: "RSI",
        priceScaleId: "rsi",
      });

      this.indicatorSeries[type] = rsiSeries;
      console.log(`${type} 지표 추가됨`);
      return rsiSeries;
    }

    return null;
  }

  removeIndicator(type) {
    if (this.indicatorSeries[type]) {
      this.priceChart.removeSeries(this.indicatorSeries[type]);
      delete this.indicatorSeries[type];
      console.log(`${type} 지표 제거됨`);
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

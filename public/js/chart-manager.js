import { COIN_NAMES } from "./constants.js";

export class ChartManager {
  constructor(state) {
    this.state = state;
    this.chart = null;
  }

  async fetchAndRender() {
    if (!this.state.activeCoin || !this.state.activeUnit) return;
    try {
      const response = await fetch(
        `/api/candles?unit=${this.state.activeUnit}&market=${this.state.activeCoin}`
      );
      const data = await response.json();
      const sortedData = data.reverse();
      const chartData = sortedData.map((d) => ({
        x: new Date(d.candle_date_time_kst).getTime(),
        o: d.opening_price,
        h: d.high_price,
        l: d.low_price,
        c: d.trade_price,
      }));
      const volumeData = sortedData.map((d) => ({
        x: new Date(d.candle_date_time_kst).getTime(),
        y: d.candle_acc_trade_volume,
        color: d.trade_price >= d.opening_price ? "#1261C4" : "#C84A31",
      }));
      const unitForChart = this.getChartTimeUnit();

      this.renderCombinedChart(chartData, volumeData, unitForChart);
    } catch (error) {
      console.error("차트 데이터 로딩 오류:", error);
    }
  }

  renderCombinedChart(chartData, volumeData, unitForChart) {
    if (this.chart) {
      this.chart.destroy();
    }

    const ma5Data = this.calculateMA(chartData, 5).map((y, i) => ({
      x: chartData[i]?.x,
      y,
    }));
    const ma20Data = this.calculateMA(chartData, 20).map((y, i) => ({
      x: chartData[i]?.x,
      y,
    }));

    const volumeBackgroundColors = volumeData.map((d) => d.color);

    const ctx = document.getElementById("combinedChart")?.getContext("2d");
    if (ctx) {
      this.chart = new Chart(ctx, {
        type: "line",
        data: {
          datasets: [
            {
              type: "candlestick",
              label: `${COIN_NAMES[this.state.activeCoin]} 캔들`,
              data: chartData,
              yAxisID: "yPrice",
              color: {
                up: "#1261C4",
                down: "#C84A31",
                unchanged: "#FFFFFF",
              },
              borderColor: {
                up: "#1261C4",
                down: "#C84A31",
                unchanged: "#FFFFFF",
              },
            },
            {
              type: "line",
              label: "MA5",
              data: ma5Data,
              yAxisID: "yPrice",
              borderColor: "#FF0000",
              borderWidth: 1,
              fill: false,
              pointRadius: 0,
              tension: 0.1,
            },
            {
              type: "line",
              label: "MA20",
              data: ma20Data,
              yAxisID: "yPrice",
              borderColor: "#00FF00",
              borderWidth: 1,
              fill: false,
              pointRadius: 0,
              tension: 0.1,
            },
            {
              type: "bar",
              label: "거래량",
              data: volumeData.map((d) => ({ x: d.x, y: d.y })),
              yAxisID: "yVolume",
              backgroundColor: volumeBackgroundColors,
            },
          ],
        },
        options: this.getCombinedChartOptions(unitForChart),
      });
    }
  }

  calculateMA(chartData, period) {
    const ma = [];
    for (let i = 0; i < chartData.length; i++) {
      if (i < period - 1) {
        ma.push(null);
      } else {
        let sum = 0;
        for (let j = 0; j < period; j++) {
          sum += chartData[i - j].c;
        }
        ma.push(sum / period);
      }
    }
    return ma;
  }

  getChartTimeUnit() {
    if (this.state.activeUnit === "1D") return "day";
    return parseInt(this.state.activeUnit) >= 60 ? "hour" : "minute";
  }

  getCombinedChartOptions(unitForChart) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          mode: "index",
          intersect: false,
          position: "nearest",
          callbacks: {
            title: (tooltipItems) => {
              const item = tooltipItems[0];
              if (!item) return "";
              const date = new Date(item.parsed.x);
              return `${date.getFullYear()}-${(date.getMonth() + 1)
                .toString()
                .padStart(2, "0")}-${date
                .getDate()
                .toString()
                .padStart(2, "0")} ${date
                .getHours()
                .toString()
                .padStart(2, "0")}:${date
                .getMinutes()
                .toString()
                .padStart(2, "0")}`;
            },
            label: (context) => {
              const d = context.raw;
              if (context.dataset.type === "candlestick") {
                const volumeDataPoint = this.chart.data.datasets
                  .find((ds) => ds.type === "bar")
                  ?.data.find((vd) => vd.x === d.x);
                const volume = volumeDataPoint ? volumeDataPoint.y : 0;
                return [
                  `시가: ${d.o.toLocaleString()}`,
                  `고가: ${d.h.toLocaleString()}`,
                  `저가: ${d.l.toLocaleString()}`,
                  `종가: ${d.c.toLocaleString()}`,
                  `거래량: ${volume.toLocaleString()}`,
                ];
              }
              if (context.dataset.type === "line") {
                return `${context.dataset.label}: ${d.y.toLocaleString()}`;
              }
              if (context.dataset.type === "bar") {
                return `${context.dataset.label}: ${d.y.toLocaleString()}`;
              }
              return context.formattedValue;
            },
          },
        },
        crosshair: {
          line: {
            color: "#6A7985",
            width: 1,
            dashPattern: [5, 5],
          },
          sync: {
            enabled: true,
            group: 1,
          },
          zoom: {
            enabled: false,
          },
        },
      },
      scales: {
        x: {
          type: "time",
          time: {
            unit: unitForChart,
            // 🔧 날짜 포맷 수정
            displayFormats: {
              minute: "HH:mm", // 09:30
              hour: "MM/DD HH:mm", // 09/04 15:30
              day: "MM/DD", // 09/04
            },
            tooltipFormat: "YYYY-MM-DD HH:mm",
          },
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: {
            color: "white",
            maxTicksLimit: 8,
            source: "auto",
            autoSkip: true,
            autoSkipPadding: 50,
            // 🔧 커스텀 날짜 포맷 함수 추가
            callback: function (value, index, ticks) {
              const date = new Date(value);

              if (unitForChart === "minute") {
                return date.toLocaleTimeString("ko-KR", {
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: false,
                });
              } else if (unitForChart === "hour") {
                return `${
                  date.getMonth() + 1
                }/${date.getDate()} ${date.getHours()}:00`;
              } else if (unitForChart === "day") {
                return `${date.getMonth() + 1}/${date.getDate()}`;
              }

              return date.toLocaleDateString("ko-KR", {
                month: "numeric",
                day: "numeric",
              });
            },
          },
          title: { display: false },
        },
        yPrice: {
          id: "yPrice",
          position: "right",
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: {
            color: "white",
            callback: function (value) {
              return value.toLocaleString();
            },
          },
          title: { display: false },
          stack: "combined",
          stackWeight: 3,
        },
        yVolume: {
          id: "yVolume",
          position: "right",
          grid: { display: false },
          ticks: {
            color: "white",
            maxTicksLimit: 3, // 볼륨축은 3개만
            callback: function (value) {
              // 🔧 볼륨 단위 간소화 (K, M 표시)
              if (value >= 1000000) {
                return (value / 1000000).toFixed(1) + "M";
              } else if (value >= 1000) {
                return (value / 1000).toFixed(1) + "K";
              }
              return value.toLocaleString();
            },
          },
          title: { display: false },
          stack: "combined",
          stackWeight: 1,
        },
      },
      layout: {
        padding: {
          bottom: 10,
          top: 10,
          left: 10,
          right: 10,
        },
      },
      parsing: false,
    };
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

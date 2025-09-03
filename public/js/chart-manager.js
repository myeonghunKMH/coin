import { COIN_NAMES } from "./constants.js";

export class ChartManager {
  constructor(state) {
    this.state = state;
    this.mainChart = null;
    this.volumeChart = null;
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
      this.renderCandleChart(chartData, volumeData, unitForChart);
      this.renderVolumeChart(volumeData, unitForChart);
    } catch (error) {
      console.error("차트 데이터 로딩 오류:", error);
    }
  }

  renderCandleChart(chartData, volumeData, unitForChart) {
    if (this.mainChart) {
      this.mainChart.destroy();
    }
    // Calculate Moving Averages
    const ma5Data = this.calculateMA(chartData, 5).map((y, i) => ({
      x: chartData[i]?.x,
      y,
    }));
    const ma20Data = this.calculateMA(chartData, 20).map((y, i) => ({
      x: chartData[i]?.x,
      y,
    }));
    const ctx = document.getElementById("coinChart")?.getContext("2d");
    if (ctx) {
      this.mainChart = new Chart(ctx, {
        type: "candlestick",
        data: {
          datasets: [
            {
              label: `${COIN_NAMES[this.state.activeCoin]} ${
                this.state.activeUnit
              } 캔들`,
              data: chartData,
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
              borderColor: "#FF0000",
              borderWidth: 1,
              fill: false,
              pointRadius: 0,
              tension: 0,
            },
            {
              type: "line",
              label: "MA20",
              data: ma20Data,
              borderColor: "#00FF00",
              borderWidth: 1,
              fill: false,
              pointRadius: 0,
              tension: 0,
            },
          ],
        },
        options: this.getCandleOptions(volumeData, unitForChart),
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

  renderVolumeChart(volumeData, unitForChart) {
    if (this.volumeChart) {
      this.volumeChart.destroy();
    }
    const ctx = document.getElementById("volumeChart")?.getContext("2d");
    if (ctx) {
      this.volumeChart = new Chart(ctx, {
        type: "bar",
        data: {
          datasets: [
            {
              label: "거래량",
              data: volumeData.map((d) => ({ x: d.x, y: d.y })),
              backgroundColor: volumeData.map((d) => d.color),
            },
          ],
        },
        options: this.getVolumeOptions(unitForChart),
      });
    }
  }

  getChartTimeUnit() {
    if (this.state.activeUnit === "1D") return "day";
    return parseInt(this.state.activeUnit) >= 60 ? "hour" : "minute";
  }

  getCandleOptions(volumeData, unitForChart) {
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
              const volumeItem = volumeData.find((v) => v.x === d.x);
              const volume = volumeItem ? volumeItem.y : 0;
              if (context.dataset.type === "candlestick") {
                return [
                  `시가: ${d.o.toLocaleString()}`,
                  `고가: ${d.h.toLocaleString()}`,
                  `저가: ${d.l.toLocaleString()}`,
                  `종가: ${d.c.toLocaleString()}`,
                  `거래량: ${volume.toLocaleString()}`,
                ];
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
            displayFormats: {
              minute: "H:mm",
              hour: "M/D H:00",
              day: "M/D",
            },
            tooltipFormat: "YYYY-MM-DD HH:mm",
          },
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: {
            color: "white",
            maxTicksLimit: 10,
          },
          title: { display: false },
        },
        y: {
          position: "right",
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: { color: "white" },
          title: { display: false },
        },
      },
      layout: {
        padding: {
          bottom: 0,
        },
      },
    };
  }

  getVolumeOptions(unitForChart) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false, // Volume chart tooltips are hidden (handled by candlestick chart)
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
            displayFormats: {
              minute: "H:mm",
              hour: "M/D H:00",
              day: "M/D",
            },
            tooltipFormat: "YYYY-MM-DD HH:mm",
          },
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: {
            color: "white",
            maxTicksLimit: 10,
            display: false,
          },
          title: { display: false },
        },
        y: {
          position: "right",
          grid: { display: false },
          ticks: { color: "white", maxTicksLimit: 5 },
          title: { display: false },
        },
      },
      layout: {
        padding: {
          top: 0,
        },
      },
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

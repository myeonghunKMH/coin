import { COIN_NAMES } from "./constants.js";

export class ChartManager {
  constructor(state) {
    this.state = state;
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

      const dataset = [
        {
          label: `${COIN_NAMES[this.state.activeCoin]} ${
            this.state.activeUnit
          } 캔들`,
          data: chartData,
          borderColor: "rgb(75, 192, 192)",
          tension: 0.1,
        },
      ];

      const unitForChart = this.getChartTimeUnit();
      const chartOptions = this.getChartOptions(unitForChart);

      if (this.state.mainChart) {
        this.state.mainChart.destroy();
      }

      const ctx = document.getElementById("coinChart")?.getContext("2d");
      if (ctx) {
        this.state.mainChart = new Chart(ctx, {
          type: "candlestick",
          data: { datasets: dataset },
          options: chartOptions,
        });
      }
    } catch (error) {
      console.error("차트 데이터 로딩 오류:", error);
    }
  }

  getChartTimeUnit() {
    if (this.state.activeUnit === "1D") return "day";
    return parseInt(this.state.activeUnit) >= 60 ? "hour" : "minute";
  }

  getChartOptions(unitForChart) {
    return {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { mode: "index", intersect: false },
      },
      scales: {
        x: {
          type: "time",
          time: {
            unit: unitForChart,
            displayFormats: {
              minute: "HH:mm",
              hour: "HH:mm",
              day: "MM-DD",
            },
          },
          title: { display: true, text: "시간", color: "white" },
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: { color: "white" },
        },
        y: {
          title: { display: true, text: "가격(KRW)", color: "white" },
          grid: { color: "rgba(255, 255, 255, 0.1)" },
          ticks: { color: "white" },
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

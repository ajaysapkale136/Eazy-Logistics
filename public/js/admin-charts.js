/* admin-charts.js — Real monthly revenue + bookings chart */

(() => {
  "use strict";

  document.addEventListener("DOMContentLoaded", () => {
    const range = document.getElementById("chartRange");
    loadChart(range.value);

    range.addEventListener("change", () => loadChart(range.value));
  });

  async function loadChart(months) {
    try {
      const res = await fetch(`/admin/api/earnings/monthly?months=${months}`);
      const data = await res.json();

      if (!data.ok) return console.warn("Chart data error:", data);

      renderChart(data.labels, data.bookings, data.revenue);
    } catch (err) {
      console.error("Chart load error:", err);
    }
  }


  document.getElementById("chartRange").addEventListener("change", async function () {
  const months = this.value;

  // Update heading dynamically
  const chartTitle = document.getElementById("chartTitle");
  chartTitle.textContent = `Bookings & Revenue — Last ${months} months`;

  // Then refetch and render the chart data as you already do
  await updateAdminChart(months);
  });

  let chart;

  function renderChart(labels, bookings, revenue) {
    const ctx = document.getElementById("adminMainChart").getContext("2d");

    if (chart) chart.destroy();

    chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Bookings",
            data: bookings,
            borderColor: "#3b82f6",
            backgroundColor: "rgba(59,130,246,0.2)",
            tension: 0.3,
            fill: true
          },
          {
            label: "Revenue",
            data: revenue,
            borderColor: "#fb7185",
            backgroundColor: "rgba(251,113,133,0.15)",
            tension: 0.3,
            fill: true
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: "top" }
        }
      }
    });
  }
})();

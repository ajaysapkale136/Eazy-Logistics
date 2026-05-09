/* admin-ui.js — Real data loading + stable animations */

(() => {
  "use strict";

  const qs = s => document.querySelector(s);
  const qsa = s => Array.from(document.querySelectorAll(s));

  const escapeHtml = str =>
    String(str || "").replace(/[&<>"'`]/g, c => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
      "`": "&#96;"
    }[c]));

  document.addEventListener("DOMContentLoaded", () => {
    loadSummary();
    highlightSidebar();
    animateCards();
  });

  /* ---------------------------------------------------------
     LOAD DASHBOARD SUMMARY DATA (REAL TIME)
  --------------------------------------------------------- */
  async function loadSummary() {
    try {
      const res = await fetch("/admin/api/summary");
      const data = await res.json();

      if (!data.ok) return console.warn("Summary failed", data);

      // Stats
      setText("#metricListings", data.listingsCount);
      setText("#metricUsers", data.usersCount);
      setText("#metricBookings", data.bookingsCount);
      setText("#metricRevenue", "₹" + data.revenue.toLocaleString());

      setText("#stat-listings", data.listingsCount);
      setText("#stat-users", data.usersCount);

      // Top cities
      if (Array.isArray(data.topCities)) {
        qs("#topCities").innerHTML =
          data.topCities
            .map(c => `<li>${escapeHtml(c._id)} (${c.count})</li>`)
            .join("") || "<li>No data</li>";
      }

      // Upcoming / Recent bookings
      if (Array.isArray(data.recentBookings)) {
        qs("#upcomingBookings").innerHTML =
          data.recentBookings
            .map(
              b => `
            <li>
              <strong>${escapeHtml(b.listingTitle || "—")}</strong>
              <div class="muted">${escapeHtml(b.guestName || "—")} • ₹${b.totalPrice}</div>
            </li>`
            )
            .join("") || "<li>No bookings</li>";
      }

    } catch (err) {
      console.error("Error loading dashboard summary:", err);
    }
  }

  /* ---------------------------------------------------------
     Helpers
  --------------------------------------------------------- */
  function setText(id, val) {
    const el = qs(id);
    if (el) el.innerText = val;
  }

  function highlightSidebar() {
    qsa(".admin-sidebar a").forEach(a => {
      if (location.pathname.startsWith(a.getAttribute("href"))) {
        a.classList.add("active");
      }
    });
  }

  function animateCards() {
    qsa(".metric").forEach((el, i) => {
      el.style.opacity = 0;
      el.style.transform = "translateY(8px)";
      setTimeout(() => {
        el.style.transition = "all .45s ease";
        el.style.opacity = 1;
        el.style.transform = "translateY(0)";
      }, 120 + i * 100);
    });
  }
})();

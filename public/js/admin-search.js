document.addEventListener("DOMContentLoaded", () => {
  const searchInput = document.querySelector("#adminSearchInput");
  const resultsContainer = document.querySelector("#searchResults");

  if (!searchInput || !resultsContainer) return;

  searchInput.addEventListener("input", async () => {
    const query = searchInput.value.trim();
    if (!query) {
      resultsContainer.innerHTML = "";
      resultsContainer.classList.remove("visible");
      return;
    }

    const res = await fetch(`/admin/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();

    let html = "";

    if (data.users.length) {
      html += `<div class="section"><h5>Users</h5>`;
      data.users.forEach(u => {
        html += `
          <a class="result-card link-card glass-card" href="/admin/users/${u._id}">
            <i class="fa fa-user icon"></i>
            <div class="text">
              <strong>${u.username}</strong><br>
              <small>${u.email || 'No email'}</small>
            </div>
          </a>`;
      });
      html += `</div>`;
    }

    if (data.listings.length) {
      html += `<div class="section"><h5>Listings</h5>`;
      data.listings.forEach(l => {
        html += `
          <a class="result-card link-card glass-card" href="/listings/${l._id}">
            <i class="fa fa-home icon"></i>
            <div class="text">
              <strong>${l.title}</strong><br>
              <small>${l.location || 'Unknown location'}</small>
            </div>
          </a>`;
      });
      html += `</div>`;
    }

    if (data.bookings.length) {
      html += `<div class="section"><h5>Bookings</h5>`;
      data.bookings.forEach(b => {
        html += `
          <a class="result-card link-card" href="/admin/bookings/${b._id}">
            <i class="fa fa-calendar-check icon"></i>
            <div class="text">
              <strong>${b.guestName || 'Booking ID: ' + b._id}</strong><br>
              <small>Status: ${b.status || 'pending'}</small>
            </div>
          </a>`;
      });
      html += `</div>`;
    }

    resultsContainer.innerHTML = html || "<p class='no-results'>No results found.</p>";
    resultsContainer.classList.add("visible");
  });
});

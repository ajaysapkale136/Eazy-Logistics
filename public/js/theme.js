// public/js/theme.js
(function () {
  const body = document.body;
  const themes = ["light", "dark", "midnight", "neon"];

  // helper: remove all theme classes
  function clearThemes() {
    body.classList.remove(...themes);
  }

  // read attributes set by server (boilerplate.ejs)
  const serverTheme = body.getAttribute("data-server-theme") || "light";
  const isAuth = body.getAttribute("data-auth") === "true";

  clearThemes();

  if (isAuth) {
    // Logged in -> trust server theme (persist it to localStorage)
    body.classList.add(serverTheme);
    try { localStorage.setItem("theme", serverTheme); } catch (e) {}
    return;
  }

  // Logged out or not authenticated -> use saved theme (or default light)
  const saved = (function () {
    try { return localStorage.getItem("theme"); } catch (e) { return null; }
  })();

  const chosen = saved || "light";
  if (themes.includes(chosen)) {
    body.classList.add(chosen);
  } else {
    body.classList.add("light");
  }
})();

document.querySelectorAll(".method").forEach(method => {
  method.addEventListener("click", () => {
    document.querySelectorAll(".method").forEach(m => m.classList.remove("active"));
    method.classList.add("active");
  });
});

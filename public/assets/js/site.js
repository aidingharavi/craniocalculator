(function () {
  const header = document.querySelector(".site-header");
  const toggle = document.querySelector(".nav-toggle");
  if (toggle && header) {
    toggle.addEventListener("click", () => {
      const open = header.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
      toggle.textContent = open ? "Close" : "Menu";
    });
  }
  document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  // Home page question box grows with its content.
  const homeQ = document.getElementById("home-q");
  if (homeQ) {
    const size = () => {
      homeQ.style.height = "auto";
      homeQ.style.height = Math.max(58, homeQ.scrollHeight + 2) + "px";
    };
    homeQ.addEventListener("input", size);
    homeQ.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (homeQ.value.trim()) homeQ.form.submit();
      }
    });
  }
})();

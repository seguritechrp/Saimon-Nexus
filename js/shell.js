/* ============================================================
   SHELL — navegación entre módulos (topnav)
   ============================================================ */
(function () {
  const shell = document.getElementById("shell");
  if (!shell) return;

  const links = Array.from(document.querySelectorAll(".topnav [data-module]"));
  const panes = Array.from(document.querySelectorAll("[data-module-pane]"));

  function setModule(id) {
    const next = id || "operacion";
    shell.dataset.module = next;

    links.forEach((el) => {
      const on = el.dataset.module === next;
      el.classList.toggle("is-active", on);
      if (el.tagName === "BUTTON" || el.getAttribute("role") === "link") {
        if (on) el.setAttribute("aria-current", "page");
        else el.removeAttribute("aria-current");
      }
    });

    panes.forEach((pane) => {
      const show = pane.dataset.modulePane === next && next !== "operacion";
      pane.hidden = !show;
    });

    if (next === "operacion" && window.nexusMap) {
      requestAnimationFrame(() => {
        window.nexusMap.resize();
        window.dispatchEvent(new Event("resize"));
      });
    }

    window.dispatchEvent(new CustomEvent("nexus:module", { detail:{ module: next } }));
  }

  document.querySelector(".topnav")?.addEventListener("click", (e) => {
    const trigger = e.target.closest("[data-module]");
    if (!trigger || !trigger.closest(".topnav")) return;
    e.preventDefault();
    setModule(trigger.dataset.module);
  });

  window.nexusSetModule = setModule;
  setModule(shell.dataset.module || "operacion");
})();

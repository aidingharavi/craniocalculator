(function () {
  const { getJson, esc } = window.CF;

  getJson("/data/calculators.json")
    .then((d) => {
      const live = d.tools.filter((t) => t.status === "live");
      const href = (t) => t.href || `/calculators/model?id=${encodeURIComponent(t.id)}`;
      document.getElementById("home-live").innerHTML = live
        .slice(0, 5)
        .map((t) => `<li><a class="row" href="${esc(href(t))}"><span class="row-title">${esc(t.name)}</span></a></li>`)
        .join("");
    })
    .catch(() => {
      document.getElementById("home-live").innerHTML = '<li class="empty">The calculator list couldn\'t load.</li>';
    });

})();

/* Number the tabs by their actual order and open the first one (works with or without the real-data panels). */
(function () {
  "use strict";
  var tabs = document.querySelectorAll(".tab"); if (!tabs.length) return;
  tabs.forEach(function (t, i) { t.textContent = t.textContent.replace(/^\d+\s*·\s*/, (i + 1) + " · "); });
  tabs[0].click();
})();

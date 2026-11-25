// alex-gil.com: bits shared by every page.
// "Email me": copies the address and says so (works even without a mail app set up).
// If copying isn't allowed, it falls back to opening the mail app.
(function () {
  "use strict";
  document.querySelectorAll("[data-email]").forEach(function (a) {
    var label = a.textContent, timer;
    a.addEventListener("click", function (e) {
      if (!navigator.clipboard) return; // let mailto: open the mail app
      e.preventDefault();
      navigator.clipboard.writeText(a.dataset.email).then(function () {
        a.classList.add("is-copied");
        a.textContent = "Copied: " + a.dataset.email;
        clearTimeout(timer);
        timer = setTimeout(function () { a.classList.remove("is-copied"); a.textContent = label; }, 2600);
      }, function () { location.href = a.href; });
    });
  });
})();

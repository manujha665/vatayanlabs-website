/* Vatayan Labs — size embedded chart iframes to their content.

   The chart files are standalone same-origin HTML, and every one of them is
   taller than any sensible fixed height (they range ~670-1220px), so a fixed
   height either clips the short ones or leaves a gap under the tall ones.
   Measure each one and set the height to match.

   The charts set `min-height: 100vh` on body, so measure from a small base
   height first — otherwise the iframe's own height becomes the floor and the
   value can only ever grow. */
(function () {
  var BASE = 400;

  function fit(frame) {
    try {
      frame.style.height = BASE + "px";
      var doc = frame.contentDocument;
      if (!doc || !doc.body) return;
      var h = Math.max(doc.body.scrollHeight, doc.documentElement.scrollHeight);
      if (h > 0) frame.style.height = h + "px";
    } catch (e) {
      /* cross-origin or not yet loaded — keep the CSS fallback height */
      frame.style.height = "";
    }
  }

  function frames() {
    return Array.prototype.slice.call(
      document.querySelectorAll(".chart-embed iframe")
    );
  }

  function init() {
    frames().forEach(function (frame) {
      frame.addEventListener("load", function () { fit(frame); });
      if (frame.contentDocument && frame.contentDocument.readyState === "complete") fit(frame);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  var timer;
  window.addEventListener("resize", function () {
    clearTimeout(timer);
    timer = setTimeout(function () { frames().forEach(fit); }, 150);
  });
})();

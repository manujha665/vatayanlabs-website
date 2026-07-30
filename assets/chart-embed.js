/* Vatayan Labs — size embedded chart iframes to their content.

   The chart files are standalone same-origin HTML, and they range from about
   670px to 1260px tall, so any fixed height either clips the tall ones or
   leaves a gap under the short ones. Measure each and set the height to match.

   Measure the content element rather than body.scrollHeight: the charts set
   `min-height: 100vh` on body, so scrollHeight is floored by the iframe's own
   height and can only ever grow. Each chart is a single centred `.card` inside
   a padded body, so card height + body padding is the true content height, and
   it doesn't depend on how tall we've currently made the frame.

   A ResizeObserver catches the charts that finish drawing after load — without
   it several settle 2-10px taller than the first measurement and clip. */
(function () {
  function contentHeight(doc) {
    var body = doc.body;
    if (!body) return 0;
    var card = body.firstElementChild;
    if (!card) return body.scrollHeight;
    var cs = doc.defaultView.getComputedStyle(body);
    var pad = parseFloat(cs.paddingTop || 0) + parseFloat(cs.paddingBottom || 0);
    return Math.ceil(card.getBoundingClientRect().height + pad);
  }

  function fit(frame) {
    try {
      var doc = frame.contentDocument;
      if (!doc || !doc.body) return;
      var h = contentHeight(doc);
      if (h > 0 && String(h) !== frame.dataset.fittedHeight) {
        frame.dataset.fittedHeight = String(h);
        frame.style.height = h + "px";
      }
    } catch (e) {
      /* cross-origin or not yet loaded — keep the CSS fallback height */
    }
  }

  function watch(frame) {
    fit(frame);
    if (typeof ResizeObserver === "undefined") return;
    try {
      var card = frame.contentDocument.body.firstElementChild;
      if (!card || frame.dataset.observed) return;
      frame.dataset.observed = "1";
      new ResizeObserver(function () { fit(frame); }).observe(card);
    } catch (e) { /* nothing to observe */ }
  }

  function frames() {
    return Array.prototype.slice.call(document.querySelectorAll(".chart-embed iframe"));
  }

  function init() {
    frames().forEach(function (frame) {
      frame.addEventListener("load", function () { watch(frame); });
      if (frame.contentDocument && frame.contentDocument.readyState === "complete") watch(frame);
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

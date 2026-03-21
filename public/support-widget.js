(function () {
  var script = document.currentScript || (function () {
    var scripts = document.getElementsByTagName("script");
    return scripts[scripts.length - 1];
  })();

  var token = script.getAttribute("data-token");
  var position = script.getAttribute("data-position") || "right";
  var color = script.getAttribute("data-color") || "#B02B2C";
  var label = script.getAttribute("data-label") || "Support";
  var baseUrl = script.getAttribute("data-base-url") || "";

  if (!token) { console.warn("[Support Widget] data-token is required"); return; }

  var isOpen = false;
  var container, iframe, button;

  function createWidget() {
    // Floating button
    button = document.createElement("button");
    button.id = "tw-support-btn";
    button.innerHTML = '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg><span style="margin-left:6px;font-size:14px;font-weight:600;">' + label + "</span>";
    Object.assign(button.style, {
      position: "fixed",
      bottom: "24px",
      [position]: "24px",
      background: color,
      color: "#fff",
      border: "none",
      borderRadius: "99px",
      padding: "12px 20px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      boxShadow: "0 4px 16px rgba(0,0,0,0.2)",
      zIndex: "2147483646",
      fontFamily: "system-ui, sans-serif",
    });
    button.addEventListener("click", toggleWidget);

    // Container for iframe
    container = document.createElement("div");
    container.id = "tw-support-container";
    Object.assign(container.style, {
      position: "fixed",
      bottom: "90px",
      [position]: "24px",
      width: "360px",
      height: "580px",
      maxHeight: "calc(100vh - 110px)",
      borderRadius: "16px",
      boxShadow: "0 8px 40px rgba(0,0,0,0.18)",
      overflow: "hidden",
      display: "none",
      zIndex: "2147483647",
      border: "1px solid rgba(0,0,0,0.08)",
    });

    iframe = document.createElement("iframe");
    iframe.src = baseUrl + "/support/widget?token=" + encodeURIComponent(token) + "&site=" + encodeURIComponent(window.location.hostname);
    iframe.style.cssText = "width:100%;height:100%;border:none;";
    iframe.setAttribute("title", label);

    container.appendChild(iframe);
    document.body.appendChild(button);
    document.body.appendChild(container);
  }

  function toggleWidget() {
    isOpen = !isOpen;
    container.style.display = isOpen ? "block" : "none";
    button.style.borderRadius = isOpen ? "12px" : "99px";
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", createWidget);
  } else {
    createWidget();
  }
})();

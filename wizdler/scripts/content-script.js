// scripts/content-script.js (MV3-ready)

(function () {
  var ns = {
    wsdl: 'http://schemas.xmlsoap.org/wsdl/',
    xhtml: 'http://www.w3.org/1999/xhtml'
  };

  var xmlContent = getXmlContent();
  var isWsdl = false;

  if (xmlContent) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlContent, 'text/xml');
    var root = doc.documentElement;

    if (root && root.namespaceURI === ns.wsdl && root.localName === 'definitions') {
      isWsdl = true;

      // Позначка для popup.js (якщо він перевіряє через executeScript)
      try { window.__WIZDLER_WSDL__ = true; } catch (_) {}
    }
  }

  try {
    chrome.runtime.sendMessage({ command: isWsdl ? 'showAction' : 'hideAction' });
  } catch (e) {
    console.warn('chrome.runtime недоступний або заблокований:', e);
  }

  // ---- message handler (аналог onRequest у MV2) ----
  // Popup/Editor може питати XML або просити зберегти файл
  chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    if (!request || !request.command) {
      sendResponse && sendResponse();
      return;
    }
    switch (request.command) {
      case 'getXml':
        sendResponse && sendResponse(xmlContent || null);
        break;

      case 'download':
        try {
          if (!request.name || !request.data) throw new Error('Missing download name or data.');
          downloadFile(request.name, request.data);
          sendResponse && sendResponse({ ok: true });
        } catch (error) {
          sendResponse && sendResponse({ error: error.message || String(error) });
        }
        break;

      default:
        sendResponse && sendResponse();
    }
    // нічого асинхронного тут не чекаємо → return false
    return false;
  });

  // ---------------- helpers ----------------
  function getXmlContent() {
    var docEl = document.documentElement;
    if (!docEl) return null;

    switch (docEl.namespaceURI) {
      case ns.wsdl:
        // Сторінка вже як XML/WSDL
        return new XMLSerializer().serializeToString(document);

      case ns.xhtml: {
        // Chromium XML Viewer зберігає сирий XML у спеціальному контейнері
        var el = document.getElementById('webkit-xml-viewer-source-xml');
        if (el) return el.innerHTML;

        // Інші варіанти вбудованих в’юерів (залишаємо як коментар, щоб не ламати чужі сторінки)
        // var alt = document.querySelector('body>.xv-source-pane');
        // if (alt) return alt.textContent;

        return null;
      }

      default:
        return null;
    }
  }

  function downloadFile(name, dataUrlOrHref) {
    var a = document.createElementNS(ns.xhtml, 'a');
    a.download = name;
    a.href = dataUrlOrHref;
    a.click();
  }
})();

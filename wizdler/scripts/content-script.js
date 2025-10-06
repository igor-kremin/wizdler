// scripts/content-script.js (MV3-ready)

(function () {
  var ns = {
    wsdl: 'http://schemas.xmlsoap.org/wsdl/',
    xhtml: 'http://www.w3.org/1999/xhtml'
  };

  var xmlContent = getXmlContent();

  if (xmlContent) {
    var parser = new DOMParser();
    var doc = parser.parseFromString(xmlContent, 'text/xml');
    var root = doc.documentElement;

    if (root && root.namespaceURI === ns.wsdl && root.localName === 'definitions') {
      // Попросити background "увімкнути" дію (аналог pageAction у MV2)
      try {
        chrome.runtime.sendMessage({ command: 'showAction' });
      } catch (e) {
        // Якщо щось не так із chrome.runtime (рідко, але хай буде безпечно)
        console.warn('chrome.runtime недоступний або заблокований:', e);
      }

      // Позначка для popup.js (якщо він перевіряє через executeScript)
      try { window.__WIZDLER_WSDL__ = true; } catch (_) {}
    }
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
        if (request.name && request.data) {
          downloadFile(request.name, request.data);
        }
        sendResponse && sendResponse();
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
    try {
      var a = document.createElementNS(ns.xhtml, 'a');
      a.download = name;
      a.href = dataUrlOrHref; // data:..., blob:..., або звичайний URL
      // ініціюємо клік
      var ev = document.createEvent('MouseEvents');
      ev.initEvent('click', true, true);
      a.dispatchEvent(ev);
    } catch (e) {
      console.warn('downloadFile error:', e);
    }
  }
})();

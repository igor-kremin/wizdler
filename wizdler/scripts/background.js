// scripts/background.js  (MV3 service worker)

function setActionEnabled(tabId, enabled) {
  if (tabId == null) return;
  if (enabled) {
    chrome.action.enable(tabId);
    chrome.action.setTitle({ tabId, title: 'Browse WSDL…' });
  } else {
    chrome.action.disable(tabId);
    chrome.action.setTitle({ tabId, title: 'Wizdler: WSDL not found' });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.action.disable();
});

chrome.runtime.onStartup.addListener(() => {
  chrome.action.disable();
});

// УВАГА: у MV3 слухаємо chrome.runtime.onMessage, а не chrome.extension.onRequest
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  const command = request && request.command;

  switch (command) {
    case 'showAction': {
      if (sender.tab) setActionEnabled(sender.tab.id, true);
      sendResponse && sendResponse();
      break;
    }

    case 'hideAction': {
      if (sender.tab) setActionEnabled(sender.tab.id, false);
      sendResponse && sendResponse();
      break;
    }

    case 'openEditor': {
      // chrome.extension.getURL -> chrome.runtime.getURL
      const url =
        chrome.runtime.getURL('editor.html') +
        '#wsdl=' + encodeURIComponent(request.url) +
        '&addr=' + encodeURIComponent(request.address) +
        '&title=' + encodeURIComponent(request.title);

      chrome.tabs.create({ url }, () => {
        const error = chrome.runtime.lastError;
        sendResponse && sendResponse(error ? { error: error.message } : {});
      });
      return true;
    }

    case 'ajax': {
      const method = (request.type || request.method || 'GET').toUpperCase();
      const headers = Object.assign({}, request.headers || {});
      const hasContentType = Object.keys(headers).some((name) => name.toLowerCase() === 'content-type');
      if (request.contentType && !hasContentType) {
        headers['Content-Type'] = request.contentType;
      }
      const options = { method, headers };
      if (request.data != null && method !== 'GET' && method !== 'HEAD') {
        options.body = request.data;
      }

      fetch(request.url, options)
        .then(async (r) => {
          const text = await r.text();
          if (r.ok) {
            sendResponse && sendResponse({ type: 'success', args: [text], status: r.status, statusText: r.statusText });
          } else {
            sendResponse && sendResponse({ type: 'error', status: r.status, statusText: r.statusText, body: text });
          }
        })
        .catch((e) => {
          sendResponse && sendResponse({ type: 'error', error: String(e) });
        });
      // ВАЖЛИВО: повертаємо true, щоб залишити порт відкритим для async sendResponse
      return true;
    }

    default:
      sendResponse && sendResponse();
  }
});

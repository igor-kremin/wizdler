var App = {
  url: null,
  tabId: null,
  wsdl: null,
  groups: [],
  operations: [],
  query: '',
  busy: false,

  showMessage: function (message, error) {
    $('#popup-message').text(message || '').toggleClass('error', !!error).prop('hidden', !message);
  },

  setBusy: function (busy, message) {
    App.busy = busy;
    $('body').toggleClass('busy', busy);
    $('#download-wsdl').prop('disabled', busy || !App.wsdl);
    if (message) App.showMessage(message, false);
  },

  downloadFile: function (name, data) {
    try {
      if (typeof chrome !== 'undefined' && chrome.tabs && App.tabId != null) {
        chrome.tabs.sendMessage(App.tabId, { command: 'download', name: name, data: data }, function (result) {
          var error = chrome.runtime.lastError;
          var message = error ? error.message : result && result.error;
          if (!message && (!result || !result.ok)) message = 'The page did not acknowledge the download. Refresh it and retry.';
          App.setBusy(false);
          App.showMessage(message || 'Download requested: ' + name, !!message);
        });
      } else {
        var a = document.createElement('a');
        a.download = name;
        a.href = data;
        a.click();
        App.setBusy(false);
        App.showMessage('Download requested: ' + name, false);
      }
    } catch (error) {
      App.setBusy(false);
      App.showMessage('Could not start the download: ' + error.message, true);
    }
  },

  getWSDL: function (callback) {
    if (typeof chrome !== 'undefined' && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, function (tabs) {
        var error = chrome.runtime.lastError;
        var tab = tabs && tabs[0];
        if (error || !tab) return callback(new Error(error ? error.message : 'No active tab'));
        App.tabId = tab.id;
        App.url = tab.url;
        chrome.tabs.sendMessage(tab.id, { command: 'getXml' }, function (data) {
          var messageError = chrome.runtime.lastError;
          callback(messageError ? new Error(messageError.message) : null, data);
        });
      });
    } else {
      $.ajax({
        url: App.url,
        dataType: 'text',
        success: function (data) { callback(null, data); },
        error: function () { callback(new Error('Failed to load WSDL: ' + App.url)); }
      });
    }
  },

  getFilenameFromURL: function (url, ext) {
    var name = url.substring(url.lastIndexOf('/') + 1).replace(/[^a-z0-9\-.]/gi, '_');
    if (ext && name.substr(-ext.length) !== ext) name += ext;
    return name;
  },

  address: function (addresses, requested) {
    var original = requested;
    var index = 1;
    while (Object.prototype.hasOwnProperty.call(addresses, requested)) requested = original + ' (' + ++index + ')';
    addresses[requested] = true;
    return '#/' + requested;
  },

  sort: function (arr) {
    return arr.slice().sort(function (a, b) { return a.name.local.localeCompare(b.name.local); });
  },

  createTree: function (wsdl) {
    App.wsdl = wsdl;
    App.groups = [];
    App.operations = [];
    var addresses = Object.create(null);
    var $services = $('#services').empty();
    var names = [];

    $.each(App.sort(wsdl.services), function () {
      var service = this;
      names.push(service.name.local);
      var $service = $('<li class="service-group">').appendTo($services);
      if (wsdl.services.length > 1) {
        $('<h2 class="service-label">').text(service.name.local).appendTo($service);
      }
      var $ports = $('<ul>').appendTo($service);
      $.each(App.sort(service.ports), function () {
        var port = this;
        var binding = wsdl.bindings[port.binding.full];
        var portType = binding && wsdl.portTypes[binding.type.full];
        if (!binding || !portType) return;
        var protocol = binding.soap12 ? 'SOAP 1.2' : binding.soap ? 'SOAP 1.1' : binding.http ? binding.http.verb : '';
        var $group = $('<li class="port-group">').appendTo($ports);
        var $toggle = $('<button class="port-toggle" type="button" aria-expanded="true">')
          .append($('<span class="chevron" aria-hidden="true">'))
          .append($('<span class="port-name">').text(port.name.local))
          .append($('<span class="protocol-tag">').text(protocol))
          .append($('<span class="group-count">'))
          .appendTo($group);
        var groupId = 'binding-' + App.groups.length;
        $toggle.attr('aria-controls', groupId).prop('title', port.description || 'Collapse or expand this binding');
        var $list = $('<ul class="operations">').attr('id', groupId).appendTo($group);
        var group = { element: $group, button: $toggle, list: $list, operations: [], collapsed: false, service: $service };
        $toggle.data('group', group);
        App.groups.push(group);

        $.each(App.sort(binding.operations), function () {
          var operation = this;
          var portTypeOperation = portType.operations[operation.name.full];
          if (!portTypeOperation) return;
          var description = operation.description || portTypeOperation.description || '';
          var address = App.address(addresses, [service.name.local, port.name.local, operation.name.local].join('/'));
          var $row = $('<li class="operation-row">').appendTo($list);
          var $link = $('<a class="operation-link">').attr('href', address)
            .attr('title', description || 'Open ' + operation.name.local + ' in the request editor')
            .data('ctx', {
              wsdl: wsdl,
              address: address,
              service: service,
              port: port,
              binding: binding,
              portType: portType,
              portTypeOperation: portTypeOperation,
              operation: operation
            })
            .append($('<span class="method-icon" aria-hidden="true">').text('</>'))
            .appendTo($row);
          var $copy = $('<span class="operation-copy">').appendTo($link);
          var $name = $('<span class="operation-name">').text(operation.name.local).appendTo($copy);
          if (description) $('<span class="operation-description">').text(description).appendTo($copy);
          $('<span class="operation-arrow" aria-hidden="true">').text('→').appendTo($link);
          var item = {
            row: $row,
            nameElement: $name,
            name: operation.name.local,
            search: [operation.name.local, description, service.name.local, port.name.local].join(' ').toLowerCase()
          };
          group.operations.push(item);
          App.operations.push(item);
        });
      });
    });

    $('#service-title').text(names.length === 1 ? names[0] : names.length ? names.length + ' services' : 'No services found').attr('title', names.join(', '));
    $('#service-source').text(wsdl.url.replace(/^https?:\/\//, '')).attr('title', wsdl.url);
    $('#loading-state').prop('hidden', true);
    $('#download-wsdl').prop('disabled', false);
    App.filterOperations();
    $('#tree').scrollTop(0);
    $('#method-search').focus();
  },

  highlightName: function (item, tokens) {
    var text = item.name;
    var lower = text.toLowerCase();
    var ranges = [];
    for (var i = 0; i < tokens.length; ++i) {
      var start = lower.indexOf(tokens[i]);
      while (start !== -1) {
        ranges.push({ start: start, end: start + tokens[i].length });
        start = lower.indexOf(tokens[i], start + tokens[i].length);
      }
    }
    ranges.sort(function (a, b) { return a.start - b.start; });
    item.nameElement.empty();
    var position = 0;
    for (var j = 0; j < ranges.length; ++j) {
      if (ranges[j].start < position) continue;
      item.nameElement.append(document.createTextNode(text.substring(position, ranges[j].start)));
      item.nameElement.append($('<mark>').text(text.substring(ranges[j].start, ranges[j].end)));
      position = ranges[j].end;
    }
    item.nameElement.append(document.createTextNode(text.substring(position)));
  },

  filterOperations: function () {
    App.query = $.trim($('#method-search').val()).toLowerCase();
    var tokens = App.query ? App.query.split(/\s+/) : [];
    var count = 0;
    $.each(App.groups, function () {
      var group = this;
      var matches = 0;
      $.each(group.operations, function () {
        var item = this;
        var visible = tokens.every(function (token) { return item.search.indexOf(token) !== -1; });
        item.row.prop('hidden', !visible);
        App.highlightName(item, tokens);
        if (visible) matches++;
      });
      count += matches;
      group.element.prop('hidden', !matches);
      group.button.find('.group-count').text(App.query ? matches + ' / ' + group.operations.length : group.operations.length);
      var collapsed = !App.query && group.collapsed;
      group.element.toggleClass('collapsed', collapsed);
      group.button.attr('aria-expanded', String(!collapsed)).prop('disabled', !!App.query);
      group.list.prop('hidden', collapsed);
    });
    $('.service-group').each(function () {
      $(this).prop('hidden', !$(this).find('.port-group').filter(function () { return !this.hidden; }).length);
    });
    $('#method-count').text(App.query ? count + ' of ' + App.operations.length + ' methods' : count + ' method' + (count === 1 ? '' : 's') + ' · ' + App.groups.length + ' binding' + (App.groups.length === 1 ? '' : 's'));
    $('#empty-state').prop('hidden', count > 0);
    $('#clear-search').prop('hidden', !App.query);
    $('#search-shortcut').prop('hidden', !!App.query);
    $('#toggle-groups').prop('disabled', !!App.query || !App.groups.length);
    if (!App.operations.length && !App.query) {
      $('#empty-state strong').text('No methods available');
      $('#empty-state p').text('This WSDL does not expose any supported service operations.');
      $('#reset-search').prop('hidden', true);
    } else {
      $('#empty-state strong').text('No matching methods');
      $('#empty-state p').text('Try a shorter name or a different keyword.');
      $('#reset-search').prop('hidden', false);
    }
    var allCollapsed = App.groups.length && App.groups.every(function (group) { return group.collapsed; });
    $('#toggle-groups').text(allCollapsed ? 'Expand all' : 'Collapse all');
  },

  clearSearch: function () {
    $('#method-search').val('');
    App.filterOperations();
    $('#tree').scrollTop(0);
    $('#method-search').focus();
  },

  openEditor: function (opts) {
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      App.setBusy(false);
      App.showMessage('The request editor is available when running as a browser extension.', true);
      return;
    }
    try {
      chrome.runtime.sendMessage(Object.assign({}, opts, { command: 'openEditor' }), function (result) {
        var error = chrome.runtime.lastError;
        App.setBusy(false);
        if (error || (result && result.error)) App.showMessage('Could not open the editor: ' + (error ? error.message : result.error), true);
        else window.close();
      });
    } catch (error) {
      App.setBusy(false);
      App.showMessage('Could not open the editor: ' + error.message, true);
    }
  },

  onReceiveWSDL: function (err, data) {
    if (err || !data) {
      $('#loading-state').prop('hidden', true);
      $('#service-title').text('WSDL unavailable');
      $('#method-count').text('No methods loaded');
      App.showMessage(err ? err.message : 'This page does not contain a WSDL definition.', true);
      return;
    }
    try {
      Wsdl.parse(App.url, data, false, App.createTree);
    } catch (error) {
      $('#loading-state').prop('hidden', true);
      $('#service-title').text('Could not read WSDL');
      $('#method-count').text('No methods loaded');
      App.showMessage(error.message, true);
    }
  },

  generateFilename: function (names, url, ext) {
    var filename = App.getFilenameFromURL(url);
    if (filename.toLowerCase().substr(-ext.length) !== ext.toLowerCase()) filename += ext;
    var base = filename.substr(0, filename.length - ext.length) || 'file';
    var i = 0;
    while (Object.prototype.hasOwnProperty.call(names, filename)) filename = base + '.' + ++i + ext;
    names[filename] = true;
    return filename;
  },

  hasImportErrors: function (wsdl) {
    var errors = wsdl.importErrors || [];
    if (!errors.length) return false;
    var messages = [];
    for (var i = 0; i < errors.length; ++i) messages.push(errors[i].message || String(errors[i]));
    App.showMessage('Some schemas could not be loaded. Reopen the popup to retry.\n' + messages.join('\n'), true);
    return true;
  },

  onServiceClick: function () {
    var wsdl = App.wsdl;
    if (!wsdl || App.busy) return;
    App.setBusy(true, 'Preparing WSDL and schemas…');
    try {
      wsdl._parseSchema(wsdl.url, function () {
        if (App.hasImportErrors(wsdl)) { App.setBusy(false); return; }
        try {
          var zipName = App.getFilenameFromURL(wsdl.url, '.zip');
          if (!wsdl.zip) {
            var names = Object.create(null);
            var zip = new JSZip();
            zip.file(App.generateFilename(names, wsdl.url, '.wsdl'), wsdl.text || '');
            for (var i = 0; i < wsdl.imports.length; ++i) {
              zip.file(App.generateFilename(names, wsdl.imports[i].location, '.xsd'), wsdl.imports[i].text || '');
            }
            wsdl.zip = 'data:application/zip;base64,' + zip.generate();
          }
          App.downloadFile(zipName, wsdl.zip);
        } catch (error) {
          App.setBusy(false);
          App.showMessage('Could not create the archive: ' + error.message, true);
        }
      });
    } catch (error) {
      App.setBusy(false);
      App.showMessage(error.message, true);
    }
  },

  onOperationClick: function (e) {
    e.preventDefault();
    if (App.busy) return;
    var ctx = $(this).data('ctx');
    App.setBusy(true, 'Opening ' + ctx.operation.name.local + '…');
    try {
      ctx.wsdl._parseSchema(ctx.wsdl.url, function () {
        try {
          if (App.hasImportErrors(ctx.wsdl)) { App.setBusy(false); return; }
          App.openEditor({ title: ctx.operation.name.local, address: ctx.address, url: ctx.wsdl.url, resources: ctx.wsdl.resources });
        } catch (error) {
          App.setBusy(false);
          App.showMessage('Could not open this method: ' + error.message, true);
        }
      });
    } catch (error) {
      App.setBusy(false);
      App.showMessage('Could not open this method: ' + error.message, true);
    }
  },

  onKeyDown: function (e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    var target = e.target;
    var inSearch = target.id === 'method-search';
    if (e.key === '/' && target.tagName !== 'INPUT') {
      e.preventDefault();
      $('#method-search').focus();
    } else if (e.key === 'Escape' && $('#method-search').val()) {
      e.preventDefault();
      App.clearSearch();
    } else if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && (inSearch || $(target).hasClass('operation-link'))) {
      var $links = $('.operation-link:visible');
      if (!$links.length) return;
      e.preventDefault();
      var index = $links.index(target);
      var next = inSearch ? 0 : (index + (e.key === 'ArrowDown' ? 1 : -1) + $links.length) % $links.length;
      $links.get(next).focus();
    } else if (e.key === 'Enter' && inSearch) {
      var first = $('.operation-link:visible').get(0);
      if (first) { e.preventDefault(); first.click(); }
    }
  },

  run: function () {
    $(function () {
      $(document).on('click', '.operation-link', App.onOperationClick);
      $(document).on('click', '.port-toggle', function () {
        if (App.query) return;
        var group = $(this).data('group');
        group.collapsed = !group.collapsed;
        App.filterOperations();
      });
      $('#toggle-groups').on('click', function () {
        var collapse = !App.groups.every(function (group) { return group.collapsed; });
        $.each(App.groups, function () { this.collapsed = collapse; });
        App.filterOperations();
      });
      $('#method-search').on('input', function () {
        App.filterOperations();
        $('#tree').scrollTop(0);
      });
      $('#clear-search, #reset-search').on('click', App.clearSearch);
      $('#download-wsdl').on('click', App.onServiceClick);
      $(document).on('keydown', App.onKeyDown);
      $('#method-search').focus();
      App.getWSDL(App.onReceiveWSDL);
    });
  }
};

App.run();

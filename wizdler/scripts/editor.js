var App = {
	ajax: function(config) {
		var fileProtocol = 'file://';
		if (config.url.substr(0, fileProtocol.length) == fileProtocol) {
			chrome.runtime.sendMessage({
				command: 'ajax',
				url: config.url,
				type: config.type,
				contentType: config.contentType,
				data: config.data,
				headers: config.headers
			}, function(result) {
				if (chrome.runtime.lastError) {
					config.error && config.error(null, 'error', chrome.runtime.lastError.message);
					return;
				}
				if (!result || !result.type) {
					config.error && config.error(null, 'error', 'No response from background service.');
					return;
				}
				var args = result.args || [];
				var text = result.type == 'error' ? result.body || '' : args[0] || '';
				var xhr = {
					responseXML: null,
					responseText: text,
					status: result.status || 0,
					statusText: result.statusText || ''
				};
				if (result.type == 'error') {
					var message = result.error || (result.status ? 'HTTP ' + result.status : 'Request failed');
					config.error && config.error(xhr, 'error', message);
					return;
				}
				if (!config.success) return;
				var data = text;
				if (config.dataType == 'xml' && text) {
					data = new DOMParser().parseFromString(text, 'text/xml');
					if (data.getElementsByTagName('parsererror').length) {
						config.error && config.error(xhr, 'parsererror', 'The server returned invalid XML.');
						return;
					}
					xhr.responseXML = data;
				}
				config.success(data, 'success', xhr);
			});
		} else {
			if (config.headers) {
				config.beforeSend = function(xhr) {
					var headers = config.headers;
					if (headers)
						for (var x in headers)
							if (headers.hasOwnProperty(x))
								xhr.setRequestHeader(x, headers[x]);
				};
			}
			return $.ajax(config);
		}
	},

	bind: function(name) {
		var me = this;
		return function() {
			me[name].apply(me, arguments);
		};
	},

	resizeEditors: function() {
		this.requestEditor.resize();
		this.responseEditor.resize();
	},

	setError: function(message) {
		$('#error').text(message || '').prop('hidden', !message);
	},

	setEmptyState: function(id, title, message) {
		var state = $('#' + id);
		state.find('h3').text(title);
		state.find('p').text(message);
		state.prop('hidden', false);
	},

	withoutNamespaces: function(text) {
		var spans = [];
		var offset = 0;
		while (offset < text.length) {
			var start = text.indexOf('<', offset);
			if (start == -1) break;
			var end;
			if (text.substr(start, 4) == '<!--') {
				end = text.indexOf('-->', start + 4);
				offset = end == -1 ? text.length : end + 3;
				continue;
			}
			if (text.substr(start, 9) == '<![CDATA[') {
				end = text.indexOf(']]>', start + 9);
				offset = end == -1 ? text.length : end + 3;
				continue;
			}
			if (text.substr(start, 2) == '<?') {
				end = text.indexOf('?>', start + 2);
				offset = end == -1 ? text.length : end + 2;
				continue;
			}
			if (text.substr(start, 2) == '<!') {
				var depth = 0;
				var quote = '';
				end = start + 2;
				for (; end < text.length; ++end) {
					var character = text.charAt(end);
					if (quote) {
						if (character == quote) quote = '';
					} else if (text.substr(end, 4) == '<!--') {
						var commentEnd = text.indexOf('-->', end + 4);
						end = commentEnd == -1 ? text.length : commentEnd + 2;
					} else if (character == '"' || character == "'") quote = character;
					else if (character == '[') depth++;
					else if (character == ']') depth--;
					else if (character == '>' && depth == 0) break;
				}
				offset = end + 1;
				continue;
			}
			if (text.charAt(start + 1) == '/' || /[\s<>]/.test(text.charAt(start + 1))) {
				offset = start + 1;
				continue;
			}
			var cursor = start + 1;
			while (cursor < text.length && !/[\s/>]/.test(text.charAt(cursor))) cursor++;
			var attributes = [];
			var complete = false;
			while (cursor < text.length) {
				var whitespace = cursor;
				while (/\s/.test(text.charAt(cursor))) cursor++;
				if (text.charAt(cursor) == '>' || text.substr(cursor, 2) == '/>') {
					cursor += text.charAt(cursor) == '>' ? 1 : 2;
					complete = true;
					break;
				}
				if (cursor == whitespace) break;
				var nameStart = cursor;
				while (cursor < text.length && !/[\s=/>"'<]/.test(text.charAt(cursor))) cursor++;
				var name = text.substring(nameStart, cursor);
				while (/\s/.test(text.charAt(cursor))) cursor++;
				if (!name || text.charAt(cursor) != '=') break;
				cursor++;
				while (/\s/.test(text.charAt(cursor))) cursor++;
				var delimiter = text.charAt(cursor);
				if (delimiter != '"' && delimiter != "'") break;
				end = text.indexOf(delimiter, cursor + 1);
				if (end == -1) break;
				if (name == 'xmlns' || name.indexOf('xmlns:') == 0)
					attributes.push({ start: whitespace, end: end + 1 });
				cursor = end + 1;
			}
			if (!complete) break;
			Array.prototype.push.apply(spans, attributes);
			offset = cursor;
		}
		var result = '';
		var position = 0;
		for (var i = 0; i < spans.length; ++i) {
			result += text.substring(position, spans[i].start);
			position = spans[i].end;
		}
		return result + text.substring(position);
	},

	refreshBodyView: function(kind) {
		if (this.hideNamespaces)
			this[kind + 'PreviewSession'].setValue(this.withoutNamespaces(this[kind + 'Session'].getValue()));
	},

	getNamespacePreference: function() {
		try {
			return localStorage.getItem('wizdler.hideXmlns') === 'true';
		} catch (error) {
			return false;
		}
	},

	onNamespaceChange: function() {
		this.hideNamespaces = $('#hide-xmlns').prop('checked');
		for (var i = 0, kinds = ['request', 'response']; i < kinds.length; ++i) {
			var kind = kinds[i];
			this.refreshBodyView(kind);
			this[kind + 'Editor'].setSession(this[kind + (this.hideNamespaces ? 'PreviewSession' : 'Session')]);
		}
		this.requestEditor.setReadOnly(!this.requestReady || this.hideNamespaces);
		this.requestEditor.textInput.getElement().setAttribute('aria-readonly', String(!this.requestReady || this.hideNamespaces));
		this.responseEditor.setReadOnly(true);
		$('#request-mode').text(this.hideNamespaces ? 'Read-only preview' : 'Editable XML');
		$('#namespace-help').text(this.hideNamespaces ? 'Namespace-free preview and copy. Show xmlns to edit; sending still uses the original XML.' : 'Display and copied text only. Requests are always sent with their original namespaces.');
		$('#request-copy-status, #response-copy-status').text('');
		this.updateControls();
		this.resizeEditors();
		try {
			localStorage.setItem('wizdler.hideXmlns', String(this.hideNamespaces));
		} catch (error) {
			return;
		}
	},

	updateCopyControls: function() {
		$('#copy-request').prop('disabled', !this.requestReady || !this.requestSession.getValue() || this.copying.request);
		$('#copy-response').prop('disabled', !this.responseSession.getValue() || this.copying.response);
	},

	legacyCopy: function(text) {
		var active = document.activeElement;
		var textarea = document.createElement('textarea');
		textarea.className = 'clipboard-buffer';
		textarea.value = text;
		textarea.readOnly = true;
		textarea.setAttribute('aria-hidden', 'true');
		textarea.tabIndex = -1;
		try {
			document.body.appendChild(textarea);
			textarea.focus({ preventScroll: true });
			textarea.select();
			textarea.setSelectionRange(0, text.length);
			if (!document.execCommand('copy')) throw new Error('Clipboard access was denied.');
		} finally {
			textarea.remove();
			if (active && active.focus) active.focus({ preventScroll: true });
		}
	},

	writeClipboard: function(text) {
		var me = this;
		if (navigator.clipboard && navigator.clipboard.writeText) {
			var operation;
			try {
				operation = navigator.clipboard.writeText(text);
			} catch (error) {
				operation = Promise.reject(error);
			}
			return Promise.resolve(operation).catch(function() { me.legacyCopy(text); });
		}
		try {
			this.legacyCopy(text);
			return Promise.resolve();
		} catch (error) {
			return Promise.reject(error);
		}
	},

	copyBody: function(kind) {
		if (this.copying[kind]) return;
		var text = this[kind + 'Session'].getValue();
		if (!text || (kind == 'request' && !this.requestReady)) return;
		var hidden = this.hideNamespaces;
		if (hidden) text = this.withoutNamespaces(text);
		var me = this;
		var status = $('#' + kind + '-copy-status');
		status.text('Copying…').removeClass('copy-error');
		this.copying[kind] = true;
		this.updateCopyControls();
		return this.writeClipboard(text).then(function() {
			status.text(hidden ? 'Copied without xmlns' : 'Copied');
			me.copying[kind] = false;
			me.updateCopyControls();
		}, function() {
			status.text('Copy failed. Allow clipboard access and retry.').addClass('copy-error');
			me.copying[kind] = false;
			me.updateCopyControls();
		});
	},

	updateControls: function() {
		var disabled = !this.requestReady || this.pending;
		$('#go, #method, #address').prop('disabled', disabled);
		$('#format-request').prop('disabled', disabled || this.hideNamespaces);
		$('#hide-xmlns').prop('disabled', !this.requestReady && !this.responseSession.getValue());
		$('#go').text(this.pending ? 'Sending...' : 'Send request');
		$('#request-form, #response-panel').attr('aria-busy', this.pending ? 'true' : 'false');
		this.updateCopyControls();
	},

	failLoad: function(error) {
		this.requestReady = false;
		this.requestEditor.setReadOnly(true);
		this.requestEditor.textInput.getElement().setAttribute('aria-readonly', 'true');
		this.updateControls();
		$('#status').text('Request unavailable.');
		this.setError('Unable to prepare the request. ' + (error.message || String(error)));
		this.setEmptyState('request-empty', 'Request unavailable', 'Return to the Wizdler popup and select an operation to try again.');
	},

	address: function(addresses, requested) {
		var original = requested;
		var index = 1;
		while (addresses.hasOwnProperty(requested))
			requested = original + ' (' + (++index) + ')';
		addresses[requested] = true;
		return '#/' + requested;
	},

	refreshCtxs: function(callback) {
		if (this.ctxs) {
			callback.call(this);
			return;
		}
		var me = this;
		Wsdl.parse(this.url, this.xml, true, function() {
			try {
				var addresses = new Object;
				var ctxs = new Object;
				var wsdl = this;
				if (wsdl.importErrors && wsdl.importErrors.length)
					throw new Error('An imported schema could not be loaded. ' + wsdl.importErrors[0].message);
				$.each(wsdl.services, function() {
					var service = this;
					$.each(service.ports, function() {
						var port = this;
						var binding = wsdl.bindings[port.binding.full];
						if (binding) {
							var portType = wsdl.portTypes[binding.type.full];
							if (!portType)
								throw new Error('The WSDL refers to a missing port type.');
							$.each(binding.operations, function() {
								var operation = this;
								var portTypeOperation = portType.operations[this.name.full];
								var address = me.address(addresses, [service.name.local, port.name.local, operation.name.local].join('/'));
								ctxs[address] = {
									wsdl: wsdl,
									generator: wsdl.generator,
									service: service,
									binding: binding,
									port: port,
									portType: portType,
									portTypeOperation: portTypeOperation,
									operation: operation
								};
							});
						}
					});
				});
				me.ctxs = ctxs;
				callback.call(me);
			} catch (error) {
				me.failLoad(error);
			}
		});
	},

	formatBody: function(text) {
		if (!text || !/^\s*</.test(text))
			return text;
		try {
			var xml = new DOMParser().parseFromString(text, 'text/xml');
			return xml.getElementsByTagName('parsererror').length ? text : vkbeautify.xml(text);
		} catch (error) {
			return text;
		}
	},

	completeRequest: function(xhr, text, error) {
		this.pending = false;
		this.updateControls();
		var elapsed = Math.max(0, Date.now() - this.requestStarted);
		$('#elapsed-time').text(elapsed < 1000 ? elapsed + ' ms' : (elapsed / 1000).toFixed(2) + ' s');
		var status = xhr && xhr.status ? 'HTTP ' + xhr.status + (xhr.statusText ? ' ' + xhr.statusText : '') : error ? 'Request failed' : 'Received · HTTP status unavailable';
		$('#response-status').text(status).attr('data-state', error ? 'error' : 'success');
		$('#status').text(error ? 'Request failed. Review the details below.' : 'Response received. Review the response body below.');
		this.setError(error || '');
		this.responseBody = this.formatBody(text || '');
		this.responseSession.setValue(this.responseBody);
		if (this.responseBody) {
			$('#response-empty').prop('hidden', true);
		} else if (error) {
			this.setEmptyState('response-empty', 'No response body', 'The request failed without a response body. See the error above for details.');
		} else {
			this.setEmptyState('response-empty', 'Empty response', 'The request completed, but the server returned no response body.');
		}
		this.resizeEditors();
	},

	onGoClick: function(e) {
		if (e) e.preventDefault();
		if (!this.requestReady || this.pending)
			return;
		var url = $.trim($('#address').val());
		try {
			var endpoint = new URL(url);
			if (!/^(https?|file):$/.test(endpoint.protocol))
				throw new Error('Unsupported endpoint protocol.');
		} catch (error) {
			this.setError('Enter a valid HTTP, HTTPS or file endpoint URL before sending.');
			$('#address').focus();
			return;
		}
		var me = this;
		this.request.url = url;
		this.request.method = $('#method').val();
		this.request.body = this.requestSession.getValue();
		this.pending = true;
		this.requestStarted = Date.now();
		this.setError('');
		this.updateControls();
		$('#status').text('Sending request...');
		$('#response-status').text('Sending...').attr('data-state', 'pending');
		$('#elapsed-time').text('');
		this.responseSession.setValue('');
		this.setEmptyState('response-empty', 'Waiting for response', 'Your request is on its way. The response will appear here.');
		try {
			App.ajax({
				url: this.request.url,
				type: this.request.method,
				contentType: 'text/xml; charset=utf-8',
				dataType: 'xml',
				data: this.request.body,
				headers: this.request.headers,
				success: function(xml, type, xhr) {
					var text = xhr && typeof xhr.responseText == 'string' ? xhr.responseText : xml ? new XMLSerializer().serializeToString(xml) : '';
					me.completeRequest(xhr, text);
				},
				error: function(xhr, type, statusText) {
					var text = '';
					if (xhr && typeof xhr.responseText == 'string') {
						text = xhr.responseText;
					} else if (xhr && xhr.responseXML) {
						text = new XMLSerializer().serializeToString(xhr.responseXML);
					}
					var message = type == 'parsererror' ? 'The response could not be read as XML. The raw response is shown below.' : 'Failed to get a response. ' + (statusText || type || 'Check the endpoint and your connection.');
					me.completeRequest(xhr, text, message);
				}
			});
		} catch (error) {
			this.completeRequest(null, '', 'Failed to send the request. ' + error.message);
		}
	},

	onFormatClick: function() {
		if (!this.requestReady || this.pending || this.hideNamespaces)
			return;
		var text = this.requestSession.getValue();
		var xml = new DOMParser().parseFromString(text, 'text/xml');
		if (!text || xml.getElementsByTagName('parsererror').length) {
			this.setError('The request is not valid XML. Correct it before formatting.');
			return;
		}
		this.setError('');
		this.requestSession.setValue(vkbeautify.xml(text));
		this.requestEditor.focus();
	},

	onExitClick: function() {
		close();
	},

	createEditor: function(id) {
		var me = this;
		var editor = ace.edit(id);
		editor.setTheme('ace/theme/vs');
		editor.setFontSize(13);
		editor.renderer.setShowGutter(false);
		editor.renderer.setPadding(16);
		editor.getSession().setUseWrapMode(true);
		editor.commands.addCommands([{
			name: 'ungotoline',
			bindKey: {
				mac: 'Command-L'
			},
			exec: function() {
				return false;
			},
			readOnly: true
		}, {
			name: 'sendRequest',
			bindKey: {
				win: 'Ctrl-Return',
				mac: 'Command-Return'
			},
			exec: function() {
				me.onGoClick();
			},
			readOnly: true
		}]);
		var Mode = require('ace/mode/xml').Mode;
		editor.getSession().setMode(new Mode);
		editor.setReadOnly(true);
		var input = editor.textInput.getElement();
		input.setAttribute('aria-label', id == 'request' ? 'Request body' : 'Response body, read-only');
		input.setAttribute('aria-readonly', 'true');
		return editor;
	},

	open: function() {
		var ctx = this.ctxs[this.addr];
		if (!ctx)
			throw new Error('The selected operation was not found in the WSDL.');
		var request = Wsdl.generateRequest(ctx);
		if (!request.url || !request.method)
			throw new Error('The selected operation does not define an endpoint or method.');
		if (ctx.operation.input && (ctx.operation.soap || ctx.operation.soap12)) {
			var xml = new DOMParser().parseFromString(request.body, 'text/xml');
			if (!xml.documentElement || xml.getElementsByTagName('parsererror').length)
				throw new Error('The SOAP request could not be generated. Check the WSDL and its imported schemas.');
		}
		this.request = request;
		if (!$('#method option').filter(function() { return this.value == request.method; }).length)
			$('<option>').val(request.method).text(request.method).appendTo('#method');
		$('#method').val(request.method);
		$('#address').val(request.url);
		$('#operation-name').text(ctx.operation.name.local);
		$('#service-context').text(ctx.service.name.local + ' / ' + ctx.port.name.local);
		document.title = ctx.operation.name.local + ' · Wizdler';
		this.requestSession.setValue(request.body);
		this.requestEditor.setReadOnly(this.hideNamespaces);
		this.requestEditor.textInput.getElement().setAttribute('aria-readonly', String(this.hideNamespaces));
		$('#request-empty').prop('hidden', true);
		this.requestReady = true;
		this.updateControls();
		$('#status').text('Ready to send. Review the request below.');
		this.resizeEditors();
	},

	parseArgs: function() {
		var hash = location.hash.substr(1);
		var args = hash.split('&');
		var result = new Object;
		for (var i = 0, n = args.length; i < n; ++i) {
			var pair = args[i];
			if (pair) {
				var index = pair.indexOf('=');
				var key = decodeURIComponent(index == -1 ? pair : pair.substr(0, index));
				var value = index == -1 ? '' : decodeURIComponent(pair.substr(index + 1));
				result[key] = value;
			}
		}
		return result;
	},

	run: function() {
		var me = this;
		this.requestReady = false;
		this.pending = false;
		this.hideNamespaces = this.getNamespacePreference();
		this.copying = { request: false, response: false };
		$('#request-form').submit(this.bind('onGoClick')).keydown(function(e) {
			if ((e.ctrlKey || e.metaKey) && e.which == 13)
				me.onGoClick(e);
		});
		$('#format-request').click(this.bind('onFormatClick'));
		$('#hide-xmlns').prop('checked', this.hideNamespaces).change(this.bind('onNamespaceChange'));
		$('#copy-request').click(function() { me.copyBody('request'); });
		$('#copy-response').click(function() { me.copyBody('response'); });
		$('#exit').click(this.bind('onExitClick'));
		if (/Mac/.test(navigator.platform))
			$('#shortcut-key').text('Cmd');
		this.requestEditor = this.createEditor('request');
		this.responseEditor = this.createEditor('response');
		var EditSession = require('ace/edit_session').EditSession;
		var Mode = require('ace/mode/xml').Mode;
		$.each(['request', 'response'], function(index, kind) {
			me[kind + 'Session'] = me[kind + 'Editor'].getSession();
			var preview = new EditSession('');
			preview.setMode(new Mode);
			preview.setUseWrapMode(true);
			me[kind + 'PreviewSession'] = preview;
			me[kind + 'Session'].on('change', function() {
				me.refreshBodyView(kind);
				$('#' + kind + '-copy-status').text('');
				me.updateCopyControls();
			});
		});
		$(window).resize(this.bind('resizeEditors'));
		this.onNamespaceChange();
		try {
			var args = this.parseArgs();
			if (!args.wsdl)
				return;
			$('#operation-name').text(args.title || 'SOAP request');
			$('#service-context').text('Loading service and operation details...');
			$('#status').text('Loading WSDL and preparing the request...');
			this.setEmptyState('request-empty', 'Preparing your request', 'Loading the WSDL and its imported schemas...');
			App.ajax({
				url: args.wsdl,
				type: 'GET',
				dataType: 'text',
				success: function(data) {
					try {
						var xml = new DOMParser().parseFromString(data, 'text/xml');
						if (!xml.documentElement || xml.getElementsByTagName('parsererror').length || xml.documentElement.localName != 'definitions' || xml.documentElement.namespaceURI != Wsdl.ns.wsdl)
							throw new Error('The document is not a valid WSDL definition.');
						me.url = args.wsdl;
						me.addr = args.addr;
						me.xml = data;
						me.refreshCtxs(function() {
							me.open();
						});
					} catch (error) {
						me.failLoad(error);
					}
				},
				error: function(xhr, type, statusText) {
					me.failLoad(new Error('Failed to load the WSDL. ' + (statusText || type || 'Check the URL and your connection.')));
				}
			});
		} catch (error) {
			this.failLoad(error);
		}
	}
};

App.run();

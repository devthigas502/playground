/**
 * CodeCast - Main Application
 * Multi-file editor with HTML/CSS/JS tabs and live preview
 */
(function () {
    'use strict';

    // ==========================================
    // State
    // ==========================================
    let editor = null;
    let recorder = new CodeCastRecorder();
    let player = new CodeCastPlayer();
    let currentRecording = null;
    let appMode = 'idle'; // idle, recording, playing, paused
    let isIgnoringChanges = false;
    let autoPreview = true;
    let previewDebounceTimer = null;

    // Multi-file state
    let activeFile = 'html'; // html | css | js
    const files = {
        html: { model: null, state: null, content: '' },
        css:  { model: null, state: null, content: '' },
        js:   { model: null, state: null, content: '' }
    };

    const fileConfig = {
        html: { name: 'index.html', language: 'html' },
        css:  { name: 'style.css',  language: 'css' },
        js:   { name: 'script.js',  language: 'javascript' }
    };

    // ==========================================
    // DOM Elements
    // ==========================================
    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    const elements = {
        editorContainer: $('#editorContainer'),
        languageSelect: $('#languageSelect'),
        lessonTitle: $('#lessonTitle'),
        fileTabs: $('#fileTabs'),

        // Controls
        btnRecord: $('#btnRecord'),
        btnStopRecord: $('#btnStopRecord'),
        btnPlay: $('#btnPlay'),
        btnPause: $('#btnPause'),
        btnRestart: $('#btnRestart'),

        // Timeline
        timelineContainer: $('#timelineContainer'),
        timelineTrack: $('#timelineTrack'),
        timelineProgress: $('#timelineProgress'),
        timelineThumb: $('#timelineThumb'),
        timelineEvents: $('#timelineEvents'),
        currentTime: $('#currentTime'),
        totalTime: $('#totalTime'),

        // Status
        statusMessage: $('#statusMessage'),

        // Speed
        speedControl: $('#speedControl'),
        playbackSpeed: $('#playbackSpeed'),

        // Save/Load
        btnSave: $('#btnSave'),
        btnLoad: $('#btnLoad'),
        fileInput: $('#fileInput'),

        // Audio
        btnMicToggle: $('#btnMicToggle'),

        // Theme
        btnThemeToggle: $('#btnThemeToggle'),

        // Pause bar
        pauseBar: $('#pauseBar'),
        btnResume: $('#btnResume'),
        btnResetCode: $('#btnResetCode'),

        // Shortcuts modal
        btnShortcuts: $('#btnShortcuts'),
        shortcutsOverlay: $('#shortcutsOverlay'),
        btnCloseShortcuts: $('#btnCloseShortcuts'),

        // Layout / Resize
        mainContent: $('.main-content'),
        editorPanel: $('.editor-panel'),
        rightPanel: $('#rightPanel'),
        resizeHandle: $('#resizeHandle'),
        btnExpandEditor: $('#btnExpandEditor'),
        btnExpandPanel: $('#btnExpandPanel'),

        // Right Panel
        btnPreviewTab: $('#btnPreviewTab'),
        btnConsoleTab: $('#btnConsoleTab'),
        previewPanel: $('#previewPanel'),
        consolePanel: $('#consolePanel'),
        previewFrame: $('#previewFrame'),
        btnRefreshPreview: $('#btnRefreshPreview'),
        btnAutoPreview: $('#btnAutoPreview'),

        // Console
        consoleOutput: $('#consoleOutput'),
        btnClearConsole: $('#btnClearConsole'),

        // Neovim UI
        nvimMode: $('#nvimMode'),
        nvimStatusMode: $('#nvimStatusMode'),
        nvimStatusFile: $('#nvimStatusFile'),
        nvimStatusLang: $('#nvimStatusLang'),
        nvimStatusPos: $('#nvimStatusPos'),
        nvimStatusPercent: $('#nvimStatusPercent'),

        // Toast
        toastContainer: $('#toastContainer')
    };

    // ==========================================
    // Default File Contents
    // ==========================================
    const defaultContents = {
        html: '<div class="container">\n    <h1>Ol\u00e1, CodeCast! \ud83c\udfac</h1>\n    <p>Escreva apenas as tags HTML necess\u00e1rias.</p>\n    <p>A estrutura do documento \u00e9 gerada automaticamente!</p>\n\n    <button id="btnHello" class="btn">Clique aqui</button>\n    <p id="output" class="output"></p>\n</div>',

        css: '* {\n    margin: 0;\n    padding: 0;\n    box-sizing: border-box;\n}\n\nbody {\n    font-family: \'Segoe UI\', Tahoma, sans-serif;\n    background: linear-gradient(135deg, #1a1b26 0%, #24283b 100%);\n    color: #c0caf5;\n    min-height: 100vh;\n    display: flex;\n    justify-content: center;\n    align-items: center;\n}\n\n.container {\n    text-align: center;\n    padding: 3rem;\n    background: rgba(255, 255, 255, 0.05);\n    border-radius: 16px;\n    backdrop-filter: blur(10px);\n    border: 1px solid rgba(255, 255, 255, 0.1);\n    max-width: 500px;\n}\n\nh1 {\n    font-size: 2rem;\n    margin-bottom: 1rem;\n    background: linear-gradient(90deg, #7aa2f7, #bb9af7);\n    -webkit-background-clip: text;\n    -webkit-text-fill-color: transparent;\n}\n\np {\n    margin-bottom: 1rem;\n    color: #a9b1d6;\n    line-height: 1.6;\n}\n\n.btn {\n    background: #7aa2f7;\n    color: #1a1b26;\n    border: none;\n    padding: 12px 28px;\n    border-radius: 8px;\n    font-size: 1rem;\n    font-weight: 600;\n    cursor: pointer;\n    transition: all 0.2s ease;\n    margin-top: 0.5rem;\n}\n\n.btn:hover {\n    background: #bb9af7;\n    transform: translateY(-2px);\n    box-shadow: 0 4px 15px rgba(122, 162, 247, 0.3);\n}\n\n.output {\n    margin-top: 1rem;\n    font-size: 1.1rem;\n    color: #9ece6a;\n    min-height: 24px;\n}',

        js: 'const btn = document.getElementById(\'btnHello\');\nconst output = document.getElementById(\'output\');\n\nlet count = 0;\n\nbtn.addEventListener(\'click\', () => {\n    count++;\n    output.textContent = `Voc\u00ea clicou ${count} vez${count > 1 ? \'es\' : \'\'}! \ud83c\udf89`;\n\n    const colors = [\'#9ece6a\', \'#7aa2f7\', \'#bb9af7\', \'#e0af68\', \'#f7768e\'];\n    output.style.color = colors[count % colors.length];\n});\n\nconsole.log(\'Script carregado!\');\nconsole.log(\'Clique no bot\u00e3o para testar.\');'
    };

    // ==========================================
    // Monaco Editor Setup
    // ==========================================
    function initEditor() {
        require.config({
            paths: {
                vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs'
            }
        });

        require(['vs/editor/editor.main'], function () {
            // Define Neovim Tokyonight theme
            monaco.editor.defineTheme('codecast-dark', {
                base: 'vs-dark',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '565f89', fontStyle: 'italic' },
                    { token: 'keyword', foreground: 'bb9af7' },
                    { token: 'keyword.control', foreground: 'bb9af7' },
                    { token: 'string', foreground: '9ece6a' },
                    { token: 'string.escape', foreground: '89ddff' },
                    { token: 'number', foreground: 'ff9e64' },
                    { token: 'type', foreground: '2ac3de' },
                    { token: 'type.identifier', foreground: '2ac3de' },
                    { token: 'variable', foreground: 'c0caf5' },
                    { token: 'variable.parameter', foreground: 'e0af68' },
                    { token: 'function', foreground: '7aa2f7' },
                    { token: 'method', foreground: '7aa2f7' },
                    { token: 'regexp', foreground: 'b4f9f8' },
                    { token: 'operator', foreground: '89ddff' },
                    { token: 'delimiter', foreground: '89ddff' },
                    { token: 'delimiter.bracket', foreground: 'a9b1d6' },
                    { token: 'tag', foreground: 'f7768e' },
                    { token: 'attribute.name', foreground: '7aa2f7' },
                    { token: 'attribute.value', foreground: '9ece6a' },
                    { token: 'constant', foreground: 'ff9e64' },
                    { token: 'predefined', foreground: '7dcfff' }
                ],
                colors: {
                    'editor.background': '#1a1b26',
                    'editor.foreground': '#c0caf5',
                    'editor.lineHighlightBackground': '#292e42',
                    'editor.selectionBackground': '#33467C',
                    'editorCursor.foreground': '#c0caf5',
                    'editor.selectionHighlightBackground': '#3b4261',
                    'editorLineNumber.foreground': '#3b4261',
                    'editorLineNumber.activeForeground': '#737aa2',
                    'editorIndentGuide.background': '#292e42',
                    'editorIndentGuide.activeBackground': '#3b4261',
                    'editorBracketMatch.background': '#3b426180',
                    'editorBracketMatch.border': '#bb9af780',
                    'editorGutter.background': '#1a1b26',
                    'editorWhitespace.foreground': '#292e42',
                    'scrollbar.shadow': '#00000000',
                    'editorOverviewRuler.border': '#1a1b26'
                }
            });

            monaco.editor.defineTheme('codecast-light', {
                base: 'vs',
                inherit: true,
                rules: [
                    { token: 'comment', foreground: '848cb5', fontStyle: 'italic' },
                    { token: 'keyword', foreground: '7847bd' },
                    { token: 'string', foreground: '587539' },
                    { token: 'number', foreground: 'b15c00' },
                    { token: 'type', foreground: '007197' },
                    { token: 'function', foreground: '2e7de9' },
                    { token: 'variable', foreground: '3760bf' },
                    { token: 'operator', foreground: '006a83' },
                    { token: 'tag', foreground: 'b15c00' },
                    { token: 'attribute.name', foreground: '2e7de9' },
                    { token: 'attribute.value', foreground: '587539' }
                ],
                colors: {
                    'editor.background': '#e1e2e7',
                    'editor.foreground': '#3760bf',
                    'editor.lineHighlightBackground': '#c4c8da',
                    'editor.selectionBackground': '#99a7df40',
                    'editorCursor.foreground': '#3760bf',
                    'editorLineNumber.foreground': '#848cb5',
                    'editorLineNumber.activeForeground': '#3760bf',
                    'editorGutter.background': '#e1e2e7',
                    'scrollbar.shadow': '#00000000',
                    'editorOverviewRuler.border': '#e1e2e7'
                }
            });

            // Create models for each file
            files.html.model = monaco.editor.createModel(defaultContents.html, 'html');
            files.css.model  = monaco.editor.createModel(defaultContents.css, 'css');
            files.js.model   = monaco.editor.createModel(defaultContents.js, 'javascript');

            // Store initial content
            files.html.content = defaultContents.html;
            files.css.content  = defaultContents.css;
            files.js.content   = defaultContents.js;

            // Create editor with HTML model initially
            editor = monaco.editor.create(elements.editorContainer, {
                model: files.html.model,
                theme: 'codecast-dark',
                fontSize: 14,
                fontFamily: "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace",
                fontLigatures: true,
                lineHeight: 22,
                padding: { top: 8, bottom: 8 },
                minimap: { enabled: false },
                scrollBeyondLastLine: true,
                smoothScrolling: false,
                cursorBlinking: 'smooth',
                cursorStyle: 'line',
                cursorSmoothCaretAnimation: 'on',
                cursorWidth: 2,
                renderLineHighlight: 'all',
                renderLineHighlightOnlyWhenFocus: false,
                bracketPairColorization: { enabled: true },
                automaticLayout: true,
                wordWrap: 'on',
                lineNumbers: 'on',
                glyphMargin: false,
                folding: true,
                lineDecorationsWidth: 16,
                lineNumbersMinChars: 4,
                renderWhitespace: 'none',
                overviewRulerBorder: false,
                overviewRulerLanes: 0,
                hideCursorInOverviewRuler: true,
                scrollbar: {
                    vertical: 'hidden',
                    horizontal: 'hidden',
                    verticalScrollbarSize: 0,
                    horizontalScrollbarSize: 0
                },
                suggest: {
                    showMethods: true,
                    showFunctions: true,
                    showConstructors: true,
                    showFields: true,
                    showVariables: true,
                    showClasses: true,
                    showInterfaces: true
                },
                tabSize: 2
            });

            // Listen to content changes on all models
            Object.keys(files).forEach(function(key) {
                files[key].model.onDidChangeContent(function() {
                    files[key].content = files[key].model.getValue();
                    if (autoPreview && !isIgnoringChanges) {
                        schedulePreviewUpdate();
                    }
                });
            });

            // Keyboard shortcuts
            editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, function() {
                clearConsole();
                updatePreview(true);
            });

            // Neovim statusline updates
            setupNvimStatusline(editor);

            // Initial preview
            setTimeout(function() { updatePreview(true); }, 500);

            // Setup complete
            showToast('Editor carregado com sucesso!', 'success');
            setupEventListeners();
        });
    }

    // ==========================================
    // File Tab Switching
    // ==========================================
    function switchToFile(fileKey) {
        if (fileKey === activeFile) return;

        // Save current editor state (scroll position, cursor, etc.)
        files[activeFile].state = editor.saveViewState();

        // Switch
        activeFile = fileKey;
        editor.setModel(files[fileKey].model);

        // Restore view state if available
        if (files[fileKey].state) {
            editor.restoreViewState(files[fileKey].state);
        }

        // Update tab UI
        elements.fileTabs.querySelectorAll('.tab').forEach(function(tab) {
            tab.classList.toggle('active', tab.dataset.file === fileKey);
        });

        // Update neovim statusline
        var cfg = fileConfig[fileKey];
        elements.nvimStatusFile.textContent = cfg.name;
        elements.nvimStatusLang.textContent = cfg.language;

        // Record tab switch if recording
        if (appMode === 'recording' && recorder.isRecording) {
            var elapsed = Date.now() - recorder.startTime;
            recorder.events.push({
                time: elapsed,
                type: 'tab-switch',
                file: fileKey
            });
        }

        // Focus editor
        editor.focus();
    }

    // ==========================================
    // Live Preview
    // ==========================================
    function schedulePreviewUpdate() {
        if (previewDebounceTimer) clearTimeout(previewDebounceTimer);
        previewDebounceTimer = setTimeout(function() { updatePreview(false); }, 400);
    }

    function updatePreview(withConsole) {
        var htmlContent = files.html.content;
        var cssContent = files.css.content;
        var jsContent = files.js.content;

        // Console interceptor (only injected on explicit save/refresh)
        var consoleInterceptor = '';
        if (withConsole) {
        consoleInterceptor =
            '(function() {\n' +
            '    function _serializeEl(el) {\n' +
            '        var tag = el.tagName.toLowerCase();\n' +
            '        var out = "<" + tag;\n' +
            '        if (el.id) out += " id=\\"" + el.id + "\\"";\n' +
            '        if (el.className && typeof el.className === "string" && el.className.trim()) out += " class=\\"" + el.className.trim() + "\\"";\n' +
            '        var skip = {"id":1,"class":1,"style":1};\n' +
            '        for (var i = 0; i < el.attributes.length; i++) {\n' +
            '            var at = el.attributes[i];\n' +
            '            if (!skip[at.name]) out += " " + at.name + "=\\"" + at.value + "\\"";\n' +
            '        }\n' +
            '        out += ">";\n' +
            '        var txt = el.textContent || "";\n' +
            '        if (el.children.length > 0) {\n' +
            '            out += "..." + el.children.length + " children";\n' +
            '        } else if (txt.length > 0) {\n' +
            '            out += txt.length > 60 ? txt.substring(0,60) + "..." : txt;\n' +
            '        }\n' +
            '        out += "</" + tag + ">";\n' +
            '        return out;\n' +
            '    }\n' +
            '    function _serialize(a) {\n' +
            '        if (a === null) return "null";\n' +
            '        if (a === undefined) return "undefined";\n' +
            '        if (a instanceof HTMLElement || a instanceof Element) return _serializeEl(a);\n' +
            '        if (a instanceof NodeList || a instanceof HTMLCollection) {\n' +
            '            var items = Array.prototype.slice.call(a);\n' +
            '            return "[" + items.map(function(x) {\n' +
            '                return x instanceof Element ? _serializeEl(x) : String(x);\n' +
            '            }).join(", ") + "] (" + items.length + ")";\n' +
            '        }\n' +
            '        if (Array.isArray(a)) {\n' +
            '            return "[" + a.map(function(x) { return _serialize(x); }).join(", ") + "]";\n' +
            '        }\n' +
            '        if (typeof a === "object") {\n' +
            '            try { return JSON.stringify(a, null, 2); }\n' +
            '            catch(e) { return String(a); }\n' +
            '        }\n' +
            '        return String(a);\n' +
            '    }\n' +
            '    var _post = function(type, args) {\n' +
            '        try {\n' +
            '            window.parent.postMessage({\n' +
            '                type: "console",\n' +
            '                method: type,\n' +
            '                args: args.map(_serialize)\n' +
            '            }, "*");\n' +
            '        } catch(e) {}\n' +
            '    };\n' +
            '    var orig = {};\n' +
            '    ["log","error","warn","info"].forEach(function(m) {\n' +
            '        orig[m] = console[m];\n' +
            '        console[m] = function() {\n' +
            '            var args = Array.prototype.slice.call(arguments);\n' +
            '            orig[m].apply(console, args);\n' +
            '            _post(m, args);\n' +
            '        };\n' +
            '    });\n' +
            '    window.onerror = function(msg, src, line) {\n' +
            '        _post("error", ["\\u274c " + msg + " (line " + line + ")"]);\n' +
            '    };\n' +
            '})();';
        } // end if (withConsole)

        // Detect if user wrote a full HTML document (has <!DOCTYPE or <html or <head or <body)
        var isFullDocument = /<!doctype|<html[\s>]|<head[\s>]|<body[\s>]/i.test(htmlContent);

        var fullHtml;

        if (isFullDocument) {
            // User wrote a complete document - inject CSS/JS/interceptor into it
            fullHtml = htmlContent;

            // Replace <link href="style.css"> with inline <style>
            fullHtml = fullHtml.replace(
                /<link\s+[^>]*href=["']style\.css["'][^>]*\/?>/gi,
                '<style>\n' + cssContent + '\n</style>'
            );

            // If no style injected, add before </head>
            if (fullHtml.indexOf('<style>') === -1 && cssContent.trim()) {
                fullHtml = fullHtml.replace(
                    /<\/head>/i,
                    '<style>\n' + cssContent + '\n</style>\n</head>'
                );
            }

            // Replace <script src="script.js"> with inline script
            fullHtml = fullHtml.replace(
                /<script\s+[^>]*src=["']script\.js["'][^>]*><\/script>/gi,
                '<scr' + 'ipt>\n' + jsContent + '\n<\/scr' + 'ipt>'
            );

            // If no script injected, add before </body>
            if (fullHtml.indexOf(jsContent) === -1 && jsContent.trim()) {
                fullHtml = fullHtml.replace(
                    /<\/body>/i,
                    '<scr' + 'ipt>\n' + jsContent + '\n<\/scr' + 'ipt>\n</body>'
                );
            }

            // Inject console interceptor after <head>
            if (consoleInterceptor) {
                if (/<head[^>]*>/i.test(fullHtml)) {
                    fullHtml = fullHtml.replace(/<head[^>]*>/i, '$&\n<scr' + 'ipt>' + consoleInterceptor + '<\/scr' + 'ipt>');
                } else {
                    fullHtml = '<scr' + 'ipt>' + consoleInterceptor + '<\/scr' + 'ipt>' + fullHtml;
                }
            }
        } else {
            // User wrote only the tags - we build the full document automatically
            fullHtml = '<!DOCTYPE html>\n' +
                '<html lang="pt-BR">\n' +
                '<head>\n' +
                '    <meta charset="UTF-8">\n' +
                '    <meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
                '    <title>Preview</title>\n' +
                (consoleInterceptor ? '    <scr' + 'ipt>' + consoleInterceptor + '<\/scr' + 'ipt>\n' : '') +
                '    <style>\n' + cssContent + '\n    </style>\n' +
                '</head>\n' +
                '<body>\n' +
                htmlContent + '\n' +
                (jsContent.trim() ? '    <scr' + 'ipt>\n' + jsContent + '\n    <\/scr' + 'ipt>\n' : '') +
                '</body>\n' +
                '</html>';
        }

        // Write to iframe using srcdoc (avoids const/let redeclaration errors)
        var iframe = elements.previewFrame;
        var container = iframe.parentNode;
        var newIframe = document.createElement('iframe');
        newIframe.id = 'previewFrame';
        newIframe.className = 'preview-frame';
        newIframe.sandbox = 'allow-scripts allow-modals allow-same-origin';
        container.replaceChild(newIframe, iframe);
        elements.previewFrame = newIframe;
        newIframe.srcdoc = fullHtml;
    }

    // ==========================================
    // Console (from iframe messages)
    // ==========================================
    function setupConsoleListener() {
        window.addEventListener('message', function(e) {
            if (e.data && e.data.type === 'console') {
                var text = e.data.args.join(' ');
                appendConsole(text, e.data.method);
            }
        });
    }

    function appendConsole(text, type) {
        type = type || 'log';
        var line = document.createElement('div');
        line.className = 'console-line ' + type;
        line.textContent = text;
        elements.consoleOutput.appendChild(line);
        elements.consoleOutput.scrollTop = elements.consoleOutput.scrollHeight;
    }

    function clearConsole() {
        elements.consoleOutput.innerHTML = '';
    }

    // ==========================================
    // Neovim Statusline
    // ==========================================
    function setupNvimStatusline(ed) {
        ed.onDidChangeCursorPosition(function(e) {
            var pos = e.position;
            elements.nvimStatusPos.textContent = 'Ln ' + pos.lineNumber + ', Col ' + pos.column;

            var model = ed.getModel();
            if (model) {
                var totalLines = model.getLineCount();
                if (pos.lineNumber === 1) {
                    elements.nvimStatusPercent.textContent = 'Top';
                } else if (pos.lineNumber === totalLines) {
                    elements.nvimStatusPercent.textContent = 'Bot';
                } else {
                    var pct = Math.round((pos.lineNumber / totalLines) * 100);
                    elements.nvimStatusPercent.textContent = pct + '%';
                }
            }
        });

        ed.onDidFocusEditorText(function() { setNvimMode('insert'); });
        ed.onDidBlurEditorText(function() { setNvimMode('normal'); });
    }

    function setNvimMode(mode) {
        var modeMap = {
            normal: 'NORMAL',
            insert: 'INSERT',
            visual: 'VISUAL',
            command: 'COMMAND'
        };
        var label = modeMap[mode] || 'NORMAL';
        elements.nvimMode.textContent = label;
        elements.nvimMode.className = 'nvim-mode ' + mode;
        elements.nvimStatusMode.textContent = label;
        elements.nvimStatusMode.className = 'nvim-status-mode ' + mode;
    }

    // ==========================================
    // Event Listeners
    // ==========================================
    function setupEventListeners() {
        // File tab clicks
        elements.fileTabs.querySelectorAll('.tab').forEach(function(tab) {
            tab.addEventListener('click', function() {
                switchToFile(tab.dataset.file);
            });
        });

        // Panel switcher (Preview / Console)
        elements.btnPreviewTab.addEventListener('click', function() {
            elements.btnPreviewTab.classList.add('active');
            elements.btnConsoleTab.classList.remove('active');
            elements.previewPanel.classList.remove('hidden');
            elements.consolePanel.classList.add('hidden');
        });

        elements.btnConsoleTab.addEventListener('click', function() {
            elements.btnConsoleTab.classList.add('active');
            elements.btnPreviewTab.classList.remove('active');
            elements.consolePanel.classList.remove('hidden');
            elements.previewPanel.classList.add('hidden');
        });

        // Refresh preview
        elements.btnRefreshPreview.addEventListener('click', function() { clearConsole(); updatePreview(true); });

        // Auto-preview toggle
        elements.btnAutoPreview.addEventListener('click', function() {
            autoPreview = !autoPreview;
            elements.btnAutoPreview.classList.toggle('active', autoPreview);
            if (autoPreview) updatePreview(false);
        });

        // Record button
        elements.btnRecord.addEventListener('click', startRecording);
        elements.btnStopRecord.addEventListener('click', stopRecording);

        // Playback buttons
        elements.btnPlay.addEventListener('click', function() { startPlayback(); });
        elements.btnPause.addEventListener('click', function() { pausePlayback(); });
        elements.btnRestart.addEventListener('click', function() { restartPlayback(); });

        // Resume from pause bar
        elements.btnResume.addEventListener('click', function() { resumePlayback(false); });
        elements.btnResetCode.addEventListener('click', function() { resumePlayback(true); });

        // Speed control
        elements.playbackSpeed.addEventListener('change', function(e) {
            player.setSpeed(parseFloat(e.target.value));
        });

        // Save/Load
        elements.btnSave.addEventListener('click', saveRecording);
        elements.btnLoad.addEventListener('click', function() { elements.fileInput.click(); });
        elements.fileInput.addEventListener('change', loadRecording);

        // Theme toggle
        elements.btnThemeToggle.addEventListener('click', toggleTheme);

        // Console
        elements.btnClearConsole.addEventListener('click', clearConsole);

        // Shortcuts modal
        elements.btnShortcuts.addEventListener('click', toggleShortcutsModal);
        elements.btnCloseShortcuts.addEventListener('click', toggleShortcutsModal);
        elements.shortcutsOverlay.addEventListener('click', function(e) {
            if (e.target === elements.shortcutsOverlay) toggleShortcutsModal();
        });

        // Layout: expand buttons
        elements.btnExpandEditor.addEventListener('click', function() { toggleExpand('editor'); });
        elements.btnExpandPanel.addEventListener('click', function() { toggleExpand('panel'); });

        // Layout: resize handle
        setupResize();

        // Timeline seeking
        setupTimeline();

        // Keyboard shortcuts
        document.addEventListener('keydown', handleKeyboardShortcuts);

        // Window resize
        window.addEventListener('resize', function() {
            if (editor) editor.layout();
        });

        // Console listener for iframe messages
        setupConsoleListener();

        // Player callbacks
        player.onProgress = updateTimeline;
        player.onStateChange = handlePlayerStateChange;
        player.onComplete = handlePlaybackComplete;
    }

    // ==========================================
    // Recording (multi-file)
    // ==========================================
    async function startRecording() {
        if (appMode === 'recording') return;

        appMode = 'recording';

        // UI updates
        elements.btnRecord.classList.add('recording', 'hidden');
        elements.btnStopRecord.classList.remove('hidden');
        elements.btnPlay.classList.add('hidden');
        elements.btnPause.classList.add('hidden');
        elements.btnRestart.classList.add('hidden');
        elements.btnSave.classList.add('hidden');
        elements.timelineContainer.classList.add('hidden');
        elements.speedControl.classList.add('hidden');
        elements.statusMessage.textContent = '\u23fa Gravando...';
        elements.statusMessage.className = 'status-message recording';

        // Start the recorder (records events on active editor model)
        await recorder.startRecording(editor, {
            language: 'html',
            title: elements.lessonTitle.value,
            audioEnabled: false
        });

        // Also inject initial multi-file state into events
        recorder.events[0].multiFile = true;
        recorder.events[0].activeFile = activeFile;
        recorder.events[0].files = {
            html: files.html.content,
            css: files.css.content,
            js: files.js.content
        };

        // Dispose recorder's own content listener to avoid duplicate events
        // setupMultiFileRecording handles content tracking per-file
        if (recorder._disposable) {
            recorder._disposable.dispose();
            recorder._disposable = null;
        }

        // Track content changes for all file models
        setupMultiFileRecording();

        startRecordingTimer();
        showToast('Grava\u00e7\u00e3o iniciada! Comece a codificar.', 'info');
    }

    function setupMultiFileRecording() {
        Object.keys(files).forEach(function(key) {
            if (files[key]._recDisposable) {
                files[key]._recDisposable.dispose();
            }
            files[key]._recDisposable = files[key].model.onDidChangeContent(function() {
                if (!recorder.isRecording) return;
                var elapsed = Date.now() - recorder.startTime;
                recorder.events.push({
                    time: elapsed,
                    type: 'file-change',
                    file: key,
                    fullContent: files[key].model.getValue()
                });
            });
        });
    }

    function cleanupMultiFileRecording() {
        Object.keys(files).forEach(function(key) {
            if (files[key]._recDisposable) {
                files[key]._recDisposable.dispose();
                files[key]._recDisposable = null;
            }
        });
    }

    async function stopRecording() {
        if (appMode !== 'recording') return;

        cleanupMultiFileRecording();
        currentRecording = await recorder.stopRecording();

        // Add multi-file final state to recording
        if (currentRecording) {
            currentRecording.multiFile = true;
            currentRecording.files = {
                html: files.html.content,
                css: files.css.content,
                js: files.js.content
            };
        }

        appMode = 'idle';

        // UI updates
        elements.btnRecord.classList.remove('recording');
        elements.btnRecord.classList.remove('hidden');
        elements.btnStopRecord.classList.add('hidden');
        elements.btnPlay.classList.remove('hidden');
        elements.btnRestart.classList.remove('hidden');
        elements.btnSave.classList.remove('hidden');
        elements.speedControl.classList.remove('hidden');
        elements.timelineContainer.classList.remove('hidden');
        elements.statusMessage.textContent = 'Grava\u00e7\u00e3o conclu\u00edda!';
        elements.statusMessage.className = 'status-message';

        stopRecordingTimer();

        if (currentRecording) {
            elements.totalTime.textContent = formatTime(currentRecording.duration);
            elements.currentTime.textContent = '00:00';
            renderTimelineMarkers();
        }

        showToast('Grava\u00e7\u00e3o conclu\u00edda! Dura\u00e7\u00e3o: ' + formatTime(currentRecording.duration), 'success');
    }

    var recordingTimerInterval = null;
    function startRecordingTimer() {
        recordingTimerInterval = setInterval(function() {
            if (appMode === 'recording') {
                var elapsed = recorder.getElapsed();
                elements.statusMessage.textContent = '\u23fa Gravando... ' + formatTime(elapsed);
            }
        }, 100);
    }

    function stopRecordingTimer() {
        if (recordingTimerInterval) {
            clearInterval(recordingTimerInterval);
            recordingTimerInterval = null;
        }
    }

    // ==========================================
    // Playback
    // ==========================================
    function startPlayback() {
        if (!currentRecording) {
            showToast('Nenhuma grava\u00e7\u00e3o dispon\u00edvel. Grave primeiro!', 'error');
            return;
        }

        if (player.isPaused) {
            resumePlayback(false);
            return;
        }

        // Load and play
        player.loadRecording(currentRecording);

        // Make editor read-only during playback
        editor.updateOptions({ readOnly: true });
        isIgnoringChanges = true;

        // Set callbacks for multi-file playback
        player.onContentChange = function() {
            Object.keys(files).forEach(function(k) {
                files[k].content = files[k].model.getValue();
            });
            schedulePreviewUpdate();
        };

        player.onFileChange = function(fileKey, content) {
            if (files[fileKey] && files[fileKey].model) {
                files[fileKey].model.setValue(content);
                files[fileKey].content = content;
                schedulePreviewUpdate();
            }
        };

        player.onTabSwitch = function(fileKey) {
            switchToFile(fileKey);
        };

        player.play(editor);

        appMode = 'playing';

        elements.btnPlay.classList.add('hidden');
        elements.btnPause.classList.remove('hidden');
        elements.btnRecord.classList.add('hidden');
        elements.timelineContainer.classList.remove('hidden');
        elements.statusMessage.textContent = '\u25b6 Reproduzindo...';
        elements.statusMessage.className = 'status-message playing';
    }

    function pausePlayback() {
        player.pause(editor);
        appMode = 'paused';

        editor.updateOptions({ readOnly: false });
        isIgnoringChanges = false;

        elements.btnPause.classList.add('hidden');
        elements.btnPlay.classList.remove('hidden');
        elements.pauseBar.classList.remove('hidden');
        elements.statusMessage.textContent = '\u23f8 Pausado - Edite o c\u00f3digo!';
        elements.statusMessage.className = 'status-message paused';
    }

    function resumePlayback(resetCode) {
        player.resume(editor, false);

        editor.updateOptions({ readOnly: true });
        isIgnoringChanges = true;

        appMode = 'playing';

        elements.btnPlay.classList.add('hidden');
        elements.btnPause.classList.remove('hidden');
        elements.pauseBar.classList.add('hidden');
        elements.statusMessage.textContent = '\u25b6 Reproduzindo...';
        elements.statusMessage.className = 'status-message playing';
    }

    function restartPlayback() {
        player.stop();

        if (currentRecording) {
            // Restore all files to initial state
            if (currentRecording.multiFile) {
                var initEvt = currentRecording.events[0];
                if (initEvt && initEvt.files) {
                    Object.keys(initEvt.files).forEach(function(key) {
                        if (files[key] && files[key].model) {
                            files[key].model.setValue(initEvt.files[key]);
                            files[key].content = initEvt.files[key];
                        }
                    });
                }
            } else {
                var initEvent = currentRecording.events[0];
                if (initEvent && initEvent.type === 'init') {
                    editor.setValue(initEvent.content || '');
                }
            }
            updatePreview(false);
        }

        appMode = 'idle';

        elements.btnPlay.classList.remove('hidden');
        elements.btnPause.classList.add('hidden');
        elements.pauseBar.classList.add('hidden');
        elements.btnRecord.classList.remove('hidden');
        elements.currentTime.textContent = '00:00';
        updateTimeline(0, 0);
        elements.statusMessage.textContent = 'Pronto para reproduzir';
        elements.statusMessage.className = 'status-message';

        editor.updateOptions({ readOnly: false });
        isIgnoringChanges = false;
    }

    function handlePlayerStateChange(state) {}

    function handlePlaybackComplete() {
        appMode = 'idle';

        elements.btnPlay.classList.remove('hidden');
        elements.btnPause.classList.add('hidden');
        elements.pauseBar.classList.add('hidden');
        elements.btnRecord.classList.remove('hidden');
        elements.statusMessage.textContent = 'Reprodu\u00e7\u00e3o finalizada. Edite o c\u00f3digo!';
        elements.statusMessage.className = 'status-message';

        editor.updateOptions({ readOnly: false });
        isIgnoringChanges = false;

        showToast('Reprodu\u00e7\u00e3o finalizada! Agora voc\u00ea pode editar o c\u00f3digo.', 'success');
    }

    // ==========================================
    // Timeline
    // ==========================================
    function setupTimeline() {
        var isDragging = false;

        elements.timelineTrack.addEventListener('mousedown', function(e) {
            isDragging = true;
            seekFromMouse(e);
        });

        document.addEventListener('mousemove', function(e) {
            if (isDragging) seekFromMouse(e);
        });

        document.addEventListener('mouseup', function() {
            isDragging = false;
        });

        function seekFromMouse(e) {
            if (!currentRecording) return;
            var rect = elements.timelineTrack.getBoundingClientRect();
            var x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
            var ratio = x / rect.width;
            var seekTime = ratio * currentRecording.duration;
            player.seekTo(editor, seekTime);
            updateTimeline(seekTime, ratio);
        }
    }

    function updateTimeline(currentTimeMs, progress) {
        var pct = Math.max(0, Math.min(100, progress * 100));
        elements.timelineProgress.style.width = pct + '%';
        elements.timelineThumb.style.left = pct + '%';
        elements.currentTime.textContent = formatTime(currentTimeMs);
    }

    function renderTimelineMarkers() {
        elements.timelineEvents.innerHTML = '';
        if (!currentRecording) return;

        var changeEvents = currentRecording.events.filter(function(e) {
            return e.type === 'change' || e.type === 'file-change';
        });
        var step = Math.max(1, Math.floor(changeEvents.length / 50));

        for (var i = 0; i < changeEvents.length; i += step) {
            var event = changeEvents[i];
            var pct = (event.time / currentRecording.duration) * 100;
            var marker = document.createElement('div');
            marker.className = 'timeline-event-marker';
            marker.style.left = pct + '%';
            elements.timelineEvents.appendChild(marker);
        }
    }

    // ==========================================
    // Save & Load
    // ==========================================
    function saveRecording() {
        if (!currentRecording) {
            showToast('Nenhuma grava\u00e7\u00e3o para salvar.', 'error');
            return;
        }

        var data = JSON.stringify(currentRecording, null, 2);
        var blob = new Blob([data], { type: 'application/json' });
        var url = URL.createObjectURL(blob);

        var title = elements.lessonTitle.value || 'gravacao';
        var safeName = title.replace(/[^a-zA-Z0-9\u00C0-\u017F\s-]/g, '').replace(/\s+/g, '-').toLowerCase();

        var a = document.createElement('a');
        a.href = url;
        a.download = safeName + '.codecast';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Grava\u00e7\u00e3o salva com sucesso!', 'success');
    }

    function loadRecording(e) {
        var file = e.target.files[0];
        if (!file) return;

        var reader = new FileReader();
        reader.onload = function(event) {
            try {
                var recording = JSON.parse(event.target.result);

                if (!recording.events || !recording.duration) {
                    throw new Error('Formato inv\u00e1lido');
                }

                currentRecording = recording;
                elements.lessonTitle.value = recording.title || 'Aula Carregada';

                // Load multi-file content
                if (recording.multiFile) {
                    var initEvt = recording.events[0];
                    var fileData = initEvt.files || recording.files || {};
                    Object.keys(fileData).forEach(function(key) {
                        if (files[key] && files[key].model) {
                            files[key].model.setValue(fileData[key]);
                            files[key].content = fileData[key];
                        }
                    });
                    switchToFile('html');
                } else {
                    // Legacy single-file
                    var initEvent = recording.events[0];
                    if (initEvent && initEvent.type === 'init') {
                        editor.setValue(initEvent.content || '');
                    }
                }

                updatePreview(false);

                elements.btnPlay.classList.remove('hidden');
                elements.btnRestart.classList.remove('hidden');
                elements.btnSave.classList.remove('hidden');
                elements.speedControl.classList.remove('hidden');
                elements.timelineContainer.classList.remove('hidden');
                elements.totalTime.textContent = formatTime(recording.duration);
                elements.currentTime.textContent = '00:00';
                elements.statusMessage.textContent = 'Grava\u00e7\u00e3o carregada! Clique em Play.';
                elements.statusMessage.className = 'status-message';

                renderTimelineMarkers();
                updateTimeline(0, 0);

                showToast('"' + recording.title + '" carregada! Dura\u00e7\u00e3o: ' + formatTime(recording.duration), 'success');
            } catch (err) {
                showToast('Erro ao carregar arquivo: ' + err.message, 'error');
            }
        };

        reader.readAsText(file);
        e.target.value = '';
    }

    // ==========================================
    // Theme
    // ==========================================
    var isDarkTheme = true;

    function toggleTheme() {
        isDarkTheme = !isDarkTheme;
        document.body.classList.toggle('light-theme', !isDarkTheme);

        if (editor) {
            monaco.editor.setTheme(isDarkTheme ? 'codecast-dark' : 'codecast-light');
        }
    }

    // ==========================================
    // Keyboard Shortcuts
    // ==========================================
    function handleKeyboardShortcuts(e) {
        // Space bar to play/pause
        if (e.code === 'Space' && !isEditorFocused() && !isInputFocused()) {
            e.preventDefault();
            if (appMode === 'playing') {
                pausePlayback();
            } else if (appMode === 'paused' || (appMode === 'idle' && currentRecording)) {
                startPlayback();
            }
        }

        // Ctrl+S to refresh preview with console output
        if (e.ctrlKey && !e.shiftKey && e.code === 'KeyS') {
            e.preventDefault();
            clearConsole();
            updatePreview(true);
            showToast('Preview atualizado!', 'info');
        }

        // Ctrl+Shift+R to start/stop recording
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyR') {
            e.preventDefault();
            if (appMode === 'recording') {
                stopRecording();
            } else if (appMode === 'idle') {
                startRecording();
            }
        }

        // Ctrl+1/2/3 to switch tabs
        if (e.ctrlKey && !e.shiftKey && !e.altKey) {
            if (e.code === 'Digit1') { e.preventDefault(); switchToFile('html'); }
            if (e.code === 'Digit2') { e.preventDefault(); switchToFile('css'); }
            if (e.code === 'Digit3') { e.preventDefault(); switchToFile('js'); }
        }

        // Ctrl+Shift+P to switch to Preview
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyP') {
            e.preventDefault();
            elements.btnPreviewTab.click();
        }

        // Ctrl+Shift+C to switch to Console
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyC') {
            e.preventDefault();
            elements.btnConsoleTab.click();
        }

        // Ctrl+Shift+E to expand editor
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyE') {
            e.preventDefault();
            toggleExpand('editor');
        }

        // Ctrl+Shift+B to expand browser/panel
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyB') {
            e.preventDefault();
            toggleExpand('panel');
        }

        // Ctrl+Shift+L to reset layout
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyL') {
            e.preventDefault();
            resetLayout();
        }

        // Ctrl+/ to toggle shortcuts modal
        if (e.ctrlKey && !e.shiftKey && (e.code === 'Slash' || e.key === '/')) {
            e.preventDefault();
            toggleShortcutsModal();
        }

        // Escape to close pause bar or shortcuts modal
        if (e.code === 'Escape') {
            if (!elements.shortcutsOverlay.classList.contains('hidden')) {
                toggleShortcutsModal();
            } else if (appMode === 'paused') {
                resumePlayback(false);
            }
        }
    }

    function isEditorFocused() {
        return elements.editorContainer.contains(document.activeElement);
    }

    function isInputFocused() {
        var tag = document.activeElement && document.activeElement.tagName ? document.activeElement.tagName.toLowerCase() : '';
        return tag === 'input' || tag === 'textarea' || tag === 'select';
    }

    // ==========================================
    // Shortcuts Modal
    // ==========================================
    function toggleShortcutsModal() {
        elements.shortcutsOverlay.classList.toggle('hidden');
    }

    // ==========================================
    // Layout: Expand / Resize
    // ==========================================
    var expandedPanel = null; // null | 'editor' | 'panel'

    function toggleExpand(which) {
        if (expandedPanel === which) {
            resetLayout();
            return;
        }
        expandedPanel = which;

        if (which === 'editor') {
            elements.editorPanel.classList.add('expanded');
            elements.rightPanel.classList.add('collapsed');
            elements.resizeHandle.classList.add('collapsed');
            updateExpandIcons('editor');
        } else {
            elements.rightPanel.classList.add('expanded');
            elements.editorPanel.classList.add('collapsed');
            elements.resizeHandle.classList.add('collapsed');
            updateExpandIcons('panel');
        }

        if (editor) setTimeout(function() { editor.layout(); }, 50);
    }

    function resetLayout() {
        expandedPanel = null;
        elements.editorPanel.classList.remove('expanded', 'collapsed');
        elements.rightPanel.classList.remove('expanded', 'collapsed');
        elements.resizeHandle.classList.remove('collapsed');
        elements.editorPanel.style.flex = '';
        elements.rightPanel.style.width = '';
        updateExpandIcons(null);

        if (editor) setTimeout(function() { editor.layout(); }, 50);
    }

    function updateExpandIcons(state) {
        // Swap icon between expand and collapse
        var expandSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';
        var collapseSvg = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/></svg>';

        elements.btnExpandEditor.innerHTML = (state === 'editor') ? collapseSvg : expandSvg;
        elements.btnExpandPanel.innerHTML = (state === 'panel') ? collapseSvg : expandSvg;
    }

    function setupResize() {
        var handle = elements.resizeHandle;
        var isDragging = false;
        var startX, startEditorWidth, startPanelWidth;

        handle.addEventListener('mousedown', function(e) {
            if (expandedPanel) return; // don't resize when expanded
            isDragging = true;
            startX = e.clientX;
            startEditorWidth = elements.editorPanel.offsetWidth;
            startPanelWidth = elements.rightPanel.offsetWidth;
            document.body.style.cursor = 'col-resize';
            document.body.style.userSelect = 'none';
            handle.classList.add('active');
            e.preventDefault();
        });

        document.addEventListener('mousemove', function(e) {
            if (!isDragging) return;
            var dx = e.clientX - startX;
            var totalWidth = elements.mainContent.offsetWidth;
            var newEditorW = startEditorWidth + dx;
            var newPanelW = startPanelWidth - dx;

            // Min sizes
            var minEditor = 250;
            var minPanel = 200;
            if (newEditorW < minEditor) { newEditorW = minEditor; newPanelW = totalWidth - minEditor; }
            if (newPanelW < minPanel) { newPanelW = minPanel; newEditorW = totalWidth - minPanel; }

            // Subtract handle width
            var handleW = handle.offsetWidth;
            elements.editorPanel.style.flex = '0 0 ' + (newEditorW - handleW / 2) + 'px';
            elements.rightPanel.style.width = (newPanelW - handleW / 2) + 'px';

            if (editor) editor.layout();
        });

        document.addEventListener('mouseup', function() {
            if (!isDragging) return;
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            handle.classList.remove('active');
        });
    }

    // ==========================================
    // Toast Notifications
    // ==========================================
    function showToast(message, type) {
        type = type || 'info';
        var toast = document.createElement('div');
        toast.className = 'toast ' + type;
        toast.textContent = message;
        elements.toastContainer.appendChild(toast);

        setTimeout(function() {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 3000);
    }

    // ==========================================
    // Utilities
    // ==========================================
    function formatTime(ms) {
        var totalSeconds = Math.floor(ms / 1000);
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds % 60;
        return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0');
    }

    // ==========================================
    // Initialize
    // ==========================================
    initEditor();

})();

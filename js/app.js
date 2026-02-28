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

    // Sessions/Sections state
    let sectionPromptIsExercise = false; // used when opening section prompt
    let currentSectionIndex = -1;        // current section index during playback

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
        btnContinueRecord: $('#btnContinueRecord'),
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

        // Save/Load/New
        btnSave: $('#btnSave'),
        btnLoad: $('#btnLoad'),
        btnNew: $('#btnNew'),
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
        toastContainer: $('#toastContainer'),

        // Timeline Editor
        btnEditRecording: $('#btnEditRecording'),
        editorOverlay: $('#editorOverlay'),
        btnCloseEditor: $('#btnCloseEditor'),
        teFilterType: $('#teFilterType'),
        teSelectAll: $('#teSelectAll'),
        teDeleteSelected: $('#teDeleteSelected'),
        teEventsList: $('#teEventsList'),
        teTrimBefore: $('#teTrimBefore'),
        teTrimAfter: $('#teTrimAfter'),
        teAdjustTimes: $('#teAdjustTimes'),
        teApply: $('#teApply'),
        teEventCount: $('#teEventCount'),

        // Sessions Sidebar
        btnToggleSidebar: $('#btnToggleSidebar'),
        sessionsSidebar: $('#sessionsSidebar'),
        btnCloseSidebar: $('#btnCloseSidebar'),
        sidebarSections: $('#sidebarSections'),

        // Section/Exercise recording buttons
        btnAddSection: $('#btnAddSection'),
        btnAddExercise: $('#btnAddExercise'),

        // Section prompt modal
        sectionPromptOverlay: $('#sectionPromptOverlay'),
        sectionPromptTitle: $('#sectionPromptTitle'),
        sectionPromptInput: $('#sectionPromptInput'),
        sectionPromptDesc: $('#sectionPromptDesc'),
        btnCloseSectionPrompt: $('#btnCloseSectionPrompt'),
        btnCancelSection: $('#btnCancelSection'),
        btnConfirmSection: $('#btnConfirmSection'),

        // Library
        btnLibrary: $('#btnLibrary'),
        libraryOverlay: $('#libraryOverlay'),
        btnCloseLibrary: $('#btnCloseLibrary'),
        btnRefreshLibrary: $('#btnRefreshLibrary'),
        libraryList: $('#libraryList'),
        libraryCount: $('#libraryCount'),

        // Exercise pause bar
        exercisePauseBar: $('#exercisePauseBar'),
        exercisePauseTitle: $('#exercisePauseTitle'),
        exercisePauseDesc: $('#exercisePauseDesc'),
        btnSeeAnswer: $('#btnSeeAnswer')
    };

    // ==========================================
    // Default File Contents
    // ==========================================
    const defaultContents = {
        html: '',

        css: '',

        js: ''
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

        // Record preview-update event during recording (explicit save/refresh)
        if (withConsole && appMode === 'recording' && recorder.isRecording) {
            var elapsed = Date.now() - recorder.startTime;
            recorder.events.push({
                time: elapsed,
                type: 'preview-update'
            });
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
        elements.btnContinueRecord.addEventListener('click', continueRecording);
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

        // Save/Load/New
        elements.btnSave.addEventListener('click', saveRecording);
        elements.btnLoad.addEventListener('click', function() { elements.fileInput.click(); });
        elements.fileInput.addEventListener('change', loadRecording);
        elements.btnNew.addEventListener('click', newRecording);

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

        // Timeline Editor modal
        elements.btnEditRecording.addEventListener('click', openTimelineEditor);
        elements.btnCloseEditor.addEventListener('click', closeTimelineEditor);
        elements.editorOverlay.addEventListener('click', function(e) {
            if (e.target === elements.editorOverlay) closeTimelineEditor();
        });
        elements.teFilterType.addEventListener('change', function() {
            renderEventsList(elements.teFilterType.value);
        });
        elements.teSelectAll.addEventListener('click', toggleSelectAllEvents);
        elements.teDeleteSelected.addEventListener('click', deleteSelectedEvents);
        elements.teTrimBefore.addEventListener('click', trimBefore);
        elements.teTrimAfter.addEventListener('click', trimAfter);
        elements.teAdjustTimes.addEventListener('click', adjustTimes);
        elements.teApply.addEventListener('click', applyTimelineEdits);

        // Library
        elements.btnLibrary.addEventListener('click', openLibrary);
        elements.btnCloseLibrary.addEventListener('click', closeLibrary);
        elements.btnRefreshLibrary.addEventListener('click', function() { loadLibraryList(); });
        elements.libraryOverlay.addEventListener('click', function(e) {
            if (e.target === elements.libraryOverlay) closeLibrary();
        });

        // Sessions sidebar
        elements.btnToggleSidebar.addEventListener('click', toggleSidebar);
        elements.btnCloseSidebar.addEventListener('click', toggleSidebar);

        // Section/Exercise recording
        elements.btnAddSection.addEventListener('click', function() { openSectionPrompt(false); });
        elements.btnAddExercise.addEventListener('click', function() { openSectionPrompt(true); });
        elements.btnCloseSectionPrompt.addEventListener('click', closeSectionPrompt);
        elements.btnCancelSection.addEventListener('click', closeSectionPrompt);
        elements.btnConfirmSection.addEventListener('click', confirmAddSection);
        elements.sectionPromptOverlay.addEventListener('click', function(e) {
            if (e.target === elements.sectionPromptOverlay) closeSectionPrompt();
        });
        elements.sectionPromptInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter') { e.preventDefault(); confirmAddSection(); }
        });

        // Exercise pause: see answer
        elements.btnSeeAnswer.addEventListener('click', function() { resumeFromExercise(); });

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
        elements.btnContinueRecord.classList.add('hidden');
        elements.btnStopRecord.classList.remove('hidden');
        elements.btnAddSection.classList.remove('hidden');
        elements.btnAddExercise.classList.remove('hidden');
        elements.btnPlay.classList.add('hidden');
        elements.btnPause.classList.add('hidden');
        elements.btnRestart.classList.add('hidden');
        elements.btnSave.classList.add('hidden');
        elements.btnNew.classList.add('hidden');
        elements.btnEditRecording.classList.add('hidden');
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

    // ==========================================
    // Continue Recording (append to existing)
    // ==========================================
    async function continueRecording() {
        if (!currentRecording || appMode === 'recording') return;

        // Stop any ongoing playback
        if (appMode === 'playing' || appMode === 'paused') {
            player.stop();
            editor.updateOptions({ readOnly: false });
            isIgnoringChanges = false;
            elements.pauseBar.classList.add('hidden');
        }

        appMode = 'recording';

        // Save existing events (remove 'end' event if present)
        var previousEvents = currentRecording.events.filter(function(e) {
            return e.type !== 'end';
        });
        var previousDuration = currentRecording.duration;

        // UI updates
        elements.btnRecord.classList.add('recording', 'hidden');
        elements.btnContinueRecord.classList.add('hidden');
        elements.btnStopRecord.classList.remove('hidden');
        elements.btnAddSection.classList.remove('hidden');
        elements.btnAddExercise.classList.remove('hidden');
        elements.btnPlay.classList.add('hidden');
        elements.btnPause.classList.add('hidden');
        elements.btnRestart.classList.add('hidden');
        elements.btnSave.classList.add('hidden');
        elements.btnNew.classList.add('hidden');
        elements.btnEditRecording.classList.add('hidden');
        elements.timelineContainer.classList.add('hidden');
        elements.speedControl.classList.add('hidden');
        elements.statusMessage.textContent = '\u23fa Continuando grava\u00e7\u00e3o...';
        elements.statusMessage.className = 'status-message recording';

        // Start recorder normally (creates fresh init + listeners)
        await recorder.startRecording(editor, {
            language: 'html',
            title: elements.lessonTitle.value,
            audioEnabled: false
        });

        // Now replace recorder state to continue from previous recording:
        // 1. Set startTime back so elapsed times continue from previous duration
        recorder.startTime = Date.now() - previousDuration;

        // 2. Replace recorder events with previous events + a file-change snapshot at the junction
        recorder.events = previousEvents;

        // Add a snapshot of current file states at the junction point
        recorder.events.push({
            time: previousDuration,
            type: 'file-change',
            file: activeFile,
            fullContent: files[activeFile].model.getValue()
        });

        // Also record which tab is active at junction
        recorder.events.push({
            time: previousDuration,
            type: 'tab-switch',
            file: activeFile
        });

        // Dispose recorder's own content listener to avoid duplicates
        if (recorder._disposable) {
            recorder._disposable.dispose();
            recorder._disposable = null;
        }

        // Track content changes for all file models
        setupMultiFileRecording();

        startRecordingTimer();
        showToast('Continuando grava\u00e7\u00e3o a partir de ' + formatTime(previousDuration), 'info');
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
        elements.btnContinueRecord.classList.remove('hidden');
        elements.btnStopRecord.classList.add('hidden');
        elements.btnAddSection.classList.add('hidden');
        elements.btnAddExercise.classList.add('hidden');
        elements.btnPlay.classList.remove('hidden');
        elements.btnRestart.classList.remove('hidden');
        elements.btnSave.classList.remove('hidden');
        elements.btnNew.classList.remove('hidden');
        elements.btnEditRecording.classList.remove('hidden');
        elements.speedControl.classList.remove('hidden');
        elements.timelineContainer.classList.remove('hidden');
        elements.statusMessage.textContent = 'Grava\u00e7\u00e3o conclu\u00edda!';
        elements.statusMessage.className = 'status-message';

        stopRecordingTimer();

        if (currentRecording) {
            elements.totalTime.textContent = formatTime(currentRecording.duration);
            elements.currentTime.textContent = '00:00';
            renderTimelineMarkers();
            currentSectionIndex = -1;
            renderSidebarSections();
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

        // Handle section events (auto-pause on exercises)
        player.onSection = function(sectionEvt) {
            handleSectionDuringPlayback(sectionEvt);
        };

        // Handle preview-update events (replay preview refresh with console)
        player.onPreviewUpdate = function() {
            clearConsole();
            updatePreview(true);
        };

        player.play(editor);

        appMode = 'playing';

        elements.btnPlay.classList.add('hidden');
        elements.btnPause.classList.remove('hidden');
        elements.btnRecord.classList.add('hidden');
        elements.btnContinueRecord.classList.add('hidden');
        elements.btnNew.classList.add('hidden');
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
        elements.exercisePauseBar.classList.add('hidden');
        elements.btnRecord.classList.remove('hidden');
        elements.btnContinueRecord.classList.remove('hidden');
        elements.btnNew.classList.remove('hidden');
        elements.currentTime.textContent = '00:00';
        updateTimeline(0, 0);
        elements.statusMessage.textContent = 'Pronto para reproduzir';
        elements.statusMessage.className = 'status-message';

        editor.updateOptions({ readOnly: false });
        isIgnoringChanges = false;
        currentSectionIndex = -1;
        renderSidebarSections();
    }

    function handlePlayerStateChange(state) {}

    function handlePlaybackComplete() {
        appMode = 'idle';

        elements.btnPlay.classList.remove('hidden');
        elements.btnPause.classList.add('hidden');
        elements.pauseBar.classList.add('hidden');
        elements.exercisePauseBar.classList.add('hidden');
        elements.btnRecord.classList.remove('hidden');
        elements.btnContinueRecord.classList.remove('hidden');
        elements.btnNew.classList.remove('hidden');
        elements.statusMessage.textContent = 'Reprodu\u00e7\u00e3o finalizada. Edite o c\u00f3digo!';
        elements.statusMessage.className = 'status-message';

        editor.updateOptions({ readOnly: false });
        isIgnoringChanges = false;

        currentSectionIndex = -1;
        renderSidebarSections();

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

        // Add section markers on the timeline
        var sections = currentRecording.events.filter(function(e) { return e.type === 'section'; });
        sections.forEach(function(sect) {
            var pct = (sect.time / currentRecording.duration) * 100;
            var sMarker = document.createElement('div');
            sMarker.className = 'timeline-section-marker' + (sect.isExercise ? '' : ' lesson');
            sMarker.style.left = pct + '%';
            sMarker.title = (sect.isExercise ? '🏋️ ' : '📌 ') + sect.title;
            elements.timelineEvents.appendChild(sMarker);
        });

        // Add preview-update markers on the timeline
        var previewUpdates = currentRecording.events.filter(function(e) { return e.type === 'preview-update'; });
        previewUpdates.forEach(function(pu) {
            var pct = (pu.time / currentRecording.duration) * 100;
            var puMarker = document.createElement('div');
            puMarker.className = 'timeline-section-marker preview';
            puMarker.style.left = pct + '%';
            puMarker.title = '🔄 Preview atualizado';
            elements.timelineEvents.appendChild(puMarker);
        });
    }

    // ==========================================
    // New Recording (discard current)
    // ==========================================
    function newRecording() {
        if (appMode === 'recording') return;

        // Stop playback if active
        if (appMode === 'playing' || appMode === 'paused') {
            player.stop();
            editor.updateOptions({ readOnly: false });
            isIgnoringChanges = false;
        }

        // Discard current recording
        currentRecording = null;

        // Reset files to default content
        Object.keys(defaultContents).forEach(function(key) {
            if (files[key] && files[key].model) {
                files[key].model.setValue(defaultContents[key]);
                files[key].content = defaultContents[key];
            }
        });
        switchToFile('html');
        clearConsole();
        updatePreview(false);

        // Reset UI
        appMode = 'idle';
        elements.btnRecord.classList.remove('recording', 'hidden');
        elements.btnContinueRecord.classList.add('hidden');
        elements.btnStopRecord.classList.add('hidden');
        elements.btnAddSection.classList.add('hidden');
        elements.btnAddExercise.classList.add('hidden');
        elements.btnPlay.classList.add('hidden');
        elements.btnPause.classList.add('hidden');
        elements.btnRestart.classList.add('hidden');
        elements.btnSave.classList.add('hidden');
        elements.btnNew.classList.add('hidden');
        elements.btnEditRecording.classList.add('hidden');
        elements.pauseBar.classList.add('hidden');
        elements.exercisePauseBar.classList.add('hidden');
        elements.timelineContainer.classList.add('hidden');
        elements.speedControl.classList.add('hidden');
        elements.currentTime.textContent = '00:00';
        elements.totalTime.textContent = '00:00';
        updateTimeline(0, 0);
        elements.statusMessage.textContent = 'Pronto para gravar';
        elements.statusMessage.className = 'status-message';
        elements.lessonTitle.value = 'Minha Aula';

        // Reset sidebar
        currentSectionIndex = -1;
        renderSidebarSections();

        showToast('Grava\u00e7\u00e3o descartada. Pronto para uma nova!', 'info');
    }

    // ==========================================
    // Library (recordings folder)
    // ==========================================
    function openLibrary() {
        elements.libraryOverlay.classList.remove('hidden');
        loadLibraryList();
    }

    function closeLibrary() {
        elements.libraryOverlay.classList.add('hidden');
    }

    function loadLibraryList() {
        elements.libraryList.innerHTML = '<div class="library-empty">Carregando...</div>';
        elements.libraryCount.textContent = '';

        fetch('recordings/manifest.json?t=' + Date.now())
            .then(function(res) {
                if (!res.ok) throw new Error('Manifest n\u00e3o encontrado. Execute scan-recordings.ps1');
                return res.json();
            })
            .then(function(manifest) {
                renderLibraryList(manifest);
            })
            .catch(function(err) {
                elements.libraryList.innerHTML = '<div class="library-empty">'
                    + '<svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="opacity:0.4;margin-bottom:8px"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>'
                    + '<br>' + err.message + '</div>';
            });
    }

    function renderLibraryList(manifest) {
        var list = elements.libraryList;
        list.innerHTML = '';

        if (!manifest.recordings || manifest.recordings.length === 0) {
            list.innerHTML = '<div class="library-empty">'
                + 'Nenhuma grava\u00e7\u00e3o encontrada.<br>'
                + '<span style="font-size:11px;opacity:0.6">Adicione .codecast na pasta recordings/</span></div>';
            elements.libraryCount.textContent = '0 grava\u00e7\u00f5es';
            return;
        }

        elements.libraryCount.textContent = manifest.recordings.length + ' grava\u00e7\u00e3o' + (manifest.recordings.length > 1 ? '\u00f5es' : '');

        manifest.recordings.forEach(function(rec) {
            var card = document.createElement('div');
            card.className = 'library-card';

            var durSec = Math.floor((rec.duration || 0) / 1000);
            var durMin = Math.floor(durSec / 60);
            var durSecR = durSec % 60;
            var durStr = String(durMin).padStart(2, '0') + ':' + String(durSecR).padStart(2, '0');

            var sizeStr = '';
            if (rec.size) {
                if (rec.size > 1024 * 1024) sizeStr = (rec.size / (1024 * 1024)).toFixed(1) + ' MB';
                else sizeStr = Math.round(rec.size / 1024) + ' KB';
            }

            var sectionsHtml = '';
            if (rec.sections && rec.sections.length > 0) {
                sectionsHtml = '<div class="library-card-sections">';
                rec.sections.forEach(function(s) {
                    var icon = s.isExercise ? '\ud83c\udfcb\ufe0f' : '\ud83d\udccc';
                    sectionsHtml += '<span class="library-section-tag' + (s.isExercise ? ' exercise' : '') + '">' + icon + ' ' + s.title + '</span>';
                });
                sectionsHtml += '</div>';
            }

            card.innerHTML = '<div class="library-card-info">'
                + '<div class="library-card-title">' + (rec.title || rec.filename) + '</div>'
                + '<div class="library-card-meta">'
                + '<span class="library-meta-item">\u23f1 ' + durStr + '</span>'
                + '<span class="library-meta-item">\ud83d\udcca ' + (rec.events || 0) + ' eventos</span>'
                + (sizeStr ? '<span class="library-meta-item">\ud83d\udcbe ' + sizeStr + '</span>' : '')
                + '</div>' + sectionsHtml + '</div>'
                + '<button class="btn btn-sm library-card-play" title="Abrir grava\u00e7\u00e3o">'
                + '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>'
                + ' Abrir</button>';

            card.querySelector('.library-card-play').addEventListener('click', function() {
                loadFromLibrary(rec.filename, rec.title);
            });

            list.appendChild(card);
        });
    }

    function loadFromLibrary(filename, title) {
        closeLibrary();
        showToast('Carregando "' + title + '"...', 'info');

        fetch('recordings/' + encodeURIComponent(filename) + '?t=' + Date.now())
            .then(function(res) {
                if (!res.ok) throw new Error('Arquivo n\u00e3o encontrado');
                return res.json();
            })
            .then(function(recording) {
                if (!recording.events || !recording.duration) throw new Error('Formato inv\u00e1lido');
                applyLoadedRecording(recording);
            })
            .catch(function(err) {
                showToast('Erro ao carregar: ' + err.message, 'error');
            });
    }

    function applyLoadedRecording(recording) {
        if (appMode === 'playing' || appMode === 'paused') {
            player.stop();
            editor.updateOptions({ readOnly: false });
            isIgnoringChanges = false;
        }

        currentRecording = recording;
        elements.lessonTitle.value = recording.title || 'Aula Carregada';

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
            var initEvent = recording.events[0];
            if (initEvent && initEvent.type === 'init') {
                editor.setValue(initEvent.content || '');
            }
        }

        updatePreview(false);
        clearConsole();

        appMode = 'idle';
        elements.btnPlay.classList.remove('hidden');
        elements.btnRestart.classList.remove('hidden');
        elements.btnSave.classList.remove('hidden');
        elements.btnNew.classList.remove('hidden');
        elements.btnEditRecording.classList.remove('hidden');
        elements.btnContinueRecord.classList.remove('hidden');
        elements.speedControl.classList.remove('hidden');
        elements.timelineContainer.classList.remove('hidden');
        elements.pauseBar.classList.add('hidden');
        elements.exercisePauseBar.classList.add('hidden');
        elements.totalTime.textContent = formatTime(recording.duration);
        elements.currentTime.textContent = '00:00';
        elements.statusMessage.textContent = 'Grava\u00e7\u00e3o carregada! Clique em Play.';
        elements.statusMessage.className = 'status-message';

        renderTimelineMarkers();
        updateTimeline(0, 0);
        currentSectionIndex = -1;
        renderSidebarSections();

        showToast('"' + recording.title + '" carregada! Dura\u00e7\u00e3o: ' + formatTime(recording.duration), 'success');
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
                applyLoadedRecording(recording);
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

        // Ctrl+Shift+S to toggle sessions sidebar
        if (e.ctrlKey && e.shiftKey && e.code === 'KeyS') {
            e.preventDefault();
            toggleSidebar();
        }

        // Ctrl+/ to toggle shortcuts modal
        if (e.ctrlKey && !e.shiftKey && (e.code === 'Slash' || e.key === '/')) {
            e.preventDefault();
            toggleShortcutsModal();
        }

        // Escape to close modals or pause bar
        if (e.code === 'Escape') {
            if (!elements.sectionPromptOverlay.classList.contains('hidden')) {
                closeSectionPrompt();
            } else if (!elements.editorOverlay.classList.contains('hidden')) {
                closeTimelineEditor();
            } else if (!elements.shortcutsOverlay.classList.contains('hidden')) {
                toggleShortcutsModal();
            } else if (!elements.exercisePauseBar.classList.contains('hidden')) {
                resumeFromExercise();
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
            elements.previewFrame.style.pointerEvents = 'none'
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
            elements.editorPanel.style.flex = '1 0  ' + (newEditorW - handleW / 2) + 'px';
            elements.rightPanel.style.width = (newPanelW - handleW / 2) + 'px';

            if (editor) editor.layout();
        });

        document.addEventListener('mouseup', function() {
            if (!isDragging) return;
            isDragging = false;
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            handle.classList.remove('active');
            elements.previewFrame.style.pointerEvents = ''

        });
    }

    // ==========================================
    // Timeline Editor
    // ==========================================
    var teEditedEvents = []; // Working copy of events for editing

    function openTimelineEditor() {
        if (!currentRecording || !currentRecording.events) {
            showToast('Nenhuma gravação para editar.', 'error');
            return;
        }

        // Deep clone events so edits don't affect original until apply
        teEditedEvents = JSON.parse(JSON.stringify(currentRecording.events));

        elements.teFilterType.value = 'all';
        renderEventsList('all');
        elements.editorOverlay.classList.remove('hidden');
    }

    function closeTimelineEditor() {
        elements.editorOverlay.classList.add('hidden');
        teEditedEvents = [];
    }

    function renderEventsList(filter) {
        var list = elements.teEventsList;
        list.innerHTML = '';

        var eventsToShow = teEditedEvents.map(function(evt, idx) {
            return { event: evt, originalIndex: idx };
        });

        if (filter && filter !== 'all') {
            eventsToShow = eventsToShow.filter(function(item) {
                return item.event.type === filter;
            });
        }

        // Update event count
        elements.teEventCount.textContent = eventsToShow.length + ' de ' + teEditedEvents.length + ' eventos';

        if (eventsToShow.length === 0) {
            list.innerHTML = '<div class="te-empty">Nenhum evento encontrado</div>';
            return;
        }

        eventsToShow.forEach(function(item) {
            var evt = item.event;
            var idx = item.originalIndex;

            var row = document.createElement('div');
            row.className = 'te-event-row';
            row.dataset.index = idx;

            // Checkbox
            var checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'te-checkbox';
            checkbox.dataset.index = idx;
            checkbox.addEventListener('change', updateDeleteButtonState);

            // Type badge
            var badge = document.createElement('span');
            badge.className = 'te-event-type te-type-' + evt.type;
            badge.textContent = getEventTypeLabel(evt.type);

            // Time
            var time = document.createElement('span');
            time.className = 'te-event-time';
            time.textContent = formatTimeMs(evt.time);

            // Time input for editing
            var timeInput = document.createElement('input');
            timeInput.type = 'number';
            timeInput.className = 'te-time-input';
            timeInput.value = evt.time;
            timeInput.min = 0;
            timeInput.title = 'Tempo em ms';
            timeInput.dataset.index = idx;
            timeInput.addEventListener('change', function(e) {
                var newTime = parseInt(e.target.value, 10);
                if (!isNaN(newTime) && newTime >= 0) {
                    teEditedEvents[idx].time = newTime;
                    time.textContent = formatTimeMs(newTime);
                }
            });

            // File info
            var fileInfo = document.createElement('span');
            fileInfo.className = 'te-event-file';
            if (evt.file) {
                fileInfo.textContent = evt.file;
            } else if (evt.activeFile) {
                fileInfo.textContent = evt.activeFile;
            }

            // Preview / description
            var preview = document.createElement('span');
            preview.className = 'te-event-preview';
            preview.textContent = getEventPreview(evt);

            // Delete button
            var deleteBtn = document.createElement('button');
            deleteBtn.className = 'btn btn-icon btn-sm te-delete-btn';
            deleteBtn.title = 'Remover este evento';
            deleteBtn.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';
            deleteBtn.addEventListener('click', function() {
                teEditedEvents.splice(idx, 1);
                renderEventsList(elements.teFilterType.value);
                showToast('Evento removido', 'info');
            });

            row.appendChild(checkbox);
            row.appendChild(badge);
            row.appendChild(time);
            row.appendChild(timeInput);
            row.appendChild(fileInfo);
            row.appendChild(preview);
            row.appendChild(deleteBtn);

            list.appendChild(row);
        });

        updateDeleteButtonState();
    }

    function getEventTypeLabel(type) {
        var labels = {
            'init': 'Init',
            'change': 'Change',
            'file-change': 'Alteração',
            'tab-switch': 'Tab',
            'cursor': 'Cursor',
            'selection': 'Seleção',
            'section': 'Seção',
            'preview-update': 'Preview',
            'end': 'Fim'
        };
        return labels[type] || type;
    }

    function getEventPreview(evt) {
        switch (evt.type) {
            case 'init':
                var fileCount = evt.files ? Object.keys(evt.files).length : 0;
                return 'Estado inicial' + (fileCount ? ' (' + fileCount + ' arquivos)' : '');
            case 'file-change':
                var content = evt.fullContent || '';
                return content.length > 60 ? content.substring(0, 60) + '...' : content || '(vazio)';
            case 'change':
                if (evt.changes && evt.changes.length > 0) {
                    var c = evt.changes[0];
                    var text = c.text || c.insertedText || '';
                    return text.length > 40 ? text.substring(0, 40) + '...' : text || '(edição)';
                }
                return evt.fullContent ? evt.fullContent.substring(0, 60) + '...' : '(change)';
            case 'tab-switch':
                return 'Trocar para: ' + (evt.file || '');
            case 'cursor':
                if (evt.cursor) {
                    return 'Ln ' + evt.cursor.lineNumber + ', Col ' + evt.cursor.column;
                }
                return 'Cursor';
            case 'selection':
                return 'Seleção';
            case 'section':
                return (evt.isExercise ? '🏋️ ' : '📌 ') + (evt.title || 'Seção');
            case 'preview-update':
                return '🔄 Atualização do preview';
            case 'end':
                return 'Fim da gravação';
            default:
                return evt.type;
        }
    }

    function formatTimeMs(ms) {
        var totalSeconds = Math.floor(ms / 1000);
        var minutes = Math.floor(totalSeconds / 60);
        var seconds = totalSeconds % 60;
        var millis = ms % 1000;
        return String(minutes).padStart(2, '0') + ':' + String(seconds).padStart(2, '0') + '.' + String(millis).padStart(3, '0');
    }

    function updateDeleteButtonState() {
        var checked = elements.teEventsList.querySelectorAll('.te-checkbox:checked');
        elements.teDeleteSelected.disabled = checked.length === 0;
        elements.teDeleteSelected.textContent = checked.length > 0
            ? 'Deletar selecionados (' + checked.length + ')'
            : 'Deletar selecionados';
    }

    function toggleSelectAllEvents() {
        var checkboxes = elements.teEventsList.querySelectorAll('.te-checkbox');
        var allChecked = Array.from(checkboxes).every(function(cb) { return cb.checked; });

        checkboxes.forEach(function(cb) {
            cb.checked = !allChecked;
        });

        elements.teSelectAll.textContent = allChecked ? 'Selecionar todos' : 'Desmarcar todos';
        updateDeleteButtonState();
    }

    function deleteSelectedEvents() {
        var checked = elements.teEventsList.querySelectorAll('.te-checkbox:checked');
        if (checked.length === 0) return;

        // Collect indices to remove (from highest to lowest to avoid shifting)
        var indices = [];
        checked.forEach(function(cb) {
            indices.push(parseInt(cb.dataset.index, 10));
        });
        indices.sort(function(a, b) { return b - a; });

        // Prevent deleting init event (index 0)
        var hasInit = indices.indexOf(0) !== -1;
        if (hasInit) {
            showToast('O evento Init não pode ser removido.', 'error');
            indices = indices.filter(function(i) { return i !== 0; });
        }

        indices.forEach(function(idx) {
            teEditedEvents.splice(idx, 1);
        });

        renderEventsList(elements.teFilterType.value);
        showToast(indices.length + ' evento(s) removido(s)', 'info');
    }

    function trimBefore() {
        var checked = elements.teEventsList.querySelectorAll('.te-checkbox:checked');
        if (checked.length === 0) {
            showToast('Selecione pelo menos um evento como referência.', 'error');
            return;
        }

        var indices = [];
        checked.forEach(function(cb) { indices.push(parseInt(cb.dataset.index, 10)); });
        var minIndex = Math.min.apply(null, indices);

        // Always keep init event (index 0)
        if (minIndex <= 0) {
            showToast('Nada para remover antes do Init.', 'info');
            return;
        }

        var removed = teEditedEvents.splice(1, minIndex - 1);
        renderEventsList(elements.teFilterType.value);
        showToast(removed.length + ' evento(s) removido(s) antes da seleção', 'info');
    }

    function trimAfter() {
        var checked = elements.teEventsList.querySelectorAll('.te-checkbox:checked');
        if (checked.length === 0) {
            showToast('Selecione pelo menos um evento como referência.', 'error');
            return;
        }

        var indices = [];
        checked.forEach(function(cb) { indices.push(parseInt(cb.dataset.index, 10)); });
        var maxIndex = Math.max.apply(null, indices);

        if (maxIndex >= teEditedEvents.length - 1) {
            showToast('Nada para remover após a seleção.', 'info');
            return;
        }

        var removed = teEditedEvents.splice(maxIndex + 1);
        renderEventsList(elements.teFilterType.value);
        showToast(removed.length + ' evento(s) removido(s) após a seleção', 'info');
    }

    function adjustTimes() {
        if (teEditedEvents.length < 2) return;

        // Recalculate times: keep relative gaps but remove large pauses (>2s become 500ms)
        var maxGap = 2000;
        var reducedGap = 500;

        var adjusted = 0;
        for (var i = 1; i < teEditedEvents.length; i++) {
            var gap = teEditedEvents[i].time - teEditedEvents[i - 1].time;
            if (gap > maxGap) {
                var reduction = gap - reducedGap;
                adjusted++;
                // Shift this and all subsequent events
                for (var j = i; j < teEditedEvents.length; j++) {
                    teEditedEvents[j].time -= reduction;
                }
            }
        }

        // Ensure first event starts at 0
        if (teEditedEvents[0].time !== 0) {
            var offset = teEditedEvents[0].time;
            teEditedEvents.forEach(function(evt) { evt.time -= offset; });
        }

        renderEventsList(elements.teFilterType.value);
        showToast(adjusted + ' gap(s) maiores que 2s foram reduzidos', 'info');
    }

    function applyTimelineEdits() {
        if (!currentRecording) return;

        // Update the recording with edited events
        currentRecording.events = teEditedEvents;

        // Recalculate duration
        if (teEditedEvents.length > 0) {
            var lastTime = teEditedEvents[teEditedEvents.length - 1].time;
            currentRecording.duration = lastTime;
        }

        // Update UI
        elements.totalTime.textContent = formatTime(currentRecording.duration);
        elements.currentTime.textContent = '00:00';
        renderTimelineMarkers();
        updateTimeline(0, 0);

        closeTimelineEditor();
        showToast('Alterações aplicadas! Eventos: ' + currentRecording.events.length + ', Duração: ' + formatTime(currentRecording.duration), 'success');
    }

    // ==========================================
    // Sessions Sidebar
    // ==========================================
    function toggleSidebar() {
        elements.sessionsSidebar.classList.toggle('hidden');
        elements.btnToggleSidebar.classList.toggle('active');
        renderSidebarSections();
    }

    function renderSidebarSections() {
        var container = elements.sidebarSections;
        container.innerHTML = '';

        if (!currentRecording || !currentRecording.events) {
            container.innerHTML = '<div class="sidebar-empty">Nenhuma sessão marcada.<br>Grave e adicione seções.</div>';
            return;
        }

        var sections = currentRecording.events.filter(function(e) { return e.type === 'section'; });

        if (sections.length === 0) {
            container.innerHTML = '<div class="sidebar-empty">Nenhuma sessão marcada nesta gravação.</div>';
            return;
        }

        sections.forEach(function(sect, idx) {
            var item = document.createElement('div');
            item.className = 'sidebar-section-item' + (sect.isExercise ? ' exercise' : '') + (idx === currentSectionIndex ? ' active' : '');
            item.dataset.time = sect.time;
            item.dataset.index = idx;

            var icon = document.createElement('span');
            icon.className = 'sidebar-section-icon';
            if (sect.isExercise) {
                icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
            } else {
                icon.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>';
            }

            var info = document.createElement('div');
            info.className = 'sidebar-section-info';

            var title = document.createElement('span');
            title.className = 'sidebar-section-title';
            title.textContent = sect.title || ('Seção ' + (idx + 1));

            var meta = document.createElement('span');
            meta.className = 'sidebar-section-meta';
            meta.textContent = formatTime(sect.time) + (sect.isExercise ? ' • Exercício' : '');

            info.appendChild(title);
            info.appendChild(meta);

            item.appendChild(icon);
            item.appendChild(info);

            // Click to seek
            item.addEventListener('click', function() {
                if (!currentRecording) return;
                if (appMode === 'idle' && currentRecording) {
                    startPlayback();
                }
                player.seekTo(editor, sect.time);
                updateTimeline(sect.time, sect.time / currentRecording.duration);
                currentSectionIndex = idx;
                renderSidebarSections();
            });

            container.appendChild(item);
        });
    }

    // ==========================================
    // Section/Exercise Recording
    // ==========================================
    function openSectionPrompt(isExercise) {
        sectionPromptIsExercise = isExercise;
        elements.sectionPromptTitle.textContent = isExercise ? 'Adicionar Exercício' : 'Adicionar Seção';
        elements.sectionPromptInput.value = '';
        elements.sectionPromptDesc.value = '';
        elements.sectionPromptInput.placeholder = isExercise
            ? 'Ex: Crie um botão de logout...'
            : 'Ex: Criando o HTML base...';
        elements.sectionPromptOverlay.classList.remove('hidden');
        setTimeout(function() { elements.sectionPromptInput.focus(); }, 100);
    }

    function closeSectionPrompt() {
        elements.sectionPromptOverlay.classList.add('hidden');
    }

    function confirmAddSection() {
        var title = elements.sectionPromptInput.value.trim();
        if (!title) {
            elements.sectionPromptInput.focus();
            showToast('Informe um título para a seção.', 'error');
            return;
        }

        var description = elements.sectionPromptDesc.value.trim();

        if (appMode === 'recording' && recorder.isRecording) {
            var elapsed = Date.now() - recorder.startTime;
            var sectionEvent = {
                time: elapsed,
                type: 'section',
                title: title,
                isExercise: sectionPromptIsExercise,
                description: description || ''
            };
            recorder.events.push(sectionEvent);

            var label = sectionPromptIsExercise ? 'Exercício' : 'Seção';
            showToast(label + ' "' + title + '" adicionado(a) em ' + formatTime(elapsed), 'success');
        }

        closeSectionPrompt();
    }

    // ==========================================
    // Exercise Auto-pause during Playback
    // ==========================================
    function handleSectionDuringPlayback(sectionEvt) {
        // Update current section index
        if (currentRecording) {
            var sections = currentRecording.events.filter(function(e) { return e.type === 'section'; });
            for (var i = 0; i < sections.length; i++) {
                if (sections[i].time === sectionEvt.time && sections[i].title === sectionEvt.title) {
                    currentSectionIndex = i;
                    break;
                }
            }
        }
        renderSidebarSections();

        if (sectionEvt.isExercise) {
            exercisePause(sectionEvt);
        }
    }

    function exercisePause(sectionEvt) {
        // Pause player
        player.pause(editor);
        appMode = 'paused';

        editor.updateOptions({ readOnly: false });
        isIgnoringChanges = false;

        // Show exercise bar instead of normal pause bar
        elements.pauseBar.classList.add('hidden');
        elements.exercisePauseBar.classList.remove('hidden');
        elements.exercisePauseTitle.textContent = sectionEvt.title || 'Pratique agora!';
        elements.exercisePauseDesc.textContent = sectionEvt.description || '';
        if (!sectionEvt.description) {
            elements.exercisePauseDesc.classList.add('hidden');
        } else {
            elements.exercisePauseDesc.classList.remove('hidden');
        }

        elements.btnPause.classList.add('hidden');
        elements.btnPlay.classList.remove('hidden');
        elements.statusMessage.textContent = '\u270f\ufe0f Exercício - Pratique!';
        elements.statusMessage.className = 'status-message paused';

        showToast('Exercício: ' + sectionEvt.title + ' — Edite o código e depois clique "Ver resposta"', 'info');
    }

    function resumeFromExercise() {
        elements.exercisePauseBar.classList.add('hidden');
        resumePlayback(false);
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

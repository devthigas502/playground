/**
 * CodeCast - Python Runner Module
 * Executes Python code using Pyodide (CPython compiled to WebAssembly)
 */
class PythonRunner {
    constructor() {
        this.pyodide = null;
        this.loading = false;
        this.ready = false;
        this._loadPromise = null;

        // Callbacks
        this.onOutput = null;   // (text, type) => void  — type: 'stdout' | 'stderr'
        this.onReady = null;    // () => void
        this.onError = null;    // (error) => void
        this.onLoading = null;  // (progress) => void
    }

    /**
     * Load Pyodide runtime (lazy — only loads when first needed)
     */
    async load() {
        if (this.ready) return;
        if (this._loadPromise) return this._loadPromise;

        this.loading = true;
        if (this.onLoading) this.onLoading('Carregando interpretador Python...');

        this._loadPromise = (async () => {
            try {
                // Load Pyodide from CDN
                this.pyodide = await loadPyodide({
                    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.25.1/full/',
                    stdout: (text) => {
                        if (this.onOutput) this.onOutput(text, 'stdout');
                    },
                    stderr: (text) => {
                        if (this.onOutput) this.onOutput(text, 'stderr');
                    }
                });

                // Override input() to use window.prompt and set up stdin
                await this.pyodide.runPythonAsync(`
import sys
import io

class _BrowserInput:
    """Stdin replacement that uses JavaScript prompt() for input()."""
    def __init__(self):
        self.encoding = 'utf-8'
        self.errors = 'strict'
        self.closed = False
        self.mode = 'r'
        self.name = '<stdin>'

    def readable(self):
        return True

    def writable(self):
        return False

    def seekable(self):
        return False

    def fileno(self):
        raise io.UnsupportedOperation("fileno")

    def read(self, size=-1):
        return self.readline()

    def readline(self, size=-1):
        from js import prompt
        result = prompt("")
        if result is None:
            return ""
        return result + "\\n"

    def readlines(self):
        return [self.readline()]

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if not line:
            raise StopIteration
        return line

    def close(self):
        self.closed = True

    def flush(self):
        pass

    def isatty(self):
        return True

sys.stdin = _BrowserInput()

# Override builtin input to flush stdout before prompting
import builtins
_original_input = builtins.input

def _browser_input(prompt_text=""):
    # Flush captured stdout so user sees prior prints
    sys.stdout.flush()
    from js import prompt
    result = prompt(str(prompt_text) if prompt_text else "")
    if result is None:
        raise EOFError("Entrada cancelada pelo usuário")
    return result

builtins.input = _browser_input
`);

                this.ready = true;
                this.loading = false;
                if (this.onReady) this.onReady();
                if (this.onLoading) this.onLoading(null);
            } catch (err) {
                this.loading = false;
                this._loadPromise = null;
                if (this.onError) this.onError('Erro ao carregar Pyodide: ' + err.message);
                throw err;
            }
        })();

        return this._loadPromise;
    }

    /**
     * Run Python code and capture output
     * @param {string} code - Python source code
     * @returns {Promise<{success: boolean, output: string, error: string|null}>}
     */
    async run(code) {
        if (!this.ready) {
            await this.load();
        }

        // Redirect stdout/stderr to capture output, but preserve custom stdin
        const result = { success: true, output: '', error: null };

        try {
            // Reset stdout/stderr capture (keep stdin intact)
            await this.pyodide.runPythonAsync(`
import sys, io, builtins

# Save custom stdin before redirect
_saved_stdin = sys.stdin

sys.stdout = io.StringIO()
sys.stderr = io.StringIO()

# Keep our browser input working — re-wrap input to log to captured stdout
_inner_browser_input = builtins.input.__wrapped__ if hasattr(builtins.input, '__wrapped__') else None

def _capturing_input(prompt_text=""):
    # Write the prompt to captured stdout so it appears in output
    if prompt_text:
        sys.stdout.write(str(prompt_text))
    from js import prompt
    result = prompt(str(prompt_text) if prompt_text else "")
    if result is None:
        raise EOFError("Entrada cancelada pelo usuário")
    # Echo the user's answer to stdout
    sys.stdout.write(result + "\\n")
    return result

builtins.input = _capturing_input
`);

            // Run user code
            await this.pyodide.runPythonAsync(code);

            // Capture output
            const stdout = await this.pyodide.runPythonAsync('sys.stdout.getvalue()');
            const stderr = await this.pyodide.runPythonAsync('sys.stderr.getvalue()');

            result.output = stdout || '';
            if (stderr) {
                result.error = stderr;
            }

            // Restore stdout/stderr/stdin and input
            await this.pyodide.runPythonAsync(`
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
sys.stdin = _saved_stdin

# Restore the original browser input
def _browser_input(prompt_text=""):
    sys.stdout.flush()
    from js import prompt
    result = prompt(str(prompt_text) if prompt_text else "")
    if result is None:
        raise EOFError("Entrada cancelada pelo usuário")
    return result

builtins.input = _browser_input
`);

        } catch (err) {
            result.success = false;

            // Try to get any partial stdout before the error
            try {
                const partialOut = await this.pyodide.runPythonAsync('sys.stdout.getvalue() if hasattr(sys.stdout, "getvalue") else ""');
                if (partialOut) {
                    result.output = partialOut;
                }
            } catch (_) {}

            result.error = this._formatPythonError(err.message);

            // Restore stdout/stderr/stdin even on error
            try {
                await this.pyodide.runPythonAsync(`
import sys, builtins
sys.stdout = sys.__stdout__
sys.stderr = sys.__stderr__
if hasattr(sys, '_saved_stdin'):
    sys.stdin = _saved_stdin

def _browser_input(prompt_text=""):
    sys.stdout.flush()
    from js import prompt
    result = prompt(str(prompt_text) if prompt_text else "")
    if result is None:
        raise EOFError("Entrada cancelada pelo usuário")
    return result

builtins.input = _browser_input
`);
            } catch (_) {}
        }

        return result;
    }

    /**
     * Install a Python package using micropip
     * @param {string} packageName
     */
    async installPackage(packageName) {
        if (!this.ready) await this.load();

        try {
            await this.pyodide.loadPackage('micropip');
            const micropip = this.pyodide.pyimport('micropip');
            await micropip.install(packageName);
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    }

    /**
     * Reset the Python environment (clear variables, etc.)
     */
    async reset() {
        if (!this.ready) return;

        try {
            await this.pyodide.runPythonAsync(`
import sys
# Clear user-defined variables
_keep = set(dir()) | {'_keep'}
for _name in list(dir()):
    if _name not in _keep and not _name.startswith('_'):
        try:
            del globals()[_name]
        except:
            pass
del _keep, _name
`);
        } catch (_) {}
    }

    /**
     * Format Python error messages for display
     */
    _formatPythonError(msg) {
        if (!msg) return msg;
        // Remove Pyodide internal frames, keep only user-relevant info
        const lines = msg.split('\n');
        const filtered = [];
        let inUserCode = false;

        for (const line of lines) {
            if (line.includes('<exec>') || line.includes('<module>')) {
                inUserCode = true;
            }
            if (inUserCode || line.startsWith('Traceback') ||
                line.match(/^\w+Error:/) || line.match(/^\w+Exception:/) ||
                line.match(/^\s+\^/) || line.match(/^SyntaxError:/)) {
                filtered.push(line);
            }
        }

        return filtered.length > 0 ? filtered.join('\n') : msg;
    }

    /**
     * Check if Pyodide is loaded and ready
     */
    isReady() {
        return this.ready;
    }

    /**
     * Check if Pyodide is currently loading
     */
    isLoading() {
        return this.loading;
    }
}

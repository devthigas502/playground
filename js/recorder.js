/**
 * CodeCast - Recorder Module
 * Handles recording code changes with timestamps and optional audio
 */
class CodeCastRecorder {
    constructor() {
        this.isRecording = false;
        this.events = [];
        this.startTime = 0;
        this.language = 'javascript';
        this.title = 'Minha Aula';

        // Audio recording
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.audioBlob = null;
        this.audioEnabled = false;

        // Cursor tracking
        this.lastCursorPosition = null;

        // Selection tracking
        this.lastSelection = null;
    }

    /**
     * Start recording code changes
     */
    async startRecording(editor, options = {}) {
        if (this.isRecording) return;

        this.isRecording = true;
        this.events = [];
        this.startTime = Date.now();
        this.language = options.language || 'javascript';
        this.title = options.title || 'Minha Aula';
        this.audioChunks = [];
        this.audioBlob = null;

        // Record initial state
        const initialContent = editor.getValue();
        const initialPosition = editor.getPosition();

        this.events.push({
            time: 0,
            type: 'init',
            content: initialContent,
            cursor: initialPosition ? {
                lineNumber: initialPosition.lineNumber,
                column: initialPosition.column
            } : null,
            language: this.language
        });

        // Setup editor change listener
        this._disposable = editor.onDidChangeModelContent((e) => {
            if (!this.isRecording) return;

            const elapsed = Date.now() - this.startTime;

            // Record each change operation
            const changes = e.changes.map(change => ({
                range: {
                    startLineNumber: change.range.startLineNumber,
                    startColumn: change.range.startColumn,
                    endLineNumber: change.range.endLineNumber,
                    endColumn: change.range.endColumn
                },
                text: change.text,
                rangeLength: change.rangeLength
            }));

            this.events.push({
                time: elapsed,
                type: 'change',
                changes: changes,
                fullContent: editor.getValue()
            });
        });

        // Setup cursor position listener
        this._cursorDisposable = editor.onDidChangeCursorPosition((e) => {
            if (!this.isRecording) return;

            const elapsed = Date.now() - this.startTime;
            const pos = e.position;

            // Throttle cursor events (max 1 every 50ms)
            if (this.lastCursorPosition &&
                elapsed - this.lastCursorPosition < 50) return;

            this.lastCursorPosition = elapsed;

            this.events.push({
                time: elapsed,
                type: 'cursor',
                cursor: {
                    lineNumber: pos.lineNumber,
                    column: pos.column
                }
            });
        });

        // Setup selection listener
        this._selectionDisposable = editor.onDidChangeCursorSelection((e) => {
            if (!this.isRecording) return;

            const elapsed = Date.now() - this.startTime;
            const sel = e.selection;

            // Only record if there's an actual selection (not just cursor)
            if (sel.startLineNumber === sel.endLineNumber &&
                sel.startColumn === sel.endColumn) return;

            this.events.push({
                time: elapsed,
                type: 'selection',
                selection: {
                    startLineNumber: sel.startLineNumber,
                    startColumn: sel.startColumn,
                    endLineNumber: sel.endLineNumber,
                    endColumn: sel.endColumn
                }
            });
        });

        // Start audio recording if enabled
        if (options.audioEnabled) {
            await this._startAudioRecording();
        }

        return true;
    }

    /**
     * Stop recording
     */
    async stopRecording() {
        if (!this.isRecording) return null;

        this.isRecording = false;
        const duration = Date.now() - this.startTime;

        // Record final event
        this.events.push({
            time: duration,
            type: 'end'
        });

        // Dispose listeners
        if (this._disposable) {
            this._disposable.dispose();
            this._disposable = null;
        }
        if (this._cursorDisposable) {
            this._cursorDisposable.dispose();
            this._cursorDisposable = null;
        }
        if (this._selectionDisposable) {
            this._selectionDisposable.dispose();
            this._selectionDisposable = null;
        }

        // Stop audio recording
        if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
            await this._stopAudioRecording();
        }

        // Optimize events - remove redundant cursor events
        this.events = this._optimizeEvents(this.events);

        // Build recording object
        const recording = {
            version: '1.0',
            title: this.title,
            language: this.language,
            duration: duration,
            createdAt: new Date().toISOString(),
            events: this.events,
            hasAudio: !!this.audioBlob
        };

        if (this.audioBlob) {
            recording.audioData = await this._blobToBase64(this.audioBlob);
        }

        return recording;
    }

    /**
     * Optimize recorded events by removing redundant ones
     */
    _optimizeEvents(events) {
        const optimized = [];
        let lastCursorTime = -100;

        for (let i = 0; i < events.length; i++) {
            const event = events[i];

            if (event.type === 'cursor') {
                // If there's a change event within 20ms, skip the cursor event
                const hasNearbyChange = events.some(e =>
                    e.type === 'change' &&
                    Math.abs(e.time - event.time) < 20
                );
                if (hasNearbyChange) continue;

                // Skip if too close to last cursor event
                if (event.time - lastCursorTime < 100) continue;
                lastCursorTime = event.time;
            }

            optimized.push(event);
        }

        return optimized;
    }

    /**
     * Start audio recording
     */
    async _startAudioRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });

            this.audioChunks = [];

            this.mediaRecorder.ondataavailable = (e) => {
                if (e.data.size > 0) {
                    this.audioChunks.push(e.data);
                }
            };

            this.mediaRecorder.start(100); // Collect data every 100ms
            this.audioEnabled = true;
        } catch (err) {
            console.warn('Could not start audio recording:', err);
            this.audioEnabled = false;
        }
    }

    /**
     * Stop audio recording
     */
    _stopAudioRecording() {
        return new Promise((resolve) => {
            if (!this.mediaRecorder) {
                resolve();
                return;
            }

            this.mediaRecorder.onstop = () => {
                this.audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });

                // Stop all tracks
                if (this.mediaRecorder.stream) {
                    this.mediaRecorder.stream.getTracks().forEach(t => t.stop());
                }

                resolve();
            };

            this.mediaRecorder.stop();
        });
    }

    /**
     * Convert blob to base64
     */
    _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
    }

    /**
     * Get current recording duration
     */
    getElapsed() {
        if (!this.isRecording) return 0;
        return Date.now() - this.startTime;
    }

    /**
     * Get event count
     */
    getEventCount() {
        return this.events.length;
    }
}

// Export for use in other modules
window.CodeCastRecorder = CodeCastRecorder;

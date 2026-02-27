/**
 * CodeCast - Player Module
 * Handles playback of recorded sessions with pause/edit capabilities
 */
class CodeCastPlayer {
    constructor() {
        this.recording = null;
        this.isPlaying = false;
        this.isPaused = false;
        this.currentEventIndex = 0;
        this.startTime = 0;
        this.pauseTime = 0;
        this.totalPauseDuration = 0;
        this.speed = 1;
        this.animationFrame = null;

        // Audio
        this.audioElement = null;

        // Callbacks
        this.onProgress = null;
        this.onStateChange = null;
        this.onComplete = null;
        this.onContentChange = null;
        this.onFileChange = null;
        this.onTabSwitch = null;
        this.onSection = null;
        this.onPreviewUpdate = null;

        // Snapshot for resuming after student edits
        this._snapshotAtPause = null;
        this._multiFileSnapshot = null;

        // Multi-file state tracking
        this._fileStates = {};

        // Scheduled timeout for next event
        this._nextEventTimeout = null;
    }

    /**
     * Load a recording for playback
     */
    loadRecording(recording) {
        this.stop();
        this.recording = recording;
        this.currentEventIndex = 0;
        this.totalPauseDuration = 0;
        this._fileStates = {};
        this._multiFileSnapshot = null;

        // Setup audio if available
        if (recording.audioData) {
            this._setupAudio(recording.audioData);
        }

        return {
            duration: recording.duration,
            eventCount: recording.events.length,
            language: recording.language,
            title: recording.title
        };
    }

    /**
     * Start or resume playback
     */
    play(editor) {
        if (!this.recording) return false;

        if (this.isPaused) {
            return this.resume(editor);
        }

        this.isPlaying = true;
        this.isPaused = false;
        this.currentEventIndex = 0;
        this.totalPauseDuration = 0;

        // Apply initial state
        const initEvent = this.recording.events[0];
        if (initEvent && initEvent.type === 'init') {
            this._applyEvent(editor, initEvent);
            this.currentEventIndex = 1;
        }

        this.startTime = Date.now();

        // Start playback loop
        this._scheduleNextEvent(editor);

        // Start audio
        if (this.audioElement) {
            this.audioElement.currentTime = 0;
            this.audioElement.playbackRate = this.speed;
            this.audioElement.play().catch(() => {});
        }

        this._notifyStateChange('playing');
        return true;
    }

    /**
     * Pause playback - allows student to edit
     */
    pause(editor) {
        if (!this.isPlaying || this.isPaused) return;

        this.isPaused = true;
        this.isPlaying = false;
        this.pauseTime = Date.now();

        // Cancel scheduled events
        if (this._nextEventTimeout) {
            clearTimeout(this._nextEventTimeout);
            this._nextEventTimeout = null;
        }

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        // Save snapshot of code at pause point
        this._snapshotAtPause = editor.getValue();
        if (this.recording && this.recording.multiFile) {
            this._multiFileSnapshot = Object.assign({}, this._fileStates);
        }

        // Pause audio
        if (this.audioElement) {
            this.audioElement.pause();
        }

        // Make editor fully editable
        editor.updateOptions({ readOnly: false });

        this._notifyStateChange('paused');
    }

    /**
     * Resume playback after pause
     */
    resume(editor, keepStudentCode = false) {
        if (!this.isPaused) return false;

        const pauseDuration = Date.now() - this.pauseTime;
        this.totalPauseDuration += pauseDuration;

        this.isPaused = false;
        this.isPlaying = true;

        // If not keeping student code, restore to the recorded state
        if (!keepStudentCode) {
            if (this.recording && this.recording.multiFile && this._multiFileSnapshot) {
                // Restore all files to their recorded state
                Object.keys(this._multiFileSnapshot).forEach(key => {
                    if (this.onFileChange) {
                        this.onFileChange(key, this._multiFileSnapshot[key]);
                    }
                });
            } else if (this._snapshotAtPause !== null) {
                // Single-file: find last recorded content
                let lastContent = this._snapshotAtPause;
                for (let i = this.currentEventIndex - 1; i >= 0; i--) {
                    const evt = this.recording.events[i];
                    if (evt.type === 'change' && evt.fullContent !== undefined) {
                        lastContent = evt.fullContent;
                        break;
                    } else if (evt.type === 'init') {
                        lastContent = evt.content;
                        break;
                    }
                }
                editor.setValue(lastContent);
            }
        }

        this._snapshotAtPause = null;
        this._multiFileSnapshot = null;

        // Resume audio
        if (this.audioElement) {
            this.audioElement.playbackRate = this.speed;
            this.audioElement.play().catch(() => {});
        }

        // Continue scheduling events
        this._scheduleNextEvent(editor);

        this._notifyStateChange('playing');
        return true;
    }

    /**
     * Stop playback completely
     */
    stop() {
        this.isPlaying = false;
        this.isPaused = false;
        this.currentEventIndex = 0;
        this.totalPauseDuration = 0;
        this._snapshotAtPause = null;
        this._multiFileSnapshot = null;
        this._fileStates = {};

        if (this._nextEventTimeout) {
            clearTimeout(this._nextEventTimeout);
            this._nextEventTimeout = null;
        }

        if (this.animationFrame) {
            cancelAnimationFrame(this.animationFrame);
            this.animationFrame = null;
        }

        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement.currentTime = 0;
        }

        this._notifyStateChange('stopped');
    }

    /**
     * Seek to a specific time position
     */
    seekTo(editor, timeMs) {
        if (!this.recording) return;

        const wasPlaying = this.isPlaying;
        const wasPaused = this.isPaused;

        // Stop current playback
        if (this._nextEventTimeout) {
            clearTimeout(this._nextEventTimeout);
            this._nextEventTimeout = null;
        }

        // Find the last state at or before the target time
        let lastContent = '';
        let lastCursor = null;
        let targetIndex = 0;
        let isMultiFile = false;
        let lastActiveFile = null;

        for (let i = 0; i < this.recording.events.length; i++) {
            const event = this.recording.events[i];
            if (event.time > timeMs) break;

            targetIndex = i + 1;

            if (event.type === 'init') {
                lastCursor = event.cursor;
                if (event.multiFile && event.files) {
                    isMultiFile = true;
                    this._fileStates = Object.assign({}, event.files);
                    lastActiveFile = event.activeFile || 'html';
                } else {
                    lastContent = event.content;
                }
            } else if (event.type === 'change' && event.fullContent !== undefined) {
                if (!isMultiFile) {
                    lastContent = event.fullContent;
                }
            } else if (event.type === 'cursor') {
                lastCursor = event.cursor;
            } else if (event.type === 'file-change') {
                this._fileStates[event.file] = event.fullContent;
            } else if (event.type === 'tab-switch') {
                lastActiveFile = event.file;
            }
        }

        // Apply the state
        if (isMultiFile) {
            if (this.onFileChange) {
                Object.keys(this._fileStates).forEach(key => {
                    this.onFileChange(key, this._fileStates[key]);
                });
            }
            if (lastActiveFile && this.onTabSwitch) {
                this.onTabSwitch(lastActiveFile);
            }
        } else {
            editor.setValue(lastContent);
        }
        if (lastCursor) {
            editor.setPosition(lastCursor);
            editor.revealPositionInCenter(lastCursor);
        }

        this.currentEventIndex = targetIndex;

        // Update timeline
        const progress = timeMs / this.recording.duration;
        this._notifyProgress(timeMs, progress);

        // Adjust start time so playback continues from this point
        this.startTime = Date.now() - (timeMs / this.speed) - this.totalPauseDuration;

        // Sync audio
        if (this.audioElement) {
            this.audioElement.currentTime = timeMs / 1000;
        }

        // Resume if was playing
        if (wasPlaying && !wasPaused) {
            this.isPlaying = true;
            this._scheduleNextEvent(editor);
        } else if (wasPaused) {
            this.isPaused = true;
            this.isPlaying = false;
            this.pauseTime = Date.now();
            this._snapshotAtPause = lastContent;
        }
    }

    /**
     * Set playback speed
     */
    setSpeed(speed) {
        const currentTime = this.getCurrentTime();
        this.speed = speed;

        if (this.audioElement) {
            this.audioElement.playbackRate = speed;
        }

        // Recalculate start time to maintain position
        if (this.isPlaying) {
            this.startTime = Date.now() - (currentTime / this.speed);
        }
    }

    /**
     * Get current playback time in ms
     */
    getCurrentTime() {
        if (!this.recording) return 0;
        if (this.isPaused) {
            return (this.pauseTime - this.startTime - this.totalPauseDuration) * this.speed;
        }
        if (!this.isPlaying) return 0;
        return (Date.now() - this.startTime - this.totalPauseDuration) * this.speed;
    }

    /**
     * Schedule the next event for playback
     */
    _scheduleNextEvent(editor) {
        if (!this.isPlaying || this.isPaused) return;
        if (this.currentEventIndex >= this.recording.events.length) {
            this._onPlaybackComplete(editor);
            return;
        }

        const event = this.recording.events[this.currentEventIndex];
        const currentTime = this.getCurrentTime();
        const delay = Math.max(0, (event.time - currentTime) / this.speed);

        // Update progress
        const progress = currentTime / this.recording.duration;
        this._notifyProgress(currentTime, Math.min(1, progress));

        if (delay <= 0) {
            // Apply immediately
            this._applyEvent(editor, event);
            this.currentEventIndex++;
            // Use requestAnimationFrame for immediate events to avoid stack overflow
            this.animationFrame = requestAnimationFrame(() => {
                this._scheduleNextEvent(editor);
            });
        } else {
            this._nextEventTimeout = setTimeout(() => {
                if (!this.isPlaying || this.isPaused) return;

                this._applyEvent(editor, event);
                this.currentEventIndex++;
                this._scheduleNextEvent(editor);
            }, delay);
        }

        // Keep updating progress smoothly
        this._startProgressUpdater(editor);
    }

    /**
     * Continuously update progress bar
     */
    _startProgressUpdater(editor) {
        if (this._progressUpdater) return;

        const update = () => {
            if (!this.isPlaying || this.isPaused) {
                this._progressUpdater = null;
                return;
            }

            const currentTime = this.getCurrentTime();
            const progress = Math.min(1, currentTime / this.recording.duration);
            this._notifyProgress(currentTime, progress);

            this._progressUpdater = requestAnimationFrame(update);
        };

        this._progressUpdater = requestAnimationFrame(update);
    }

    /**
     * Apply a recorded event to the editor
     */
    _applyEvent(editor, event) {
        switch (event.type) {
            case 'init':
                if (event.multiFile && event.files) {
                    this._fileStates = Object.assign({}, event.files);
                    if (this.onFileChange) {
                        Object.keys(event.files).forEach(key => {
                            this.onFileChange(key, event.files[key]);
                        });
                    }
                    if (event.activeFile && this.onTabSwitch) {
                        this.onTabSwitch(event.activeFile);
                    }
                } else {
                    editor.setValue(event.content || '');
                }
                if (event.cursor) {
                    editor.setPosition(event.cursor);
                    editor.revealPositionInCenter(event.cursor);
                }
                break;

            case 'change':
                // For multiFile recordings, skip (file-change events handle content)
                if (this.recording && this.recording.multiFile) break;
                // Apply using full content (more reliable than individual changes)
                if (event.fullContent !== undefined) {
                    // Save cursor to try to maintain it
                    const pos = editor.getPosition();
                    editor.setValue(event.fullContent);
                    if (pos) {
                        try {
                            editor.setPosition(pos);
                        } catch(e) {}
                    }
                }
                if (this.onContentChange) {
                    this.onContentChange(event.fullContent);
                }
                break;

            case 'cursor':
                if (event.cursor) {
                    try {
                        editor.setPosition(event.cursor);
                        editor.revealPositionInCenterIfOutsideViewport(event.cursor);
                    } catch(e) {}
                }
                break;

            case 'selection':
                if (event.selection) {
                    try {
                        const sel = new monaco.Selection(
                            event.selection.startLineNumber,
                            event.selection.startColumn,
                            event.selection.endLineNumber,
                            event.selection.endColumn
                        );
                        editor.setSelection(sel);
                    } catch(e) {}
                }
                break;

            case 'file-change':
                // Multi-file: update a specific file's content
                if (event.file && event.fullContent !== undefined) {
                    this._fileStates[event.file] = event.fullContent;
                    if (this.onFileChange) {
                        this.onFileChange(event.file, event.fullContent);
                    }
                }
                break;

            case 'tab-switch':
                // Multi-file: switch to a different tab
                if (event.file && this.onTabSwitch) {
                    this.onTabSwitch(event.file);
                }
                break;

            case 'section':
                // Section/exercise marker
                if (this.onSection) {
                    this.onSection(event);
                }
                break;

            case 'preview-update':
                // Preview refresh with console (recorded from Ctrl+S, Ctrl+Enter, Refresh)
                if (this.onPreviewUpdate) {
                    this.onPreviewUpdate();
                }
                break;

            case 'end':
                this._onPlaybackComplete(editor);
                break;
        }
    }

    /**
     * Handle playback completion
     */
    _onPlaybackComplete(editor) {
        this.isPlaying = false;
        this.isPaused = false;

        if (this._nextEventTimeout) {
            clearTimeout(this._nextEventTimeout);
            this._nextEventTimeout = null;
        }

        if (this._progressUpdater) {
            cancelAnimationFrame(this._progressUpdater);
            this._progressUpdater = null;
        }

        if (this.audioElement) {
            this.audioElement.pause();
        }

        // Notify progress at 100%
        this._notifyProgress(this.recording.duration, 1);

        // Make editor editable
        editor.updateOptions({ readOnly: false });

        this._notifyStateChange('completed');

        if (this.onComplete) {
            this.onComplete();
        }
    }

    /**
     * Setup audio element from base64 data
     */
    _setupAudio(audioData) {
        if (this.audioElement) {
            this.audioElement.pause();
            this.audioElement = null;
        }

        this.audioElement = new Audio(audioData);
        this.audioElement.playbackRate = this.speed;
    }

    /**
     * Notify progress callback
     */
    _notifyProgress(currentTime, progress) {
        if (this.onProgress) {
            this.onProgress(currentTime, progress);
        }
    }

    /**
     * Notify state change callback
     */
    _notifyStateChange(state) {
        if (this.onStateChange) {
            this.onStateChange(state);
        }
    }

    /**
     * Get snapshot for seeking
     */
    getContentAtTime(timeMs) {
        if (!this.recording) return '';

        let content = '';
        for (let i = 0; i < this.recording.events.length; i++) {
            const event = this.recording.events[i];
            if (event.time > timeMs) break;

            if (event.type === 'init') {
                content = event.content;
            } else if (event.type === 'change' && event.fullContent !== undefined) {
                content = event.fullContent;
            }
        }

        return content;
    }
}

// Export for use in other modules
window.CodeCastPlayer = CodeCastPlayer;

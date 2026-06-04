/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable, DisposableMap, DisposableStore, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { URI } from '../../../../base/common/uri.js';
import { joinPath } from '../../../../base/common/resources.js';
import { IFileService } from '../../../../platform/files/common/files.js';
import { ICommandDetectionCapability, TerminalCapability } from '../../../../platform/terminal/common/capabilities/capabilities.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IPathService } from '../../../services/path/common/pathService.js';
import { ISecondBarService } from '../../../services/secondBar/browser/secondBarService.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';

const LOG_PREFIX = '[ClaudeSessionBar]';

/** Text shown in the second bar when no Claude Code terminal is focused. */
const SECOND_BAR_IDLE_TEXT = '';

/** Fields we extract from a Claude Code session transcript (`~/.claude/projects/<cwd>/<id>.jsonl`). */
interface ITranscriptInfo {
	sessionId?: string;
	version?: string;
	mode?: string;
	permissionMode?: string;
	aiTitle?: string;
	lastPrompt?: string;
}

/** Minimal shape of a single transcript JSONL record (only the fields we read). */
interface ITranscriptRecord {
	type?: string;
	sessionId?: string;
	version?: string;
	mode?: string;
	permissionMode?: string;
	aiTitle?: string;
	lastPrompt?: string;
}

/**
 * Detects whether a terminal is running Claude Code and — while a Claude terminal is focused —
 * shows its session info in the second bar at the bottom of the window.
 *
 * Detection is intentionally NOT tied to focus alone — it is re-evaluated whenever a terminal
 * gains focus, changes its title, or executes a command, so we notice Claude even when it starts
 * in a terminal that is already focused.
 */
export class ClaudeSessionBar extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.claudeSessionBar';

	/** Instance IDs currently detected as running Claude Code (used to log transitions, not spam). */
	private readonly _claudeInstanceIds = new Set<number>();

	/** Per-instance listeners (command detection, blur), keyed by instance ID. */
	private readonly _instanceListeners = this._register(new DisposableMap<number>());

	/** The instance ID whose session is currently shown in the second bar, if any. */
	private _displayedClaudeId: number | undefined;

	/** Watcher + listener for the transcript file backing the currently displayed session. */
	private readonly _transcriptWatcher = this._register(new MutableDisposable());

	constructor(
		@ITerminalService private readonly _terminalService: ITerminalService,
		@ISecondBarService private readonly _secondBarService: ISecondBarService,
		@IFileService private readonly _fileService: IFileService,
		@IPathService private readonly _pathService: IPathService,
	) {
		super();

		// A terminal gained focus: re-evaluate Claude detection, refresh the second bar.
		this._register(this._terminalService.onDidFocusInstance(instance => {
			this._evaluateClaude(instance, 'focus');
			this._syncSecondBar();
		}));

		// A terminal's title changed: Claude Code sets the title to its version on launch,
		// so this catches Claude starting in an already-focused terminal.
		this._register(this._terminalService.onAnyInstanceTitleChange(instance => {
			this._evaluateClaude(instance, 'titleChange');
			this._syncSecondBar();
		}));

		// Track command execution / blur per instance (existing + future terminals).
		this._register(this._terminalService.onDidCreateInstance(instance => this._trackInstance(instance)));
		this._register(this._terminalService.onDidDisposeInstance(instance => this._untrackInstance(instance)));
		for (const instance of this._terminalService.instances) {
			this._trackInstance(instance);
		}
	}

	// --- Detection -----------------------------------------------------------

	/**
	 * Subscribes to command execution and blur for a terminal so detection and the second bar
	 * re-sync when a command starts or focus leaves. Shell integration (and thus command
	 * detection) may attach after the instance is created, so we also listen for the capability
	 * being added.
	 */
	private _trackInstance(instance: ITerminalInstance): void {
		if (this._instanceListeners.has(instance.instanceId)) {
			return;
		}

		const store = new DisposableStore();

		const hookCommandDetection = (commandDetection: ICommandDetectionCapability) => {
			store.add(commandDetection.onCommandExecuted(() => {
				this._evaluateClaude(instance, 'commandExecuted');
				this._syncSecondBar();
			}));
		};

		const existing = instance.capabilities.get(TerminalCapability.CommandDetection);
		if (existing) {
			hookCommandDetection(existing);
		}
		store.add(instance.capabilities.onDidAddCommandDetectionCapability(commandDetection => hookCommandDetection(commandDetection)));

		// When this terminal loses focus, the second bar may need to clear.
		store.add(instance.onDidBlur(() => this._syncSecondBar()));

		this._instanceListeners.set(instance.instanceId, store);
	}

	/**
	 * Drops per-instance listeners and detection state when a terminal is disposed.
	 */
	private _untrackInstance(instance: ITerminalInstance): void {
		this._instanceListeners.deleteAndDispose(instance.instanceId);
		this._claudeInstanceIds.delete(instance.instanceId);
		this._syncSecondBar();
	}

	/**
	 * Re-evaluates whether a terminal is running Claude Code and logs only on a state
	 * transition (started / stopped), tagged with what triggered the re-evaluation.
	 */
	private _evaluateClaude(instance: ITerminalInstance, reason: string): void {
		const id = instance.instanceId;
		const isClaude = this._isClaudeCodeTerminal(instance);
		const wasClaude = this._claudeInstanceIds.has(id);

		if (isClaude && !wasClaude) {
			this._claudeInstanceIds.add(id);
			console.log(`${LOG_PREFIX} ✅ Claude Code detected in terminal ${id} (via ${reason})`);
		} else if (!isClaude && wasClaude) {
			this._claudeInstanceIds.delete(id);
			console.log(`${LOG_PREFIX} ⛔ Claude Code no longer running in terminal ${id} (via ${reason})`);
		}
	}

	/**
	 * Heuristic check for whether a terminal is running Claude Code, best signal first:
	 *  - shell integration reports `claude` as the executing command
	 *  - shell integration history contains a `claude` invocation
	 *  - the foreground process name looks like `claude`
	 *
	 * Note: when Claude Code runs it sets the terminal title (and hence process name) to its
	 * version string, so the process-name check is an unreliable fallback — command detection
	 * is the load-bearing signal.
	 */
	private _isClaudeCodeTerminal(instance: ITerminalInstance): boolean {
		const commandDetection = instance.capabilities.get(TerminalCapability.CommandDetection);
		if (commandDetection) {
			if (/\bclaude\b/.test(commandDetection.executingCommand ?? '')) {
				return true;
			}
			if (commandDetection.commands.some(command => /\bclaude\b/.test(command.command))) {
				return true;
			}
		}

		if (/claude/i.test(instance.processName)) {
			return true;
		}

		return false;
	}

	// --- Second bar ----------------------------------------------------------

	/**
	 * Updates the second bar to reflect the currently focused terminal: if it is running
	 * Claude Code, show its session info; otherwise clear it. No-ops when the displayed
	 * terminal has not changed (transcript-driven updates are handled by the watcher).
	 */
	private _syncSecondBar(): void {
		const focused = this._terminalService.instances.find(instance => instance.hasFocus);
		const claude = focused && this._isClaudeCodeTerminal(focused) ? focused : undefined;
		const newId = claude?.instanceId;

		if (newId === this._displayedClaudeId) {
			return;
		}

		this._displayedClaudeId = newId;
		this._transcriptWatcher.clear();

		if (!claude) {
			this._secondBarService.setText(SECOND_BAR_IDLE_TEXT);
			return;
		}

		// Stage 1: show terminal-level basics immediately (version fills in from the transcript).
		this._secondBarService.setText(this._composeText(claude));

		// Stage 2: enrich with session transcript details (async).
		this._enrichWithTranscript(claude);
	}

	/**
	 * Locates the session transcript for a Claude terminal, renders it into the second bar,
	 * and watches it so subsequent activity keeps the bar up to date.
	 */
	private async _enrichWithTranscript(instance: ITerminalInstance): Promise<void> {
		const transcript = await this._findTranscriptFile(instance);
		if (!transcript || this._displayedClaudeId !== instance.instanceId) {
			return;
		}

		const store = new DisposableStore();
		const watcher = store.add(this._fileService.createWatcher(transcript, { recursive: false, excludes: [] }));
		store.add(watcher.onDidChange(() => this._renderTranscript(instance, transcript)));
		this._transcriptWatcher.value = store;

		await this._renderTranscript(instance, transcript);
	}

	/**
	 * Reads and parses the transcript file, then updates the second bar — but only if the
	 * same Claude terminal is still the one being displayed.
	 */
	private async _renderTranscript(instance: ITerminalInstance, transcript: URI): Promise<void> {
		let content: string;
		try {
			content = (await this._fileService.readFile(transcript)).value.toString();
		} catch {
			return;
		}
		if (this._displayedClaudeId !== instance.instanceId) {
			return;
		}
		this._secondBarService.setText(this._composeText(instance, this._parseTranscript(content)));
	}

	/**
	 * Resolves the newest `*.jsonl` transcript for a terminal's cwd under
	 * `~/.claude/projects/<encoded-cwd>/`. Returns undefined if nothing is found.
	 *
	 * Note: the `~/.claude` layout is an implementation detail of the Claude Code CLI and may
	 * change; this is handled defensively (missing dir / unparseable lines are tolerated).
	 */
	private async _findTranscriptFile(instance: ITerminalInstance): Promise<URI | undefined> {
		const cwd = instance.cwd;
		if (!cwd) {
			return undefined;
		}

		const home = this._pathService.userHome({ preferLocal: true });
		const encodedCwd = cwd.replace(/[^a-zA-Z0-9]/g, '-');
		const directory = joinPath(home, '.claude', 'projects', encodedCwd);

		try {
			const stat = await this._fileService.resolve(directory, { resolveMetadata: true });
			const transcripts = (stat.children ?? []).filter(child => !child.isDirectory && child.name.endsWith('.jsonl'));
			if (transcripts.length === 0) {
				return undefined;
			}
			transcripts.sort((a, b) => b.mtime - a.mtime);
			return transcripts[0].resource;
		} catch {
			return undefined;
		}
	}

	/**
	 * Extracts the latest session fields by scanning transcript records from newest to
	 * oldest, stopping once everything of interest has been found.
	 */
	private _parseTranscript(content: string): ITranscriptInfo {
		const info: ITranscriptInfo = {};
		const lines = content.split('\n');

		for (let i = lines.length - 1; i >= 0; i--) {
			const line = lines[i].trim();
			if (!line) {
				continue;
			}

			let record: ITranscriptRecord;
			try {
				record = JSON.parse(line) as ITranscriptRecord;
			} catch {
				continue;
			}

			if (!info.sessionId && record.sessionId) {
				info.sessionId = record.sessionId;
			}
			if (!info.version && record.version) {
				info.version = record.version;
			}
			switch (record.type) {
				case 'mode': info.mode ??= record.mode; break;
				case 'permission-mode': info.permissionMode ??= record.permissionMode; break;
				case 'ai-title': info.aiTitle ??= record.aiTitle; break;
				case 'last-prompt': info.lastPrompt ??= record.lastPrompt; break;
			}

			if (info.sessionId && info.version && info.mode && info.permissionMode && info.aiTitle && info.lastPrompt) {
				break;
			}
		}

		return info;
	}

	/**
	 * Builds the second-bar label from terminal basics plus optional transcript details, e.g.
	 * `Claude Code 2.1.162 — /Users/mike · normal · #dc9c89e7 · "Track user focus…"`.
	 */
	private _composeText(instance: ITerminalInstance, transcript?: ITranscriptInfo): string {
		let text = transcript?.version ? `Claude Code ${transcript.version}` : 'Claude Code';
		if (instance.cwd) {
			text += ` — ${instance.cwd}`;
		}

		if (transcript) {
			const meta: string[] = [];
			if (transcript.mode) {
				meta.push(transcript.mode);
			}
			if (transcript.permissionMode && transcript.permissionMode !== 'default') {
				meta.push(transcript.permissionMode);
			}
			if (transcript.sessionId) {
				meta.push(`#${transcript.sessionId.slice(0, 8)}`);
			}
			if (meta.length) {
				text += ` · ${meta.join(' · ')}`;
			}

			const summary = transcript.aiTitle ?? transcript.lastPrompt;
			if (summary) {
				text += ` · "${this._truncate(summary, 60)}"`;
			}
		}

		return text;
	}

	private _truncate(value: string, max: number): string {
		return value.length > max ? `${value.slice(0, max - 1)}…` : value;
	}
}

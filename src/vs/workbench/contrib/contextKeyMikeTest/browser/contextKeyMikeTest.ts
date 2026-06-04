/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Disposable } from '../../../../base/common/lifecycle.js';
import { IContextKeyService } from '../../../../platform/contextkey/common/contextkey.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';

/**
 * The focus-related context keys we care about. `onDidChangeContext` is a firehose that
 * fires for every context key in the workbench, so we filter it down to just these.
 */
const WATCHED_FOCUS_KEYS = new Set<string>([
	'terminalFocus',
	'editorTextFocus',
	'sideBarFocus',
	'panelFocus',
	'auxiliaryBarFocus',
]);

const LOG_PREFIX = '[ContextKeyMikeTest]';

/**
 * Experimental probe: logs where focus is in the workbench, and the details of any terminal
 * that gains focus. Claude Code awareness lives separately in the `claudeSessionBar` contrib.
 */
export class ContextKeyMikeTest extends Disposable implements IWorkbenchContribution {

	static readonly ID = 'workbench.contrib.contextKeyMikeTest';

	constructor(
		@IContextKeyService private readonly _contextKeyService: IContextKeyService,
		@ITerminalService private readonly _terminalService: ITerminalService,
	) {
		super();

		// Log the initial state once, since the event below only fires on *changes*.
		this._logFocusState('initial');

		// Broad signal: the context-key firehose, filtered to focus keys.
		this._register(this._contextKeyService.onDidChangeContext(e => {
			if (e.affectsSome(WATCHED_FOCUS_KEYS)) {
				this._logFocusState('contextChange');
			}
		}));

		// Narrow signal: a terminal gained focus.
		this._register(this._terminalService.onDidFocusInstance(instance => {
			this._logTerminalFocused(instance);
		}));
	}

	/**
	 * Logs which of the watched focus context keys are currently active.
	 */
	private _logFocusState(reason: string): void {
		const active: string[] = [];
		for (const key of WATCHED_FOCUS_KEYS) {
			if (this._contextKeyService.getContextKeyValue<boolean>(key)) {
				active.push(key);
			}
		}
		console.log(`${LOG_PREFIX} focus (${reason}):`, active.length ? active.join(', ') : '<none>');
	}

	/**
	 * Logs the details of a terminal instance that just gained focus.
	 */
	private _logTerminalFocused(instance: ITerminalInstance): void {
		console.log(`${LOG_PREFIX} terminal focused:`, {
			id: instance.instanceId,
			processName: instance.processName,
			title: instance.title,
			cwd: instance.cwd,
		});
	}
}

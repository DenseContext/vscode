/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/cutIn.css';
import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { FileAccess } from '../../../../base/common/network.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';

const SOUND_FILES = [
	'mvc.mp3',
	'persona.mp3',
	'phoenix.mp3',
	'guilty-gear.mp3',
	'antonidas-play.wav',
	'tirion-play.wav',
	'tirion-stinger.wav',
];

const CUT_IN_STYLES: Record<string, {
	panelClass: string;
	text: string;
	subtext?: string;
	exitAnimation: string;
	flash: boolean;
}> = {
	'mvc': {
		panelClass: 'cut-in-panel-mvc',
		text: 'VS CODE',
		exitAnimation: 'mvcExit 0.4s cubic-bezier(0.22, 0.61, 0.36, 1) forwards',
		flash: true,
	},
	'persona': {
		panelClass: 'cut-in-panel-persona',
		text: 'READY',
		subtext: 'TAKE YOUR TIME',
		exitAnimation: 'personaExit 0.2s cubic-bezier(0.4, 0, 1, 1) forwards',
		flash: false,
	},
	'phoenix-wright': {
		panelClass: 'cut-in-panel-phoenix',
		text: 'OBJECTION!',
		subtext: 'CODE REVIEW',
		exitAnimation: 'phoenixExit 0.3s ease-out forwards',
		flash: true,
	},
	'guilty-gear': {
		panelClass: 'cut-in-panel-guilty-gear',
		text: 'SLASH',
		subtext: 'LET\'S CODE',
		exitAnimation: 'ggExit 0.3s cubic-bezier(0.4, 0, 1, 1) forwards',
		flash: false,
	},
};

export class CutInOverlay {

	static readonly ID = 'workbench.contrib.cutIn';

	private readonly _disposables = new DisposableStore();
	private _overlay: HTMLElement | undefined;
	private _flash: HTMLElement | undefined;
	private _audio: HTMLAudioElement | undefined;
	private readonly _configurationService: IConfigurationService;

	constructor(
		@IConfigurationService configurationService: IConfigurationService
	) {
		this._configurationService = configurationService;
	}

	showCutIn(onDismissed?: () => void): void {
		this._removeOverlay();

		const styleName = this._configurationService.getValue<string>('workbench.experimental.cutIn.style') || 'mvc';
		const style = CUT_IN_STYLES[styleName] ?? CUT_IN_STYLES['mvc'];

		if (style.flash) {
			const flash = document.createElement('div');
			flash.classList.add('cut-in-flash');
			this._flash = flash;
			mainWindow.document.body.appendChild(flash);
			this._disposables.add(dom.addDisposableListener(flash, 'animationend', () => {
				flash.remove();
				this._flash = undefined;
			}));
		}

		const overlay = document.createElement('div');
		overlay.classList.add('cut-in-overlay');

		const panel = document.createElement('div');
		panel.classList.add(style.panelClass);

		const text = document.createElement('span');
		text.classList.add('cut-in-text');
		text.textContent = style.text;
		panel.appendChild(text);

		if (style.subtext) {
			const subtext = document.createElement('span');
			subtext.classList.add('cut-in-subtext');
			subtext.textContent = style.subtext;
			panel.appendChild(subtext);
		}

		overlay.appendChild(panel);
		this._overlay = overlay;

		mainWindow.document.body.appendChild(overlay);

		const soundEnabled = this._configurationService.getValue<boolean>('workbench.experimental.cutIn.sound');
		if (soundEnabled !== false && SOUND_FILES.length > 0) {
			const randomSound = SOUND_FILES[Math.floor(Math.random() * SOUND_FILES.length)];
			const soundUrl = FileAccess.asBrowserUri(`vs/workbench/contrib/cutIn/browser/media/sounds/${randomSound}`).toString(true);
			const audio = new Audio(soundUrl);
			audio.volume = 0.5;
			this._audio = audio;
			audio.play().catch(() => { /* autoplay may be blocked */ });
		}

		this._disposables.add(dom.addDisposableListener(panel, 'click', () => {
			panel.style.animation = style.exitAnimation;
			this._disposables.add(dom.addDisposableListener(panel, 'animationend', () => {
				this._removeOverlay();
				onDismissed?.();
			}));
		}));
	}

	private _removeOverlay(): void {
		if (this._overlay) {
			this._overlay.remove();
			this._overlay = undefined;
		}
		if (this._flash) {
			this._flash.remove();
			this._flash = undefined;
		}
		if (this._audio) {
			this._audio.pause();
			this._audio = undefined;
		}
	}

	dispose(): void {
		this._removeOverlay();
		this._disposables.dispose();
	}
}

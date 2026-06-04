/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/xkcd.css';
import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getWorkbenchContribution } from '../../../common/contributions.js';
import { CutInOverlay } from '../../cutIn/browser/cutIn.js';

interface IXkcdComic {
	num: number;
	title: string;
	safe_title: string;
	img: string;
	alt: string;
}

const XKCD_SEEN_KEY = 'xkcd.seenComics';
const XKCD_LATEST_KEY = 'xkcd.latestNum';

export class XkcdOverlay {

	static readonly ID = 'workbench.contrib.xkcd';

	private readonly _disposables = new DisposableStore();
	private _overlay: HTMLElement | undefined;

	constructor(
		@IConfigurationService _configurationService: IConfigurationService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		const xkcdEnabled = _configurationService.getValue<boolean>('workbench.experimental.xkcd.enabled');
		const cutInEnabled = _configurationService.getValue<boolean>('workbench.experimental.cutIn.enabled');
		const cutIn = getWorkbenchContribution<CutInOverlay>(CutInOverlay.ID);

		if (cutInEnabled && xkcdEnabled) {
			cutIn.showCutIn(() => { this.showXkcd(); });
		} else if (cutInEnabled) {
			cutIn.showCutIn();
		} else if (xkcdEnabled) {
			this.showXkcd();
		}
	}

	async showXkcd(): Promise<void> {
		this._removeOverlay();

		const comic = await this._fetchRandomComic();
		if (!comic) {
			return;
		}

		this._markSeen(comic.num);
		this._renderComic(comic);
	}

	private async _fetchRandomComic(): Promise<IXkcdComic | null> {
		try {
			let latestNum = this._storageService.getNumber(XKCD_LATEST_KEY, StorageScope.APPLICATION);

			if (!latestNum) {
				const latest = await this._fetchJson<IXkcdComic>('https://xkcd.com/info.0.json');
				if (!latest) {
					return null;
				}
				latestNum = latest.num;
				this._storageService.store(XKCD_LATEST_KEY, latestNum, StorageScope.APPLICATION, StorageTarget.MACHINE);
			}

			const comicNum = this._pickUnseen(latestNum);
			return await this._fetchJson<IXkcdComic>(`https://xkcd.com/${comicNum}/info.0.json`);
		} catch {
			return null;
		}
	}

	private async _fetchJson<T>(url: string): Promise<T | null> {
		try {
			const res = await fetch(url, {
				headers: { 'Accept': 'application/json' }
			});
			if (!res.ok) {
				return null;
			}
			return await res.json() as T;
		} catch {
			return null;
		}
	}

	private _pickUnseen(latestNum: number): number {
		const seen = this._getSeenSet();

		if (seen.size >= latestNum) {
			seen.clear();
			this._storageService.store(XKCD_SEEN_KEY, '[]', StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		let num: number;
		do {
			num = Math.floor(Math.random() * latestNum) + 1;
		} while (seen.has(num) && seen.size < latestNum);

		return num;
	}

	private _getSeenSet(): Set<number> {
		try {
			const raw = this._storageService.get(XKCD_SEEN_KEY, StorageScope.APPLICATION, '[]');
			const arr = JSON.parse(raw) as number[];
			return new Set(arr);
		} catch {
			return new Set();
		}
	}

	private _markSeen(num: number): void {
		const seen = this._getSeenSet();
		seen.add(num);
		this._storageService.store(
			XKCD_SEEN_KEY,
			JSON.stringify([...seen]),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);
	}

	private _renderComic(comic: IXkcdComic): void {
		const overlay = document.createElement('div');
		overlay.classList.add('xkcd-overlay');

		const card = document.createElement('div');
		card.classList.add('xkcd-card');

		const header = document.createElement('div');
		header.classList.add('xkcd-header');

		const title = document.createElement('h2');
		title.classList.add('xkcd-title');
		title.textContent = comic.safe_title;

		const number = document.createElement('span');
		number.classList.add('xkcd-number');
		number.textContent = `#${comic.num}`;

		header.appendChild(title);
		header.appendChild(number);

		const imageContainer = document.createElement('div');
		imageContainer.classList.add('xkcd-image-container');

		const img = document.createElement('img');
		img.src = comic.img;
		img.alt = comic.alt;
		imageContainer.appendChild(img);

		const alt = document.createElement('p');
		alt.classList.add('xkcd-alt');
		alt.textContent = comic.alt;

		const footer = document.createElement('div');
		footer.classList.add('xkcd-footer');

		const hint = document.createElement('span');
		hint.classList.add('xkcd-hint');
		hint.textContent = 'Click anywhere to dismiss';

		footer.appendChild(hint);

		card.appendChild(header);
		card.appendChild(imageContainer);
		card.appendChild(alt);
		card.appendChild(footer);
		overlay.appendChild(card);

		this._overlay = overlay;
		mainWindow.document.body.appendChild(overlay);

		this._disposables.add(dom.addDisposableListener(overlay, 'click', () => {
			overlay.style.animation = 'xkcdFadeOut 0.2s ease-out forwards';
			this._disposables.add(dom.addDisposableListener(overlay, 'animationend', () => {
				this._removeOverlay();
			}));
		}));
	}

	private _removeOverlay(): void {
		if (this._overlay) {
			this._overlay.remove();
			this._overlay = undefined;
		}
	}

	dispose(): void {
		this._removeOverlay();
		this._disposables.dispose();
	}
}

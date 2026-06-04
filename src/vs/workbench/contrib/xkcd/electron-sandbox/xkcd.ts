/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import './media/xkcd.css';
import * as dom from '../../../../base/browser/dom.js';
import { mainWindow } from '../../../../base/browser/window.js';
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { IConfigurationService } from '../../../../platform/configuration/common/configuration.js';
import { INativeHostService } from '../../../../platform/native/common/native.js';
import { IStorageService, StorageScope, StorageTarget } from '../../../../platform/storage/common/storage.js';
import { getWorkbenchContribution } from '../../../common/contributions.js';
import { CutInOverlay } from '../../cutIn/browser/cutIn.js';
import { createAllProviders, IComic, IComicProvider } from './comicProviders.js';

const SELECTED_PROVIDER_KEY = 'comics.selectedProvider';

export class XkcdOverlay {

	static readonly ID = 'workbench.contrib.xkcd';

	private readonly _disposables = new DisposableStore();
	private readonly _renderDisposables = this._disposables.add(new DisposableStore());
	private _overlay: HTMLElement | undefined;

	private readonly _providers: IComicProvider[];
	private _currentProvider: IComicProvider;

	private readonly _latestNums = new Map<string, number>();
	private readonly _histories = new Map<string, IComic[]>();
	private readonly _historyIndices = new Map<string, number>();

	constructor(
		@IConfigurationService _configurationService: IConfigurationService,
		@INativeHostService nativeHostService: INativeHostService,
		@IStorageService private readonly _storageService: IStorageService
	) {
		this._providers = createAllProviders(nativeHostService);
		const savedId = this._storageService.get(SELECTED_PROVIDER_KEY, StorageScope.APPLICATION);
		this._currentProvider = this._providers.find(p => p.id === savedId) ?? this._providers[0];

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

	private get _history(): IComic[] {
		let h = this._histories.get(this._currentProvider.id);
		if (!h) {
			h = [];
			this._histories.set(this._currentProvider.id, h);
		}
		return h;
	}

	private get _historyIndex(): number {
		return this._historyIndices.get(this._currentProvider.id) ?? -1;
	}

	private set _historyIndex(val: number) {
		this._historyIndices.set(this._currentProvider.id, val);
	}

	private get _latestNum(): number {
		return this._latestNums.get(this._currentProvider.id) ?? 0;
	}

	private set _latestNum(val: number) {
		this._latestNums.set(this._currentProvider.id, val);
	}

	async showXkcd(): Promise<void> {
		this._removeOverlay();

		const comic = await this._fetchRandomComic();
		if (!comic) {
			return;
		}

		this._history.splice(this._historyIndex + 1);
		this._history.push(comic);
		this._historyIndex = this._history.length - 1;

		this._markSeen(comic.key);
		this._renderComic(comic);
	}

	private _showComic(comic: IComic): void {
		this._removeOverlay();
		this._renderComic(comic);
	}

	private async _navigateNext(): Promise<void> {
		if (this._historyIndex < this._history.length - 1) {
			this._historyIndex++;
			this._showComic(this._history[this._historyIndex]);
		} else {
			const comic = await this._fetchRandomComic();
			if (!comic) {
				return;
			}
			this._history.push(comic);
			this._historyIndex = this._history.length - 1;
			this._markSeen(comic.key);
			this._showComic(comic);
		}
	}

	private _navigatePrev(): void {
		if (this._historyIndex > 0) {
			this._historyIndex--;
			this._showComic(this._history[this._historyIndex]);
		}
	}

	private async _navigateToComic(num: number): Promise<void> {
		const comic = await this._currentProvider.fetchComic(num);
		if (!comic) {
			return;
		}
		this._history.splice(this._historyIndex + 1);
		this._history.push(comic);
		this._historyIndex = this._history.length - 1;
		this._markSeen(comic.key);
		this._showComic(comic);
	}

	private async _resolveLatestNum(): Promise<number> {
		if (this._latestNum) {
			return this._latestNum;
		}
		let latestNum = this._storageService.getNumber(this._currentProvider.latestStorageKey, StorageScope.APPLICATION);
		if (!latestNum) {
			latestNum = await this._currentProvider.resolveLatest();
			if (!latestNum) {
				return 0;
			}
			this._storageService.store(this._currentProvider.latestStorageKey, latestNum, StorageScope.APPLICATION, StorageTarget.MACHINE);
		}
		this._latestNum = latestNum;
		return latestNum;
	}

	private async _fetchRandomComic(): Promise<IComic | null> {
		try {
			const latestNum = await this._resolveLatestNum();
			if (!latestNum) {
				return null;
			}
			const comicNum = this._pickUnseen(latestNum);
			return await this._currentProvider.fetchComic(comicNum);
		} catch {
			return null;
		}
	}

	private _pickUnseen(latestNum: number): number {
		const seen = this._getSeenSet();

		if (seen.size >= latestNum) {
			seen.clear();
			this._storageService.store(this._currentProvider.seenStorageKey, '[]', StorageScope.APPLICATION, StorageTarget.MACHINE);
		}

		let num: number;
		do {
			num = Math.floor(Math.random() * latestNum) + 1;
		} while (seen.has(num) && seen.size < latestNum);

		return num;
	}

	private _getSeenSet(): Set<number> {
		try {
			const raw = this._storageService.get(this._currentProvider.seenStorageKey, StorageScope.APPLICATION, '[]');
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
			this._currentProvider.seenStorageKey,
			JSON.stringify([...seen]),
			StorageScope.APPLICATION,
			StorageTarget.MACHINE
		);
	}

	getProviders(): IComicProvider[] {
		return this._providers;
	}

	getCurrentProviderId(): string {
		return this._currentProvider.id;
	}

	async switchProvider(provider: IComicProvider): Promise<void> {
		this._currentProvider = provider;
		this._storageService.store(SELECTED_PROVIDER_KEY, provider.id, StorageScope.APPLICATION, StorageTarget.MACHINE);
		await this.showXkcd();
	}

	private _renderComic(comic: IComic): void {
		const overlay = document.createElement('div');
		overlay.classList.add('xkcd-overlay');

		const content = document.createElement('div');
		content.classList.add('xkcd-content');

		const cardRow = document.createElement('div');
		cardRow.classList.add('xkcd-card-row');

		const prevArrow = document.createElement('button');
		prevArrow.classList.add('xkcd-nav', 'xkcd-nav-prev');
		prevArrow.textContent = '‹';
		prevArrow.disabled = this._historyIndex <= 0;
		prevArrow.addEventListener('click', (e) => {
			e.stopPropagation();
			this._navigatePrev();
		});

		const nextArrow = document.createElement('button');
		nextArrow.classList.add('xkcd-nav', 'xkcd-nav-next');
		nextArrow.textContent = '›';
		nextArrow.addEventListener('click', (e) => {
			e.stopPropagation();
			this._navigateNext();
		});

		const card = document.createElement('div');
		card.classList.add('xkcd-card');

		const header = document.createElement('div');
		header.classList.add('xkcd-header');

		const title = document.createElement('h2');
		title.classList.add('xkcd-title');
		title.textContent = comic.title;

		const number = document.createElement('span');
		number.classList.add('xkcd-number');
		number.textContent = `#${comic.key}`;

		header.appendChild(title);
		header.appendChild(number);

		const imageContainer = document.createElement('div');
		imageContainer.classList.add('xkcd-image-container');

		const img = document.createElement('img');
		img.src = comic.image;
		img.alt = comic.alt ?? comic.title;
		imageContainer.appendChild(img);

		card.appendChild(header);
		card.appendChild(imageContainer);

		if (comic.alt) {
			const alt = document.createElement('p');
			alt.classList.add('xkcd-alt');
			alt.textContent = comic.alt;
			card.appendChild(alt);
		}

		const footer = document.createElement('div');
		footer.classList.add('xkcd-footer');

		const supportLink = document.createElement('a');
		supportLink.classList.add('xkcd-link');
		supportLink.textContent = 'Support the author';
		supportLink.href = this._currentProvider.supportUrl;
		supportLink.target = '_blank';
		supportLink.addEventListener('click', (e) => e.stopPropagation());

		footer.appendChild(supportLink);
		card.appendChild(footer);

		cardRow.appendChild(prevArrow);
		cardRow.appendChild(card);
		cardRow.appendChild(nextArrow);

		content.appendChild(cardRow);

		const seen = this._getSeenSet();
		if (this._latestNum > 0) {
			const gridSection = this._renderGrid(seen, comic.key);
			content.appendChild(gridSection);
		}

		const select = this._renderProviderSelect();
		content.appendChild(select);

		overlay.appendChild(content);

		this._overlay = overlay;
		this._renderDisposables.clear();
		mainWindow.document.body.appendChild(overlay);

		this._renderDisposables.add(dom.addDisposableListener(overlay, 'click', (e) => {
			if (e.target === overlay) {
				overlay.style.animation = 'xkcdFadeOut 0.2s ease-out forwards';
				this._renderDisposables.add(dom.addDisposableListener(overlay, 'animationend', () => {
					this._removeOverlay();
				}));
			}
		}));
	}

	private _renderGrid(seen: Set<number>, currentNum: number): HTMLElement {
		const section = document.createElement('div');
		section.classList.add('xkcd-grid-section');

		const gridContainer = document.createElement('div');
		gridContainer.classList.add('xkcd-grid-scroll');

		const grid = document.createElement('div');
		grid.classList.add('xkcd-grid');

		let tooltip: HTMLElement | undefined;

		for (let i = 1; i <= this._latestNum; i++) {
			const cell = document.createElement('div');
			cell.classList.add('xkcd-grid-cell');
			if (seen.has(i)) {
				cell.classList.add('xkcd-grid-cell-seen');
			}
			if (i === currentNum) {
				cell.classList.add('xkcd-grid-cell-current');
			}
			const num = i;
			cell.addEventListener('mouseenter', () => {
				tooltip?.remove();
				tooltip = document.createElement('div');
				tooltip.classList.add('xkcd-grid-tooltip');
				tooltip.textContent = `#${num}`;
				const rect = cell.getBoundingClientRect();
				const sectionRect = section.getBoundingClientRect();
				tooltip.style.left = `${rect.left - sectionRect.left + rect.width / 2}px`;
				tooltip.style.top = `${rect.top - sectionRect.top - 24}px`;
				section.appendChild(tooltip);
			});
			cell.addEventListener('mouseleave', () => {
				tooltip?.remove();
				tooltip = undefined;
			});
			cell.addEventListener('click', (e) => {
				e.stopPropagation();
				this._navigateToComic(num);
			});
			grid.appendChild(cell);
		}

		const label = document.createElement('div');
		label.classList.add('xkcd-grid-label');
		label.textContent = `${seen.size} of ${this._latestNum} seen`;

		gridContainer.appendChild(grid);
		section.appendChild(gridContainer);
		section.appendChild(label);
		return section;
	}

	private _renderProviderSelect(): HTMLElement {
		const wrapper = document.createElement('div');
		wrapper.classList.add('xkcd-select-wrapper');

		const select = document.createElement('select');
		select.classList.add('xkcd-comic-select');

		for (const provider of this._providers) {
			const option = document.createElement('option');
			option.value = provider.id;
			option.textContent = provider.name;
			option.selected = provider.id === this._currentProvider.id;
			select.appendChild(option);
		}

		select.addEventListener('change', (e) => {
			e.stopPropagation();
			const target = e.target as HTMLSelectElement;
			const provider = this._providers.find(p => p.id === target.value);
			if (provider && provider.id !== this._currentProvider.id) {
				this.switchProvider(provider);
			}
		});

		select.addEventListener('click', (e) => e.stopPropagation());

		wrapper.appendChild(select);
		return wrapper;
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
